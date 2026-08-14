import test from 'node:test';
import assert from 'node:assert/strict';

test('el proxy OCR autentica, valida el lote y mantiene las claves fuera de URL y respuesta', async () => {
  process.env.GEMINI_API_KEYS = 'server-key-a,server-key-b';
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  process.env.VITE_GOOGLE_CLIENT_ID = 'web-client.apps.googleusercontent.com';
  process.env.DRIVE_ALLOWED_GOOGLE_DOMAIN = 'upacifico.edu.py';

  const originalFetch = globalThis.fetch;
  const { OAuth2Client } = await import('google-auth-library');
  const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      email: 'recepcion@upacifico.edu.py',
      email_verified: true,
      hd: 'upacifico.edu.py',
    }),
  });

  const upstreamResults = [{
    index: 0,
    nombres: 'MARIA ELENA',
    apellidos: 'PEREZ GOMEZ',
    carrera: 'MEDICINA',
    tipoDocumento: 'CEDULA DE IDENTIDAD',
    numeroDocumento: '6543210',
    legible: true,
    warnings: [],
  }];
  let upstreamUrl;
  let upstreamOptions;
  globalThis.fetch = async (url, options) => {
    upstreamUrl = String(url);
    upstreamOptions = options;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(upstreamResults) }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const { default: handler } = await import('../api/ocr.ts');
  const payload = { images: [{ index: 0, data: 'AA==' }], keySlot: 1 };

  try {
    const noToken = await handler.fetch(new Request('https://recepcion.example/api/ocr', {
      method: 'POST',
      headers: { Origin: 'https://recepcion.example' },
      body: JSON.stringify(payload),
    }));
    assert.equal(noToken.status, 401);

    const invalid = await handler.fetch(new Request('https://recepcion.example/api/ocr', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer google-id-token',
        Origin: 'https://recepcion.example',
      },
      body: JSON.stringify({ images: [{ data: 'AA==' }] }),
    }));
    assert.equal(invalid.status, 400);

    const response = await handler.fetch(new Request('https://recepcion.example/api/ocr', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer google-id-token',
        'Content-Type': 'application/json',
        Origin: 'https://recepcion.example',
      },
      body: JSON.stringify(payload),
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'success');
    assert.deepEqual(body.results, upstreamResults);
    assert.equal(upstreamOptions.headers['x-goog-api-key'], 'server-key-b');
    assert.doesNotMatch(upstreamUrl, /key=/i);
    assert.doesNotMatch(JSON.stringify(body), /server-key/);

    const upstreamBody = JSON.parse(upstreamOptions.body);
    assert.equal(upstreamBody.generationConfig.responseMimeType, 'application/json');
    assert.equal(upstreamBody.generationConfig.responseSchema.type, 'array');
    assert.equal(upstreamBody.contents[0].parts[1].text, 'IMAGE_INDEX: 0');
    assert.equal(upstreamBody.contents[0].parts[2].inlineData.mimeType, 'image/jpeg');
  } finally {
    globalThis.fetch = originalFetch;
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_MODEL;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    delete process.env.DRIVE_ALLOWED_GOOGLE_DOMAIN;
  }
});
