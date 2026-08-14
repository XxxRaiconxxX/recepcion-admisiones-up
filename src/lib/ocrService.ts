import { createWorker, type Worker } from 'tesseract.js';
import type { BatchCargoStudent } from '../types/batchCargo';

export interface ExtractedContractData {
  nombresApellidos: string;
  carrera: string;
  ci?: string;
  rawText: string;
  confidence: number;
  bestRotationDegrees: number;
  processedImageUrl?: string;
}

export interface BatchItemResult {
  id: string;
  index: number;
  nombresApellidos: string;
  carrera: string;
  ci?: string;
  status: 'success' | 'error';
  errorMessage?: string;
  processedImageUrl?: string;
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

// Configuración centralizada y fácilmente ajustable
export const BATCH_CONFIG = {
  BATCH_SIZE: 6, // 5 a 6 fotos por lote para evitar truncamiento de tokens JSON
  MAX_CONCURRENCY: 2, // 2 lotes simultáneos (fácilmente reducible a 1 si hay 429)
  MAX_RETRIES_PER_BATCH: 2, // Intentos de reintento por lote
  MAX_IMAGE_DIMENSION: 1024, // Lado mayor de imagen en píxeles
  JPEG_QUALITY: 0.82 // Calidad de compresión para reducir peso manteniendo legibilidad
};

const KNOWN_CARRERAS = [
  'Medicina',
  'Odontología',
  'Derecho',
  'Administración de Empresas',
  'Kinesiología y Fisioterapia',
  'Nutrición',
  'Posgrado'
];

// Clave permanente oficial incrustada en el sistema para uso continuo y transparente
const getEmbeddedKey = (): string => {
  const encoded = 'QVEuQWI4Uk42SUhKT08wLXRRMThlVEdScXhRSXR2d1h5MzJNaFhPczdnaTRLX3p2WTNxYUE=';
  try {
    if (typeof atob !== 'undefined') {
      return atob(encoded);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    }
  } catch {}
  return '';
};

export class OcrService {
  private static workerInstance: Worker | null = null;
  private static isInitializing = false;

  /**
   * Obtiene la API Key de Gemini incrustada por defecto de forma permanente
   */
  public static getSavedGeminiKey(): string {
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim()) {
      return envKey.trim();
    }

    const defaultKey = getEmbeddedKey();

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('up_gemini_api_key');
      if (stored && stored.trim()) {
        return stored.trim();
      }
      try {
        localStorage.setItem('up_gemini_api_key', defaultKey);
      } catch {}
    }

    return defaultKey;
  }

  public static saveGeminiKey(key: string) {
    const defaultKey = getEmbeddedKey();
    if (typeof window === 'undefined') return;
    if (key.trim()) {
      localStorage.setItem('up_gemini_api_key', key.trim());
    } else {
      localStorage.setItem('up_gemini_api_key', defaultKey);
    }
  }

  /**
   * Redimensiona una imagen con Canvas (lado mayor <= 1024px, JPEG calidad 82%)
   * Retorna { base64Data, dataUrl } optimizados para Gemini Vision
   */
  public static async resizeImageForVision(
    imageSource: string | File | Blob,
    maxDimension = BATCH_CONFIG.MAX_IMAGE_DIMENSION,
    quality = BATCH_CONFIG.JPEG_QUALITY
  ): Promise<{ base64Data: string; dataUrl: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto Canvas para redimensionar'));
          return;
        }

        let width = img.width;
        let height = img.height;

        // Mantener el aspect ratio limitando el lado más largo
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Dibujar imagen escalada
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64Data = dataUrl.split(',')[1] || '';

        resolve({ base64Data, dataUrl });
      };

      img.onerror = (err) => reject(err);

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        img.src = URL.createObjectURL(imageSource);
      }
    });
  }

  /**
   * Valida estrictamente que la respuesta de Gemini contenga todos los índices 0..N-1 sin faltantes ni repetidos
   */
  public static validateStrictBatchIndices(
    rawResults: any[],
    expectedLength: number
  ): { isValid: boolean; parsedList: Array<{ index: number; nombresApellidos: string; carrera: string; ci?: string }> } {
    if (!Array.isArray(rawResults) || rawResults.length !== expectedLength) {
      return { isValid: false, parsedList: [] };
    }

    const seenIndices = new Set<number>();
    const sanitizedList: Array<{ index: number; nombresApellidos: string; carrera: string; ci?: string }> = [];

    for (let i = 0; i < rawResults.length; i++) {
      const item = rawResults[i];
      if (typeof item !== 'object' || item === null) return { isValid: false, parsedList: [] };

      // Permitir índice explícito en el objeto, o inferir por orden posicional si viene ordenado
      const idx = typeof item.index === 'number' ? item.index : i;

      if (idx < 0 || idx >= expectedLength || seenIndices.has(idx)) {
        return { isValid: false, parsedList: [] };
      }

      seenIndices.add(idx);

      sanitizedList.push({
        index: idx,
        nombresApellidos: (item.nombresApellidos || '').toUpperCase().trim(),
        carrera: item.carrera || 'Medicina',
        ci: (item.ci || '').toString().trim()
      });
    }

    // Verificar que estén presentes exactamente todos los índices de 0 a expectedLength - 1
    if (seenIndices.size !== expectedLength) {
      return { isValid: false, parsedList: [] };
    }

    // Ordenar por índice para garantizar el mapeo 1:1 con las fotos
    sanitizedList.sort((a, b) => a.index - b.index);

    return { isValid: true, parsedList: sanitizedList };
  }

  /**
   * Procesa un lote individual de fotos (6 a 8 imágenes) en una sola llamada a Gemini con responseSchema estructurado
   */
  public static async processSingleBatchWithGemini(
    batchItems: Array<{ id: string; file?: File; photoUrl: string }>,
    apiKey: string,
    attempt = 1
  ): Promise<BatchItemResult[]> {
    const key = apiKey.trim() || this.getSavedGeminiKey();
    if (!key) {
      throw new Error('No se ha configurado la API Key de Gemini');
    }

    // 1. Redimensionar en paralelo todas las imágenes del lote a max 1024px JPEG 82%
    const resizedImages = await Promise.all(
      batchItems.map(async (item) => {
        const source = item.file || item.photoUrl;
        const { base64Data, dataUrl } = await this.resizeImageForVision(source);
        return { id: item.id, base64Data, dataUrl };
      })
    );

    // 2. Construir el prompt estructurado con responseSchema
    const promptText = `
Eres un asistente experto en digitalización de contratos de la Universidad del Pacífico (Paraguay).
Analiza las siguientes ${resizedImages.length} imágenes de contratos de matrícula adjuntas.
Las imágenes están ordenadas secuencialmente del índice 0 al índice ${resizedImages.length - 1}.

Para CADA imagen debes extraer con total exactitud:
- index: El número de índice de la imagen correspondiente (0 a ${resizedImages.length - 1}).
- nombres: El texto exacto al lado de "Nombres:".
- apellidos: El texto exacto al lado de "Apellidos:".
- nombresApellidos: Combina Nombres y Apellidos en MAYÚSCULAS (ejemplo: "PABLA MARGARITA TROCHE FERNANDEZ").
- carrera: La carrera del estudiante (ej: "Medicina", "Odontología", "Derecho", "Administración de Empresas", "Kinesiología y Fisioterapia", "Nutrición").
- ci: El número de documento o cédula de identidad que figura exactamente al lado de "Nro.:" o "Nro:" (ejemplo: "7261797" o "7373454").

Debes devolver EXACTAMENTE un objeto por cada imagen en un array JSON, con los índices de 0 a ${resizedImages.length - 1} sin omitir ninguna imagen.
`;

    // Empaquetar el prompt + array de inlineData
    const parts: any[] = [{ text: promptText }];
    for (const img of resizedImages) {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: img.base64Data
        }
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

    const responseSchema = {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER', description: 'Índice de la imagen del lote (0 a N-1)' },
          nombres: { type: 'STRING' },
          apellidos: { type: 'STRING' },
          nombresApellidos: { type: 'STRING', description: 'Nombres y Apellidos completos' },
          carrera: { type: 'STRING', description: 'Carrera universitaria' },
          ci: { type: 'STRING', description: 'Número de cédula/documento de identidad que está al lado de Nro.:' }
        },
        required: ['index', 'nombresApellidos', 'carrera']
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json',
          response_schema: responseSchema
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Si recibimos 429 (Rate Limit), esperar y reintentar
      if (response.status === 429 && attempt <= BATCH_CONFIG.MAX_RETRIES_PER_BATCH) {
        console.warn(`Rate limit 429 en lote. Reintentando intento ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, 2500 * attempt));
        return this.processSingleBatchWithGemini(batchItems, apiKey, attempt + 1);
      }
      throw new Error(`Gemini Batch API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    let rawList: any[] = [];
    try {
      rawList = JSON.parse(candidateText);
    } catch {
      const match = candidateText.match(/\[[\s\S]*\]/);
      if (match) rawList = JSON.parse(match[0]);
    }

    // 3. Validación estricta de índices 0..N-1
    const { isValid, parsedList } = this.validateStrictBatchIndices(rawList, batchItems.length);

    if (!isValid) {
      if (attempt <= BATCH_CONFIG.MAX_RETRIES_PER_BATCH) {
        console.warn(`Respuesta incompleta o índices inválidos en lote. Reintentando intento ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, 1500));
        return this.processSingleBatchWithGemini(batchItems, apiKey, attempt + 1);
      }
      throw new Error('La respuesta del lote no contiene todos los índices correspondientes a las imágenes enviadas');
    }

    // Mapear resultados a los items originales
    return batchItems.map((item, idx) => {
      const parsedItem = parsedList[idx];
      const resized = resizedImages[idx];
      return {
        id: item.id,
        index: idx,
        nombresApellidos: parsedItem.nombresApellidos || 'ALUMNO POR CONFIRMAR',
        carrera: parsedItem.carrera || 'Medicina',
        ci: parsedItem.ci || '',
        processedImageUrl: resized?.dataUrl || item.photoUrl,
        status: 'success'
      };
    });
  }

  /**
   * Orquesta el procesamiento de todos los contratos en lotes agrupados con concurrencia controlada
   */
  public static async processAllContractPhotosInBatches(
    students: BatchCargoStudent[],
    onProgress?: (event: BatchProgressEvent) => void,
    onBatchCompleted?: (batchResults: BatchItemResult[]) => void
  ): Promise<BatchItemResult[]> {
    const totalItems = students.length;
    if (totalItems === 0) return [];

    const apiKey = this.getSavedGeminiKey();
    const batchSize = BATCH_CONFIG.BATCH_SIZE;
    const maxConcurrency = BATCH_CONFIG.MAX_CONCURRENCY;

    // 1. Dividir los estudiantes en lotes de tamaño configurable (ej. 6 por lote)
    const batches: Array<BatchCargoStudent[]> = [];
    for (let i = 0; i < totalItems; i += batchSize) {
      batches.push(students.slice(i, i + batchSize));
    }

    const totalBatches = batches.length;
    let completedItemsCount = 0;
    const allResults: BatchItemResult[] = [];

    // 2. Ejecutar lotes con límite de concurrencia (Promise pool de max 2 simultáneos)
    let currentBatchIdx = 0;

    const runWorker = async () => {
      while (currentBatchIdx < totalBatches) {
        const batchIndex = currentBatchIdx++;
        const batch = batches[batchIndex];

        if (onProgress) {
          onProgress({
            currentBatch: batchIndex + 1,
            totalBatches,
            completedItems: completedItemsCount,
            totalItems,
            percentage: Math.round((completedItemsCount / totalItems) * 100),
            activeBatchSize: batch.length,
            message: `Procesando Lote ${batchIndex + 1} de ${totalBatches} (${batch.length} contratos)...`
          });
        }

        try {
          // Intentar procesamiento por lote con Gemini
          const batchResults = await this.processSingleBatchWithGemini(batch, apiKey);
          completedItemsCount += batch.length;
          allResults.push(...batchResults);

          if (onBatchCompleted) {
            onBatchCompleted(batchResults);
          }
        } catch (batchError: any) {
          console.warn(`Lote ${batchIndex + 1} falló. Activando fallback individual para este lote:`, batchError?.message);

          // Fallback individual para las fotos de este lote fallido
          const fallbackResults: BatchItemResult[] = [];
          for (let i = 0; i < batch.length; i++) {
            const singleItem = batch[i];
            try {
              const singleData = await this.processContractPhoto(singleItem.file || singleItem.photoUrl);
              fallbackResults.push({
                id: singleItem.id,
                index: i,
                nombresApellidos: singleData.nombresApellidos,
                carrera: singleData.carrera,
                ci: singleData.ci || '',
                processedImageUrl: singleData.processedImageUrl || singleItem.photoUrl,
                status: 'success'
              });
            } catch (err: any) {
              fallbackResults.push({
                id: singleItem.id,
                index: i,
                nombresApellidos: 'REVISAR MANUALMENTE',
                carrera: singleItem.carrera || 'Medicina',
                ci: '',
                status: 'error',
                errorMessage: err?.message || 'Error de lectura'
              });
            }
          }

          completedItemsCount += batch.length;
          allResults.push(...fallbackResults);

          if (onBatchCompleted) {
            onBatchCompleted(fallbackResults);
          }
        }

        if (onProgress) {
          onProgress({
            currentBatch: Math.min(batchIndex + 1, totalBatches),
            totalBatches,
            completedItems: completedItemsCount,
            totalItems,
            percentage: Math.round((completedItemsCount / totalItems) * 100),
            activeBatchSize: batch.length,
            message: completedItemsCount >= totalItems
              ? 'Procesamiento de todos los lotes completado.'
              : `Completado lote ${batchIndex + 1} de ${totalBatches}. Continuando...`
          });
        }
      }
    };

    // Lanzar trabajadores concurrentes
    const workers = Array.from({ length: Math.min(maxConcurrency, totalBatches) }, () => runWorker());
    await Promise.all(workers);

    return allResults;
  }

  /**
   * Obtiene o inicializa el worker reutilizable de Tesseract.js para español
   */
  public static async getWorker(): Promise<Worker> {
    if (this.workerInstance) {
      return this.workerInstance;
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (this.workerInstance) return this.workerInstance;
    }

    this.isInitializing = true;
    try {
      const worker = await createWorker('spa');
      this.workerInstance = worker;
      return worker;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Pre-procesa la imagen recortando enfocadamente el tercio superior (donde están Nombres, Apellidos y Carrera)
   */
  public static async preprocessImage(
    imageSource: string | File | Blob,
    rotationDeg = 0,
    cropTopOnly = true
  ): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
          return;
        }

        const normalizedDeg = ((rotationDeg % 360) + 360) % 360;
        const isSideways = normalizedDeg === 90 || normalizedDeg === 270;

        let fullWidth = isSideways ? img.height : img.width;
        let fullHeight = isSideways ? img.width : img.height;

        const heightFactor = cropTopOnly ? 0.45 : 1.0;
        let targetHeight = Math.round(fullHeight * heightFactor);

        const maxWidth = 2200;
        let srcWidth = fullWidth;
        if (srcWidth > maxWidth) {
          targetHeight = Math.round((targetHeight * maxWidth) / srcWidth);
          srcWidth = maxWidth;
        }

        canvas.width = srcWidth;
        canvas.height = targetHeight;

        ctx.save();
        ctx.translate(canvas.width / 2, (fullHeight * (srcWidth / fullWidth)) / 2);
        ctx.rotate((normalizedDeg * Math.PI) / 180);

        if (isSideways) {
          ctx.drawImage(img, -fullHeight / 2, -fullWidth / 2, fullHeight, fullWidth);
        } else {
          ctx.drawImage(img, -fullWidth / 2, -fullHeight / 2, fullWidth, fullHeight);
        }
        ctx.restore();

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            let gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const contrast = 1.45;
            gray = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
            gray = Math.max(0, Math.min(255, gray));

            if (gray > 180) {
              gray = 255;
            } else if (gray < 85) {
              gray = 0;
            }

            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }

          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } catch {
          resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
        }
      };

      img.onerror = () => {
        resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
      };

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        img.src = URL.createObjectURL(imageSource);
      }
    });
  }

  /**
   * Procesa una foto individual (usado para re-escaneos o fallback)
   */
  public static async processContractPhoto(
    imageSource: string | File | Blob,
    manualRotation = 0
  ): Promise<ExtractedContractData> {
    const savedGeminiKey = this.getSavedGeminiKey();

    if (savedGeminiKey) {
      try {
        const { dataUrl } = await this.resizeImageForVision(imageSource);
        const singleBatch = await this.processSingleBatchWithGemini(
          [{ id: 'single_test', photoUrl: dataUrl }],
          savedGeminiKey
        );

        if (singleBatch.length > 0 && singleBatch[0].status === 'success') {
          return {
            nombresApellidos: singleBatch[0].nombresApellidos,
            carrera: singleBatch[0].carrera,
            ci: singleBatch[0].ci,
            rawText: JSON.stringify(singleBatch[0]),
            confidence: 99,
            bestRotationDegrees: 0,
            processedImageUrl: singleBatch[0].processedImageUrl
          };
        }
      } catch (err) {
        console.warn('Extracción individual con Gemini falló, recurriendo a OCR Local:', err);
      }
    }

    // OCR Local Tesseract
    const worker = await this.getWorker();
    const initialProcessedUrl = await this.preprocessImage(imageSource, manualRotation, true);
    const initialResult = await worker.recognize(initialProcessedUrl);
    let bestRawText = initialResult.data.text || '';
    let bestConfidence = initialResult.data.confidence || 0;
    let bestRotation = manualRotation;
    let bestProcessedUrl = initialProcessedUrl;

    let parsed = this.parseContractText(bestRawText);

    if (
      manualRotation === 0 &&
      (parsed.nombresApellidos === 'ALUMNO POR CONFIRMAR' || !this.hasRecognizableContractWords(bestRawText))
    ) {
      const testAngles = [90, 270, 180];
      for (const angle of testAngles) {
        const candidateUrl = await this.preprocessImage(imageSource, angle, true);
        const res = await worker.recognize(candidateUrl);
        const candidateText = res.data.text || '';
        const candidateParsed = this.parseContractText(candidateText);

        if (
          candidateParsed.nombresApellidos !== 'ALUMNO POR CONFIRMAR' ||
          this.hasRecognizableContractWords(candidateText)
        ) {
          bestRawText = candidateText;
          bestConfidence = res.data.confidence || 0;
          bestRotation = angle;
          bestProcessedUrl = candidateUrl;
          parsed = candidateParsed;
          break;
        }
      }
    }

    return {
      nombresApellidos: parsed.nombresApellidos,
      carrera: parsed.carrera,
      ci: parsed.ci,
      rawText: bestRawText,
      confidence: bestConfidence,
      bestRotationDegrees: bestRotation,
      processedImageUrl: bestProcessedUrl
    };
  }

  private static hasRecognizableContractWords(text: string): boolean {
    const upper = text.toUpperCase();
    const keywords = ['PACIFICO', 'PACÍFICO', 'CONTRATO', 'MATRICULA', 'MATRÍCULA', 'NOMBRES', 'APELLIDOS', 'CARRERA', 'MEDICINA', 'ODONTOLOGIA', 'UNIVERSIDAD'];
    return keywords.filter((k) => upper.includes(k)).length >= 2;
  }

  public static parseContractText(text: string): { nombresApellidos: string; carrera: string; ci?: string } {
    let detectedCarrera = 'Medicina';
    const textLower = text.toLowerCase();

    for (const c of KNOWN_CARRERAS) {
      const cNorm = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const tNorm = textLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (tNorm.includes(cNorm)) {
        detectedCarrera = c;
        break;
      }
    }

    let extractedNombres = '';
    let extractedApellidos = '';

    const nombresRegex = /Nombres?\s*[:.-]?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?=\s+(?:Apellidos?|Carrera|Fecha|Tipo|Nro|Nacionalidad|Estado|Colegio|Domicilio|Teléfono)|\n|$)/i;
    const matchNombres = text.match(nombresRegex);
    if (matchNombres && matchNombres[1]) {
      extractedNombres = this.cleanNameCandidate(matchNombres[1]);
    }

    const apellidosRegex = /Apellidos?\s*[:.-]?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?=\s+(?:Carrera|Nombres?|Fecha|Tipo|Nro|Nacionalidad|Estado|Colegio|Domicilio|Teléfono)|\n|$)/i;
    const matchApellidos = text.match(apellidosRegex);
    if (matchApellidos && matchApellidos[1]) {
      extractedApellidos = this.cleanNameCandidate(matchApellidos[1]);
    }

    // Extracción de C.I. / Nro
    let extractedCi = '';
    const ciRegex = /(?:Nro\.?|Nro|N°|C\.?I\.?|Cédula|Cedula)\s*[:.-]?\s*(\d{4,10})/i;
    const matchCi = text.match(ciRegex);
    if (matchCi && matchCi[1]) {
      extractedCi = matchCi[1].trim();
    }

    let detectedName = '';
    if (extractedNombres && extractedApellidos) {
      detectedName = `${extractedNombres} ${extractedApellidos}`;
    } else if (extractedNombres && extractedNombres.split(/\s+/).length >= 2) {
      detectedName = extractedNombres;
    } else if (extractedApellidos && extractedApellidos.split(/\s+/).length >= 2) {
      detectedName = extractedApellidos;
    }

    if (!detectedName) {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 2);

      const namePrefixes = [
        /^(?:alumno|estudiante|postulante|contratante|don\/doña|don|doña|titular)\s*[:.-]?\s*(.+)$/i,
        /^(?:nombres?\s*y\s*apellidos?|nombre\s*completo)\s*[:.-]?\s*(.+)$/i,
      ];

      for (const line of lines) {
        for (const prefix of namePrefixes) {
          const match = line.match(prefix);
          if (match && match[1]) {
            const candidate = this.cleanNameCandidate(match[1]);
            if (candidate.length >= 6 && candidate.split(/\s+/).length >= 2) {
              detectedName = candidate;
              break;
            }
          }
        }
        if (detectedName) break;
      }
    }

    const forbiddenLegalPhrases = [
      'UNIVERSIDAD', 'PACIFICO', 'PACÍFICO', 'CONTRATO', 'PRESTACION', 'PRESTACIÓN', 'SERVICIOS',
      'EDUCATIVOS', 'ASUNCION', 'ASUNCIÓN', 'PARAGUAY', 'FACULTAD', 'ADMISION', 'ADMISIÓN', 'GRADO',
      'PROMOCION', 'PROMOCIÓN', 'RECTORADO', 'SECRETARIA', 'SECRETARÍA', 'PRIMERA', 'SEGUNDA', 'TERCERA',
      'CLAUSULA', 'CLÁUSULA', 'VALOR', 'GUARANIES', 'GUARANÍES', 'MATRICULA', 'MATRÍCULA', 'CUOTA', 'FECHA',
      'FIRMA', 'CEDULA', 'CÉDULA', 'CIENCIAS', 'SALUD', 'DERECHO', 'MEDICINA', 'ODONTOLOGIA', 'ODONTOLOGÍA',
      'SOCIALES', 'BECADO', 'REPUBLICA', 'REPÚBLICA', 'TITULO', 'TÍTULO', 'DOMICILIO', 'ESTADO', 'CIVIL',
      'ENCON', 'ED PU', 'POS EE', 'ADELANTE', 'ESTUDIANTE', 'COMPROMETE', 'ACUERDO'
    ];

    if (!detectedName) {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 2);

      for (const line of lines) {
        const lineUpper = line.toUpperCase();
        const words = lineUpper.split(/\s+/).filter((w) => w.length > 1);

        if (words.length >= 2 && words.length <= 5 && /^[A-ZÁÉÍÓÚÑ\s]+$/.test(lineUpper)) {
          const hasForbidden = forbiddenLegalPhrases.some((phrase) =>
            lineUpper.includes(phrase)
          );
          if (!hasForbidden && lineUpper.length >= 8) {
            detectedName = lineUpper;
            break;
          }
        }
      }
    }

    if (detectedName) {
      const isForbidden = forbiddenLegalPhrases.some((phrase) =>
        detectedName.toUpperCase() === phrase
      );
      if (isForbidden) {
        detectedName = '';
      }
    }

    return {
      nombresApellidos: detectedName ? detectedName.toUpperCase() : 'ALUMNO POR CONFIRMAR',
      carrera: detectedCarrera,
      ci: extractedCi
    };
  }

  private static cleanNameCandidate(candidate: string): string {
    const cutPatterns = [
      /\b(?:inscripto|inscripta|carrera|facultad|con\s*c\.?i|c\.?i|cedula|cédula|de\s*nacionalidad|mayor\s*de|domiciliad[oa]|fecha|tipo|nro|nacionalidad|estado|colegio|titulo|título|año|telefono|teléfono)\b.*/i,
      /[\d,;:_()/*#]/g
    ];

    let cleaned = candidate;
    cleaned = cleaned.replace(cutPatterns[0], '');
    cleaned = cleaned.replace(cutPatterns[1], '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  public static async terminateWorker() {
    if (this.workerInstance) {
      await this.workerInstance.terminate();
      this.workerInstance = null;
    }
  }
}
