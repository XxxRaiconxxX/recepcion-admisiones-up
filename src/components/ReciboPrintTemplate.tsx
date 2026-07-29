import React from 'react';
import type { StudentData } from '../types/admission';

interface ReciboPrintTemplateProps {
  student: StudentData;
}

export const ReciboPrintTemplate: React.FC<ReciboPrintTemplateProps> = ({ student }) => {
  const nombreCompleto = `${student.nombres.trim()} ${student.apellidos.trim()}`;
  const isOdontologia = student.carrera === 'Odontología';

  return (
    <div id="print-receipt-content" className="w-full max-w-[210mm] mx-auto bg-white p-8 text-black font-sans text-[12pt] leading-relaxed border border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0">
      
      {/* Encabezado con Logo y Título Fieles a Imagen 1 */}
      <div className="flex justify-between items-start gap-6 border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex min-w-0 items-center space-x-3">
          <div className="w-14 h-14 shrink-0 bg-slate-900 text-white font-bold flex items-center justify-center text-2xl rounded">
            UP
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 font-serif uppercase">
              Universidad del Pacífico
            </h1>
            <p className="text-xs font-semibold text-slate-700 tracking-wider">
              FORMAMOS LÍDERES
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <h2 className="text-lg font-bold uppercase tracking-wider text-slate-900">
            RECEPCIÓN DE DOCUMENTOS
          </h2>
          <div className="text-sm font-semibold text-slate-700 mt-1">
            Fecha: <span className="font-mono underline decoration-dotted">{student.fecha || new Date().toLocaleDateString('es-PY')}</span>
          </div>
          <div className="text-lg font-mono font-bold text-red-700 tracking-widest mt-1">
            {student.numeroRecibo || '0030853'}
          </div>
        </div>
      </div>

      {/* Declaración del Recibo */}
      <div className="mb-6 space-y-3">
        <p className="text-justify">
          Declaro haber recibido del Sr. / Sra.{' '}
          <span className="font-bold underline px-2">{nombreCompleto || '________________________________________________'}</span>
        </p>
        <p className="text-justify">
          Con C.I.: <span className="font-bold underline px-2">{student.ci || '____________________'}</span> inscripto en la carrera / el post grado de:{' '}
          <span className="font-bold underline px-2">{student.carrera || '__________________________________'}</span>
        </p>
        <p className="font-medium text-slate-900 mt-2">
          la documentación que figura a continuación:
        </p>
      </div>

      {/* Lista de Documentos con Casillas de Verificación (Checkboxes) - Exacto a Imagen 1 */}
      <div className="space-y-3.5 my-6 pl-2">
        
        <div className="flex items-start space-x-3">
          <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.certificadoEstudios ? 'bg-slate-900 text-white' : 'bg-white'}`}>
            {student.certificadoEstudios && <span className="pdf-checkbox-check" />}
          </div>
          <span className="text-sm font-medium">
            Certificados de Estudios - Original Visado por la Supervisión Administrativa.
          </span>
        </div>

        <div className="flex items-start space-x-3">
          <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.fotocopiaCedula ? 'bg-slate-900 text-white' : 'bg-white'}`}>
            {student.fotocopiaCedula && <span className="pdf-checkbox-check" />}
          </div>
          <span className="text-sm font-medium">
            Fotocopia del Documento de Identidad Autenticada por Escribanía Paraguaya.
          </span>
        </div>

        <div className="flex items-start space-x-3">
          <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.fotosCarnet ? 'bg-slate-900 text-white' : 'bg-white'}`}>
            {student.fotosCarnet && <span className="pdf-checkbox-check" />}
          </div>
          <span className="text-sm font-medium">
            2 Fotografías Tamaño Carné.
          </span>
        </div>

        <div className="flex items-start space-x-3">
          <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.antecedentesPoliciales ? 'bg-slate-900 text-white' : 'bg-white'}`}>
            {student.antecedentesPoliciales && <span className="pdf-checkbox-check" />}
          </div>
          <span className="text-sm font-medium">
            Certificado de Antecedentes Policiales - Original.
          </span>
        </div>

        <div className="flex items-start space-x-3">
          <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.carnetMigraciones ? 'bg-slate-900 text-white' : 'bg-white'}`}>
            {student.carnetMigraciones && <span className="pdf-checkbox-check" />}
          </div>
          <span className="text-sm font-medium">
            Fotocopia Autenticada del Carné de Migraciones - Estudiantes Extranjeros.
          </span>
        </div>

        {/* Campos Condicionales de Odontología */}
        {isOdontologia && (
          <>
            <div className="flex items-start space-x-3">
              <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.tarjetaVacunacion ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                {student.tarjetaVacunacion && <span className="pdf-checkbox-check" />}
              </div>
              <span className="text-sm font-semibold text-purple-950">
                Tarjeta de vacunación (copia) - Requisito Facultad de Odontología.
              </span>
            </div>

            <div className="flex items-start space-x-3">
              <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.pruebaVistaOido ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                {student.pruebaVistaOido && <span className="pdf-checkbox-check" />}
              </div>
              <span className="text-sm font-semibold text-purple-950">
                Prueba de vista y Oído - Examen/Certificado de vista y oído.
              </span>
            </div>
          </>
        )}

        <div className="flex items-start space-x-3">
          <div className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-slate-900 flex items-center justify-center font-bold text-[12px] leading-none ${student.otros ? 'bg-slate-900 text-white' : 'bg-white'}`}>
            {student.otros && <span className="pdf-checkbox-check" />}
          </div>
          <div className="flex-1 min-w-0 h-5 leading-5 text-sm font-medium flex items-center gap-2">
            <span>Otros:</span>
            <span className="h-5 border-b border-dotted border-slate-700 flex-1 min-w-0 overflow-hidden whitespace-nowrap px-2 font-mono">
              {student.descripcionOtros || '\u00A0'}
            </span>
          </div>
        </div>

      </div>

      {/* Descripción de Otros si aplica */}
      {student.observaciones && (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs font-mono">
          <span className="font-bold">Observaciones adicionales:</span> {student.observaciones}
        </div>
      )}

      {/* Sección de Pie y Firmas Físicas - Imagen 1 */}
      <div className="mt-14 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs font-medium">
        <div>
          <div className="h-16 flex items-end justify-center mb-1">
            <span className="text-slate-400 italic text-[10px]">Firma física del alumno</span>
          </div>
          <div className="border-t border-slate-900 pt-1">
            <p className="font-bold">Firma del Alumno</p>
            <p className="text-[11px] text-slate-700 mt-0.5">
              C.I. N°: <span className="font-semibold">{student.ci}</span>
            </p>
            <p className="text-[11px] text-slate-700 mt-0.5">
              Aclaración: <span className="font-semibold">{nombreCompleto}</span>
            </p>
          </div>
        </div>

        <div>
          <div className="h-16 flex items-end justify-center mb-1">
            <span className="text-slate-400 italic text-[10px]">Firma y sello de recepción</span>
          </div>
          <div className="border-t border-slate-900 pt-1">
            <p className="font-bold">Firma de Recepción</p>
            <p className="text-[11px] text-slate-700 mt-0.5">
              Recepcionista: <span className="font-semibold">{student.nombreRecepcionista || 'Arlet Gonzalez'}</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Universidad del Pacífico - Admisiones
            </p>
          </div>
        </div>
      </div>

      {/* Pie Imprenta Legal / Formamos Líderes */}
      <div className="mt-8 text-[8px] text-slate-400 text-center border-t border-slate-100 pt-2 font-mono">
        UP Impresos • Universidad del Pacífico • Asunción, Paraguay • Recibo de Admisión
      </div>

    </div>
  );
};
