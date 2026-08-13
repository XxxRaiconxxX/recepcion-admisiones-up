import test from 'node:test';
import assert from 'node:assert/strict';
import { OcrService } from '../src/lib/ocrService.ts';

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
