import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileCheck2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import type { StudentData } from '../types/admission';
import {
  DriveService,
  GOOGLE_DRIVE_ROOT_URL,
  getStudentDriveFolderName,
  type DriveUploadResult,
} from '../lib/driveClient';
import { DocumentExporter } from '../lib/pdfExport';
import { ReciboPrintTemplate } from './ReciboPrintTemplate';
import { CargoPrintTemplate } from './CargoPrintTemplate';

interface DriveSimulationModalProps {
  student: StudentData;
  idToken?: string;
  onClose: () => void;
  onStart: () => void;
  onComplete: (result: DriveUploadResult) => void;
  onError: (message: string) => void;
}

export const DriveSimulationModal: React.FC<DriveSimulationModalProps> = ({
  student,
  idToken,
  onClose,
  onStart,
  onComplete,
  onError,
}) => {
  // ponytail: cada apertura trabaja con una foto inmutable del formulario; reintentar reutiliza esa misma foto.
  const [uploadStudent] = useState(() => ({ ...student }));
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onStartRef = useRef(onStart);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  onStartRef.current = onStart;
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const folderName = getStudentDriveFolderName(uploadStudent);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const runUpload = async () => {
      onStartRef.current();
      setCurrentStep(1);
      setProgress(10);
      setIsFinished(false);
      setErrorMessage(null);
      setFolderUrl(null);

      try {
        if (!idToken) {
          throw new Error('Conecta una cuenta de Google autorizada antes de subir a Drive.');
        }

        setCurrentStep(2);
        setProgress(25);
        const receiptPdf = await DocumentExporter.generatePdfBlob('drive-receipt-content');
        if (!active) return;

        setProgress(45);
        const cargoPdf = await DocumentExporter.generatePdfBlob('drive-cargo-content');
        if (!active) return;

        setCurrentStep(3);
        setProgress(70);
        const result = await DriveService.uploadReceiptAndCargo(
          uploadStudent,
          receiptPdf,
          cargoPdf,
          idToken,
          controller.signal,
        );
        if (!active) return;

        setFolderUrl(result.driveFolderUrl);
        setCurrentStep(4);
        setProgress(100);
        setIsFinished(true);
        onCompleteRef.current(result);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }

        const message = error instanceof Error ? error.message : 'No se pudo subir a Google Drive.';
        setErrorMessage(message);
        onErrorRef.current(message);
      }
    };

    // El siguiente tick evita que el montaje de verificación de React StrictMode duplique html2pdf.
    const startTimer = window.setTimeout(runUpload, 0);

    return () => {
      active = false;
      window.clearTimeout(startTimer);
      controller.abort();
    };
  }, [attempt, idToken, uploadStudent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-white">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-heading text-slate-100">
                Subida real a Google Drive
              </h3>
              <p className="text-xs text-slate-400">
                Legajo existente:{' '}
                <span className="text-emerald-400 font-mono font-bold">{folderName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 bg-slate-950">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-300 flex items-center gap-2">
                {errorMessage ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    No se completó la subida
                  </>
                ) : isFinished ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ¡Subida confirmada por Google Drive!
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                    Generando y enviando comprobantes...
                  </>
                )}
              </span>
              <span className="text-emerald-400 font-mono font-bold text-sm">{progress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
              <div
                className={`h-3 transition-all duration-500 rounded-full ${
                  errorMessage
                    ? 'bg-red-500'
                    : 'bg-gradient-to-r from-blue-600 to-emerald-400'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className={`p-3 rounded-xl border ${currentStep >= 1 ? 'bg-slate-900 border-blue-500 text-blue-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'}`}>
              <ShieldCheck className="w-5 h-5 mx-auto mb-1 text-blue-400" />
              <div className="font-bold text-[11px]">1. Conexión</div>
              <div className="text-[9px] text-slate-400">Vercel seguro</div>
            </div>

            <div className={`p-3 rounded-xl border ${currentStep >= 2 ? 'bg-slate-900 border-blue-500 text-blue-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'}`}>
              <FileCheck2 className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
              <div className="font-bold text-[11px]">2. PDFs</div>
              <div className="text-[9px] text-slate-400">Recibo y Cargo</div>
            </div>

            <div className={`p-3 rounded-xl border ${currentStep >= 3 ? 'bg-slate-900 border-blue-500 text-blue-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'}`}>
              <Search className="w-5 h-5 mx-auto mb-1 text-amber-400" />
              <div className="font-bold text-[11px]">3. Legajo</div>
              <div className="text-[9px] text-slate-400">Buscar exacto</div>
            </div>

            <div className={`p-3 rounded-xl border ${currentStep >= 4 ? 'bg-slate-900 border-emerald-500 text-emerald-300' : 'bg-slate-900/40 border-slate-800 text-slate-600'}`}>
              <Upload className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
              <div className="font-bold text-[11px]">4. Confirmado</div>
              <div className="text-[9px] text-slate-400">Drive respondió</div>
            </div>
          </div>

          {errorMessage && (
            <div className="bg-red-950/40 border border-red-800/80 rounded-2xl p-4 text-xs text-red-200 space-y-3">
              <div className="font-bold text-red-300">Google Drive no confirmó la operación</div>
              <p className="leading-relaxed">{errorMessage}</p>
              <p className="text-slate-400">
                No se crea ninguna carpeta automáticamente. Verifica que el legajo exista con ese
                nombre exacto.
              </p>
              <button
                onClick={() => setAttempt((value) => value + 1)}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reintentar
              </button>
            </div>
          )}

          {isFinished && (
            <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-2xl p-4 text-xs text-emerald-200 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Dos comprobantes confirmados
              </div>
              <p className="text-slate-300 leading-relaxed">
                El Recibo y el Cargo están en el legajo existente. Un reintento no duplica archivos
                del mismo nombre.
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <a
              href={folderUrl || GOOGLE_DRIVE_ROOT_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 font-medium underline"
            >
              Abrir {folderUrl ? 'legajo en' : 'carpeta raíz de'} Google Drive
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer ${
                isFinished
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isFinished ? 'Entendido y cerrar' : 'Cancelar'}
            </button>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="fixed top-0 -left-[10000px] w-[210mm] bg-white pointer-events-none"
      >
        <div id="drive-receipt-content" className="pdf-render-root">
          <ReciboPrintTemplate student={uploadStudent} />
        </div>
        <div id="drive-cargo-content" className="pdf-render-root">
          <CargoPrintTemplate student={uploadStudent} />
        </div>
      </div>
    </div>
  );
};
