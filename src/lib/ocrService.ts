import type { Worker } from 'tesseract.js';
import type { BatchCargoStudent } from '../types/batchCargo';

export type OcrMode = 'gemini' | 'local';

export interface ContractFields {
  nombres: string;
  apellidos: string;
  nombresApellidos: string;
  carrera: string;
  tipoDocumento?: string;
  ci?: string;
}

export interface ExtractedContractData extends ContractFields {
  rawText: string;
  confidence: number;
  bestRotationDegrees: number;
  extractionSource: 'gemini' | 'local_ocr';
  errorMessage?: string;
}

export interface BatchItemResult extends ContractFields {
  id: string;
  index: number;
  status: 'success' | 'error';
  extractionSource: 'gemini' | 'local_ocr';
  errorMessage?: string;
}

export interface BatchProgressEvent {
  currentBatch: number;
  totalBatches: number;
  completedItems: number;
  totalItems: number;
  percentage: number;
  activeBatchSize: number;
  message: string;
}

interface StrictGeminiResult extends ContractFields {
  index: number;
  legible: boolean;
  warnings: string[];
}

interface OcrExecutionOptions {
  mode: OcrMode;
  signal?: AbortSignal;
  enhance?: boolean;
}

interface BatchExecutionOptions extends OcrExecutionOptions {
  onProgress?: (event: BatchProgressEvent) => void;
  onBatchCompleted?: (batchResults: BatchItemResult[]) => void;
}

export const BATCH_CONFIG = {
  BATCH_SIZE: 6,
  MAX_CONCURRENCY: 2,
  MAX_FILES: 50,
  MAX_FILE_BYTES: 25_000_000,
  MAX_IMAGE_DIMENSION: 1280,
  JPEG_QUALITY: 0.82,
  MAX_BASE64_IMAGE_LENGTH: 600_000,
  GEMINI_TIMEOUT_MS: 48_000,
};

const KNOWN_CARRERAS = [
  'Medicina',
  'Odontología',
  'Derecho',
  'Administración de Empresas',
  'Kinesiología y Fisioterapia',
  'Nutrición',
  'Posgrado',
];

const FORBIDDEN_NAME_PHRASES = [
  'UNIVERSIDAD DEL PACIFICO',
  'ASUNCION',
  'PEDRO JUAN CABALLERO',
  'SAN MARTIN',
  'TORRES UP',
  'BECADO',
  'CONTRATO DE MATRICULA',
  'NUMERO DE ESTUDIANTE',
  'LUGAR DE TRABAJO',
];

const normalizeForComparison = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const combineNames = (nombres: string, apellidos: string) =>
  normalizeSpaces(`${nombres} ${apellidos}`).toUpperCase();

const createAbortError = () => new DOMException('Procesamiento cancelado.', 'AbortError');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw createAbortError();
};

const isBlobUrl = (value: string) => value.startsWith('blob:');

export class OcrService {
  private static workerInstance: Worker | null = null;
  private static workerPromise: Promise<Worker> | null = null;
  private static recognitionQueue: Promise<void> = Promise.resolve();

  public static isSupportedImageFile(file: File): boolean {
    const supportedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      '',
    ]);
    return supportedTypes.has(file.type.toLowerCase()) && /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
  }

  public static async ensureJpegBlob(fileOrBlob: File | Blob | string): Promise<Blob | File | string> {
    if (typeof fileOrBlob === 'string') return fileOrBlob;

    const isHeic =
      fileOrBlob.type === 'image/heic' ||
      fileOrBlob.type === 'image/heif' ||
      (fileOrBlob instanceof File && /\.(heic|heif)$/i.test(fileOrBlob.name));

    if (!isHeic) return fileOrBlob;

    try {
      const heicModule = await import('heic2any');
      const heic2any = (heicModule.default || heicModule) as any;
      const conversion = await heic2any({ blob: fileOrBlob, toType: 'image/jpeg', quality: 0.9 });
      const convertedBlob = Array.isArray(conversion) ? conversion[0] : conversion;
      if (!(convertedBlob instanceof Blob)) throw new Error('Conversión HEIC sin imagen de salida.');

      return fileOrBlob instanceof File
        ? new File([convertedBlob], fileOrBlob.name.replace(/\.(heic|heif)$/i, '.jpg'), {
            type: 'image/jpeg',
          })
        : convertedBlob;
    } catch (error) {
      console.warn('Error convirtiendo HEIC a JPEG:', error);
      throw new Error('No se pudo convertir la foto HEIC. Intenta exportarla como JPEG.');
    }
  }

  private static async renderImage(
    imageSource: string | File | Blob,
    rotationDeg: number,
    maxDimension: number,
    quality: number,
    enhance: boolean,
  ): Promise<string> {
    const safeSource = await this.ensureJpegBlob(imageSource);
    const objectUrl = typeof safeSource === 'string' ? null : URL.createObjectURL(safeSource);
    const sourceUrl = typeof safeSource === 'string' ? safeSource : objectUrl!;

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const loadedImage = new Image();
        loadedImage.crossOrigin = 'anonymous';
        loadedImage.onload = () => resolve(loadedImage);
        loadedImage.onerror = () => reject(new Error('No se pudo abrir la imagen seleccionada.'));
        loadedImage.src = sourceUrl;
      });

      const normalizedDeg = ((rotationDeg % 360) + 360) % 360;
      const isSideways = normalizedDeg === 90 || normalizedDeg === 270;
      let width = isSideways ? img.height : img.width;
      let height = isSideways ? img.width : img.height;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo inicializar Canvas para procesar la imagen.');

      try {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate((normalizedDeg * Math.PI) / 180);
        ctx.filter = enhance ? 'brightness(1.05) contrast(1.14)' : 'none';
        if (isSideways) {
          ctx.drawImage(img, -height / 2, -width / 2, height, width);
        } else {
          ctx.drawImage(img, -width / 2, -height / 2, width, height);
        }
        ctx.restore();

        return canvas.toDataURL('image/jpeg', quality);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
        img.src = '';
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  public static async resizeImageForVision(
    imageSource: string | File | Blob,
    rotationDeg = 0,
    enhance = false,
  ): Promise<{ base64Data: string }> {
    let dataUrl = await this.renderImage(
      imageSource,
      rotationDeg,
      BATCH_CONFIG.MAX_IMAGE_DIMENSION,
      BATCH_CONFIG.JPEG_QUALITY,
      enhance,
    );
    let base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1);

    if (base64Data.length > BATCH_CONFIG.MAX_BASE64_IMAGE_LENGTH) {
      dataUrl = await this.renderImage(imageSource, rotationDeg, 1100, 0.7, enhance);
      base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1);
    }
    if (!base64Data || base64Data.length > BATCH_CONFIG.MAX_BASE64_IMAGE_LENGTH) {
      throw new Error('La imagen sigue siendo demasiado pesada después de optimizarla.');
    }

    return { base64Data };
  }

  private static sanitizeNamePart(value: string): string {
    return normalizeSpaces(
      value
        .normalize('NFC')
        .replace(/[^\p{L}\p{M}'’.\-\s]/gu, ' '),
    ).toUpperCase();
  }

  private static sanitizeDocumentNumber(value: string): string {
    return normalizeSpaces(value.replace(/[^\p{L}\p{N}.\-/\s]/gu, ' ')).toUpperCase();
  }

  private static sanitizeDocumentType(value: string): string {
    return normalizeSpaces(value.replace(/[^\p{L}\p{M}.\-/\s]/gu, ' ')).toUpperCase();
  }

  private static normalizeCareer(value: string): string {
    const clean = normalizeSpaces(value.replace(/[^\p{L}\p{M}\s/&.-]/gu, ' '));
    const normalized = normalizeForComparison(clean);
    const known = KNOWN_CARRERAS.find((career) => normalizeForComparison(career) === normalized);
    return known || clean;
  }

  private static getContractIssues(fields: ContractFields): string[] {
    const issues: string[] = [];
    const nameParts = [fields.nombres, fields.apellidos, fields.nombresApellidos]
      .map(normalizeForComparison);
    if (!fields.nombres) issues.push('Nombres no legibles');
    if (!fields.apellidos) issues.push('Apellidos no legibles');
    if (
      FORBIDDEN_NAME_PHRASES.some((phrase) =>
        nameParts.includes(normalizeForComparison(phrase)),
      )
    ) {
      issues.push('El nombre coincide con texto institucional');
    }
    if (!fields.carrera) issues.push('Carrera no legible');
    if (!fields.ci) issues.push('Número de documento no legible');
    return issues;
  }

  public static validateStrictBatchIndices(
    rawResults: unknown,
    expectedLength: number,
  ): { isValid: boolean; parsedList: StrictGeminiResult[] } {
    if (!Array.isArray(rawResults) || rawResults.length !== expectedLength) {
      return { isValid: false, parsedList: [] };
    }

    const seen = new Set<number>();
    const parsedList: StrictGeminiResult[] = [];
    for (const rawItem of rawResults) {
      if (typeof rawItem !== 'object' || rawItem === null) {
        return { isValid: false, parsedList: [] };
      }
      const item = rawItem as Record<string, unknown>;
      if (
        !Object.hasOwn(item, 'index') ||
        !Number.isInteger(item.index) ||
        (item.index as number) < 0 ||
        (item.index as number) >= expectedLength ||
        seen.has(item.index as number) ||
        typeof item.nombres !== 'string' ||
        typeof item.apellidos !== 'string' ||
        typeof item.carrera !== 'string' ||
        typeof item.tipoDocumento !== 'string' ||
        typeof item.numeroDocumento !== 'string' ||
        typeof item.legible !== 'boolean' ||
        !Array.isArray(item.warnings) ||
        !item.warnings.every((warning) => typeof warning === 'string')
      ) {
        return { isValid: false, parsedList: [] };
      }

      const index = item.index as number;
      seen.add(index);
      const nombres = this.sanitizeNamePart(item.nombres);
      const apellidos = this.sanitizeNamePart(item.apellidos);
      parsedList.push({
        index,
        nombres,
        apellidos,
        nombresApellidos: combineNames(nombres, apellidos),
        carrera: this.normalizeCareer(item.carrera),
        tipoDocumento: this.sanitizeDocumentType(item.tipoDocumento),
        ci: this.sanitizeDocumentNumber(item.numeroDocumento),
        legible: item.legible,
        warnings: item.warnings.map((warning) => normalizeSpaces(warning)).filter(Boolean),
      });
    }

    if (seen.size !== expectedLength) return { isValid: false, parsedList: [] };
    parsedList.sort((a, b) => a.index - b.index);
    return { isValid: true, parsedList };
  }

  public static async processSingleBatchWithGemini(
    batchItems: Array<{ id: string; file?: File; photoUrl: string; rotationDegrees?: number }>,
    options: OcrExecutionOptions & { keySlot?: number },
  ): Promise<BatchItemResult[]> {
    throwIfAborted(options.signal);

    const images = await Promise.all(
      batchItems.map(async (item, index) => {
        const { base64Data } = await this.resizeImageForVision(
          item.file || item.photoUrl,
          item.rotationDegrees || 0,
          options.enhance || false,
        );
        return { index, data: base64Data };
      }),
    );
    throwIfAborted(options.signal);

    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
    const timeout = setTimeout(() => controller.abort(), BATCH_CONFIG.GEMINI_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch('/api/ocr', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ images, keySlot: options.keySlot || 0 }),
      });
    } catch (error) {
      if (options.signal?.aborted) throw createAbortError();
      if (controller.signal.aborted) {
        throw new Error('Gemini superó el tiempo de espera; se utilizará OCR local.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromParent);
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new Error('El servicio OCR no devolvió una respuesta JSON válida.');
    }
    if (!response.ok || payload.status !== 'success') {
      throw new Error(payload.message || `El servicio OCR respondió ${response.status}.`);
    }

    const { isValid, parsedList } = this.validateStrictBatchIndices(
      payload.results,
      batchItems.length,
    );
    if (!isValid) throw new Error('Gemini devolvió un lote incompleto o con índices inválidos.');

    return batchItems.map((item, index) => {
      const parsed = parsedList[index];
      const issues = [...this.getContractIssues(parsed), ...parsed.warnings];
      if (!parsed.legible && issues.length === 0) issues.push('Gemini marcó la foto como ilegible');
      return {
        id: item.id,
        index,
        nombres: parsed.nombres,
        apellidos: parsed.apellidos,
        nombresApellidos: parsed.nombresApellidos || 'ALUMNO POR CONFIRMAR',
        carrera: parsed.carrera,
        tipoDocumento: parsed.tipoDocumento,
        ci: parsed.ci,
        status: issues.length === 0 && parsed.legible ? 'success' : 'error',
        extractionSource: 'gemini',
        errorMessage: issues.length > 0 ? Array.from(new Set(issues)).join('. ') : undefined,
      };
    });
  }

  public static async processAllContractPhotosInBatches(
    students: BatchCargoStudent[],
    options: BatchExecutionOptions,
  ): Promise<BatchItemResult[]> {
    if (students.length === 0) return [];
    if (new Set(students.map((student) => student.id)).size !== students.length) {
      throw new Error('Hay identificadores de foto duplicados en el lote.');
    }

    const batches: BatchCargoStudent[][] = [];
    for (let index = 0; index < students.length; index += BATCH_CONFIG.BATCH_SIZE) {
      batches.push(students.slice(index, index + BATCH_CONFIG.BATCH_SIZE));
    }

    const globalIndex = new Map(students.map((student, index) => [student.id, index]));
    const resultsById = new Map<string, BatchItemResult>();
    let nextBatchIndex = 0;
    let completedItems = 0;

    const runLocalBatch = async (batch: BatchCargoStudent[]) => {
      const localResults: BatchItemResult[] = [];
      for (const item of batch) {
        throwIfAborted(options.signal);
        try {
          const extracted = await this.processContractPhoto(item.file || item.photoUrl, item.rotationDegrees || 0, {
            ...options,
            mode: 'local',
          });
          const issues = this.getContractIssues(extracted);
          localResults.push({
            id: item.id,
            index: globalIndex.get(item.id)!,
            nombres: extracted.nombres,
            apellidos: extracted.apellidos,
            nombresApellidos: extracted.nombresApellidos,
            carrera: extracted.carrera,
            tipoDocumento: extracted.tipoDocumento,
            ci: extracted.ci,
            status: issues.length === 0 ? 'success' : 'error',
            extractionSource: 'local_ocr',
            errorMessage: issues.length > 0 ? issues.join('. ') : undefined,
          });
        } catch (error: any) {
          if (error?.name === 'AbortError') throw error;
          localResults.push({
            id: item.id,
            index: globalIndex.get(item.id)!,
            nombres: '',
            apellidos: '',
            nombresApellidos: 'REVISAR MANUALMENTE',
            carrera: item.carrera,
            tipoDocumento: item.tipoDocumento,
            ci: '',
            status: 'error',
            extractionSource: 'local_ocr',
            errorMessage: error?.message || 'Error de lectura local',
          });
        }
      }
      return localResults;
    };

    const runWorker = async () => {
      while (true) {
        throwIfAborted(options.signal);
        const batchIndex = nextBatchIndex++;
        if (batchIndex >= batches.length) return;
        const batch = batches[batchIndex];
        options.onProgress?.({
          currentBatch: batchIndex + 1,
          totalBatches: batches.length,
          completedItems,
          totalItems: students.length,
          percentage: Math.round((completedItems / students.length) * 100),
          activeBatchSize: batch.length,
          message: `Procesando lote ${batchIndex + 1} de ${batches.length} (${batch.length} contratos)...`,
        });

        let batchResults: BatchItemResult[];
        if (options.mode === 'gemini') {
          try {
            batchResults = await this.processSingleBatchWithGemini(batch, {
              ...options,
              keySlot: batchIndex,
            });
            batchResults = batchResults.map((result) => ({
              ...result,
              index: globalIndex.get(result.id)!,
            }));
          } catch (error: any) {
            if (error?.name === 'AbortError') throw error;
            console.warn(`Gemini falló en el lote ${batchIndex + 1}; usando OCR local:`, error?.message);
            batchResults = await runLocalBatch(batch);
          }
        } else {
          batchResults = await runLocalBatch(batch);
        }

        for (const result of batchResults) resultsById.set(result.id, result);
        completedItems += batch.length;
        options.onBatchCompleted?.(batchResults);
        options.onProgress?.({
          currentBatch: batchIndex + 1,
          totalBatches: batches.length,
          completedItems,
          totalItems: students.length,
          percentage: Math.round((completedItems / students.length) * 100),
          activeBatchSize: batch.length,
          message: `Lote ${batchIndex + 1} procesado.`,
        });
      }
    };

    const workerCount = Math.min(BATCH_CONFIG.MAX_CONCURRENCY, batches.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return students.map((student) => resultsById.get(student.id)!);
  }

  public static async getWorker(): Promise<Worker> {
    if (this.workerInstance) return this.workerInstance;
    if (!this.workerPromise) {
      this.workerPromise = import('tesseract.js')
        .then(({ createWorker }) => createWorker('spa'))
        .then((worker) => {
          this.workerInstance = worker;
          return worker;
        })
        .finally(() => {
          this.workerPromise = null;
        });
    }
    return this.workerPromise;
  }

  private static recognize(image: string): Promise<any> {
    const job = this.recognitionQueue.then(async () => {
      const worker = await this.getWorker();
      return worker.recognize(image);
    });
    this.recognitionQueue = job.then(() => undefined, () => undefined);
    return job;
  }

  public static preprocessImage(
    imageSource: string | File | Blob,
    rotationDeg = 0,
    enhance = true,
  ): Promise<string> {
    return this.renderImage(imageSource, rotationDeg, 1800, 0.9, enhance);
  }

  public static async processContractPhoto(
    imageSource: string | File | Blob,
    manualRotation = 0,
    options: OcrExecutionOptions = { mode: 'local' },
  ): Promise<ExtractedContractData> {
    throwIfAborted(options.signal);

    if (options.mode === 'gemini') {
      try {
        const single = await this.processSingleBatchWithGemini(
          [{
            id: 'single_contract',
            file: typeof imageSource === 'string' ? undefined : imageSource as File,
            photoUrl: typeof imageSource === 'string' ? imageSource : '',
            rotationDegrees: manualRotation,
          }],
          { ...options, keySlot: 0 },
        );
        if (single[0]?.status === 'success') {
          return {
            ...single[0],
            rawText: JSON.stringify(single[0]),
            confidence: 99,
            bestRotationDegrees: manualRotation,
            extractionSource: 'gemini',
          };
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') throw error;
        console.warn('Gemini individual falló; usando OCR local:', error?.message);
      }
    }

    const angles = manualRotation === 0 ? [0, 90, 270, 180] : [manualRotation];
    let best: {
      fields: ContractFields;
      rawText: string;
      confidence: number;
      angle: number;
      score: number;
    } | null = null;

    for (const angle of angles) {
      throwIfAborted(options.signal);
      const processed = await this.preprocessImage(imageSource, angle, options.enhance !== false);
      const recognition = await this.recognize(processed);
      throwIfAborted(options.signal);
      const rawText = recognition.data.text || '';
      const confidence = recognition.data.confidence || 0;
      const fields = this.parseContractText(rawText);
      const score = (5 - this.getContractIssues(fields).length) * 100 + confidence;
      if (!best || score > best.score) best = { fields, rawText, confidence, angle, score };
      if (this.getContractIssues(fields).length === 0) break;
    }

    if (!best) throw new Error('OCR local no pudo procesar la imagen.');
    return {
      ...best.fields,
      rawText: best.rawText,
      confidence: best.confidence,
      bestRotationDegrees: best.angle,
      extractionSource: 'local_ocr',
      errorMessage: this.getContractIssues(best.fields).join('. ') || undefined,
    };
  }

  private static extractLabeledValue(
    text: string,
    labelPattern: string,
    nextLabelPattern: string,
  ): string {
    const expression = new RegExp(
      `${labelPattern}\\s*[:.\\-]?\\s*([\\s\\S]*?)(?=\\s+(?:${nextLabelPattern})\\s*[:.\\-]?|\\r?\\n|$)`,
      'iu',
    );
    return normalizeSpaces(text.match(expression)?.[1] || '');
  }

  public static parseContractText(text: string): ContractFields {
    const nombres = this.sanitizeNamePart(
      this.extractLabeledValue(
        text,
        'Nombres?',
        'Apellidos?|Carrera|Fecha|Tipo\\s+de\\s+Documento|Nro\\.?|Nacionalidad|Estado|Colegio|Domicilio|Tel[eé]fono',
      ),
    );
    const apellidos = this.sanitizeNamePart(
      this.extractLabeledValue(
        text,
        'Apellidos?',
        'Nombres?|Carrera|Fecha|Tipo\\s+de\\s+Documento|Nro\\.?|Nacionalidad|Estado|Colegio|Domicilio|Tel[eé]fono',
      ),
    );

    const rawCareer = this.extractLabeledValue(
      text,
      'Carrera',
      'Nro\\.?|N[°º]|Fecha|Tipo\\s+de\\s+Documento|Nacionalidad|Estado|Colegio|Domicilio',
    );
    let carrera = this.normalizeCareer(rawCareer);
    if (!carrera) {
      const normalizedText = normalizeForComparison(text);
      carrera = KNOWN_CARRERAS.find((known) =>
        normalizedText.includes(normalizeForComparison(known)),
      ) || '';
    }

    const tipoDocumento = this.sanitizeDocumentType(
      this.extractLabeledValue(
        text,
        'Tipo\\s+de\\s+Documento',
        'Nro\\.?|N[°º]|Nacionalidad|Estado|Colegio|Domicilio',
      ),
    );
    const documentAnchor = text.search(/Tipo\s+de\s+Documento/iu);
    const documentScope = documentAnchor >= 0 ? text.slice(documentAnchor, documentAnchor + 260) : text;
    let ci = this.sanitizeDocumentNumber(
      this.extractLabeledValue(
        documentScope,
        '(?:Nro\\.?|N[°º])',
        'Nacionalidad|Estado|Colegio|Domicilio|Ciudad|Correo|Tel[eé]fono|Año',
      ),
    );
    if (!ci) {
      const fallback = text.match(
        /(?:C\.?I\.?|C[eé]dula|Pasaporte|DNI)\s*(?:Nro\.?|N[°º])?\s*[:.-]?\s*([\p{L}\p{N}][\p{L}\p{N}./-]{2,24})/iu,
      );
      ci = this.sanitizeDocumentNumber(fallback?.[1] || '');
    }

    let combined = combineNames(nombres, apellidos);
    if (!combined) {
      const lines = text.split(/\r?\n/).map(normalizeSpaces).filter(Boolean);
      for (const line of lines) {
        const match = line.match(
          /^(?:alumno|estudiante|postulante|contratante|titular|nombre\s+completo)\s*[:.-]?\s*(.+)$/iu,
        );
        if (!match) continue;
        const candidate = this.sanitizeNamePart(match[1]);
        if (candidate.split(/\s+/).length >= 2) {
          combined = candidate;
          break;
        }
      }
    }

    if (
      FORBIDDEN_NAME_PHRASES.some((phrase) =>
        normalizeForComparison(combined) === normalizeForComparison(phrase),
      )
    ) {
      combined = '';
    }

    return {
      nombres,
      apellidos,
      nombresApellidos: combined || 'ALUMNO POR CONFIRMAR',
      carrera,
      tipoDocumento,
      ci,
    };
  }

  public static revokePhotoUrl(url: string) {
    if (isBlobUrl(url)) URL.revokeObjectURL(url);
  }

  public static async terminateWorker() {
    const worker = this.workerInstance || (this.workerPromise ? await this.workerPromise.catch(() => null) : null);
    this.workerInstance = null;
    this.workerPromise = null;
    this.recognitionQueue = Promise.resolve();
    if (worker) await worker.terminate();
  }
}
