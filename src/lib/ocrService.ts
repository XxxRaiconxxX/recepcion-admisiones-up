import { createWorker, type Worker } from 'tesseract.js';

export interface ExtractedContractData {
  nombresApellidos: string;
  carrera: string;
  rawText: string;
  confidence: number;
}

const KNOWN_CARRERAS = [
  'Medicina',
  'Odontología',
  'Derecho',
  'Administración de Empresas',
  'Kinesiología y Fisioterapia',
  'Nutrición',
  'Posgrado'
];

export class OcrService {
  private static workerInstance: Worker | null = null;
  private static isInitializing = false;

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
   * Pre-procesa la imagen en un Canvas HTML5 para optimizar el contraste del texto en contratos
   */
  public static async preprocessImage(imageSource: string | File | Blob): Promise<string> {
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

        // Escalar manteniendo proporción para óptimo rendimiento OCR
        const maxWidth = 2200;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        // Dibujar original
        ctx.drawImage(img, 0, 0, width, height);

        // Obtener píxeles para escala de grises y aumento de contraste
        try {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Luminancia en escala de grises
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Filtro de contraste pronunciado (contrast boost)
            const contrast = 1.35;
            gray = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
            gray = Math.max(0, Math.min(255, gray));

            // Binarización suave para resaltar letras oscuras
            if (gray > 185) {
              gray = 255;
            } else if (gray < 75) {
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
   * Ejecuta el OCR en una foto y analiza el texto del contrato
   */
  public static async processContractPhoto(
    imageSource: string | File | Blob,
    onProgress?: (p: number) => void
  ): Promise<ExtractedContractData> {
    const worker = await this.getWorker();

    // Optimizar imagen
    const processedUrl = await this.preprocessImage(imageSource);

    if (onProgress) onProgress(0.3);

    // Reconocimiento OCR con Tesseract
    const result = await worker.recognize(processedUrl);
    const rawText = result.data.text || '';
    const confidence = result.data.confidence || 0;

    if (onProgress) onProgress(0.9);

    // Extracción inteligente de Carrera y Alumno
    const parsed = this.parseContractText(rawText);

    return {
      nombresApellidos: parsed.nombresApellidos,
      carrera: parsed.carrera,
      rawText,
      confidence
    };
  }

  /**
   * Algoritmo heurístico para detectar Nombre del Alumno y Carrera
   */
  public static parseContractText(text: string): { nombresApellidos: string; carrera: string } {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 2);

    // 1. Detectar Carrera
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

    // 2. Detectar Nombre y Apellido
    let detectedName = '';

    // Patrones de prefijos de nombres
    const namePrefixes = [
      /^(?:alumno|estudiante|postulante|contratante|don\/doña|don|doña|titular)\s*[:.-]?\s*(.+)$/i,
      /^(?:nombres?\s*y\s*apellidos?|nombre\s*completo)\s*[:.-]?\s*(.+)$/i,
    ];

    // Buscar primero línea por línea con prefijo
    for (const line of lines) {
      for (const prefix of namePrefixes) {
        const match = line.match(prefix);
        if (match && match[1]) {
          const candidate = this.cleanNameCandidate(match[1]);
          if (candidate.length >= 5) {
            detectedName = candidate;
            break;
          }
        }
      }
      if (detectedName) break;
    }

    // Si no encontró por línea directa, probar patrón general
    if (!detectedName) {
      const generalPattern = /(?:alumno|estudiante|postulante|contratante|don\/doña|don|doña)\s*[:.-]?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]{5,40})/i;
      const match = text.match(generalPattern);
      if (match && match[1]) {
        detectedName = this.cleanNameCandidate(match[1]);
      }
    }

    // Si no encontró por patrón directo, buscar líneas en mayúsculas que parezcan nombres completos
    if (!detectedName) {
      const excludedWords = [
        'UNIVERSIDAD', 'PACIFICO', 'PACÍFICO', 'CONTRATO', 'PRESTACION', 'PRESTACIÓN', 'SERVICIOS',
        'EDUCATIVOS', 'ASUNCION', 'ASUNCIÓN', 'PARAGUAY', 'FACULTAD', 'ADMISION', 'ADMISIÓN', 'GRADO',
        'PROMOCION', 'PROMOCIÓN', 'RECTORADO', 'SECRETARIA', 'SECRETARÍA', 'PRIMERA', 'SEGUNDA', 'CLAUSULA',
        'CLÁUSULA', 'VALOR', 'GUARANIES', 'GUARANÍES', 'MATRICULA', 'MATRÍCULA', 'CUOTA', 'FECHA', 'FIRMA',
        'CEDULA', 'CÉDULA', 'CIENCIAS', 'SALUD', 'DERECHO', 'MEDICINA', 'ODONTOLOGIA', 'ODONTOLOGÍA', 'SOCIALES'
      ];

      for (const line of lines) {
        const lineUpper = line.toUpperCase();
        const words = lineUpper.split(/\s+/).filter((w) => w.length > 1);

        // Nombres tienen típicamente 2 a 5 palabras, solo letras
        if (words.length >= 2 && words.length <= 5 && /^[A-ZÁÉÍÓÚÑ\s]+$/.test(lineUpper)) {
          const hasExcluded = words.some((w) => excludedWords.includes(w));
          if (!hasExcluded && lineUpper.length >= 8) {
            detectedName = lineUpper;
            break;
          }
        }
      }
    }

    return {
      nombresApellidos: detectedName ? detectedName.toUpperCase() : 'ALUMNO POR CONFIRMAR',
      carrera: detectedCarrera
    };
  }

  /**
   * Limpia y formatea el nombre extraído cortando palabras clave posteriores
   */
  private static cleanNameCandidate(candidate: string): string {
    // Cortar en palabras como inscripto, con ci, carrera, etc.
    const cutPatterns = [
      /\b(?:inscripto|inscripta|carrera|facultad|con\s*c\.?i|c\.?i|cedula|cédula|de\s*nacionalidad|mayor\s*de|domiciliad[oa])\b.*/i,
      /[\d,;:_()/*#]/g
    ];

    let cleaned = candidate;
    cleaned = cleaned.replace(cutPatterns[0], '');
    cleaned = cleaned.replace(cutPatterns[1], '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Libera la memoria del worker de Tesseract si es necesario
   */
  public static async terminateWorker() {
    if (this.workerInstance) {
      await this.workerInstance.terminate();
      this.workerInstance = null;
    }
  }
}
