import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  Sparkles, 
  Trash2, 
  Plus, 
  Eye, 
  FileSpreadsheet, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Image as ImageIcon,
  CheckSquare,
  Square,
  FileText,
  RotateCcw,
  RotateCw,
  Bot
} from 'lucide-react';
import type { BatchCargoData, BatchCargoStudent } from '../types/batchCargo';
import { OcrService, BATCH_CONFIG, type BatchProgressEvent, type OcrMode } from '../lib/ocrService';
import { DocumentExporter } from '../lib/pdfExport';
import { BatchCargoModal } from './BatchCargoModal';

const CARRERAS_OPTIONS = [
  'Medicina',
  'Odontología',
  'Derecho',
  'Administración de Empresas',
  'Kinesiología y Fisioterapia',
  'Nutrición',
  'Posgrado'
];

interface BatchCargoSectionProps {
  userToken?: string;
}

const hasRequiredFields = (student: BatchCargoStudent) =>
  Boolean(
    student.nombres.trim() &&
    student.apellidos.trim() &&
    student.carrera.trim() &&
    student.ci?.trim(),
  );

const needsReview = (student: BatchCargoStudent) =>
  student.extractionSource === 'local_ocr' ||
  student.status === 'error' ||
  student.nombresApellidos === 'ALUMNO POR CONFIRMAR' ||
  student.nombresApellidos.includes('REVISAR') ||
  !hasRequiredFields(student);

const contractDocument = (carrera: string) =>
  carrera.trim() ? `CONTRATO ${carrera.toUpperCase()}` : 'CONTRATO PENDIENTE';

export const BatchCargoSection: React.FC<BatchCargoSectionProps> = ({ userToken }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const processingAbortRef = useRef<AbortController | null>(null);
  const studentsRef = useRef<BatchCargoStudent[]>([]);
  const [ocrMode, setOcrMode] = useState<OcrMode>(userToken ? 'gemini' : 'local');

  // Metadatos del encabezado del Cargo Masivo
  const [header, setHeader] = useState({
    numeroCargo: 'N° 046 / 2026 Promoción',
    para: 'Arlet Gonzalez',
    paraCargo: 'Archivo / Recepción',
    de: 'Axel Fretes',
    deCargo: 'Promoción / Grado',
    referencia: 'Entrega de Documentos y contratos de estudiantes',
    fecha: new Date().toLocaleDateString('es-PY'),
    observacionGlobal: 'JULIO 2026'
  });

  // Lista de alumnos extraídos de las fotos
  const [students, setStudents] = useState<BatchCargoStudent[]>([]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    if (!userToken && ocrMode === 'gemini') setOcrMode('local');
  }, [ocrMode, userToken]);

  useEffect(() => () => {
    const controller = processingAbortRef.current;
    processingAbortRef.current = null;
    controller?.abort();
    for (const student of studentsRef.current) OcrService.revokePhotoUrl(student.photoUrl);
    void OcrService.terminateWorker();
  }, []);

  // Estado del progreso por lotes
  const [batchProgress, setBatchProgress] = useState<{
    isActive: boolean;
    currentBatch: number;
    totalBatches: number;
    completedItems: number;
    totalItems: number;
    percentage: number;
    message: string;
  }>({
    isActive: false,
    currentBatch: 0,
    totalBatches: 0,
    completedItems: 0,
    totalItems: 0,
    percentage: 0,
    message: ''
  });

  // Visor de foto ampliada
  const [selectedPhotoStudent, setSelectedPhotoStudent] = useState<BatchCargoStudent | null>(null);

  // Modal de Vista Previa A4 / Impresión / Word
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Manejar selección múltiple de archivos de fotos (con soporte nativo para iPhone HEIC)
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || batchProgress.isActive) return;

    const rawFiles = Array.from(e.target.files);
    e.target.value = '';
    if (students.length + rawFiles.length > BATCH_CONFIG.MAX_FILES) {
      alert(`El cargo admite como máximo ${BATCH_CONFIG.MAX_FILES} fotos en total.`);
      return;
    }
    const invalidFile = rawFiles.find(
      (file) => !OcrService.isSupportedImageFile(file) || file.size > BATCH_CONFIG.MAX_FILE_BYTES,
    );
    if (invalidFile) {
      alert(`La foto "${invalidFile.name}" no es compatible o supera 25 MB.`);
      return;
    }
    const hasHeic = rawFiles.some(
      (f) =>
        f.type === 'image/heic' ||
        f.type === 'image/heif' ||
        /\.(heic|heif)$/i.test(f.name)
    );

    if (hasHeic) {
      setBatchProgress({
        isActive: true,
        currentBatch: 0,
        totalBatches: Math.ceil(rawFiles.length / BATCH_CONFIG.BATCH_SIZE),
        completedItems: 0,
        totalItems: rawFiles.length,
        percentage: 5,
        message: 'Optimizando y convirtiendo fotos iPhone (HEIC a JPEG)...'
      });
    }

    const preparedStudents: BatchCargoStudent[] = [];

    try {
      for (let idx = 0; idx < rawFiles.length; idx++) {
        const file = rawFiles[idx];
        const converted = await OcrService.ensureJpegBlob(file);
        if (!(converted instanceof Blob)) throw new Error(`No se pudo preparar ${file.name}.`);
        const readyFile = converted instanceof File
          ? converted
          : new File([converted], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });

        preparedStudents.push({
          id: crypto.randomUUID(),
          file: readyFile,
          photoUrl: URL.createObjectURL(readyFile),
          photoName: readyFile.name,
          rotationDegrees: 0,
          nombres: '',
          apellidos: '',
          nombresApellidos: 'EN COLA DE PROCESAMIENTO...',
          tipoDocumento: '',
          ci: '',
          carrera: '',
          documentos: [],
          observacion: header.observacionGlobal,
          status: 'pending'
        });
      }
    } catch (error: any) {
      for (const student of preparedStudents) OcrService.revokePhotoUrl(student.photoUrl);
      setBatchProgress((previous) => ({ ...previous, isActive: false }));
      alert(error?.message || 'No se pudieron preparar las fotos.');
      return;
    }

    setStudents((prev) => [...prev, ...preparedStudents]);

    // Iniciar procesamiento por lotes con IA
    await processBatchExecution(preparedStudents);
  };

  // Orquestación de procesamiento por lotes (Batching 6 fotos x request, concurrencia 2)
  const processBatchExecution = async (
    itemsToProcess: BatchCargoStudent[],
    enhance = false,
    mode: OcrMode = ocrMode,
  ) => {
    if (itemsToProcess.length === 0) return;
    const controller = new AbortController();
    processingAbortRef.current = controller;

    setBatchProgress({
      isActive: true,
      currentBatch: 0,
      totalBatches: Math.ceil(itemsToProcess.length / BATCH_CONFIG.BATCH_SIZE),
      completedItems: 0,
      totalItems: itemsToProcess.length,
      percentage: 0,
      message: `Iniciando análisis por lotes (${BATCH_CONFIG.BATCH_SIZE} contratos por llamada)...`
    });

    try {
      await OcrService.processAllContractPhotosInBatches(itemsToProcess, {
        mode,
        authToken: userToken,
        signal: controller.signal,
        enhance,
        onProgress: (progress: BatchProgressEvent) => {
          setBatchProgress({
            isActive: progress.completedItems < progress.totalItems,
            currentBatch: progress.currentBatch,
            totalBatches: progress.totalBatches,
            completedItems: progress.completedItems,
            totalItems: progress.totalItems,
            percentage: progress.percentage,
            message: progress.message
          });
        },
        onBatchCompleted: (batchResults) => {
          // Actualización progresiva en vivo a medida que cada lote termina
          setStudents((prev) =>
            prev.map((s) => {
              const matched = batchResults.find((r) => r.id === s.id);
              if (!matched) return s;
              return {
                ...s,
                nombres: matched.nombres,
                apellidos: matched.apellidos,
                nombresApellidos: matched.nombresApellidos,
                tipoDocumento: matched.tipoDocumento,
                ci: matched.ci || '',
                carrera: matched.carrera,
                documentos: [
                  contractDocument(matched.carrera),
                  ...s.documentos.filter((document) => !document.startsWith('CONTRATO')),
                ],
                status: matched.status,
                extractionSource: matched.extractionSource || 'gemini',
                errorMessage: matched.errorMessage
              };
            })
          );
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Error general en procesamiento de lotes:', err);
      setStudents((previous) => previous.map((student) =>
        itemsToProcess.some((item) => item.id === student.id)
          ? { ...student, status: 'error', errorMessage: err?.message || 'Error de procesamiento' }
          : student,
      ));
    } finally {
      if (processingAbortRef.current === controller) {
        processingAbortRef.current = null;
        setBatchProgress((prev) => ({ ...prev, isActive: false, percentage: 100 }));
      }
    }
  };

  // Re-procesar únicamente los alumnos que cayeron en OCR local o tuvieron error (sin tocar los ya exitosos con Gemini)
  const handleReprocessOnlyFallbackOrErrors = async () => {
    if (!userToken) {
      alert('Inicia sesión con Google para re-procesar pendientes con Gemini.');
      return;
    }
    const pendingItems = students.filter((student) =>
      needsReview(student) && Boolean(student.file || student.photoUrl),
    );

    if (pendingItems.length === 0) {
      alert('¡Todos los alumnos ya fueron extraídos con éxito por Gemini Vision AI!');
      return;
    }

    // Marcar como en proceso únicamente a los pendientes
    setStudents((prev) =>
      prev.map((s) =>
        pendingItems.some((p) => p.id === s.id) ? { ...s, status: 'processing' } : s
      )
    );

    await processBatchExecution(pendingItems, true, 'gemini');
  };

  // Re-procesar un alumno individual específicamente con Gemini Vision
  const handleReprocessSingleStudentWithGemini = async (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student || !student.file) return;
    if (!userToken) {
      alert('Inicia sesión con Google para re-escanear con Gemini.');
      return;
    }

    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status: 'processing' } : s))
    );

    try {
      const extracted = await OcrService.processContractPhoto(student.file, student.rotationDegrees || 0, {
        mode: 'gemini',
        authToken: userToken,
        enhance: true,
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                nombres: extracted.nombres,
                apellidos: extracted.apellidos,
                nombresApellidos: extracted.nombresApellidos,
                tipoDocumento: extracted.tipoDocumento,
                ci: extracted.ci || '',
                carrera: extracted.carrera,
                documentos: [
                  contractDocument(extracted.carrera),
                  ...s.documentos.filter((document) => !document.startsWith('CONTRATO')),
                ],
                confidence: extracted.confidence,
                rawText: extracted.rawText,
                status: extracted.errorMessage ? 'error' : 'success',
                extractionSource: extracted.extractionSource,
                errorMessage: extracted.errorMessage,
              }
            : s
        )
      );
    } catch (err: any) {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, status: 'error', errorMessage: err?.message } : s))
      );
    }
  };

  // Re-procesar OCR en un alumno individual con una rotación específica
  const handleRotateAndReprocess = async (studentId: string, deltaDegrees: number) => {
    const student = students.find((s) => s.id === studentId);
    if (!student || !student.file) return;

    const newDegrees = (((student.rotationDegrees || 0) + deltaDegrees) % 360 + 360) % 360;

    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status: 'processing', rotationDegrees: newDegrees } : s))
    );

    try {
      const extracted = await OcrService.processContractPhoto(student.file, newDegrees, {
        mode: ocrMode,
        authToken: userToken,
        enhance: true,
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                nombres: extracted.nombres,
                apellidos: extracted.apellidos,
                nombresApellidos: extracted.nombresApellidos,
                tipoDocumento: extracted.tipoDocumento,
                ci: extracted.ci || '',
                carrera: extracted.carrera,
                documentos: [
                  contractDocument(extracted.carrera),
                  ...s.documentos.filter((document) => !document.startsWith('CONTRATO')),
                ],
                confidence: extracted.confidence,
                rawText: extracted.rawText,
                rotationDegrees: newDegrees,
                status: extracted.errorMessage ? 'error' : 'success',
                extractionSource: extracted.extractionSource,
                errorMessage: extracted.errorMessage,
              }
            : s
        )
      );

      if (selectedPhotoStudent && selectedPhotoStudent.id === studentId) {
        setSelectedPhotoStudent((prev) =>
          prev
            ? {
                ...prev,
                nombres: extracted.nombres,
                apellidos: extracted.apellidos,
                nombresApellidos: extracted.nombresApellidos,
                tipoDocumento: extracted.tipoDocumento,
                ci: extracted.ci || '',
                carrera: extracted.carrera,
                rotationDegrees: newDegrees
              }
            : null
        );
      }
    } catch {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, status: 'error' } : s))
      );
    }
  };

  // Actualizar un campo de un estudiante
  const updateStudentField = (id: string, field: keyof BatchCargoStudent, value: any) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (field === 'nombres' || field === 'apellidos') {
          const next = { ...s, [field]: String(value).toUpperCase() };
          const updated = {
            ...next,
            nombresApellidos: `${next.nombres} ${next.apellidos}`.replace(/\s+/g, ' ').trim(),
            extractionSource: 'manual' as const,
          };
          return {
            ...updated,
            status: hasRequiredFields(updated) ? 'success' : 'error',
            errorMessage: hasRequiredFields(updated) ? undefined : updated.errorMessage,
          };
        }
        if (field === 'carrera') {
          const newDoc = contractDocument(String(value));
          const updatedDocs = s.documentos.map((d) => (d.startsWith('CONTRATO') ? newDoc : d));
          const updated = {
            ...s,
            carrera: value,
            documentos: updatedDocs.some((document) => document.startsWith('CONTRATO'))
              ? updatedDocs
              : [newDoc, ...updatedDocs],
            extractionSource: 'manual' as const,
          };
          return {
            ...updated,
            status: hasRequiredFields(updated) ? 'success' : 'error',
            errorMessage: hasRequiredFields(updated) ? undefined : updated.errorMessage,
          };
        }
        const updated = { ...s, [field]: value, extractionSource: 'manual' as const };
        return {
          ...updated,
          status: hasRequiredFields(updated) ? 'success' : 'error',
          errorMessage: hasRequiredFields(updated) ? undefined : updated.errorMessage,
        };
      })
    );
  };

  // Alternar documento entregado para un estudiante específico
  const toggleStudentDoc = (id: string, docName: string) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const exists = s.documentos.includes(docName);
        const updated = exists
          ? s.documentos.filter((d) => d !== docName)
          : [...s.documentos, docName];
        return { ...s, documentos: updated };
      })
    );
  };

  // Eliminar estudiante de la lista
  const removeStudent = (id: string) => {
    setStudents((prev) => {
      const removed = prev.find((student) => student.id === id);
      if (removed) OcrService.revokePhotoUrl(removed.photoUrl);
      return prev.filter((student) => student.id !== id);
    });
    if (selectedPhotoStudent?.id === id) setSelectedPhotoStudent(null);
  };

  const clearStudents = () => {
    processingAbortRef.current?.abort();
    processingAbortRef.current = null;
    for (const student of students) OcrService.revokePhotoUrl(student.photoUrl);
    setSelectedPhotoStudent(null);
    setStudents([]);
    setBatchProgress((previous) => ({ ...previous, isActive: false }));
  };

  // Agregar fila manual
  const handleAddManualRow = () => {
    const newStudent: BatchCargoStudent = {
      id: crypto.randomUUID(),
      photoName: 'Entrada Manual',
      photoUrl: '',
      rotationDegrees: 0,
      nombres: '',
      apellidos: '',
      nombresApellidos: '',
      tipoDocumento: 'CÉDULA DE IDENTIDAD',
      ci: '',
      carrera: '',
      documentos: ['CONTRATO PENDIENTE'],
      observacion: header.observacionGlobal,
      status: 'error',
      extractionSource: 'manual',
    };
    setStudents((prev) => [...prev, newStudent]);
  };

  // Objeto completo para imprimir o exportar a Word
  const currentBatchData: BatchCargoData = {
    header,
    students
  };
  const hasInvalidStudents = students.some((student) =>
    student.status === 'error' || !hasRequiredFields(student),
  );

  // Descarga directa en Word
  const handleDownloadWord = () => {
    DocumentExporter.generateBatchCargoWordDocx(currentBatchData);
  };

  return (
    <div className="space-y-6">
      
      {/* Tarjeta de Encabezado y Configuración del Cargo Masivo */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold font-heading text-slate-100">
                Generador de Cargo Masivo por Fotos (Lotes Gemini AI & OCR)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Lotes de {BATCH_CONFIG.BATCH_SIZE} contratos, imágenes de hasta {BATCH_CONFIG.MAX_IMAGE_DIMENSION}px y validación estricta por foto.
            </p>
          </div>

          {/* Motor de extracción */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => userToken ? setOcrMode('gemini') : alert('Inicia sesión con Google para usar Gemini.')}
              disabled={batchProgress.isActive}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                ocrMode === 'gemini' && userToken
                  ? 'bg-emerald-950/70 border-emerald-600/80 text-emerald-300 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <Bot className={`w-4 h-4 ${ocrMode === 'gemini' ? 'text-emerald-400' : 'text-slate-400'}`} />
              Gemini seguro {userToken ? '' : '(requiere Google)'}
            </button>
            <button
              onClick={() => setOcrMode('local')}
              disabled={batchProgress.isActive}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                ocrMode === 'local'
                  ? 'bg-amber-950/70 border-amber-600/80 text-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              Solo OCR local
            </button>

            <span className="bg-slate-800 border border-slate-700 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold text-amber-300">
              Alumnos: {students.length}
            </span>
          </div>
        </div>

        {/* Metadatos del Cargo (Para, De, Fecha, Observación Global) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-300 uppercase mb-1">
              De (Asesor Comercial) *
            </label>
            <select
              value={header.de}
              onChange={(e) => setHeader({ ...header, de: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-semibold focus:border-blue-500 outline-none"
            >
              <option value="Axel Fretes">Axel Fretes</option>
              <option value="Malu Villanueva">Malu Villanueva</option>
              <option value="Kamila Sarsa">Kamila Sarsa</option>
              <option value="Yamila">Yamila</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-300 uppercase mb-1">
              Para (Recepcionista) *
            </label>
            <input
              type="text"
              value={header.para}
              onChange={(e) => setHeader({ ...header, para: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-semibold focus:border-blue-500 outline-none"
              placeholder="Arlet Gonzalez o Felipa Silva"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-300 uppercase mb-1">
              Fecha de Emisión *
            </label>
            <input
              type="text"
              value={header.fecha}
              onChange={(e) => setHeader({ ...header, fecha: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-300 uppercase mb-1">
              Observación Global (Período) *
            </label>
            <input
              type="text"
              value={header.observacionGlobal}
              onChange={(e) => {
                setHeader({ ...header, observacionGlobal: e.target.value });
                setStudents((prev) => prev.map((s) => ({ ...s, observacion: e.target.value })));
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-semibold focus:border-blue-500 outline-none"
              placeholder="JULIO 2026"
            />
          </div>
        </div>
      </div>

      {/* Zona de Subida Múltiple de Fotos (Drag & Drop) */}
      <div className="bg-white border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center transition-all bg-gradient-to-b from-slate-50 to-white shadow-sm">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFilesSelected}
          multiple
          disabled={batchProgress.isActive}
          accept="image/*,.heic,.heif,.HEIC,.HEIF"
          className="hidden"
          id="batch-contract-photos"
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-blue-100">
            <UploadCloud className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900 font-heading">
              Sube o Arrastra las Fotos de los Contratos
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Carga de 1 a {BATCH_CONFIG.MAX_FILES} fotos, hasta 25 MB por archivo. No se inician cargas superpuestas.
            </p>
          </div>

          <label
            htmlFor="batch-contract-photos"
            aria-disabled={batchProgress.isActive}
            className={`inline-flex items-center gap-2 px-6 py-2.5 text-white text-xs font-bold rounded-xl shadow-md transition-all ${
              batchProgress.isActive ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer hover:shadow-lg'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Seleccionar Fotos de Contratos (Lote)
          </label>
        </div>
      </div>

      {/* Barra de Progreso del Lote */}
      {batchProgress.isActive && (
        <div className="bg-slate-900 border border-blue-800/80 rounded-2xl p-4 text-white shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-2 text-blue-300">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              {batchProgress.message || `Procesando lote ${batchProgress.currentBatch} de ${batchProgress.totalBatches}...`}
            </span>
            <span className="text-amber-400 font-mono font-bold">
              {batchProgress.completedItems}/{batchProgress.totalItems} ({batchProgress.percentage}%)
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
            <div
              className="bg-gradient-to-r from-blue-600 via-indigo-500 to-amber-400 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${batchProgress.percentage}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-400 italic">
            Tiempo estimado: ~15-25 segundos para 30 documentos (2 tandas en paralelo).
          </p>
        </div>
      )}

      {/* Tabla Interactiva de Alumnos Extraídos */}
      {students.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-heading flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Alumnos en este Cargo de Entrega ({students.length})
              </h3>
              <p className="text-xs text-slate-500">
                Verifica los nombres y carreras extraídos. Las fotos procesadas por Gemini se conservan intactas; puedes re-procesar solo las pendientes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {students.filter((student) => needsReview(student) && Boolean(student.file || student.photoUrl)).length > 0 && (
                <button
                  onClick={handleReprocessOnlyFallbackOrErrors}
                  disabled={batchProgress.isActive}
                  className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-amber-300 shadow-sm cursor-pointer animate-pulse"
                  title="Re-procesa ÚNICAMENTE las fotos que usaron OCR local o fallaron, sin tocar las que ya pasaron con Gemini"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                  Re-procesar solo OCR/Pendientes con Gemini ({
                    students.filter((student) => needsReview(student) && Boolean(student.file || student.photoUrl)).length
                  })
                </button>
              )}

              <button
                onClick={() => processBatchExecution(students.filter((student) => student.file || student.photoUrl))}
                disabled={batchProgress.isActive}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-slate-300 cursor-pointer"
                title="Volver a procesar todas las fotos en lotes desde cero"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-procesar Todo ({students.length})
              </button>

              <button
                onClick={handleAddManualRow}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-slate-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Fila
              </button>

              <button
                onClick={clearStudents}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all border border-red-200 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpiar Todo
              </button>
            </div>
          </div>

          {/* Grilla de Edición */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                  <th className="py-2.5 px-3 w-10 text-center">N°</th>
                  <th className="py-2.5 px-3 w-28 text-center">Foto / Girar</th>
                  <th className="py-2.5 px-3">Nombres y Apellidos *</th>
                  <th className="py-2.5 px-3 w-48">Carrera *</th>
                  <th className="py-2.5 px-3">Documentos Entregados</th>
                  <th className="py-2.5 px-3 w-32">Observación</th>
                  <th className="py-2.5 px-3 w-12 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {students.map((student, idx) => {
                  const contratoNombre = contractDocument(student.carrera);

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Número */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Miniatura de la Foto con controles de rotación */}
                      <td className="py-2.5 px-3 text-center">
                        {student.photoUrl ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleRotateAndReprocess(student.id, -90)}
                              disabled={batchProgress.isActive}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Girar 90° Izquierda y Re-escanear"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setSelectedPhotoStudent(student)}
                              className="w-10 h-10 rounded-lg overflow-hidden border border-slate-300 hover:border-blue-500 shadow-sm relative group cursor-pointer shrink-0"
                              title="Clic para ver foto ampliada"
                            >
                              <img
                                src={student.photoUrl}
                                alt="Contrato"
                                className="w-full h-full object-cover"
                                style={{ transform: `rotate(${student.rotationDegrees || 0}deg)` }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <Eye className="w-3.5 h-3.5" />
                              </div>
                            </button>

                            <button
                              onClick={() => handleRotateAndReprocess(student.id, 90)}
                              disabled={batchProgress.isActive}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Girar 90° Derecha y Re-escanear"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">-</span>
                        )}
                      </td>

                      {/* Nombres y Apellidos + CI Editables */}
                      <td className="py-2.5 px-3">
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              value={student.nombres}
                              onChange={(e) =>
                                updateStudentField(student.id, 'nombres', e.target.value)
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg border font-bold text-xs outline-none focus:ring-2 ${
                                student.extractionSource === 'local_ocr' || student.status === 'error'
                                  ? 'border-amber-400 bg-amber-50/30 text-slate-900 focus:ring-amber-500'
                                  : 'border-slate-300 text-slate-900 focus:ring-blue-600'
                              }`}
                              placeholder="Nombres"
                            />
                            <input
                              type="text"
                              value={student.apellidos}
                              onChange={(e) => updateStudentField(student.id, 'apellidos', e.target.value)}
                              className={`w-full px-2.5 py-1.5 rounded-lg border font-bold text-xs outline-none focus:ring-2 ${
                                student.extractionSource === 'local_ocr' || student.status === 'error'
                                  ? 'border-amber-400 bg-amber-50/30 text-slate-900 focus:ring-amber-500'
                                  : 'border-slate-300 text-slate-900 focus:ring-blue-600'
                              }`}
                              placeholder="Apellidos"
                            />
                          </div>

                          <div className="text-[10px] text-slate-500 font-semibold truncate" title={student.nombresApellidos}>
                            {student.nombresApellidos || 'NOMBRE COMPLETO PENDIENTE'}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
                              <select
                                value={student.tipoDocumento || ''}
                                onChange={(e) => updateStudentField(student.id, 'tipoDocumento', e.target.value)}
                                className="max-w-[150px] px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-700"
                              >
                                <option value="">Tipo documento</option>
                                {student.tipoDocumento && ![
                                  'CÉDULA DE IDENTIDAD',
                                  'PASAPORTE',
                                  'DNI',
                                  'OTRO',
                                ].includes(student.tipoDocumento) && (
                                  <option value={student.tipoDocumento}>{student.tipoDocumento}</option>
                                )}
                                <option value="CÉDULA DE IDENTIDAD">Cédula</option>
                                <option value="PASAPORTE">Pasaporte</option>
                                <option value="DNI">DNI</option>
                                <option value="OTRO">Otro</option>
                              </select>
                              <input
                                type="text"
                                value={student.ci || ''}
                                onChange={(e) =>
                                  updateStudentField(student.id, 'ci', e.target.value)
                                }
                                className="w-full max-w-[140px] px-2 py-0.5 rounded border border-slate-200 font-mono text-[11px] text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
                                placeholder="Nro.: 6153879 / PA-12345"
                              />
                            </div>

                            {/* Badge de fuente y botón de re-procesar individual */}
                            <div className="flex items-center gap-1">
                              {student.extractionSource === 'gemini' && student.status === 'success' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                  ✓ Gemini AI
                                </span>
                              )}

                              {needsReview(student) && (
                                <button
                                  type="button"
                                  onClick={() => handleReprocessSingleStudentWithGemini(student.id)}
                                  disabled={batchProgress.isActive}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold border border-amber-300 transition-colors cursor-pointer"
                                  title="Re-analizar este contrato individual con Gemini AI"
                                >
                                  <RefreshCw className="w-2.5 h-2.5 text-amber-700" />
                                  Re-escanear con IA
                                </button>
                              )}
                            </div>
                          </div>

                          {student.status === 'error' && (
                            <span className="text-[10px] text-red-500 flex items-center gap-1 font-semibold">
                              <AlertCircle className="w-3 h-3" /> {student.errorMessage || 'Revisar foto o rotar'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Selector de Carrera */}
                      <td className="py-2.5 px-3">
                        <select
                          value={student.carrera}
                          onChange={(e) => updateStudentField(student.id, 'carrera', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-600 outline-none"
                        >
                          <option value="">Seleccionar carrera</option>
                          {student.carrera && !CARRERAS_OPTIONS.includes(student.carrera) && (
                            <option value={student.carrera}>{student.carrera}</option>
                          )}
                          {CARRERAS_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Selector de Documentos Entregados */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {/* Contrato Base */}
                          <button
                            type="button"
                            onClick={() => toggleStudentDoc(student.id, contratoNombre)}
                            className={`px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                              student.documentos.includes(contratoNombre)
                                ? 'bg-blue-50 border-blue-300 text-blue-800 font-bold'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                          >
                            {student.documentos.includes(contratoNombre) ? (
                              <CheckSquare className="w-3 h-3 text-blue-600" />
                            ) : (
                              <Square className="w-3 h-3 text-slate-300" />
                            )}
                            {contratoNombre}
                          </button>

                          {/* Foto Carnet */}
                          <button
                            type="button"
                            onClick={() => toggleStudentDoc(student.id, 'FOTO TIPO CARNET')}
                            className={`px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                              student.documentos.includes('FOTO TIPO CARNET')
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-bold'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                          >
                            {student.documentos.includes('FOTO TIPO CARNET') ? (
                              <CheckSquare className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <Square className="w-3 h-3 text-slate-300" />
                            )}
                            FOTO CARNET
                          </button>

                          {/* Certificado de Estudio */}
                          <button
                            type="button"
                            onClick={() => toggleStudentDoc(student.id, 'CERTIFICADO DE ESTUDIO')}
                            className={`px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                              student.documentos.includes('CERTIFICADO DE ESTUDIO')
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                          >
                            {student.documentos.includes('CERTIFICADO DE ESTUDIO') ? (
                              <CheckSquare className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Square className="w-3 h-3 text-slate-300" />
                            )}
                            CERT. ESTUDIO
                          </button>

                          {/* Cédula Autenticada */}
                          <button
                            type="button"
                            onClick={() => toggleStudentDoc(student.id, 'CEDULA FOTOCOPIA AUTENTICADA')}
                            className={`px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                              student.documentos.includes('CEDULA FOTOCOPIA AUTENTICADA')
                                ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                          >
                            {student.documentos.includes('CEDULA FOTOCOPIA AUTENTICADA') ? (
                              <CheckSquare className="w-3 h-3 text-amber-600" />
                            ) : (
                              <Square className="w-3 h-3 text-slate-300" />
                            )}
                            CEDULA AUTENTICADA
                          </button>
                        </div>
                      </td>

                      {/* Observación */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={student.observacion}
                          onChange={(e) => updateStudentField(student.id, 'observacion', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 outline-none"
                          placeholder="JULIO 2026"
                        />
                      </td>

                      {/* Eliminar Fila */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => removeStudent(student.id)}
                          disabled={batchProgress.isActive}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          title="Eliminar alumno"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Barra de Acciones Final */}
          <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{students.length} alumnos listos para consolidar en el Cargo de Entrega.</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadWord}
                disabled={hasInvalidStudents}
                title={hasInvalidStudents ? 'Corrige los campos pendientes antes de exportar.' : undefined}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Descargar Cargo Masivo en Word (.docx)
              </button>

              <button
                onClick={() => setIsPreviewModalOpen(true)}
                disabled={hasInvalidStudents}
                title={hasInvalidStudents ? 'Corrige los campos pendientes antes de imprimir.' : undefined}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4" />
                Ver y Generar Cargo Masivo (Vista Previa A4)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Foto Ampliada con Controles de Rotación */}
      {selectedPhotoStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="relative max-w-4xl max-h-[92vh] bg-slate-900 p-4 rounded-2xl border border-slate-700 overflow-hidden flex flex-col items-center gap-3 text-white">
            <div className="w-full flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h4 className="text-sm font-bold text-slate-100">{selectedPhotoStudent.photoName}</h4>
                <p className="text-xs text-slate-400">
                  Alumno: <strong>{selectedPhotoStudent.nombresApellidos}</strong> • Carrera: <strong>{selectedPhotoStudent.carrera}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRotateAndReprocess(selectedPhotoStudent.id, -90)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-600 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Girar 90° Izq
                </button>

                <button
                  onClick={() => handleRotateAndReprocess(selectedPhotoStudent.id, 90)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-600 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Girar 90° Der
                </button>

                <button
                  onClick={() => setSelectedPhotoStudent(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto flex items-center justify-center p-2">
              <img
                src={selectedPhotoStudent.photoUrl}
                alt="Foto ampliada del contrato"
                className="max-h-[70vh] w-auto mx-auto object-contain rounded-xl shadow-lg border border-slate-800"
                style={{ transform: `rotate(${selectedPhotoStudent.rotationDegrees || 0}deg)` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Vista Previa A4 e Impresión */}
      {isPreviewModalOpen && (
        <BatchCargoModal
          batchData={currentBatchData}
          onClose={() => setIsPreviewModalOpen(false)}
        />
      )}

    </div>
  );
};
