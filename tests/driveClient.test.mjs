import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const student = {
  ci: '5705965',
  nombres: 'Axel Miguel',
  apellidos: 'Fretes Monges',
  carrera: 'Medicina',
  nombreAsesor: 'Axel Fretes',
  nombreRecepcionista: 'Arlet Gonzalez',
  fecha: '28/07/2026',
  numeroRecibo: '0030853',
  numeroCargo: 'N° 045 / 2026 Promoción',
  observaciones: 'JULIO 2026',
  certificadoEstudios: true,
  fotocopiaCedula: true,
  fotosCarnet: true,
  antecedentesPoliciales: true,
  carnetMigraciones: false,
  otros: false,
  descripcionOtros: '',
  contratoFirmado: true,
  driveSyncStatus: 'idle',
};

const pdf = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });

test('la subida solo informa éxito después de confirmar el legajo y ambos PDF', async (t) => {
  const originalFetch = globalThis.fetch;
  const vite = await createServer({
    root: process.cwd(),
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { DriveService } = await vite.ssrLoadModule('/src/lib/driveClient.ts');
    let lastSentPayload;

    await t.test('el Apps Script busca el legajo y nunca crea carpetas', async () => {
      const appsScript = await readFile('apps-script/Code.gs', 'utf8');
      assert.match(appsScript, /DriveApp\.getFoldersByName\(folderName\)/);
      assert.match(appsScript, /folder\.getParents\(\)/);
      assert.match(appsScript, /parentId === rootFolderId/);
      assert.doesNotMatch(appsScript, /\.createFolder\(/);
      assert.match(appsScript, /existingFile\.getMimeType\(\) !== 'application\/pdf'/);
      assert.match(appsScript, /existingFile\.getSize\(\) <= 0/);
    });

    await t.test('encuentra el legajo anidado y descarta homónimos fuera de la raíz', async () => {
      const appsScript = await readFile('apps-script/Code.gs', 'utf8');
      const iterator = (items) => {
        let index = 0;
        return {
          hasNext: () => index < items.length,
          next: () => items[index++],
        };
      };
      const folder = (id, parents = []) => ({
        getId: () => id,
        getParents: () => iterator(parents),
      });

      const root = folder('root');
      const advisor = folder('advisor', [root]);
      const career = folder('career', [advisor]);
      const nestedStudent = folder('nested-student', [career]);
      const outsideRoot = folder('outside-root');
      const unrelatedStudent = folder('unrelated-student', [outsideRoot]);
      const context = {
        DriveApp: {
          getFoldersByName: () => iterator([unrelatedStudent, nestedStudent]),
        },
      };

      vm.runInNewContext(appsScript, context);
      const matches = context.findDescendantFoldersByName_(
        'root',
        '5705965-Axel Miguel Fretes Monges',
      );

      assert.deepEqual(
        Array.from(matches, (match) => match.getId()),
        ['nested-student'],
      );
    });

    await t.test('propaga el error aplicativo aunque Apps Script responda HTTP 200', async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            status: 'error',
            code: 'FOLDER_NOT_FOUND',
            message: 'No existe el legajo exacto.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      await assert.rejects(
        DriveService.uploadReceiptAndCargo(
          student,
          pdf,
          pdf,
          'test-access-token',
          undefined,
          'https://example.test/api/drive',
        ),
        /No existe el legajo exacto/,
      );
    });

    await t.test('no convierte un fallo de red en una sincronización local', async () => {
      globalThis.fetch = async () => {
        throw new Error('network down');
      };

      await assert.rejects(
        DriveService.uploadReceiptAndCargo(
          student,
          pdf,
          pdf,
          'test-access-token',
          undefined,
          'https://example.test/api/drive',
        ),
        /network down/,
      );
    });

    await t.test('envía dos PDF base64 y conserva la confirmación de Drive', async () => {
      let sentAuthorization;
      globalThis.fetch = async (_url, options) => {
        lastSentPayload = JSON.parse(options.body);
        sentAuthorization = options.headers.Authorization;
        return new Response(
          JSON.stringify({
            status: 'success',
            folderId: 'folder-123',
            folderName: '5705965-Axel Miguel Fretes Monges',
            folderUrl: 'https://drive.google.com/drive/folders/folder-123',
            files: [
              { id: 'receipt-123', name: 'Recibo_5705965-Axel Miguel Fretes Monges.pdf', created: true },
              { id: 'cargo-123', name: 'Cargo_5705965-Axel Miguel Fretes Monges.pdf', created: true },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const result = await DriveService.uploadReceiptAndCargo(
        student,
        pdf,
        pdf,
        'test-access-token',
        undefined,
        'https://example.test/api/drive',
      );

      assert.equal(result.folderId, 'folder-123');
      assert.equal(result.files.length, 2);
      assert.equal(sentAuthorization, 'Bearer test-access-token');
      assert.equal(lastSentPayload.action, 'findFolderAndUpload');
      assert.deepEqual(
        lastSentPayload.files.map((file) => file.name),
        [
          'Recibo_5705965-Axel Miguel Fretes Monges.pdf',
          'Cargo_5705965-Axel Miguel Fretes Monges.pdf',
        ],
      );
      assert.ok(lastSentPayload.files.every((file) => file.base64.startsWith('JVBER')));
      assert.equal(JSON.parse(storage.get('up_drive_sync_logs')).length, 1);
    });

    await t.test('el proxy verifica el ID token, dominio, redirección y secreto', async () => {
      process.env.APPS_SCRIPT_WEBHOOK_URL =
        'https://script.google.com/macros/s/deployment-id/exec';
      process.env.APPS_SCRIPT_WEBHOOK_SECRET = 'server-only-secret';
      process.env.DRIVE_ALLOWED_GOOGLE_DOMAIN = 'upacifico.edu.py';
      process.env.VITE_GOOGLE_CLIENT_ID = 'web-client.apps.googleusercontent.com';

      const { OAuth2Client } = await import('google-auth-library');
      const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
      let verifiedPayload = {
        email: 'recepcion@upacifico.edu.py',
        email_verified: true,
        hd: 'otro-dominio.example',
      };
      let verificationOptions;
      OAuth2Client.prototype.verifyIdToken = async (options) => {
        verificationOptions = options;
        return { getPayload: () => verifiedPayload };
      };
      const { default: handler } = await import('../api/drive.ts');
      try {
        const unauthorizedResponse = await handler.fetch(
          new Request('https://recepcion.example/api/drive', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'https://recepcion.example',
            },
            body: JSON.stringify(lastSentPayload),
          }),
        );
        assert.equal(unauthorizedResponse.status, 401);

        const wrongDomainResponse = await handler.fetch(
          new Request('https://recepcion.example/api/drive', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer google-id-token',
              'Content-Type': 'application/json',
              Origin: 'https://recepcion.example',
            },
            body: JSON.stringify(lastSentPayload),
          }),
        );
        assert.equal(wrongDomainResponse.status, 403);

        verifiedPayload = { ...verifiedPayload, hd: 'upacifico.edu.py' };
        let upstreamOptions;
        globalThis.fetch = async (_url, options) => {
          upstreamOptions = options;
          return new Response(
            JSON.stringify({
              status: 'success',
              folderId: 'folder-123',
              folderName: lastSentPayload.folderName,
              folderUrl: 'https://drive.google.com/drive/folders/folder-123',
              files: [
                { id: 'receipt-123', name: lastSentPayload.files[0].name, created: true },
                { id: 'cargo-123', name: lastSentPayload.files[1].name, created: true },
              ],
            }),
            { status: 200 },
          );
        };

        const response = await handler.fetch(
          new Request('https://recepcion.example/api/drive', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer google-id-token',
              'Content-Type': 'application/json',
              Origin: 'https://recepcion.example',
            },
            body: JSON.stringify(lastSentPayload),
          }),
        );

        assert.equal(response.status, 200);
        assert.equal(verificationOptions.idToken, 'google-id-token');
        assert.equal(verificationOptions.audience, process.env.VITE_GOOGLE_CLIENT_ID);
        assert.equal(upstreamOptions.redirect, 'follow');
        assert.equal(upstreamOptions.headers['Content-Type'], 'text/plain;charset=utf-8');
        assert.equal(JSON.parse(upstreamOptions.body).secret, 'server-only-secret');
      } finally {
        OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.APPS_SCRIPT_WEBHOOK_URL;
    delete process.env.APPS_SCRIPT_WEBHOOK_SECRET;
    delete process.env.DRIVE_ALLOWED_GOOGLE_DOMAIN;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    await vite.close();
  }
});
