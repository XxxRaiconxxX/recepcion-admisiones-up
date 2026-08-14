import React from 'react';
import type { BatchCargoData, BatchCargoStudent } from '../types/batchCargo';

interface BatchCargoPrintTemplateProps {
  batchData: BatchCargoData;
}

export const BatchCargoPrintTemplate: React.FC<BatchCargoPrintTemplateProps> = ({ batchData }) => {
  const { header, students } = batchData;

  // Dividir los alumnos en páginas continuas A4 (6 alumnos en hoja 1 por encabezado, 8 en hojas intermedias)
  const paginateStudents = (items: BatchCargoStudent[]) => {
    const pages: BatchCargoStudent[][] = [];
    let currentIdx = 0;

    // Primera página: 6 alumnos para dejar espacio al encabezado completo
    const firstPageCount = 6;
    pages.push(items.slice(0, firstPageCount));
    currentIdx += firstPageCount;

    // Páginas siguientes: 8 alumnos por página
    const subsequentPageCount = 8;
    while (currentIdx < items.length) {
      pages.push(items.slice(currentIdx, currentIdx + subsequentPageCount));
      currentIdx += subsequentPageCount;
    }

    if (pages.length === 0) {
      pages.push([]);
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
            className="w-full max-w-[210mm] min-h-[297mm] mx-auto bg-white p-8 text-black font-sans text-[11pt] leading-relaxed border border-slate-300 shadow-lg rounded-sm flex flex-col justify-between print:border-none print:shadow-none print:p-0 print:min-h-0 print:page-break-after"
          >
            <div>
              {/* Encabezado N° Promoción y Paginación */}
              <div className="flex justify-between items-center text-xs font-semibold text-slate-800 mb-3 border-b border-slate-200 pb-1">
                <span>Universidad del Pacífico • Admisiones y Recepción</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{header.numeroCargo || 'N° / 2026 Promoción'}</span>
                  <span className="text-slate-500 font-mono">Página {pageIdx + 1} de {totalPages}</span>
                </div>
              </div>

              {/* Encabezado completo en la primera página */}
              {isFirstPage ? (
                <div className="border border-slate-900 rounded-sm p-4 mb-5 bg-slate-50/50">
                  <h1 className="text-xl font-bold uppercase tracking-wide text-slate-900 border-b border-slate-400 pb-2 mb-3">
                    Cargo de Entrega
                  </h1>
                  
                  <div
                    className="grid gap-x-3 gap-y-1.5 text-sm"
                    style={{ gridTemplateColumns: '7rem minmax(0, 1fr)' }}
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
                <div className="mb-4 text-xs font-bold uppercase text-slate-700 bg-slate-100 p-2 rounded flex justify-between">
                  <span>Cargo de Entrega (Continuación) — {header.referencia}</span>
                  <span>Fecha: {header.fecha}</span>
                </div>
              )}

              {/* Tabla de Alumnos de esta página */}
              <div className="overflow-hidden border border-slate-900 mb-4">
                <table className="w-full table-fixed text-left border-collapse text-xs">
                  <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '38%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase tracking-wide text-[9px]">
                      <th className="p-2 border-r border-slate-700">Nombres y Apellidos</th>
                      <th className="p-2 border-r border-slate-700">Carrera</th>
                      <th className="p-2 border-r border-slate-700">Documentos</th>
                      <th className="p-2">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {pageStudents.map((student, sIdx) => {
                      const docItems = student.documentos.length > 0 
                        ? student.documentos 
                        : [`CONTRATO ${student.carrera.toUpperCase()}`];

                      return (
                        <tr key={student.id || sIdx} className="align-top hover:bg-slate-50">
                          <td className="p-2 border-r border-slate-900 font-bold uppercase text-slate-900 text-[11px]" style={{ overflowWrap: 'anywhere' }}>
                            <div>{student.nombresApellidos}</div>
                            {student.ci && (
                              <div className="text-[10px] text-slate-700 font-mono font-normal mt-0.5">
                                C.I. N°: {student.ci}
                              </div>
                            )}
                          </td>
                          <td className="p-2 border-r border-slate-900 font-semibold uppercase text-slate-800 text-[10px]" style={{ overflowWrap: 'anywhere' }}>
                            {student.carrera}
                          </td>
                          <td className="p-2 border-r border-slate-900 text-[10px] leading-snug font-mono text-slate-900" style={{ overflowWrap: 'anywhere' }}>
                            <ul className="list-disc pl-3 space-y-0.5">
                              {docItems.map((doc, dIdx) => (
                                <li key={dIdx}>{doc.toUpperCase()}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="p-2 text-[10px] leading-snug font-semibold text-slate-800" style={{ overflowWrap: 'anywhere' }}>
                            {student.observacion || header.observacionGlobal || 'JULIO 2026'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cierre Formal y Firmas al pie de la última página */}
            {isLastPage ? (
              <div className="pt-2">
                <p className="italic text-xs text-slate-800 mb-6">
                  Sin otro particular, me despido muy atentamente.
                </p>

                <div className="grid grid-cols-2 gap-12 pt-3 border-t border-slate-300 text-xs">
                  {/* Firma Recepción */}
                  <div className="space-y-1">
                    <div className="h-16 flex items-end mb-1">
                      <span className="text-slate-400 italic text-[10px]">Firma de quien recepciona</span>
                    </div>
                    <div className="border-t border-slate-900 pt-1">
                      <p className="font-bold text-slate-900">Recibido por:</p>
                      <p className="text-slate-700 font-semibold mt-0.5">
                        {header.para || 'Arlet Gonzalez'}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Aclaración de firma / Fecha: {header.fecha}
                      </p>
                    </div>
                  </div>

                  {/* Firma Asesor */}
                  <div className="space-y-1 text-right">
                    <div className="h-16 flex items-end justify-end mb-1">
                      <span className="text-slate-400 italic text-[10px]">Firma del Asesor Comercial</span>
                    </div>
                    <div className="border-t border-slate-900 pt-1">
                      <p className="font-bold text-slate-900 uppercase">
                        {header.de || 'AXEL FRETES'}
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
            ) : (
              <div className="text-right text-[10px] text-slate-400 italic">
                Continúa en la siguiente página...
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
