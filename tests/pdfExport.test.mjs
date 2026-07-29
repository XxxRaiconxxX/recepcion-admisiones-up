import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('el guard de PDF rechaza una página blanca y exige contenido interior', async () => {
  const vite = await createServer({
    root: process.cwd(),
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { hasVisiblePdfPixels } = await vite.ssrLoadModule('/src/lib/pdfExport.ts');
    const width = 100;
    const height = 100;
    const blank = new Uint8ClampedArray(width * height * 4).fill(255);

    assert.equal(hasVisiblePdfPixels(blank, width, height), false);

    const borderOnly = blank.slice();
    for (let x = 0; x < width; x += 1) {
      borderOnly[x * 4] = 0;
      borderOnly[((height - 1) * width + x) * 4] = 0;
    }
    assert.equal(hasVisiblePdfPixels(borderOnly, width, height), false);

    const withContent = blank.slice();
    for (let y = 20; y < 80; y += 1) {
      for (let x = 20; x < 80; x += 1) {
        withContent[(y * width + x) * 4] = 15;
      }
    }
    assert.equal(hasVisiblePdfPixels(withContent, width, height), true);
  } finally {
    await vite.close();
  }
});
