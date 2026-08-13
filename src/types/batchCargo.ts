export interface BatchCargoStudent {
  id: string;
  file?: File;
  photoUrl: string;
  photoName: string;
  nombresApellidos: string;
  carrera: string;
  documentos: string[];
  observacion: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  confidence?: number;
  rawText?: string;
  errorMessage?: string;
}

export interface BatchCargoHeader {
  numeroCargo: string;
  para: string;
  paraCargo: string;
  de: string;
  deCargo: string;
  referencia: string;
  fecha: string;
  observacionGlobal: string;
}

export interface BatchCargoData {
  header: BatchCargoHeader;
  students: BatchCargoStudent[];
}

export interface OcrProgress {
  currentIndex: number;
  total: number;
  currentFileName: string;
  percentage: number;
  status: 'idle' | 'processing' | 'completed' | 'error';
}
