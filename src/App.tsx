import { lazy, Suspense, useEffect, useState } from 'react';
import { BarChart3, Home, Layers, Loader2, ShieldCheck, UserCheck, UserPlus } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { ReceptionForm } from './components/ReceptionForm';
import { BatchCargoSection } from './components/BatchCargoSection';
import { ComprobantesModal } from './components/ComprobantesModal';
import { GoogleOAuthModal } from './components/GoogleOAuthModal';
import { ModuleLanding, type AppModuleRoute } from './components/ModuleLanding';
import type { StudentData, GoogleUserProfile } from './types/admission';
import { DriveService } from './lib/driveClient';

const PromisesDashboard = lazy(() => import('./components/PromisesDashboard'));

const routeSegments: Record<Exclude<AppModuleRoute, 'home'>, string> = {
  individual: 'recepcion',
  masivo: 'cargo',
  promesas: 'promesas',
};

const getRouteFromHash = (): AppModuleRoute => {
  const segment = window.location.hash.replace(/^#\/?/, '').split('/')[0].toLowerCase();
  const match = Object.entries(routeSegments).find(([, value]) => value === segment);
  return match ? match[0] as AppModuleRoute : 'home';
};

export function App() {
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<AppModuleRoute>(getRouteFromHash);
  const [driveStatus, setDriveStatus] = useState<StudentData['driveSyncStatus']>('idle');
  const [currentFolderName, setCurrentFolderName] = useState<string>('5705965-Axel Miguel Fretes Monges');
  const [previewStudent, setPreviewStudent] = useState<StudentData | null>(null);

  useEffect(() => {
    const savedUser = DriveService.getSavedOAuthUser();
    if (savedUser) setGoogleUser(savedUser);
  }, []);

  useEffect(() => {
    const updateRoute = () => setActiveRoute(getRouteFromHash());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeRoute]);

  const navigateTo = (route: AppModuleRoute) => {
    setActiveRoute(route);
    if (route === 'home') {
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
      window.scrollTo({ top: 0 });
      return;
    }
    window.location.hash = `/${routeSegments[route]}`;
    window.scrollTo({ top: 0 });
  };

  const handleDriveStatusChange = (status: StudentData['driveSyncStatus'], folderName?: string) => {
    setDriveStatus(status);
    if (folderName) setCurrentFolderName(folderName);
  };

  const tabClass = (route: AppModuleRoute) =>
    `flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
      activeRoute === route
        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      <Navbar
        user={googleUser}
        driveStatus={driveStatus}
        folderName={currentFolderName}
        onOpenOAuthModal={() => setIsOAuthModalOpen(true)}
      />

      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6 ${activeRoute === 'promesas' ? 'max-w-[1540px]' : 'max-w-[1380px]'}`}>
        {activeRoute === 'home' ? (
          <ModuleLanding onNavigate={navigateTo} />
        ) : (
          <>
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-2 shadow-lg lg:flex-row">
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                <button type="button" onClick={() => navigateTo('home')} className="rounded-xl p-2.5 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Volver al inicio">
                  <Home className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => navigateTo('individual')} className={tabClass('individual')}>
                  <UserPlus className="h-4 w-4" /> 1. Recepción Individual
                </button>
                <button type="button" onClick={() => navigateTo('masivo')} className={tabClass('masivo')}>
                  <Layers className="h-4 w-4 text-amber-400" /> 2. Cargo Masivo por Fotos
                </button>
                <button type="button" onClick={() => navigateTo('promesas')} className={tabClass('promesas')}>
                  <BarChart3 className="h-4 w-4 text-cyan-300" /> 3. Dashboard de Promesas
                </button>
              </div>
              <div className="hidden items-center gap-2 pr-3 text-xs text-slate-400 xl:flex">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Sistema Oficial Admisiones · Universidad del Pacífico</span>
              </div>
            </div>

            {activeRoute === 'individual' && (
              <>
                <div className="relative overflow-hidden rounded-2xl border border-blue-900/40 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 p-6 shadow-xl">
                  <div className="pointer-events-none absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl" />
                  <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                    <div className="max-w-3xl space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-700/60 bg-blue-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-300">
                          <ShieldCheck className="h-3.5 w-3.5" /> Recepción Individual
                        </span>
                        {googleUser && (
                          <span className="flex items-center gap-1 rounded-full border border-emerald-700 bg-emerald-900/80 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                            <UserCheck className="h-3.5 w-3.5" /> {googleUser.email}
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl font-extrabold tracking-tight text-white">Recepción de Documentos y Cargo de Entrega Individual</h2>
                      <p className="text-sm leading-relaxed text-slate-300">
                        Genera el <strong className="text-white">Recibo de Recepción</strong> para el alumno y el <strong className="text-white">Cargo de Entrega</strong> para el asesor, conectando directamente con la carpeta de Google Drive.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Paso 1', 'Asesor escanea docs'],
                        ['Paso 2', 'Recepción valida 4 docs'],
                        ['Paso 3', 'Emisión e impresión'],
                        ['Paso 4', 'Subida a Drive'],
                      ].map(([step, label], index) => (
                        <div key={step} className={`rounded-xl border p-3 text-center ${index === 3 ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/80'}`}>
                          <div className={`text-xs font-bold ${index === 3 ? 'text-emerald-400' : 'text-blue-400'}`}>{step}</div>
                          <div className="text-[11px] font-medium text-slate-300">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <ReceptionForm
                  userToken={googleUser?.idToken}
                  onOpenPreview={(student) => setPreviewStudent(student)}
                  onDriveStatusChange={handleDriveStatusChange}
                />
              </>
            )}

            {activeRoute === 'masivo' && <BatchCargoSection />}

            {activeRoute === 'promesas' && (
              <Suspense fallback={(
                <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 text-slate-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-400" /> Cargando Dashboard de Promesas…
                </div>
              )}>
                <PromisesDashboard />
              </Suspense>
            )}
          </>
        )}
      </main>

      {previewStudent && <ComprobantesModal student={previewStudent} onClose={() => setPreviewStudent(null)} />}

      {isOAuthModalOpen && (
        <GoogleOAuthModal
          user={googleUser}
          onLogin={(user) => setGoogleUser(user)}
          onLogout={() => { setGoogleUser(null); DriveService.saveOAuthUser(null); }}
          onClose={() => setIsOAuthModalOpen(false)}
        />
      )}

      <footer className="border-t border-slate-800 bg-slate-900 py-5 text-center text-xs text-slate-400">
        <p className="font-medium text-slate-300">Universidad del Pacífico — Sistema Digital de Admisiones y Recepción</p>
      </footer>
    </div>
  );
}

export default App;
