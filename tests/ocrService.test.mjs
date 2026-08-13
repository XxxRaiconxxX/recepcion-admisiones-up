import test from 'node:test';
import assert from 'node:assert/strict';
import { OcrService } from '../src/lib/ocrService.ts';

test('OcrService parser extrae correctamente nombres y carreras de contratos tipo UP', () => {
  // Caso 1: Contrato típico con encabezado Alumno y Carrera Medicina
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

  // Caso 2: Contrato con patrón Estudiante y Carrera Odontología
  const rawText2 = `
    UNIVERSIDAD DEL PACÍFICO
    Estudiante: FERNANDA LUJAN
    Carrera: Odontología
  `;

  const parsed2 = OcrService.parseContractText(rawText2);
  assert.equal(parsed2.nombresApellidos, 'FERNANDA LUJAN');
  assert.equal(parsed2.carrera, 'Odontología');

  // Caso 3: Nombre en mayúsculas destacado y Carrera Derecho
  const rawText3 = `
    UNIVERSIDAD DEL PACIFICO
    SEBASTIAN BARRESSI ENCISO
    Derecho y Ciencias Sociales
  `;

  const parsed3 = OcrService.parseContractText(rawText3);
  assert.equal(parsed3.nombresApellidos, 'SEBASTIAN BARRESSI ENCISO');
  assert.equal(parsed3.carrera, 'Derecho');
});
