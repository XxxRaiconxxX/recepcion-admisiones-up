import React from 'react';
import type { StudentData } from '../types/admission';

interface CargoPrintTemplateProps {
  student: StudentData;
}

export const CargoPrintTemplate: React.FC<CargoPrintTemplateProps> = ({ student }) => {
  const nombreCompleto = `${student.nombres.trim().toUpperCase()} ${student.apellidos.trim().toUpperCase()}`;

  // Construcción de la lista en cadena de texto para la columna Documentos (Idéntico a Imagen 2)
  const docsList: string[] = [];
  if (student.contratoFirmado || true) docsList.push(`CONTRATO ${student.carrera.toUpperCase()}`);
  if (student.certificadoEstudios) docsList.push('CERTIFICADO DE ESTUDIO');
  if (student.fotosCarnet) docsList.push('FOTO TIPO CARNET 2');
  if (student.antecedentesPoliciales) docsList.push('ANTECEDENTES POLICIALES');
  if (student.fotocopiaCedula) docsList.push('CEDULA FOTOCOPIA AUTENTICADA');
  if (student.carnetMigraciones) docsList.push('CARNÉ MIGRACIONES');
  if (student.otros && student.descripcionOtros) docsList.push(student.descripcionOtros.toUpperCase());

  return (
    <div id="print-cargo-content" className="w-full max-w-[210mm] mx-auto bg-white p-8 text-black font-sans text-[11pt] leading-relaxed border border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0">
      
      {/* Encabezado N° Promoción */}
      <div className="text-right font-semibold text-slate-800 text-sm mb-4">
        {student.numeroCargo || 'N° / 2026 Promoción'}
      </div>

      {/* Encabezado Fiel a Imagen 2 (Caja Cargo de Entrega) */}
      <div className="border border-slate-900 rounded-sm p-4 mb-6 bg-slate-50/50">
        <h1 className="text-xl font-bold uppercase tracking-wide text-slate-900 border-b border-slate-400 pb-2 mb-3">
          Cargo de Entrega
        </h1>
        
        <div className="grid grid-cols-1 gap-1.5 text-sm">
          <div className="flex">
            <span className="font-bold w-28">Para:</span>
            <span className="font-semibold text-slate-900">{student.nombreRecepcionista || 'Felipa Silva'}</span>
            <span className="text-slate-500 ml-2">(Archivo / Recepción)</span>
          </div>

          <div className="flex">
            <span className="font-bold w-28">De:</span>
            <span className="font-semibold text-slate-900">{student.nombreAsesor || 'Axel Fretes'}</span>
            <span className="text-slate-500 ml-2">(Promoción / Grado)</span>
          </div>

          <div className="flex">
            <span className="font-bold w-28">Referencia:</span>
            <span className="font-semibold text-slate-900">Entrega de Documentos y contratos de estudiantes</span>
          </div>

          <div className="flex">
            <span className="font-bold w-28">Fecha:</span>
            <span className="font-mono font-semibold text-slate-900">{student.fecha || new Date().toLocaleDateString('es-PY')}</span>
          </div>
        </div>
      </div>

      {/* Tabla de Alumnos y Legajos Entregados - Fiel a Imagen 2 */}
      <div className="overflow-hidden border border-slate-900 mb-8">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
              <th className="p-2.5 border-r border-slate-700 w-1/4">Nombres y Apellidos</th>
              <th className="p-2.5 border-r border-slate-700 w-1/6">CARRERA</th>
              <th className="p-2.5 border-r border-slate-700 w-1/2">Documentos</th>
              <th className="p-2.5 w-1/6">Observación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900">
            <tr className="align-top">
              <td className="p-2.5 border-r border-slate-900 font-bold uppercase text-slate-900">
                {nombreCompleto}
              </td>
              <td className="p-2.5 border-r border-slate-900 font-semibold uppercase text-slate-800">
                {student.carrera || 'MEDICINA'}
              </td>
              <td className="p-2.5 border-r border-slate-900 text-[10px] leading-snug font-mono text-slate-900">
                <ul className="list-disc pl-3 space-y-0.5">
                  {docsList.map((doc, idx) => (
                    <li key={idx}>{doc}</li>
                  ))}
                </ul>
              </td>
              <td className="p-2.5 text-xs font-semibold text-slate-800">
                {student.observaciones || 'JULIO 2026'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cierre Formal */}
      <p className="italic text-sm text-slate-800 mb-16">
        Sin otro particular, me despido muy atentamente.
      </p>

      {/* Firmas Físicas Cruzadas - Imagen 2 */}
      <div className="grid grid-cols-2 gap-12 pt-4 border-t border-slate-300 text-xs">
        
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
