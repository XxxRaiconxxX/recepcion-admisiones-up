import { createWorker, type Worker } from 'tesseract.js';

export interface ExtractedContractData {
  nombresApellidos: string;
  carrera: string;
  rawText: string;
  confidence: number;
  bestRotationDegrees: number;
  processedImageUrl?: string;
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
   * Rota una imagen en Canvas por un ángulo determinado (0, 90, 180, 270 grados)
   */
  public static async rotateImage(
    imageSource: string | File | Blob,
    degrees: number
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

        const normalizedDeg = ((degrees % 360) + 360) % 360;

        if (normalizedDeg === 90 || normalizedDeg === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((normalizedDeg * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        resolve(canvas.toDataURL('image/jpeg', 0.92));
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
   * Pre-procesa la imagen en un Canvas HTML5 (rotación opcional, contraste, nitidez)
   */
  public static async preprocessImage(
    imageSource: string | File | Blob,
    rotationDeg = 0
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

        let srcWidth = isSideways ? img.height : img.width;
        let srcHeight = isSideways ? img.width : img.height;

        // Escalar manteniendo proporción para óptimo rendimiento OCR
        const maxWidth = 2200;
        if (srcWidth > maxWidth) {
          srcHeight = Math.round((srcHeight * maxWidth) / srcWidth);
          srcWidth = maxWidth;
        }

        canvas.width = srcWidth;
        canvas.height = srcHeight;

        // Aplicar transformación y rotación
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((normalizedDeg * Math.PI) / 180);

        if (isSideways) {
          ctx.drawImage(img, -srcHeight / 2, -srcWidth / 2, srcHeight, srcWidth);
        } else {
          ctx.drawImage(img, -srcWidth / 2, -srcHeight / 2, srcWidth, srcHeight);
        }
        ctx.restore();

        // Obtener píxeles para escala de grises y aumento de contraste
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Luminancia en escala de grises
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Filtro de contraste pronunciado (contrast boost)
            const contrast = 1.4;
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
   * Ejecuta el OCR en una foto con detección automática de orientación (0°, 90°, 270°, 180°)
   */
  public static async processContractPhoto(
    imageSource: string | File | Blob,
    manualRotation = 0,
    onProgress?: (p: number) => void
  ): Promise<ExtractedContractData> {
    const worker = await this.getWorker();

    // 1. Probar primero con la rotación manual (o 0° por defecto)
    const initialProcessedUrl = await this.preprocessImage(imageSource, manualRotation);
    if (onProgress) onProgress(0.3);

    const initialResult = await worker.recognize(initialProcessedUrl);
    let bestRawText = initialResult.data.text || '';
    let bestConfidence = initialResult.data.confidence || 0;
    let bestRotation = manualRotation;
    let bestProcessedUrl = initialProcessedUrl;

    let parsed = this.parseContractText(bestRawText);

    // 2. Si la foto vino de costado (texto garabateado o no se detectó el alumno/universidad),
    // probar rotaciones automáticas de 90°, 270° y 180°
    if (
      manualRotation === 0 &&
      (parsed.nombresApellidos === 'ALUMNO POR CONFIRMAR' || !this.hasRecognizableContractWords(bestRawText))
    ) {
      const testAngles = [90, 270, 180];
      for (const angle of testAngles) {
        const candidateUrl = await this.preprocessImage(imageSource, angle);
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

    if (onProgress) onProgress(0.9);

    return {
      nombresApellidos: parsed.nombresApellidos,
      carrera: parsed.carrera,
      rawText: bestRawText,
      confidence: bestConfidence,
      bestRotationDegrees: bestRotation,
      processedImageUrl: bestProcessedUrl
    };
  }

  /**
   * Comprueba si el texto contiene palabras clave típicas de un contrato UP
   */
  private static hasRecognizableContractWords(text: string): boolean {
    const upper = text.toUpperCase();
    const keywords = ['PACIFICO', 'PACÍFICO', 'CONTRATO', 'MATRICULA', 'MATRÍCULA', 'NOMBRES', 'APELLIDOS', 'CARRERA', 'MEDICINA', 'ODONTOLOGIA', 'UNIVERSIDAD'];
    return keywords.filter((k) => upper.includes(k)).length >= 2;
  }

  /**
   * Algoritmo heurístico para detectar Nombre del Alumno (Nombres + Apellidos) y Carrera
   */
  public static parseContractText(text: string): { nombresApellidos: string; carrera: string } {
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

    // 2. Extracción específica de pares clave-valor de contratos UP:
    // "Nombres: KIARA LIBETH" y "Apellidos: TRINIDAD ARIAS" y "Carrera: MEDICINA"
    let extractedNombres = '';
    let extractedApellidos = '';

    // Patrón 1: Nombres: [VALOR]
    const nombresRegex = /Nombres?\s*[:.-]?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?=\s+(?:Apellidos?|Carrera|Fecha|Tipo|Nro|Nacionalidad|Estado|Colegio|Domicilio)|\n|$)/i;
    const matchNombres = text.match(nombresRegex);
    if (matchNombres && matchNombres[1]) {
      extractedNombres = this.cleanNameCandidate(matchNombres[1]);
    }

    // Patrón 2: Apellidos: [VALOR]
    const apellidosRegex = /Apellidos?\s*[:.-]?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?=\s+(?:Carrera|Nombres?|Fecha|Tipo|Nro|Nacionalidad|Estado|Colegio|Domicilio)|\n|$)/i;
    const matchApellidos = text.match(apellidosRegex);
    if (matchApellidos && matchApellidos[1]) {
      extractedApellidos = this.cleanNameCandidate(matchApellidos[1]);
    }

    let detectedName = '';
    if (extractedNombres && extractedApellidos) {
      detectedName = `${extractedNombres} ${extractedApellidos}`;
    } else if (extractedNombres) {
      detectedName = extractedNombres;
    } else if (extractedApellidos) {
      detectedName = extractedApellidos;
    }

    // 3. Si no encontró pares explícitos Nombres/Apellidos, buscar líneas con prefijos
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
            if (candidate.length >= 5) {
              detectedName = candidate;
              break;
            }
          }
        }
        if (detectedName) break;
      }
    }

    // 4. Si aún no encontró, buscar líneas en mayúsculas que parezcan nombres
    if (!detectedName) {
      const excludedWords = [
        'UNIVERSIDAD', 'PACIFICO', 'PACÍFICO', 'CONTRATO', 'PRESTACION', 'PRESTACIÓN', 'SERVICIOS',
        'EDUCATIVOS', 'ASUNCION', 'ASUNCIÓN', 'PARAGUAY', 'FACULTAD', 'ADMISION', 'ADMISIÓN', 'GRADO',
        'PROMOCION', 'PROMOCIÓN', 'RECTORADO', 'SECRETARIA', 'SECRETARÍA', 'PRIMERA', 'SEGUNDA', 'CLAUSULA',
        'CLÁUSULA', 'VALOR', 'GUARANIES', 'GUARANÍES', 'MATRICULA', 'MATRÍCULA', 'CUOTA', 'FECHA', 'FIRMA',
        'CEDULA', 'CÉDULA', 'CIENCIAS', 'SALUD', 'DERECHO', 'MEDICINA', 'ODONTOLOGIA', 'ODONTOLOGÍA', 'SOCIALES',
        'BECADO', 'REPUBLICA', 'REPÚBLICA', 'TITULO', 'TÍTULO', 'DOMICILIO', 'ESTADO', 'CIVIL'
      ];

      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 2);

      for (const line of lines) {
        const lineUpper = line.toUpperCase();
        const words = lineUpper.split(/\s+/).filter((w) => w.length > 1);

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
    const cutPatterns = [
      /\b(?:inscripto|inscripta|carrera|facultad|con\s*c\.?i|c\.?i|cedula|cédula|de\s*nacionalidad|mayor\s*de|domiciliad[oa]|fecha|tipo|nro|nacionalidad|estado|colegio|titulo|título)\b.*/i,
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
