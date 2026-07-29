import { OAuth2Client } from 'google-auth-library';

const MAX_BODY_LENGTH = 4_000_000;
const MAX_BASE64_FILE_LENGTH = 1_800_000;
const googleVerifier = new OAuth2Client();

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null;

const validatePayload = (payload: unknown) => {
  if (!isRecord(payload) || payload.action !== 'findFolderAndUpload') {
    return 'Acción de Drive inválida.';
  }

  if (
    typeof payload.folderName !== 'string' ||
    !payload.folderName.trim() ||
    payload.folderName.length > 180 ||
    payload.folderName.includes('/') ||
    payload.folderName.includes('\\') ||
    Array.from(payload.folderName).some((character) => character.charCodeAt(0) < 32)
  ) {
    return 'Nombre de legajo inválido.';
  }

  if (!Array.isArray(payload.files) || payload.files.length !== 2) {
    return 'Se requieren exactamente el Recibo y el Cargo.';
  }

  const expectedNames = new Set([
    `Recibo_${payload.folderName}.pdf`,
    `Cargo_${payload.folderName}.pdf`,
  ]);

  for (const file of payload.files) {
    if (
      !isRecord(file) ||
      typeof file.name !== 'string' ||
      !expectedNames.delete(file.name) ||
      file.mimeType !== 'application/pdf' ||
      typeof file.base64 !== 'string' ||
      !file.base64 ||
      file.base64.length > MAX_BASE64_FILE_LENGTH ||
      file.base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)
    ) {
      return 'Los comprobantes enviados no cumplen el contrato PDF.';
    }
  }

  return expectedNames.size === 0 ? null : 'Falta uno de los comprobantes requeridos.';
};

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return json({ status: 'error', message: 'Método no permitido.' }, 405);
    }

    const origin = request.headers.get('origin');
    try {
      if (origin && new URL(origin).host !== new URL(request.url).host) {
        return json({ status: 'error', message: 'Origen no permitido.' }, 403);
      }
    } catch {
      return json({ status: 'error', message: 'Origen no permitido.' }, 403);
    }

    const googleClientId = (process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const allowedDomain = (process.env.DRIVE_ALLOWED_GOOGLE_DOMAIN || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    const allowedEmails = new Set(
      (process.env.DRIVE_ALLOWED_GOOGLE_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!googleClientId || (!allowedDomain && allowedEmails.size === 0)) {
      return json(
        {
          status: 'error',
          message: 'No se configuró el cliente y las cuentas de Google autorizadas en Vercel.',
        },
        500,
      );
    }

    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) {
      return json(
        { status: 'error', message: 'Inicia sesión con una cuenta de Google autorizada.' },
        401,
      );
    }

    let googleProfile;
    try {
      const ticket = await googleVerifier.verifyIdToken({
        idToken: token,
        audience: googleClientId,
      });
      googleProfile = ticket.getPayload();
    } catch {
      return json(
        { status: 'error', message: 'La sesión de Google venció o no es válida.' },
        401,
      );
    }

    const email =
      typeof googleProfile?.email === 'string' ? googleProfile.email.trim().toLowerCase() : '';
    const hostedDomain =
      typeof googleProfile?.hd === 'string' ? googleProfile.hd.trim().toLowerCase() : '';
    const authorized =
      googleProfile?.email_verified === true &&
      (allowedEmails.has(email) || (allowedDomain && hostedDomain === allowedDomain));
    if (!authorized) {
      return json(
        { status: 'error', message: 'Esta cuenta de Google no está autorizada para subir legajos.' },
        403,
      );
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_LENGTH) {
      return json({ status: 'error', message: 'Los PDF superan el tamaño permitido.' }, 413);
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_LENGTH) {
      return json({ status: 'error', message: 'Los PDF superan el tamaño permitido.' }, 413);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ status: 'error', message: 'Solicitud JSON inválida.' }, 400);
    }

    const validationError = validatePayload(payload);
    if (validationError) {
      return json({ status: 'error', message: validationError }, 400);
    }

    const webhookUrl =
      process.env.APPS_SCRIPT_WEBHOOK_URL ||
      process.env.VITE_APPS_SCRIPT_WEBHOOK_URL;
    const webhookSecret = process.env.APPS_SCRIPT_WEBHOOK_SECRET;

    if (
      !webhookUrl ||
      !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(webhookUrl) ||
      !webhookSecret
    ) {
      return json(
        {
          status: 'error',
          message: 'La integración de Google Drive no está configurada en Vercel.',
        },
        500,
      );
    }

    let upstream: Response;
    try {
      upstream = await fetch(webhookUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...(payload as Record<string, unknown>), secret: webhookSecret }),
      });
    } catch {
      return json(
        { status: 'error', message: 'No se pudo contactar al Apps Script de Google Drive.' },
        502,
      );
    }

    let result: any;
    try {
      result = JSON.parse(await upstream.text());
    } catch {
      return json(
        {
          status: 'error',
          message: 'Apps Script no devolvió JSON. Revisa el acceso y la versión desplegada.',
        },
        502,
      );
    }

    if (!upstream.ok || result.status !== 'success') {
      const status = result.code === 'FOLDER_NOT_FOUND' ? 404 : 502;
      return json(
        {
          status: 'error',
          code: result.code,
          message: result.message || 'Google Drive rechazó la operación.',
        },
        status,
      );
    }

    return json(result);
  },
};
