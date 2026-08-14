const MAX_BODY_LENGTH = 4_300_000;
const MAX_IMAGES = 6;
const MAX_IMAGE_BASE64_LENGTH = 600_000;
const UPSTREAM_TIMEOUT_MS = 22_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitByIp = new Map<string, { count: number; resetAt: number }>();

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null;

const getGeminiKeys = () => {
  const configured =
    process.env.GEMINI_API_KEYS ||
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    '';

  return Array.from(
    new Set(
      configured
        .split(/[\r\n,]+/)
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  );
};

const validateImages = (payload: unknown) => {
  if (!isRecord(payload) || !Array.isArray(payload.images)) {
    return 'Solicitud OCR inválida.';
  }

  if (payload.images.length === 0 || payload.images.length > MAX_IMAGES) {
    return `Se requieren entre 1 y ${MAX_IMAGES} imágenes por lote.`;
  }

  const seen = new Set<number>();
  for (const image of payload.images) {
    if (
      !isRecord(image) ||
      !Number.isInteger(image.index) ||
      image.index < 0 ||
      image.index >= payload.images.length ||
      seen.has(image.index) ||
      typeof image.data !== 'string' ||
      !image.data ||
      image.data.length > MAX_IMAGE_BASE64_LENGTH ||
      image.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
    ) {
      return 'Las imágenes OCR no cumplen el contrato de lote.';
    }
    seen.add(image.index);
  }

  return seen.size === payload.images.length ? null : 'Faltan índices de imagen en el lote.';
};

const hasStrictResults = (value: unknown, expectedLength: number) => {
  if (!Array.isArray(value) || value.length !== expectedLength) return false;

  const seen = new Set<number>();
  return value.every((item) => {
    if (
      !isRecord(item) ||
      !Number.isInteger(item.index) ||
      item.index < 0 ||
      item.index >= expectedLength ||
      seen.has(item.index) ||
      typeof item.nombres !== 'string' ||
      typeof item.apellidos !== 'string' ||
      typeof item.carrera !== 'string' ||
      typeof item.tipoDocumento !== 'string' ||
      typeof item.numeroDocumento !== 'string' ||
      typeof item.legible !== 'boolean' ||
      !Array.isArray(item.warnings) ||
      !item.warnings.every((warning: unknown) => typeof warning === 'string')
    ) {
      return false;
    }
    seen.add(item.index);
    return true;
  }) && seen.size === expectedLength;
};

const validateRequestSource = (request: Request) => {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  try {
    if (!origin || new URL(origin).host !== new URL(request.url).host) {
      return json({ status: 'error', message: 'Origen no permitido.' }, 403);
    }
  } catch {
    return json({ status: 'error', message: 'Origen no permitido.' }, 403);
  }
  if (fetchSite && fetchSite !== 'same-origin') {
    return json({ status: 'error', message: 'Origen no permitido.' }, 403);
  }
  return null;
};

const enforceRateLimit = (request: Request) => {
  const now = Date.now();
  const forwardedFor =
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const ip = forwardedFor.split(',')[0].trim() || 'unknown';
  const current = rateLimitByIp.get(ip);
  const entry = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
    : { count: current.count + 1, resetAt: current.resetAt };
  rateLimitByIp.set(ip, entry);

  // ponytail: límite por instancia; si aumenta el tráfico, moverlo a Vercel WAF para conteo distribuido.
  if (rateLimitByIp.size > 1_000) {
    for (const [key, value] of rateLimitByIp) {
      if (value.resetAt <= now) rateLimitByIp.delete(key);
    }
  }
  if (entry.count <= RATE_LIMIT_MAX_REQUESTS) return null;

  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return json(
    { status: 'error', message: 'Demasiadas solicitudes OCR. Intenta nuevamente en unos minutos.' },
    429,
    { 'Retry-After': String(retryAfter) },
  );
};

const prompt = `
Extrae datos de contratos de matrícula de la Universidad del Pacífico (Paraguay).

Cada imagen está precedida por su marcador IMAGE_INDEX. Devuelve exactamente un resultado por marcador.

Campos:
- nombres: texto exacto junto a "Nombres:".
- apellidos: texto exacto junto a "Apellidos:".
- carrera: texto exacto junto a "Carrera:".
- tipoDocumento: texto junto a "Tipo de Documento:".
- numeroDocumento: texto junto a "Nro.:" correspondiente al Tipo de Documento.

Reglas:
- Corrige visualmente rotación, inclinación, perspectiva y sombras antes de leer.
- No confundas el número del contrato ni el número de estudiante con numeroDocumento.
- Nunca uses membretes, ciudades, sedes o direcciones como nombres. En particular: UNIVERSIDAD DEL PACÍFICO, ASUNCIÓN, PEDRO JUAN CABALLERO, SAN MARTÍN y TORRES UP.
- Copia lo visible; no inventes ni completes valores. Si un campo no es legible, devuelve "" y agrega una explicación breve en warnings.
- legible es true solamente cuando nombres, apellidos, carrera y numeroDocumento son legibles.
- Usa mayúsculas para nombres, apellidos, tipoDocumento y numeroDocumento. Conserva tildes, apóstrofes, guiones, puntos y barras que pertenezcan al dato.
`;

const responseSchema = {
  type: 'array',
  minItems: 1,
  maxItems: MAX_IMAGES,
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      index: { type: 'integer' },
      nombres: { type: 'string' },
      apellidos: { type: 'string' },
      carrera: { type: 'string' },
      tipoDocumento: { type: 'string' },
      numeroDocumento: { type: 'string' },
      legible: { type: 'boolean' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'index',
      'nombres',
      'apellidos',
      'carrera',
      'tipoDocumento',
      'numeroDocumento',
      'legible',
      'warnings',
    ],
  },
};

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return json({ status: 'error', message: 'Método no permitido.' }, 405);
    }

    const sourceError = validateRequestSource(request);
    if (sourceError) return sourceError;
    const rateLimitError = enforceRateLimit(request);
    if (rateLimitError) return rateLimitError;

    const keys = getGeminiKeys();
    if (keys.length === 0) {
      return json(
        { status: 'error', message: 'Gemini no está configurado en el servidor.' },
        500,
      );
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_LENGTH) {
      return json({ status: 'error', message: 'El lote OCR supera el tamaño permitido.' }, 413);
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_LENGTH) {
      return json({ status: 'error', message: 'El lote OCR supera el tamaño permitido.' }, 413);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ status: 'error', message: 'Solicitud JSON inválida.' }, 400);
    }

    const validationError = validateImages(payload);
    if (validationError) {
      return json({ status: 'error', message: validationError }, 400);
    }

    const keySlot = Number.isInteger(payload.keySlot) ? Math.abs(payload.keySlot) : 0;
    const model = /^gemini-[a-z0-9.-]+$/i.test(process.env.GEMINI_MODEL || '')
      ? process.env.GEMINI_MODEL
      : 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const parts: any[] = [{ text: prompt }];
    for (const image of [...payload.images].sort((a, b) => a.index - b.index)) {
      parts.push({ text: `IMAGE_INDEX: ${image.index}` });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: image.data } });
    }

    let lastStatus = 502;
    for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
      const controller = new AbortController();
      const abortFromClient = () => controller.abort();
      request.signal.addEventListener('abort', abortFromClient, { once: true });
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const upstream = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': keys[(keySlot + attempt) % keys.length],
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema,
            },
          }),
        });
        lastStatus = upstream.status;
        if (!upstream.ok) {
          if (![429, 500, 502, 503, 504].includes(upstream.status)) break;
          continue;
        }

        const data: any = await upstream.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof candidateText !== 'string') continue;

        let results: unknown;
        try {
          results = JSON.parse(candidateText);
        } catch {
          continue;
        }

        if (!hasStrictResults(results, payload.images.length)) continue;
        return json({ status: 'success', results });
      } catch {
        lastStatus = 502;
        if (request.signal.aborted) break;
      } finally {
        clearTimeout(timeout);
        request.signal.removeEventListener('abort', abortFromClient);
      }
    }

    return json(
      {
        status: 'error',
        message: 'Gemini no pudo procesar el lote; se utilizará OCR local.',
      },
      lastStatus === 429 ? 429 : 502,
    );
  },
};
