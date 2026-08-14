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
  Key,
  Bot
} from 'lucide-react';
import type { BatchCargoData, BatchCargoStudent } from '../types/batchCargo';
import { OcrService, BATCH_CONFIG, type BatchProgressEvent } from '../lib/ocrService';
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

export const BatchCargoSection: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clave de Gemini API para 100% de precisión
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  useEffect(() => {
    setGeminiApiKey(OcrService.getSavedGeminiKey());
  }, []);

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

  // Guardar clave de Gemini
  const handleSaveApiKey = (key: string) => {
    setGeminiApiKey(key);
    OcrService.saveGeminiKey(key);
    setIsApiKeyModalOpen(false);
  };

  // Manejar selección múltiple de archivos de fotos (con soporte nativo para iPhone HEIC)
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const rawFiles = Array.from(e.target.files);
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

    for (let idx = 0; idx < rawFiles.length; idx++) {
      const file = rawFiles[idx];
      const converted = await OcrService.ensureJpegBlob(file);
      const readyFile = converted instanceof File ? converted : file;
      const readyBlobUrl = URL.createObjectURL(
        converted instanceof Blob ? converted : file
      );

      preparedStudents.push({
        id: `student_${Date.now()}_${idx}`,
        file: readyFile,
        photoUrl: readyBlobUrl,
        photoName: file.name.replace(/\.(heic|heif)$/i, '.jpg'),
        rotationDegrees: 0,
        nombresApellidos: 'EN COLA DE PROCESAMIENTO...',
        carrera: 'Medicina',
        documentos: ['CONTRATO MEDICINA'],
        observacion: header.observacionGlobal,
        status: 'pending'
      });
    }

    setStudents((prev) => [...prev, ...preparedStudents]);

    // Iniciar procesamiento por lotes con IA
    await processBatchExecution(preparedStudents);

    // Resetear input file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Orquestación de procesamiento por lotes (Batching 6 fotos x request, concurrencia 2)
  const processBatchExecution = async (itemsToProcess: BatchCargoStudent[]) => {
    if (itemsToProcess.length === 0) return;

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
      await OcrService.processAllContractPhotosInBatches(
        itemsToProcess,
        (progress: BatchProgressEvent) => {
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
        (batchResults) => {
          // Actualización progresiva en vivo a medida que cada lote termina
          setStudents((prev) =>
            prev.map((s) => {
              const matched = batchResults.find((r) => r.id === s.id);
              if (!matched) return s;
              return {
                ...s,
                nombresApellidos: matched.nombresApellidos,
                ci: matched.ci || s.ci || '',
                carrera: matched.carrera,
                documentos: [`CONTRATO ${matched.carrera.toUpperCase()}`],
                photoUrl: matched.processedImageUrl || s.photoUrl,
                status: matched.status,
                errorMessage: matched.errorMessage
              };
            })
          );
        }
      );
    } catch (err: any) {
      console.error('Error general en procesamiento de lotes:', err);
    } finally {
      setBatchProgress((prev) => ({ ...prev, isActive: false, percentage: 100 }));
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
      const extracted = await OcrService.processContractPhoto(student.file, newDegrees);

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                nombresApellidos: extracted.nombresApellidos,
                ci: extracted.ci || s.ci || '',
                carrera: extracted.carrera,
                documentos: [`CONTRATO ${extracted.carrera.toUpperCase()}`],
                confidence: extracted.confidence,
                rawText: extracted.rawText,
                rotationDegrees: newDegrees,
                photoUrl: extracted.processedImageUrl || s.photoUrl,
                status: 'success'
              }
            : s
        )
      );

      if (selectedPhotoStudent && selectedPhotoStudent.id === studentId) {
        setSelectedPhotoStudent((prev) =>
          prev
            ? {
                ...prev,
                photoUrl: extracted.processedImageUrl || prev.photoUrl,
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
        if (field === 'carrera') {
          const newDoc = `CONTRATO ${String(value).toUpperCase()}`;
          const updatedDocs = s.documentos.map((d) => (d.startsWith('CONTRATO') ? newDoc : d));
          return { ...s, carrera: value, documentos: updatedDocs };
        }
        return { ...s, [field]: value };
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
    setStudents((prev) => prev.filter((s) => s.id !== id));
  };

  // Agregar fila manual
  const handleAddManualRow = () => {
    const newStudent: BatchCargoStudent = {
      id: `manual_${Date.now()}`,
      photoName: 'Entrada Manual',
      photoUrl: '',
      rotationDegrees: 0,
      nombresApellidos: '',
      ci: '',
      carrera: 'Medicina',
      documentos: ['CONTRATO MEDICINA'],
      observacion: header.observacionGlobal,
      status: 'success'
    };
    setStudents((prev) => [...prev, newStudent]);
  };

  // Objeto completo para imprimir o exportar a Word
  const currentBatchData: BatchCargoData = {
    header,
    students
  };

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
              Procesamiento optimizado en lotes de {BATCH_CONFIG.BATCH_SIZE} contratos con redimensionamiento a 1024px para máxima velocidad y eficiencia.
            </p>
          </div>

          {/* Motor de Extracción y API Key */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                geminiApiKey
                  ? 'bg-emerald-950/70 border-emerald-600/80 text-emerald-300 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <Bot className={`w-4 h-4 ${geminiApiKey ? 'text-emerald-400' : 'text-slate-400'}`} />
              {geminiApiKey ? 'IA Vision Activa (100% Precisión)' : 'Configurar Gemini Vision AI'}
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
              Carga de 1 a 50+ fotos juntas. Se procesan por lotes estructurados en paralelo (~15 a 25 seg para 30 fotos).
            </p>
          </div>

          <label
            htmlFor="batch-contract-photos"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all hover:shadow-lg"
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
                Verifica los nombres y carreras extraídos. Si una foto vino de costado, usa los botones ⟲ / ⟳ para girar y auto-reprocesar.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => processBatchExecution(students)}
                className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-blue-200 cursor-pointer"
                title="Volver a procesar todas las fotos en lotes"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-procesar Todo
              </button>

              <button
                onClick={handleAddManualRow}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-slate-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Fila
              </button>

              <button
                onClick={() => setStudents([])}
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
                  const contratoNombre = `CONTRATO ${student.carrera.toUpperCase()}`;

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
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <Eye className="w-3.5 h-3.5" />
                              </div>
                            </button>

                            <button
                              onClick={() => handleRotateAndReprocess(student.id, 90)}
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
                          <div>
                            <input
                              type="text"
                              value={student.nombresApellidos}
                              onChange={(e) =>
                                updateStudentField(student.id, 'nombresApellidos', e.target.value.toUpperCase())
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 outline-none"
                              placeholder="EJ: PABLA MARGARITA TROCHE FERNANDEZ"
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">
                              C.I. N°:
                            </span>
                            <input
                              type="text"
                              value={student.ci || ''}
                              onChange={(e) =>
                                updateStudentField(student.id, 'ci', e.target.value)
                              }
                              className="w-full px-2 py-0.5 rounded border border-slate-200 font-mono text-[11px] text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
                              placeholder="Ej: 7261797"
                            />
                          </div>

                          {student.status === 'error' && (
                            <span className="text-[10px] text-red-500 flex items-center gap-1 font-semibold">
                              <AlertCircle className="w-3 h-3" /> Revisar foto o rotar
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
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Descargar Cargo Masivo en Word (.docx)
              </button>

              <button
                onClick={() => setIsPreviewModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
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
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuración de Gemini API Key */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold">Configurar Gemini Vision AI</h3>
              </div>
              <button
                onClick={() => setIsApiKeyModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Google Gemini Vision procesa en <strong>lotes estructurados de {BATCH_CONFIG.BATCH_SIZE} imágenes</strong> con respuesta JSON validada y máxima precisión.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Gemini API Key
              </label>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:border-blue-500 outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Consigue tu clave en{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline"
                >
                  aistudio.google.com/app/apikey
                </a>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => handleSaveApiKey('')}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Usar Solo OCR Local
              </button>
              <button
                onClick={() => handleSaveApiKey(geminiApiKey)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                Guardar y Activar
              </button>
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
