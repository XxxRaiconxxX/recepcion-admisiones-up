import React from 'react';
import type { StudentData } from '../types/admission';

interface CargoPrintTemplateProps {
  student: StudentData;
}

export const CargoPrintTemplate: React.FC<CargoPrintTemplateProps> = ({ student }) => {
  const nombreCompleto = `${student.nombres.trim().toUpperCase()} ${student.apellidos.trim().toUpperCase()}`;

  // Construcción de la lista en cadena de texto para la columna Documentos (Idéntico a Imagen 2)
  const docsList: string[] = [`CONTRATO ${student.carrera.toUpperCase()}`];
  if (student.certificadoEstudios) docsList.push('CERTIFICADO DE ESTUDIO');
  if (student.fotosCarnet) docsList.push('FOTO TIPO CARNET 2');
  if (student.antecedentesPoliciales) docsList.push('ANTECEDENTES POLICIALES');
  if (student.fotocopiaCedula) docsList.push('CEDULA FOTOCOPIA AUTENTICADA');
  if (student.carnetMigraciones) docsList.push('CARNÉ MIGRACIONES');
  if (student.otros && student.descripcionOtros) docsList.push(student.descripcionOtros.toUpperCase());

  return (
    <div id="print-cargo-content" className="w-full max-w-[210mm] min-h-[270mm] mx-auto bg-white p-8 text-black font-sans text-[11pt] leading-relaxed border border-slate-300 shadow-sm flex flex-col print:border-none print:shadow-none print:p-0">
      
      {/* Encabezado N° Promoción */}
      <div className="text-right font-semibold text-slate-800 text-sm mb-4">
        {student.numeroCargo || 'N° / 2026 Promoción'}
      </div>

      {/* Encabezado Fiel a Imagen 2 (Caja Cargo de Entrega) */}
      <div className="border border-slate-900 rounded-sm p-4 mb-6 bg-slate-50/50">
        <h1 className="text-xl font-bold uppercase tracking-wide text-slate-900 border-b border-slate-400 pb-2 mb-3">
          Cargo de Entrega
        </h1>
        
        <div
          className="grid gap-x-3 gap-y-1.5 text-sm"
          style={{ gridTemplateColumns: '7rem minmax(0, 1fr)' }}
        >
          <span className="font-bold">Para:</span>
          <span>
            <span className="font-semibold text-slate-900">
              {student.nombreRecepcionista || 'Arlet Gonzalez'}
            </span>
            <span className="text-slate-500 ml-2">(Archivo / Recepción)</span>
          </span>

          <span className="font-bold">De:</span>
          <span>
            <span className="font-semibold text-slate-900">
              {student.nombreAsesor || 'Axel Fretes'}
            </span>
            <span className="text-slate-500 ml-2">(Promoción / Grado)</span>
          </span>

          <span className="font-bold">Referencia:</span>
          <span className="font-semibold text-slate-900">
            Entrega de documentos y contratos de estudiantes
          </span>

          <span className="font-bold">Fecha:</span>
          <span className="font-mono font-semibold text-slate-900">
            {student.fecha || new Date().toLocaleDateString('es-PY')}
          </span>
        </div>
      </div>

      {/* Tabla de Alumnos y Legajos Entregados - Fiel a Imagen 2 */}
      <div className="overflow-hidden border border-slate-900 mb-8">
        <table className="w-full table-fixed text-left border-collapse text-xs">
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '42%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-900 text-white font-bold uppercase tracking-wide text-[9px]">
              <th className="p-2.5 border-r border-slate-700">Nombres y Apellidos</th>
              <th className="p-2.5 border-r border-slate-700">Carrera</th>
              <th className="p-2.5 border-r border-slate-700">Documentos</th>
              <th className="p-2.5">Observación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900">
            <tr className="align-top">
              <td className="p-2.5 border-r border-slate-900 font-bold uppercase text-slate-900" style={{ overflowWrap: 'anywhere' }}>
                {nombreCompleto}
              </td>
              <td className="p-2.5 border-r border-slate-900 font-semibold uppercase text-slate-800" style={{ overflowWrap: 'anywhere' }}>
                {student.carrera || 'MEDICINA'}
              </td>
              <td className="p-2.5 border-r border-slate-900 text-[10px] leading-snug font-mono text-slate-900" style={{ overflowWrap: 'anywhere' }}>
                <ul className="list-disc pl-3 space-y-0.5">
                  {docsList.map((doc, idx) => (
                    <li key={idx}>{doc}</li>
                  ))}
                </ul>
              </td>
              <td className="p-2.5 text-[10px] leading-snug font-semibold text-slate-800" style={{ overflowWrap: 'anywhere' }}>
                {student.observaciones || 'JULIO 2026'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cierre Formal */}
      <p className="italic text-sm text-slate-800">
        Sin otro particular, me despido muy atentamente.
      </p>

      {/* Firmas Físicas Cruzadas - Imagen 2 */}
      <div className="mt-auto grid grid-cols-2 gap-12 pt-4 border-t border-slate-300 text-xs">
        
        {/* Lado Izquierdo: Firma Recepción */}
        <div className="space-y-1">
          <div className="h-20 flex items-end mb-2">
            <span className="text-slate-400 italic text-[10px]">Firma de quien recepciona</span>
          </div>
          <div className="border-t border-slate-900 pt-1">
            <p className="font-bold text-slate-900">Recibido por:</p>
            <p className="text-slate-700 font-semibold mt-0.5">
              {student.nombreRecepcionista || 'Arlet Gonzalez'}
            </p>
            <p className="text-[10px] text-slate-500">
              Aclaración de firma / Fecha: {student.fecha}
            </p>
          </div>
        </div>

        {/* Lado Derecho: Firma Asesor */}
        <div className="space-y-1 text-right">
          <div className="h-20 flex items-end justify-end mb-2">
            <span className="text-slate-400 italic text-[10px]">Firma del Asesor Comercial</span>
          </div>
          <div className="border-t border-slate-900 pt-1">
            <p className="font-bold text-slate-900 uppercase">
              {student.nombreAsesor || 'AXEL FRETES'}
            </p>
            <p className="text-slate-700 font-medium">
              Asesor Grado Promoción
            </p>
            <p className="text-[10px] text-slate-500">
              Universidad del Pacífico
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};
