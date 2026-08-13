import React from 'react';
import { X, Printer, FileSpreadsheet, CheckCircle, FileText } from 'lucide-react';
import type { BatchCargoData } from '../types/batchCargo';
import { BatchCargoPrintTemplate } from './BatchCargoPrintTemplate';
import { DocumentExporter } from '../lib/pdfExport';

interface BatchCargoModalProps {
  batchData: BatchCargoData;
  onClose: () => void;
}

export const BatchCargoModal: React.FC<BatchCargoModalProps> = ({ batchData, onClose }) => {
  const handlePrint = () => {
    DocumentExporter.printElement('print-batch-cargo-content');
  };

  const handleDownloadWord = () => {
    DocumentExporter.generateBatchCargoWordDocx(batchData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-white">
        
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              Vista Previa de Cargo de Entrega Masivo ({batchData.students.length} Alumnos)
            </h3>
            <p className="text-xs text-slate-400">
              Formato oficial multi-página A4 • Universidad del Pacífico
            </p>
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
          <BatchCargoPrintTemplate batchData={batchData} />
        </div>

        {/* Pie de Modal y Acciones */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Total: <strong>{batchData.students.length} alumnos</strong> listados para entrega en un solo cargo.
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadWord}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center gap-2 border border-slate-700 cursor-pointer shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Descargar Cargo Masivo en Word (.docx)
            </button>

            <button
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir Cargo A4
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
