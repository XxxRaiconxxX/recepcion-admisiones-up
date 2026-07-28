import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cloud, 
  CheckCircle2, 
  FolderPlus, 
  FileCheck2, 
  Upload, 
  ExternalLink, 
  ShieldCheck, 
  RefreshCw
} from 'lucide-react';
import type { StudentData } from '../types/admission';
import { GOOGLE_DRIVE_ROOT_URL } from '../lib/driveClient';

interface DriveSimulationModalProps {
  student: StudentData;
  onClose: () => void;
  onComplete: () => void;
}

export const DriveSimulationModal: React.FC<DriveSimulationModalProps> = ({ student, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [progress, setProgress] = useState<number>(0);
  const [isFinished, setIsFinished] = useState(false);

  const folderName = `${student.ci.trim()}-${student.nombres.trim()} ${student.apellidos.trim()}`;

  // Simulación limpia y fluida para el usuario
  useEffect(() => {
    let isSubscribed = true;

    const runSimulation = async () => {
      // Paso 1: Autenticación
      if (!isSubscribed) return;
      setCurrentStep(1);
      setProgress(25);
      await new Promise((r) => setTimeout(r, 700));

      // Paso 2: Creación de Carpeta
      if (!isSubscribed) return;
      setCurrentStep(2);
      setProgress(50);
      await new Promise((r) => setTimeout(r, 700));

      // Paso 3: Generación de PDFs
      if (!isSubscribed) return;
      setCurrentStep(3);
      setProgress(75);
      await new Promise((r) => setTimeout(r, 700));

      // Paso 4: Subida a Drive
      if (!isSubscribed) return;
      setCurrentStep(4);
      setProgress(100);
      setIsFinished(true);
      onComplete();
    };

    runSimulation();

    return () => {
      isSubscribed = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-white">
        
        {/* Header Modal Limpio */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Cloud className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-heading text-slate-100">
                Conexión y Subida a Google Drive
              </h3>
              <p className="text-xs text-slate-400">
                Legajo del alumno: <span className="text-emerald-400 font-mono font-bold">{folderName}</span>
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Modal Orientado al Usuario */}
        <div className="p-6 space-y-6 bg-slate-950">
          
          {/* Barra de Progreso General */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-300 flex items-center gap-2">
                {!isFinished ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                    Enviando comprobantes a Google Drive...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                    ¡Subida completada con éxito!
                  </>
                )}
              </span>
              <span className="text-emerald-400 font-mono font-bold text-sm">{progress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
              <div 
                className="bg-gradient-to-r from-blue-600 to-emerald-400 h-3 transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          {/* Pasos Limpios e Intuitivos */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            
            <div className={`p-3 rounded-xl border transition-all ${
              currentStep >= 1 ? 'bg-slate-900 border-blue-500 text-blue-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'
            }`}>
              <ShieldCheck className="w-5 h-5 mx-auto mb-1 text-blue-400" />
              <div className="font-bold text-[11px]">1. Conexión</div>
              <div className="text-[9px] text-slate-400">Verificando</div>
            </div>

            <div className={`p-3 rounded-xl border transition-all ${
              currentStep >= 2 ? 'bg-slate-900 border-blue-500 text-blue-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'
            }`}>
              <FolderPlus className="w-5 h-5 mx-auto mb-1 text-amber-400" />
              <div className="font-bold text-[11px]">2. Carpeta</div>
              <div className="text-[9px] text-slate-400">Drive Vinculado</div>
            </div>

            <div className={`p-3 rounded-xl border transition-all ${
              currentStep >= 3 ? 'bg-slate-900 border-blue-500 text-blue-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'
            }`}>
              <FileCheck2 className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
              <div className="font-bold text-[11px]">3. Generar PDFs</div>
              <div className="text-[9px] text-slate-400">Recibo & Cargo</div>
            </div>

            <div className={`p-3 rounded-xl border transition-all ${
              currentStep >= 4 ? 'bg-slate-900 border-emerald-500 text-emerald-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'
            }`}>
              <Upload className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
              <div className="font-bold text-[11px]">4. Finalizado</div>
              <div className="text-[9px] text-slate-400">PDFs Guardados</div>
            </div>

          </div>

          {/* Mensaje de Confirmación Amigable */}
          {isFinished && (
            <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-2xl p-4 text-xs text-emerald-200 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Comprobantes Guardados
              </div>
              <p className="text-slate-300 leading-relaxed">
                El <strong className="text-white">Recibo de Recepción (Imagen 1)</strong> y el <strong className="text-white">Cargo de Entrega (Imagen 2)</strong> se han almacenado exitosamente en la carpeta de Google Drive del alumno.
              </p>
            </div>
          )}

          {/* Pie del Modal */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <a
              href={GOOGLE_DRIVE_ROOT_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 font-medium underline"
            >
              Abrir Carpeta en Google Drive <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer ${
                isFinished 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isFinished ? 'Entendido y Cerrar' : 'Cancelar'}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
