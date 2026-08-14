import test from 'node:test';
import assert from 'node:assert/strict';
import { OcrService, BATCH_CONFIG } from '../src/lib/ocrService.ts';

test('OcrService parser extrae correctamente nombres, carreras y cédula (Nro.:) de contratos tipo UP', () => {
  // Caso 1: Contrato real UP Kiara Libeth
  const rawTextKiara = `
    UP UNIVERSIDAD DEL PACÍFICO    BECADO    CONTRATO DE MATRÍCULA
    En la ciudad de ASUNCIÓN, República del Paraguay, a los 13 días, del mes Agosto del año 2026, firman el presente contrato de matrícula, la
    del Pacífico Privada, en adelante la "Universidad", y
    Nombres: KIARA LIBETH       Apellidos: TRINIDAD ARIAS       Carrera: MEDICINA
    Fecha de Nac.: 27/06/2007   Tipo de Documento: CÉDULA DE IDENTIDAD   Nro.: 7373454
    Nacionalidad: PARAGUAYA                                     Estado Civil: SOLTERO/A
    Título obtenido: TECNICO EN CONTABILIDAD  Colegio: 6239 COL. NAC. PROF. MIGUEL ANGEL
  `;

  const parsedKiara = OcrService.parseContractText(rawTextKiara);
  assert.equal(parsedKiara.nombresApellidos, 'KIARA LIBETH TRINIDAD ARIAS');
  assert.equal(parsedKiara.carrera, 'Medicina');
  assert.equal(parsedKiara.ci, '7373454');

  // Caso 2: Contrato real UP Pabla Margarita (foto adjunta del usuario)
  const rawTextPabla = `
    UP UNIVERSIDAD DEL PACÍFICO    BECADO    CONTRATO DE MATRÍCULA
    En la ciudad de ASUNCIÓN, República del Paraguay, a los 13 días, del mes Agosto del año 2026, firman el presente contrato de matrícula, la
    del Pacífico Privada, en adelante la "Universidad", y
    Nombres: PABLA MARGARITA    Apellidos: TROCHE FERNANDEZ     Carrera: MEDICINA
    Fecha de Nac.: 21/06/2008   Tipo de Documento: DOCUMENTO DE IDENTIDAD   Nro.: 7261797
    Nacionalidad: PARAGUAYA                                     Estado Civil: SOLTERO/A
  `;

  const parsedPabla = OcrService.parseContractText(rawTextPabla);
  assert.equal(parsedPabla.nombresApellidos, 'PABLA MARGARITA TROCHE FERNANDEZ');
  assert.equal(parsedPabla.carrera, 'Medicina');
  assert.equal(parsedPabla.ci, '7261797');

  // Caso 3: Contrato con patrón Estudiante y Carrera Odontología
  const rawText2 = `
    UNIVERSIDAD DEL PACÍFICO
    Estudiante: FERNANDA LUJAN
    Carrera: Odontología
    C.I. N° 5544332
  `;

  const parsed2 = OcrService.parseContractText(rawText2);
  assert.equal(parsed2.nombresApellidos, 'FERNANDA LUJAN');
  assert.equal(parsed2.carrera, 'Odontología');
  assert.equal(parsed2.ci, '5544332');
});

test('OcrService validateStrictBatchIndices valida con precisión la integridad de los lotes', () => {
  const expectedLength = 4;

  // 1. Lote perfecto con índices 0, 1, 2, 3 en orden
  const perfectBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina', ci: '111111' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina', ci: '222222' },
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología', ci: '333333' },
    { index: 3, nombresApellidos: 'ALUMNO 3', carrera: 'Derecho', ci: '444444' },
  ];
  const res1 = OcrService.validateStrictBatchIndices(perfectBatch, expectedLength);
  assert.equal(res1.isValid, true);
  assert.equal(res1.parsedList.length, 4);
  assert.equal(res1.parsedList[0].nombresApellidos, 'ALUMNO 0');
  assert.equal(res1.parsedList[0].ci, '111111');
  assert.equal(res1.parsedList[3].nombresApellidos, 'ALUMNO 3');
  assert.equal(res1.parsedList[3].ci, '444444');

  // 2. Lote desordenado pero completo (ej. 2, 0, 3, 1) -> debe ordenarse y ser válido
  const unorderedBatch = [
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología', ci: '333333' },
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina', ci: '111111' },
    { index: 3, nombresApellidos: 'ALUMNO 3', carrera: 'Derecho', ci: '444444' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina', ci: '222222' },
  ];
  const res2 = OcrService.validateStrictBatchIndices(unorderedBatch, expectedLength);
  assert.equal(res2.isValid, true);
  assert.equal(res2.parsedList[0].index, 0);
  assert.equal(res2.parsedList[3].index, 3);

  // 3. Lote con elemento faltante (longitud 3 en vez de 4) -> debe ser inválido
  const missingLengthBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina', ci: '111111' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina', ci: '222222' },
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología', ci: '333333' },
  ];
  const res3 = OcrService.validateStrictBatchIndices(missingLengthBatch, expectedLength);
  assert.equal(res3.isValid, false);

  // 4. Lote con índice duplicado (ej. 0, 1, 1, 3) -> debe ser inválido
  const duplicateBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina', ci: '111111' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina', ci: '222222' },
    { index: 1, nombresApellidos: 'ALUMNO 1 DUPLICADO', carrera: 'Medicina', ci: '222222' },
    { index: 3, nombresApellidos: 'ALUMNO 3', carrera: 'Derecho', ci: '444444' },
  ];
  const res4 = OcrService.validateStrictBatchIndices(duplicateBatch, expectedLength);
  assert.equal(res4.isValid, false);

  // 5. Lote con índice fuera de rango (ej. índice 4 o 99) -> debe ser inválido
  const outOfBoundsBatch = [
    { index: 0, nombresApellidos: 'ALUMNO 0', carrera: 'Medicina', ci: '111111' },
    { index: 1, nombresApellidos: 'ALUMNO 1', carrera: 'Medicina', ci: '222222' },
    { index: 2, nombresApellidos: 'ALUMNO 2', carrera: 'Odontología', ci: '333333' },
    { index: 4, nombresApellidos: 'ALUMNO 4', carrera: 'Derecho', ci: '444444' },
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
