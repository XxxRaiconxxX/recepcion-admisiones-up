import type { StudentData, GoogleUserProfile } from '../types/admission';

// ID de la Carpeta Raíz de Admisiones de la Universidad del Pacífico
// URL: https://drive.google.com/drive/folders/1dcqt0rAR0WiQ9ZnoVo9PUSxjt9xrfAA2
export const GOOGLE_DRIVE_ROOT_FOLDER_ID = '1dcqt0rAR0WiQ9ZnoVo9PUSxjt9xrfAA2';
export const GOOGLE_DRIVE_ROOT_URL = `https://drive.google.com/drive/folders/${GOOGLE_DRIVE_ROOT_FOLDER_ID}`;

// Client ID por defecto para Google Cloud OAuth 2.0
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const STORAGE_KEY_SYNC_LOGS = 'up_drive_sync_logs';
const STORAGE_KEY_OAUTH_USER = 'up_oauth_google_user';

export interface DriveUploadResult {
  success: true;
  folderId: string;
  folderName: string;
  driveFolderUrl: string;
  receiptFileName: string;
  cargoFileName: string;
  files: Array<{
    id: string;
    name: string;
    url?: string;
    created: boolean;
  }>;
}

const normalizeNamePart = (value: string) => value.trim().replace(/\s+/g, ' ');

export const getStudentDriveFolderName = (student: StudentData) =>
  `${student.ci.trim()}-${normalizeNamePart(student.nombres)} ${normalizeNamePart(student.apellidos)}`;

const blobToBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
};

export class DriveService {
  /**
   * Obtiene la sesión activa de OAuth del usuario
   */
  public static getSavedOAuthUser(): GoogleUserProfile | null {
    const data = localStorage.getItem(STORAGE_KEY_OAUTH_USER);
    if (!data) return null;
    try {
      const user = JSON.parse(data) as GoogleUserProfile;
      if (
        !user.idToken ||
        !user.tokenExpiry ||
        user.tokenExpiry <= Date.now() + 60_000
      ) {
        localStorage.removeItem(STORAGE_KEY_OAUTH_USER);
        return null;
      }
      return user;
    } catch {
      localStorage.removeItem(STORAGE_KEY_OAUTH_USER);
      return null;
    }
  }

  /**
   * Guarda o borra la sesión de OAuth de Google
   */
  public static saveOAuthUser(user: GoogleUserProfile | null) {
    if (user) {
      localStorage.setItem(STORAGE_KEY_OAUTH_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_OAUTH_USER);
    }
  }

  /**
   * Busca el legajo ya existente y sube allí los dos comprobantes.
   */
  public static async uploadReceiptAndCargo(
    student: StudentData,
    receiptPdf: Blob,
    cargoPdf: Blob,
    idToken: string,
    signal?: AbortSignal,
    endpoint = '/api/drive'
  ): Promise<DriveUploadResult> {
    const folderName = getStudentDriveFolderName(student);
    const receiptFileName = `Recibo_${folderName}.pdf`;
    const cargoFileName = `Cargo_${folderName}.pdf`;

    if (!student.ci.trim() || !student.nombres.trim() || !student.apellidos.trim()) {
      throw new Error('CI, nombres y apellidos son obligatorios para localizar el legajo.');
    }

    if (!receiptPdf.size || !cargoPdf.size) {
      throw new Error('Los comprobantes PDF están vacíos.');
    }

    if (!idToken) {
      throw new Error('Conecta una cuenta de Google autorizada antes de subir a Drive.');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        action: 'findFolderAndUpload',
        folderName,
        files: [
          {
            name: receiptFileName,
            mimeType: 'application/pdf',
            base64: await blobToBase64(receiptPdf),
          },
          {
            name: cargoFileName,
            mimeType: 'application/pdf',
            base64: await blobToBase64(cargoPdf),
          },
        ],
      }),
    });

    let result: any;
    try {
      result = await response.json();
    } catch {
      throw new Error(`La integración con Drive devolvió una respuesta inválida (HTTP ${response.status}).`);
    }

    if (!response.ok || result.status !== 'success') {
      throw new Error(result.message || `Google Drive rechazó la operación (HTTP ${response.status}).`);
    }

    const confirmedFileNames = new Set(
      Array.isArray(result.files) ? result.files.map((file: any) => file.name) : [],
    );
    if (
      !result.folderId ||
      !result.folderUrl ||
      result.folderName !== folderName ||
      !Array.isArray(result.files) ||
      result.files.length !== 2 ||
      result.files.some((file: any) => !file.id || !file.name) ||
      !confirmedFileNames.has(receiptFileName) ||
      !confirmedFileNames.has(cargoFileName)
    ) {
      throw new Error('Google Drive no confirmó la carpeta exacta y los dos comprobantes.');
    }

    // El log local es auxiliar: nunca debe convertir una subida confirmada en error.
    try {
      const savedLogs = JSON.parse(localStorage.getItem(STORAGE_KEY_SYNC_LOGS) || '[]');
      const logs = Array.isArray(savedLogs) ? savedLogs : [];
      logs.unshift({
        timestamp: new Date().toISOString(),
        studentCI: student.ci,
        studentName: `${student.nombres} ${student.apellidos}`,
        parentFolderId: GOOGLE_DRIVE_ROOT_FOLDER_ID,
        folderName,
        receiptFileName,
        cargoFileName,
        folderId: result.folderId,
        fileIds: result.files.map((file: any) => file.id),
        authMethod: 'Google Apps Script vía Vercel',
        status: 'Confirmado por Google Drive',
      });
      localStorage.setItem(STORAGE_KEY_SYNC_LOGS, JSON.stringify(logs));
    } catch (error) {
      console.warn('[Google Drive] No se pudo guardar el log local:', error);
    }

    return {
      success: true,
      folderId: result.folderId,
      folderName,
      driveFolderUrl: result.folderUrl,
      receiptFileName,
      cargoFileName,
      files: result.files,
    };
  }
}
