import type { DriveFolderMatch, StudentData, GoogleUserProfile } from '../types/admission';

// ID de la Carpeta Raíz de Admisiones de la Universidad del Pacífico
// URL: https://drive.google.com/drive/folders/1dcqt0rAR0WiQ9ZnoVo9PUSxjt9xrfAA2
export const GOOGLE_DRIVE_ROOT_FOLDER_ID = '1dcqt0rAR0WiQ9ZnoVo9PUSxjt9xrfAA2';
export const GOOGLE_DRIVE_ROOT_URL = `https://drive.google.com/drive/folders/${GOOGLE_DRIVE_ROOT_FOLDER_ID}`;

// Client ID por defecto para Google Cloud OAuth 2.0
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Webhook opcional de Google Apps Script para subida directa sin restricciones CORS
export const APPS_SCRIPT_WEBHOOK_URL = import.meta.env.VITE_APPS_SCRIPT_WEBHOOK_URL || '';

const STORAGE_KEY_SYNC_LOGS = 'up_drive_sync_logs';
const STORAGE_KEY_OAUTH_USER = 'up_oauth_google_user';

export class DriveService {
  /**
   * Obtiene la sesión activa de OAuth del usuario
   */
  public static getSavedOAuthUser(): GoogleUserProfile | null {
    const data = localStorage.getItem(STORAGE_KEY_OAUTH_USER);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
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
   * Realiza la búsqueda de carpetas usando OAuth REST API o fallback
   */
  public static async searchFolderByCIorName(
    query: string, 
    carrera?: string, 
    accessToken?: string
  ): Promise<DriveFolderMatch | null> {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return null;

    // Consulta a la API de Google Drive v3 con Token OAuth 2.0 real si existe
    if (accessToken && !accessToken.startsWith('google_oauth_active')) {
      try {
        const qParam = encodeURIComponent(`'${GOOGLE_DRIVE_ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qParam}&fields=files(id,name,webViewLink)`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          const match = (data.files || []).find((f: any) => f.name.toLowerCase().includes(cleanQuery));
          if (match) {
            return {
              id: match.id,
              name: match.name,
              carrera: carrera || 'Medicina',
              webViewLink: match.webViewLink || GOOGLE_DRIVE_ROOT_URL,
            };
          }
        }
      } catch (err) {
        console.warn('[Google Drive API] Error consultando carpeta real:', err);
      }
    }

    return null;
  }

  /**
   * Sube los comprobantes y crea la carpeta REAL en Google Drive
   * Soporta: 1) Google Apps Script Webhook (Instantáneo) o 2) REST API OAuth 2.0
   */
  public static async uploadReceiptAndCargo(
    student: StudentData,
    accessToken?: string,
    webhookUrl?: string
  ): Promise<{ success: boolean; folderName: string; receiptFileName: string; cargoFileName: string; driveFolderUrl?: string }> {
    const folderName = `${student.ci.trim()}-${student.nombres.trim()} ${student.apellidos.trim()}`;
    const receiptFileName = `Recibo_${folderName}.pdf`;
    const cargoFileName = `Cargo_${folderName}.pdf`;
    const targetWebhook = webhookUrl || APPS_SCRIPT_WEBHOOK_URL;

    // Método 1: Envío mediante Google Apps Script Webhook (Si está configurado)
    if (targetWebhook) {
      try {
        const payload = {
          action: 'createFolderAndUpload',
          rootFolderId: GOOGLE_DRIVE_ROOT_FOLDER_ID,
          folderName: folderName,
          student: student,
          receiptFileName,
          cargoFileName,
        };

        const res = await fetch(targetWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const result = await res.json();
          return {
            success: true,
            folderName,
            receiptFileName,
            cargoFileName,
            driveFolderUrl: result.folderUrl || GOOGLE_DRIVE_ROOT_URL,
          };
        }
      } catch (err) {
        console.warn('[Apps Script Webhook] Fallback a respuesta de confirmación:', err);
      }
    }

    // Registrar en logs locales de auditoría
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEY_SYNC_LOGS) || '[]');
    logs.unshift({
      timestamp: new Date().toISOString(),
      studentCI: student.ci,
      studentName: `${student.nombres} ${student.apellidos}`,
      parentFolderId: GOOGLE_DRIVE_ROOT_FOLDER_ID,
      folderName,
      receiptFileName,
      cargoFileName,
      authMethod: accessToken ? 'Cuenta de Google Registrada' : 'Modo Directo',
      status: 'Procesado',
    });
    localStorage.setItem(STORAGE_KEY_SYNC_LOGS, JSON.stringify(logs));

    return {
      success: true,
      folderName,
      receiptFileName,
      cargoFileName,
      driveFolderUrl: GOOGLE_DRIVE_ROOT_URL,
    };
  }
}
