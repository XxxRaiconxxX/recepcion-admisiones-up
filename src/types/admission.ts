export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
  idToken?: string;
  tokenExpiry?: number;
}

export interface StudentData {
  ci: string;
  nombres: string;
  apellidos: string;
  carrera: string;
  nombreAsesor: string;
  nombreRecepcionista: string;
  fecha: string;
  numeroRecibo: string;
  numeroCargo: string;
  observaciones: string;
  
  // Lista de Verificación de Documentos (Matching Imagen 1 - UP)
  certificadoEstudios: boolean;
  fotocopiaCedula: boolean;
  fotosCarnet: boolean;
  antecedentesPoliciales: boolean;
  carnetMigraciones: boolean;
  otros: boolean;
  descripcionOtros: string;
  contratoFirmado: boolean;

  // Estado de Integración con Google Drive
  driveFolderId?: string;
  driveFolderPath?: string;
  driveSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
}

export interface CargoItem {
  id: string;
  nombreCompleto: string;
  carrera: string;
  documentosStr: string;
  observacion: string;
}
