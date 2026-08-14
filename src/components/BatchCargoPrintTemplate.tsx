import React from 'react';
import type { BatchCargoData, BatchCargoStudent } from '../types/batchCargo';

interface BatchCargoPrintTemplateProps {
  batchData: BatchCargoData;
}

export const BatchCargoPrintTemplate: React.FC<BatchCargoPrintTemplateProps> = ({ batchData }) => {
  const { header, students } = batchData;

  // Paginación continua inteligente y compacta
  // Permite agrupar muchos más alumnos por hoja y continúa limpiamente en las hojas siguientes.
  const paginateStudents = (items: BatchCargoStudent[]) => {
    if (items.length === 0) return [[]];

    // Si entran todos en 1 sola hoja con firmas (hasta 9 alumnos)
    if (items.length <= 9) {
      return [items];
    }

    const pages: BatchCargoStudent[][] = [];
    let currentIdx = 0;

    // Hoja 1: Encabezado formal + hasta 10 alumnos
    const page1Count = Math.min(items.length, 10);
    pages.push(items.slice(0, page1Count));
    currentIdx += page1Count;

    // Hojas siguientes (Hojas intermedias y final)
    while (currentIdx < items.length) {
      const remaining = items.length - currentIdx;
      // Si los restantes entran cómodamente en la hoja final con firmas (hasta 13 alumnos)
      if (remaining <= 13) {
        pages.push(items.slice(currentIdx));
        break;
      }
      // Hojas intermedias sin firmas: entran hasta 16 alumnos
      const batchCount = 16;
      pages.push(items.slice(currentIdx, currentIdx + batchCount));
      currentIdx += batchCount;
    }

    return pages;
  };

  const studentPages = paginateStudents(students);
  const totalPages = studentPages.length;

  return (
    <div id="print-batch-cargo-content" className="space-y-6 print:space-y-0 text-black font-sans">
      {studentPages.map((pageStudents, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const isLastPage = pageIdx === totalPages - 1;

        return (
          <div
            key={pageIdx}
            className="w-full max-w-[210mm] min-h-[297mm] mx-auto bg-white p-7 text-black font-sans text-[10pt] leading-tight border border-slate-300 shadow-lg rounded-sm flex flex-col justify-between print:border-none print:shadow-none print:p-0 print:min-h-0 print:page-break-after"
          >
            <div>
              {/* Encabezado N° Promoción y Paginación */}
              <div className="flex justify-between items-center text-[10px] font-semibold text-slate-800 mb-2 border-b border-slate-200 pb-1">
                <span>Universidad del Pacífico • Admisiones y Recepción</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{header.numeroCargo || 'N° / 2026 Promoción'}</span>
                  <span className="text-slate-500 font-mono font-bold">Página {pageIdx + 1} de {totalPages}</span>
                </div>
              </div>

              {/* Encabezado completo SOLO en la primera página */}
              {isFirstPage ? (
                <div className="border border-slate-900 rounded-sm p-3 mb-3 bg-slate-50/60">
                  <h1 className="text-lg font-bold uppercase tracking-wide text-slate-900 border-b border-slate-400 pb-1 mb-2 text-center">
                    Cargo de Entrega
                  </h1>
                  
                  <div
                    className="grid gap-x-3 gap-y-1 text-xs"
                    style={{ gridTemplateColumns: '6.5rem minmax(0, 1fr)' }}
                  >
                    <span className="font-bold">Para:</span>
                    <span>
                      <span className="font-semibold text-slate-900">{header.para || 'Arlet Gonzalez'}</span>
                      <span className="text-slate-500 ml-2">({header.paraCargo || 'Archivo / Recepción'})</span>
                    </span>

                    <span className="font-bold">De:</span>
                    <span>
                      <span className="font-semibold text-slate-900">{header.de || 'Axel Fretes'}</span>
                      <span className="text-slate-500 ml-2">({header.deCargo || 'Promoción / Grado'})</span>
                    </span>

                    <span className="font-bold">Referencia:</span>
                    <span className="font-semibold text-slate-900">
                      {header.referencia || 'Entrega de Documentos y contratos de estudiantes'}
                    </span>

                    <span className="font-bold">Fecha:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {header.fecha || new Date().toLocaleDateString('es-PY')}
                    </span>
                  </div>
                </div>
              ) : (
                /* En hojas siguientes: Cabecera minimalista de continuación (NO repite el cargo completo) */
                <div className="mb-2.5 text-[11px] font-bold uppercase text-slate-800 bg-slate-100/80 px-3 py-1.5 rounded border border-slate-300 flex justify-between items-center">
                  <span>Cargo de Entrega — Continuación de Alumnos</span>
                  <span className="font-mono text-[10px] text-slate-600">Fecha: {header.fecha}</span>
                </div>
              )}

              {/* Tabla Compacta de Alumnos */}
              <div className="overflow-hidden border border-slate-900 mb-3">
                <table className="w-full table-fixed text-left border-collapse text-[10px]">
                  <colgroup>
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '36%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase tracking-wide text-[8.5px]">
                      <th className="p-1.5 border-r border-slate-700">Nombres y Apellidos</th>
                      <th className="p-1.5 border-r border-slate-700">Carrera</th>
                      <th className="p-1.5 border-r border-slate-700">Documentos</th>
                      <th className="p-1.5">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {pageStudents.map((student, sIdx) => {
                      const docItems = student.documentos.length > 0 
                        ? student.documentos 
                        : [`CONTRATO ${student.carrera.toUpperCase()}`];

                      return (
                        <tr key={student.id || sIdx} className="align-top hover:bg-slate-50">
                          <td className="p-1.5 border-r border-slate-900 font-bold uppercase text-slate-900 text-[10px]" style={{ overflowWrap: 'anywhere' }}>
                            <div>{student.nombresApellidos}</div>
                            {student.ci && (
                              <div className="text-[9px] text-slate-700 font-mono font-normal mt-0.5">
                                C.I. N°: {student.ci}
                              </div>
                            )}
                          </td>
                          <td className="p-1.5 border-r border-slate-900 font-semibold uppercase text-slate-800 text-[9.5px]" style={{ overflowWrap: 'anywhere' }}>
                            {student.carrera}
                          </td>
                          <td className="p-1.5 border-r border-slate-900 text-[9px] leading-snug font-mono text-slate-900" style={{ overflowWrap: 'anywhere' }}>
                            <ul className="list-disc pl-2.5 space-y-0.5">
                              {docItems.map((doc, dIdx) => (
                                <li key={dIdx}>{doc.toUpperCase()}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="p-1.5 text-[9px] leading-snug font-semibold text-slate-800" style={{ overflowWrap: 'anywhere' }}>
                            {student.observacion || header.observacionGlobal || 'JULIO 2026'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cierre Formal y Bloque de Firmas ÚNICAMENTE al pie de la última página */}
            {isLastPage ? (
              <div className="pt-2">
                <p className="italic text-[10px] text-slate-800 mb-3">
                  Sin otro particular, me despido muy atentamente.
                </p>

                <div className="grid grid-cols-2 gap-8 pt-2 border-t border-slate-300 text-xs">
                  {/* Firma Recepción */}
                  <div className="space-y-0.5">
                    <div className="h-12 flex items-end mb-1">
                      <span className="text-slate-400 italic text-[9px]">Firma de quien recepciona</span>
                    </div>
                    <div className="border-t border-slate-900 pt-1">
                      <p className="font-bold text-slate-900 text-[10px]">Recibido por:</p>
                      <p className="text-slate-700 font-semibold text-[10px] mt-0.5">
                        {header.para || 'Arlet Gonzalez'}
                      </p>
                      <p className="text-[9px] text-slate-500">
                        Aclaración de firma / Fecha: {header.fecha}
                      </p>
                    </div>
                  </div>

                  {/* Firma Asesor */}
                  <div className="space-y-0.5 text-right">
                    <div className="h-12 flex items-end justify-end mb-1">
                      <span className="text-slate-400 italic text-[9px]">Firma del Asesor Comercial</span>
                    </div>
                    <div className="border-t border-slate-900 pt-1">
                      <p className="font-bold text-slate-900 uppercase text-[10px]">
                        {header.de || 'AXEL FRETES'}
                      </p>
                      <p className="text-slate-700 font-medium text-[10px]">
                        Asesor Grado Promoción
                      </p>
                      <p className="text-[9px] text-slate-500">
                        Universidad del Pacífico
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-right text-[9px] text-slate-400 italic border-t border-slate-100 pt-1">
                Continúa en la página {pageIdx + 2}...
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
