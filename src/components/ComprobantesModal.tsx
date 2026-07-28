import React, { useState } from 'react';
import { X, Printer, FileSpreadsheet, CheckCircle, FileText } from 'lucide-react';
import type { StudentData } from '../types/admission';
import { ReciboPrintTemplate } from './ReciboPrintTemplate';
import { CargoPrintTemplate } from './CargoPrintTemplate';
import { DocumentExporter } from '../lib/pdfExport';

interface ComprobantesModalProps {
  student: StudentData;
  onClose: () => void;
}

export const ComprobantesModal: React.FC<ComprobantesModalProps> = ({ student, onClose }) => {
  const [activeTab, setActiveTab] = useState<'recibo' | 'cargo'>('recibo');

  const handlePrintCurrent = () => {
    if (activeTab === 'recibo') {
      DocumentExporter.printElement('print-receipt-content');
    } else {
      DocumentExporter.printElement('print-cargo-content');
    }
  };

  const handleDownloadWord = () => {
    const docsList: string[] = [];
    if (student.contratoFirmado) docsList.push(`CONTRATO ${student.carrera.toUpperCase()}`);
    if (student.certificadoEstudios) docsList.push('CERTIFICADO DE ESTUDIO');
    if (student.fotosCarnet) docsList.push('FOTO TIPO CARNET 2');
    if (student.antecedentesPoliciales) docsList.push('ANTECEDENTES POLICIALES');
    if (student.fotocopiaCedula) docsList.push('CEDULA FOTOCOPIA AUTENTICADA');

    DocumentExporter.generateCargoWordDocx(student, docsList.join(', '));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 text-white">
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              Vista Previa de Comprobantes Oficiales
            </h3>
            <p className="text-xs text-slate-400">
              {student.ci} - {student.nombres} {student.apellidos}
            </p>
          </div>

          {/* Selector de Pestañas */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTab('recibo')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'recibo'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1. Recibo de Recepción (Alumno)
            </button>
            <button
              onClick={() => setActiveTab('cargo')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'cargo'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2. Cargo de Entrega (Asesor)
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo Vista Previa */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-950 flex justify-center">
          {activeTab === 'recibo' ? (
            <ReciboPrintTemplate student={student} />
          ) : (
            <CargoPrintTemplate student={student} />
          )}
        </div>

        {/* Pie de Modal y Acciones */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-white">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Ambos documentos listos con formato idéntico a las fotos físicas.
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'cargo' && (
              <button
                onClick={handleDownloadWord}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center gap-2 border border-slate-700"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Descargar Cargo en Word (.docx)
              </button>
            )}

            <button
              onClick={handlePrintCurrent}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir {activeTab === 'recibo' ? 'Recibo UP (A4)' : 'Cargo (A4)'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
