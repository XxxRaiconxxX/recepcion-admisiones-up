import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ReceptionForm } from './components/ReceptionForm';
import { BatchCargoSection } from './components/BatchCargoSection';
import { ComprobantesModal } from './components/ComprobantesModal';
import { GoogleOAuthModal } from './components/GoogleOAuthModal';
import type { StudentData, GoogleUserProfile } from './types/admission';
import { DriveService } from './lib/driveClient';
import { ShieldCheck, UserCheck, UserPlus, Layers } from 'lucide-react';

export function App() {
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);

  // Selector de Sección: 'individual' (Recepción 1 a 1) o 'masivo' (Cargo por Fotos con OCR)
  const [activeSection, setActiveSection] = useState<'individual' | 'masivo'>('individual');

  const [driveStatus, setDriveStatus] = useState<StudentData['driveSyncStatus']>('idle');
  const [currentFolderName, setCurrentFolderName] = useState<string>('5705965-Axel Miguel Fretes Monges');
  const [previewStudent, setPreviewStudent] = useState<StudentData | null>(null);

  // Cargar la sesión guardada de Google OAuth 2.0 al iniciar
  useEffect(() => {
    const savedUser = DriveService.getSavedOAuthUser();
    if (savedUser) {
      setGoogleUser(savedUser);
    }
  }, []);

  const handleDriveStatusChange = (status: StudentData['driveSyncStatus'], folderName?: string) => {
    setDriveStatus(status);
    if (folderName) {
      setCurrentFolderName(folderName);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Barra de Navegación Oficial UP */}
      <Navbar
        user={googleUser}
        driveStatus={driveStatus}
        folderName={currentFolderName}
        onOpenOAuthModal={() => setIsOAuthModalOpen(true)}
      />

      {/* Cuerpo Principal - Ancho Ampliado y Prominente (max-w-[1380px]) */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
        
        {/* Selector de Pestañas Principales (Individual vs Masivo) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl shadow-lg">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveSection('individual')}
              className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeSection === 'individual'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              1. Recepción Individual (Recibo UP + Cargo)
            </button>

            <button
              onClick={() => setActiveSection('masivo')}
              className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeSection === 'masivo'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4 text-amber-400" />
              2. Cargo Masivo por Fotos (OCR 30+ Contratos)
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 pr-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sistema Oficial Admisiones • Universidad del Pacífico</span>
          </div>
        </div>

        {/* CONTENIDO SEGÚN SECCIÓN ACTIVA */}
        {activeSection === 'individual' ? (
          <>
            {/* Banner Informativo del Flujo de Trabajo Individual */}
            <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border border-blue-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-900/60 border border-blue-700/60 text-blue-300 text-xs font-semibold uppercase tracking-wider">
                      <ShieldCheck className="w-3.5 h-3.5" /> Recepción Individual
                    </span>
                    {googleUser && (
                      <span className="bg-emerald-900/80 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full border border-emerald-700 font-medium flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" /> {googleUser.email}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-extrabold text-white font-heading tracking-tight">
                    Recepción de Documentos y Cargo de Entrega Individual
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Genera el <strong className="text-white">Recibo de Recepción (Imagen 1)</strong> para el alumno y el <strong className="text-white">Cargo de Entrega (Imagen 2)</strong> para el asesor, conectando directamente con la carpeta de Google Drive.
                  </p>
                </div>

                {/* Pasos resumidos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl text-center">
                    <div className="text-xs text-blue-400 font-bold">Paso 1</div>
                    <div className="text-[11px] text-slate-300 font-medium">Asesor escanea docs</div>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl text-center">
                    <div className="text-xs text-blue-400 font-bold">Paso 2</div>
                    <div className="text-[11px] text-slate-300 font-medium">Recepción valida 4 docs</div>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl text-center">
                    <div className="text-xs text-blue-400 font-bold">Paso 3</div>
                    <div className="text-[11px] text-slate-300 font-medium">Emisión e Impresión</div>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl text-center border-emerald-900/50 bg-emerald-950/20">
                    <div className="text-xs text-emerald-400 font-bold">Paso 4</div>
                    <div className="text-[11px] text-emerald-200 font-medium">Subida a Drive</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard de Recepción Individual */}
            <ReceptionForm
              userToken={googleUser?.idToken}
              onOpenPreview={(student) => setPreviewStudent(student)}
              onDriveStatusChange={handleDriveStatusChange}
            />
          </>
        ) : (
          /* Sección de Cargo Masivo por Fotos con OCR */
          <BatchCargoSection />
        )}

      </main>

      {/* Modal de Vista Previa e Impresión Individual */}
      {previewStudent && (
        <ComprobantesModal
          student={previewStudent}
          onClose={() => setPreviewStudent(null)}
        />
      )}

      {/* Modal de Inicio de Sesión de Google */}
      {isOAuthModalOpen && (
        <GoogleOAuthModal
          user={googleUser}
          onLogin={(u) => setGoogleUser(u)}
          onLogout={() => { setGoogleUser(null); DriveService.saveOAuthUser(null); }}
          onClose={() => setIsOAuthModalOpen(false)}
        />
      )}

      {/* Pie de Página Limpio */}
      <footer className="border-t border-slate-800 bg-slate-900 text-slate-400 py-5 text-center text-xs">
        <p className="font-medium text-slate-300">
          Universidad del Pacífico — Sistema Digital de Admisiones y Recepción
        </p>
      </footer>
    </div>
  );
}

export default App;
