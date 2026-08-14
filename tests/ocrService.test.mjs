import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OcrService, BATCH_CONFIG } from '../src/lib/ocrService.ts';

const strictItem = (index, overrides = {}) => ({
  index,
  nombres: `NOMBRE ${String.fromCharCode(65 + index)}`,
  apellidos: `APELLIDO ${String.fromCharCode(65 + index)}`,
  carrera: 'Medicina',
  tipoDocumento: 'CÉDULA DE IDENTIDAD',
  numeroDocumento: `${7000000 + index}`,
  legible: true,
  warnings: [],
  ...overrides,
});

test('parsea la distribución horizontal del contrato fotografiado sin confundir cabecera ni número de estudiante', () => {
  const rawText = `
    UNIVERSIDAD DEL PACÍFICO   ASUNCIÓN   CONTRATO DE MATRÍCULA N° 105219   BECADO
    Nombres: MARIA ELENA    Apellidos: PEREZ GOMEZ    Carrera: MEDICINA
    Fecha de Nac.: 28/08/2008    Tipo de Documento: CEDULA DE IDENTIDAD    Nro.: 6543210
    Nacionalidad: PARAGUAYA    Estado Civil: SOLTERO/A
    Número de estudiante: 26727
  `;

  const parsed = OcrService.parseContractText(rawText);
  assert.deepEqual(parsed, {
    nombres: 'MARIA ELENA',
    apellidos: 'PEREZ GOMEZ',
    nombresApellidos: 'MARIA ELENA PEREZ GOMEZ',
    carrera: 'Medicina',
    tipoDocumento: 'CEDULA DE IDENTIDAD',
    ci: '6543210',
  });
});

test('preserva apóstrofes, guiones, pasaportes, DNI y cédulas con puntos', () => {
  const passport = OcrService.parseContractText(
    "Nombres: ANA MARÍA Apellidos: D'AVILA-ROJAS Carrera: DERECHO Tipo de Documento: PASAPORTE Nro.: PA-12345 Nacionalidad: ARGENTINA",
  );
  assert.equal(passport.nombresApellidos, "ANA MARÍA D'AVILA-ROJAS");
  assert.equal(passport.carrera, 'Derecho');
  assert.equal(passport.tipoDocumento, 'PASAPORTE');
  assert.equal(passport.ci, 'PA-12345');

  const dottedCi = OcrService.parseContractText(
    'Nombres: PEDRO LUIS Apellidos: GIMENEZ ROJAS Carrera: MEDICINA Tipo de Documento: CÉDULA DE IDENTIDAD Nro.: 6.080.429 Estado Civil: SOLTERO',
  );
  assert.equal(dottedCi.nombresApellidos, 'PEDRO LUIS GIMENEZ ROJAS');
  assert.equal(dottedCi.ci, '6.080.429');

  const dni = OcrService.parseContractText(
    'Nombres: LUISA Apellidos: BENITEZ Carrera: ODONTOLOGÍA Tipo de Documento: DNI Nro.: X123456 Nacionalidad: ARGENTINA',
  );
  assert.equal(dni.ci, 'X123456');
});

test('no inventa Medicina cuando la carrera no es legible', () => {
  const parsed = OcrService.parseContractText(
    'Nombres: MARIA Apellidos: PEREZ Tipo de Documento: CEDULA Nro.: 1234567 Nacionalidad: PARAGUAYA',
  );
  assert.equal(parsed.carrera, '');
});

test('validateStrictBatchIndices exige índices enteros explícitos, únicos y campos tipados', () => {
  const perfect = [0, 1, 2, 3].map((index) => strictItem(index));
  const valid = OcrService.validateStrictBatchIndices(perfect, 4);
  assert.equal(valid.isValid, true);
  assert.equal(valid.parsedList[0].nombresApellidos, 'NOMBRE A APELLIDO A');
  assert.equal(valid.parsedList[3].ci, '7000003');

  assert.equal(
    OcrService.validateStrictBatchIndices(perfect.map(({ index: _index, ...item }) => item), 4).isValid,
    false,
  );
  assert.equal(
    OcrService.validateStrictBatchIndices(perfect.map((item, index) => ({ ...item, index: index + 0.5 })), 4).isValid,
    false,
  );
  assert.equal(
    OcrService.validateStrictBatchIndices([
      strictItem(0),
      strictItem(1),
      strictItem(1),
      strictItem(3),
    ], 4).isValid,
    false,
  );
  assert.equal(
    OcrService.validateStrictBatchIndices([
      strictItem(0, { nombres: 123 }),
      strictItem(1),
      strictItem(2),
      strictItem(3),
    ], 4).isValid,
    false,
  );
});

test('Gemini incompleto o con membrete nunca se marca como extracción exitosa', async () => {
  const originalFetch = globalThis.fetch;
  const originalResize = OcrService.resizeImageForVision;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: 'success',
    results: [strictItem(0, {
      nombres: 'UNIVERSIDAD DEL PACIFICO',
      apellidos: '',
      carrera: '',
      numeroDocumento: '',
      legible: false,
      warnings: ['Sombra sobre los campos'],
    })],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  OcrService.resizeImageForVision = async () => ({ base64Data: 'AA==' });

  try {
    const [result] = await OcrService.processSingleBatchWithGemini(
      [{ id: 'photo-1', photoUrl: 'blob:test' }],
      { mode: 'gemini' },
    );
    assert.equal(result.status, 'error');
    assert.match(result.errorMessage, /Apellidos no legibles/);
    assert.match(result.errorMessage, /texto institucional/);
  } finally {
    globalThis.fetch = originalFetch;
    OcrService.resizeImageForVision = originalResize;
  }
});

test('el cliente no contiene claves ni llama directamente al endpoint de Gemini', async () => {
  const source = await readFile(new URL('../src/lib/ocrService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /QVEuQWI4/);
  assert.doesNotMatch(source, /VITE_GEMINI_API_KEY/);
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(source, /Authorization:/);
  assert.match(source, /fetch\('\/api\/ocr'/);
});

test('BATCH_CONFIG limita lote, concurrencia, archivos, memoria y tamaño de imagen', () => {
  assert.equal(BATCH_CONFIG.BATCH_SIZE, 6);
  assert.equal(BATCH_CONFIG.MAX_CONCURRENCY, 2);
  assert.equal(BATCH_CONFIG.MAX_FILES, 50);
  assert.equal(BATCH_CONFIG.MAX_IMAGE_DIMENSION, 1280);
  assert.equal(BATCH_CONFIG.MAX_BASE64_IMAGE_LENGTH, 600_000);
});
