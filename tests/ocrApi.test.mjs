import test from 'node:test';
import assert from 'node:assert/strict';

test('el proxy OCR funciona sin Google, limita abuso y mantiene las claves fuera del cliente', async () => {
  process.env.GEMINI_API_KEYS = 'server-key-a,server-key-b';
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';

  const originalFetch = globalThis.fetch;
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
    const crossOrigin = await handler.fetch(new Request('https://recepcion.example/api/ocr', {
      method: 'POST',
      headers: {
        Origin: 'https://otro.example',
        'Sec-Fetch-Site': 'cross-site',
        'X-Forwarded-For': '192.0.2.1',
      },
      body: JSON.stringify(payload),
    }));
    assert.equal(crossOrigin.status, 403);

    const invalid = await handler.fetch(new Request('https://recepcion.example/api/ocr', {
      method: 'POST',
      headers: {
        Origin: 'https://recepcion.example',
        'Sec-Fetch-Site': 'same-origin',
        'X-Forwarded-For': '192.0.2.2',
      },
      body: JSON.stringify({ images: [{ data: 'AA==' }] }),
    }));
    assert.equal(invalid.status, 400);

    const response = await handler.fetch(new Request('https://recepcion.example/api/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://recepcion.example',
        'Sec-Fetch-Site': 'same-origin',
        'X-Forwarded-For': '192.0.2.3',
      },
      body: JSON.stringify(payload),
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'success');
    assert.deepEqual(body.results, upstreamResults);
    assert.equal(upstreamOptions.headers['x-goog-api-key'], 'server-key-b');
    assert.equal(upstreamOptions.headers.Authorization, undefined);
    assert.doesNotMatch(upstreamUrl, /key=/i);
    assert.doesNotMatch(JSON.stringify(body), /server-key/);

    const upstreamBody = JSON.parse(upstreamOptions.body);
    assert.equal(upstreamBody.generationConfig.responseMimeType, 'application/json');
    assert.equal(upstreamBody.generationConfig.responseSchema.type, 'array');
    assert.equal(upstreamBody.contents[0].parts[1].text, 'IMAGE_INDEX: 0');
    assert.equal(upstreamBody.contents[0].parts[2].inlineData.mimeType, 'image/jpeg');

    let limitedResponse;
    for (let attempt = 0; attempt < 70; attempt++) {
      limitedResponse = await handler.fetch(new Request('https://recepcion.example/api/ocr', {
        method: 'POST',
        headers: {
          Origin: 'https://recepcion.example',
          'Sec-Fetch-Site': 'same-origin',
          'X-Forwarded-For': '192.0.2.60',
        },
        body: JSON.stringify({ images: [] }),
      }));
      if (limitedResponse.status === 429) break;
    }
    assert.equal(limitedResponse.status, 429);
    assert.ok(Number(limitedResponse.headers.get('retry-after')) > 0);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_MODEL;
  }
});
