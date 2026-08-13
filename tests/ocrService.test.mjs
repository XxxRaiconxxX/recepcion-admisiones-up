import test from 'node:test';
import assert from 'node:assert/strict';
import { OcrService, BATCH_CONFIG } from '../src/lib/ocrService.ts';

test('OcrService parser extrae correctamente nombres y carreras de contratos tipo UP', () => {
  // Caso 1: Contrato real UP con Nombres: [X] Apellidos: [Y] Carrera: [Z] (Idéntico a foto adjunta del usuario)
  const rawTextReal = `
    UP UNIVERSIDAD DEL PACÍFICO    BECADO    CONTRATO DE MATRÍCULA
    En la ciudad de ASUNCIÓN, República del Paraguay, a los 13 días, del mes Agosto del año 2026, firman el presente contrato de matrícula, la
    del Pacífico Privada, en adelante la "Universidad", y
    Nombres: KIARA LIBETH       Apellidos: TRINIDAD ARIAS       Carrera: MEDICINA
    Fecha de Nac.: 27/06/2007   Tipo de Documento: CÉDULA DE IDENTIDAD   Nro.: 7373454
    Nacionalidad: PARAGUAYA                                     Estado Civil: SOLTERO/A
    Título obtenido: TECNICO EN CONTABILIDAD  Colegio: 6239 COL. NAC. PROF. MIGUEL ANGEL
  `;

  const parsedReal = OcrService.parseContractText(rawTextReal);
  assert.equal(parsedReal.nombresApellidos, 'KIARA LIBETH TRINIDAD ARIAS');
  assert.equal(parsedReal.carrera, 'Medicina');

  // Caso 2: Contrato típico con encabezado Alumno y Carrera Medicina
  const rawText1 = `
    UNIVERSIDAD DEL PACIFICO
    FACULTAD DE CIENCIAS DE LA SALUD
    CONTRATO DE PRESTACION DE SERVICIOS EDUCATIVOS
    Alumno: LUZ JOHANA RIVEROS CABRERA
    Inscripto en la carrera de Medicina
    Periodo lectivo 2026
  `;

  const parsed1 = OcrService.parseContractText(rawText1);
  assert.equal(parsed1.nombresApellidos, 'LUZ JOHANA RIVEROS CABRERA');
  assert.equal(parsed1.carrera, 'Medicina');

  // Caso 3: Contrato con patrón Estudiante y Carrera Odontología
  const rawText2 = `
    UNIVERSIDAD DEL PACÍFICO
    Estudiante: FERNANDA LUJAN
    Carrera: Odontología
  `;

  const parsed2 = OcrService.parseContractText(rawText2);
  assert.equal(parsed2.nombresApellidos, 'FERNANDA LUJAN');
  assert.equal(parsed2.carrera, 'Odontología');

  // Caso 4: Nombre en mayúsculas destacado y Carrera Derecho
  const rawText3 = `
    UNIVERSIDAD DEL PACIFICO
    SEBASTIAN BARRESSI ENCISO
    Derecho y Ciencias Sociales
  `;

  const parsed3 = OcrService.parseContractText(rawText3);
  assert.equal(parsed3.nombresApellidos, 'SEBASTIAN BARRESSI ENCISO');
  assert.equal(parsed3.carrera, 'Derecho');
});

test('OcrService validateStrictBatchIndices valida con precisión la integridad de los lotes', () => {
  const expectedLength = 4;

  // 1. Lote perfecto con índices 0, 1, 2, 3 en orden
  const perfectBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina' },
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología' },
    { index: 3, nombresApellidos: 'ALUMNO 3', carrera: 'Derecho' },
  ];
  const res1 = OcrService.validateStrictBatchIndices(perfectBatch, expectedLength);
  assert.equal(res1.isValid, true);
  assert.equal(res1.parsedList.length, 4);
  assert.equal(res1.parsedList[0].nombresApellidos, 'ALUMNO 0');
  assert.equal(res1.parsedList[3].nombresApellidos, 'ALUMNO 3');

  // 2. Lote desordenado pero completo (ej. 2, 0, 3, 1) -> debe ordenarse y ser válido
  const unorderedBatch = [
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología' },
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina' },
    { index: 3, nombresApellidos: 'ALUMNO 3', carrera: 'Derecho' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina' },
  ];
  const res2 = OcrService.validateStrictBatchIndices(unorderedBatch, expectedLength);
  assert.equal(res2.isValid, true);
  assert.equal(res2.parsedList[0].index, 0);
  assert.equal(res2.parsedList[3].index, 3);

  // 3. Lote con elemento faltante (longitud 3 en vez de 4) -> debe ser inválido
  const missingLengthBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina' },
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología' },
  ];
  const res3 = OcrService.validateStrictBatchIndices(missingLengthBatch, expectedLength);
  assert.equal(res3.isValid, false);

  // 4. Lote con índice duplicado (ej. 0, 1, 1, 3) -> debe ser inválido
  const duplicateBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina' },
    { index: 1, nombresApellidos: 'ALUMNO 1 DUPLICADO', carrera: 'Medicina' },
    { index: 3, nombresApellidos: 'ALUMNO 3', carrera: 'Derecho' },
  ];
  const res4 = OcrService.validateStrictBatchIndices(duplicateBatch, expectedLength);
  assert.equal(res4.isValid, false);

  // 5. Lote con índice fuera de rango (ej. índice 4 o 99) -> debe ser inválido
  const outOfBoundsBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina' },
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología' },
    { index: 4, nombresApellidos: 'ALUMNO 4', carrera: 'Derecho' },
  ];
  const res5 = OcrService.validateStrictBatchIndices(outOfBoundsBatch, expectedLength);
  assert.equal(res5.isValid, false);
});

test('BATCH_CONFIG exporta parámetros de lote y concurrencia ajustables', () => {
  assert.equal(typeof BATCH_CONFIG.BATCH_SIZE, 'number');
  assert.equal(typeof BATCH_CONFIG.MAX_CONCURRENCY, 'number');
  assert.equal(typeof BATCH_CONFIG.MAX_IMAGE_DIMENSION, 'number');
  assert.equal(BATCH_CONFIG.MAX_IMAGE_DIMENSION, 1024);
  assert.equal(BATCH_CONFIG.BATCH_SIZE, 6);
  assert.equal(BATCH_CONFIG.MAX_CONCURRENCY, 2);
});
