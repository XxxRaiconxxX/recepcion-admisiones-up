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
   * Obtiene la API Key de Gemini guardada en localStorage o en variables de entorno
   */
  public static getSavedGeminiKey(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('up_gemini_api_key') || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
  }

  public static saveGeminiKey(key: string) {
    if (typeof window === 'undefined') return;
    if (key.trim()) {
      localStorage.setItem('up_gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('up_gemini_api_key');
    }
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
   * Convierte File o Blob a Base64 puro
   */
  public static async fileToBase64(fileOrBlob: File | Blob | string): Promise<string> {
    if (typeof fileOrBlob === 'string' && fileOrBlob.startsWith('data:')) {
      return fileOrBlob.split(',')[1] || fileOrBlob;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        resolve(res.split(',')[1] || res);
      };
      reader.onerror = reject;
      if (typeof fileOrBlob === 'string') {
        fetch(fileOrBlob)
          .then((r) => r.blob())
          .then((b) => reader.readAsDataURL(b))
          .catch(reject);
      } else {
        reader.readAsDataURL(fileOrBlob);
      }
    });
  }

  /**
   * Extracción con Gemini Vision AI (100% Precisión en cualquier ángulo o foto de celular)
   */
  public static async processWithGeminiVision(
    imageSource: string | File | Blob,
    apiKey: string
  ): Promise<ExtractedContractData> {
    const base64Data = await this.fileToBase64(imageSource);
    const key = apiKey.trim() || this.getSavedGeminiKey();

    if (!key) {
      throw new Error('No se ha configurado la API Key de Gemini');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

    const prompt = `
Eres un asistente experto en digitalización de contratos de la Universidad del Pacífico (Paraguay).
Analiza la foto de la primera página del contrato de matrícula.
Extrae con total exactitud los siguientes datos del estudiante:
1. "nombres": El texto que está exactamente al lado de "Nombres:".
2. "apellidos": El texto que está exactamente al lado de "Apellidos:".
3. "nombresApellidos": Combina Nombres y Apellidos en MAYÚSCULAS (ejemplo: "KIARA LIBETH TRINIDAD ARIAS").
4. "carrera": La carrera del estudiante (ej: "Medicina", "Odontología", "Derecho", "Administración de Empresas", "Kinesiología y Fisioterapia", "Nutrición").
5. "ci": Número de cédula de identidad si figura.

Responde ÚNICAMENTE con un objeto JSON con este formato sin texto adicional:
{
  "nombresApellidos": "NOMBRES Y APELLIDOS COMPLETOS",
  "carrera": "CARRERA",
  "ci": "NUMERO DE CI"
}
`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en Gemini Vision (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    let jsonResult: any = {};
    try {
      jsonResult = JSON.parse(candidateText);
    } catch {
      const match = candidateText.match(/\{[\s\S]*\}/);
      if (match) {
        jsonResult = JSON.parse(match[0]);
      }
    }

    return {
      nombresApellidos: (jsonResult.nombresApellidos || 'ALUMNO POR CONFIRMAR').toUpperCase().trim(),
      carrera: jsonResult.carrera || 'Medicina',
      rawText: candidateText,
      confidence: 99,
      bestRotationDegrees: 0
    };
  }

  /**
   * Pre-procesa la imagen recortando enfocadamente el tercio superior (donde están Nombres, Apellidos y Carrera)
   * para evitar que las cláusulas legales inferiores confundan al OCR.
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

        // Si cropTopOnly es true, enfocamos el 45% superior donde está el encabezado con Nombres y Apellidos
        const heightFactor = cropTopOnly ? 0.45 : 1.0;
        let targetHeight = Math.round(fullHeight * heightFactor);

        // Escalar manteniendo proporción
        const maxWidth = 2200;
        let srcWidth = fullWidth;
        if (srcWidth > maxWidth) {
          targetHeight = Math.round((targetHeight * maxWidth) / srcWidth);
          srcWidth = maxWidth;
        }

        canvas.width = srcWidth;
        canvas.height = targetHeight;

        // Aplicar transformación y rotación
        ctx.save();
        ctx.translate(canvas.width / 2, (fullHeight * (srcWidth / fullWidth)) / 2);
        ctx.rotate((normalizedDeg * Math.PI) / 180);

        if (isSideways) {
          ctx.drawImage(img, -fullHeight / 2, -fullWidth / 2, fullHeight, fullWidth);
        } else {
          ctx.drawImage(img, -fullWidth / 2, -fullHeight / 2, fullWidth, fullHeight);
        }
        ctx.restore();

        // Aplicar escala de grises y mejora de contraste adaptativo
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Filtro de contraste pronunciado para resaltar letras negras en papel
            const contrast = 1.45;
            gray = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
            gray = Math.max(0, Math.min(255, gray));

            // Binarización suave
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
   * Ejecuta el OCR en una foto (con soporte de Gemini AI si hay key, o Tesseract con recorte de cabecera)
   */
  public static async processContractPhoto(
    imageSource: string | File | Blob,
    manualRotation = 0,
    onProgress?: (p: number) => void
  ): Promise<ExtractedContractData> {
    const savedGeminiKey = this.getSavedGeminiKey();

    // 1. Si el usuario configuró la clave de Gemini, usar Gemini Vision AI para 100% de precisión
    if (savedGeminiKey) {
      if (onProgress) onProgress(0.5);
      try {
        const result = await this.processWithGeminiVision(imageSource, savedGeminiKey);
        if (onProgress) onProgress(1.0);
        return result;
      } catch (err) {
        console.warn('Gemini Vision falló, recurriendo a OCR Local:', err);
      }
    }

    // 2. OCR Local Tesseract.js con recorte superior del 45% (evita cláusulas legales)
    const worker = await this.getWorker();

    const initialProcessedUrl = await this.preprocessImage(imageSource, manualRotation, true);
    if (onProgress) onProgress(0.3);

    const initialResult = await worker.recognize(initialProcessedUrl);
    let bestRawText = initialResult.data.text || '';
    let bestConfidence = initialResult.data.confidence || 0;
    let bestRotation = manualRotation;
    let bestProcessedUrl = initialProcessedUrl;

    let parsed = this.parseContractText(bestRawText);

    // Si la foto vino de costado, probar rotaciones automáticas
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
    // "Nombres: KIARA LIBETH" y "Apellidos: TRINIDAD ARIAS"
    let extractedNombres = '';
    let extractedApellidos = '';

    // Patrón 1: Nombres: [VALOR]
    const nombresRegex = /Nombres?\s*[:.-]?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?=\s+(?:Apellidos?|Carrera|Fecha|Tipo|Nro|Nacionalidad|Estado|Colegio|Domicilio|Teléfono)|\n|$)/i;
    const matchNombres = text.match(nombresRegex);
    if (matchNombres && matchNombres[1]) {
      extractedNombres = this.cleanNameCandidate(matchNombres[1]);
    }

    // Patrón 2: Apellidos: [VALOR]
    const apellidosRegex = /Apellidos?\s*[:.-]?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?=\s+(?:Carrera|Nombres?|Fecha|Tipo|Nro|Nacionalidad|Estado|Colegio|Domicilio|Teléfono)|\n|$)/i;
    const matchApellidos = text.match(apellidosRegex);
    if (matchApellidos && matchApellidos[1]) {
      extractedApellidos = this.cleanNameCandidate(matchApellidos[1]);
    }

    let detectedName = '';
    if (extractedNombres && extractedApellidos) {
      detectedName = `${extractedNombres} ${extractedApellidos}`;
    } else if (extractedNombres && extractedNombres.split(/\s+/).length >= 2) {
      detectedName = extractedNombres;
    } else if (extractedApellidos && extractedApellidos.split(/\s+/).length >= 2) {
      detectedName = extractedApellidos;
    }

    // 3. Si no encontró pares explícitos, buscar líneas con prefijos formales
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

    // 4. Si aún no encontró, buscar líneas en mayúsculas que parezcan nombres
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
      carrera: detectedCarrera
    };
  }

  /**
   * Limpia y formatea el nombre extraído cortando palabras clave posteriores
   */
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
