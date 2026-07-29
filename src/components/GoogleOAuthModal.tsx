import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, ExternalLink, LogOut, CheckCircle2 } from 'lucide-react';
import type { GoogleUserProfile } from '../types/admission';
import { GOOGLE_DRIVE_ROOT_URL, GOOGLE_CLIENT_ID, DriveService } from '../lib/driveClient';

interface GoogleOAuthModalProps {
  user: GoogleUserProfile | null;
  onLogin: (user: GoogleUserProfile) => void;
  onLogout: () => void;
  onClose: () => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

const decodeGoogleIdToken = (token: string) => {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Google no devolvió una credencial válida.');

  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
};

export const GoogleOAuthModal: React.FC<GoogleOAuthModalProps> = ({ user, onLogin, onLogout, onClose }) => {
  const [authStatusMessage, setAuthStatusMessage] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // Recibe un ID token; el servidor verifica firma, audiencia, vencimiento y cuenta autorizada.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setAuthStatusMessage('Falta configurar VITE_GOOGLE_CLIENT_ID en Vercel.');
      return;
    }

    let active = true;
    let script = document.querySelector<HTMLScriptElement>('script[data-google-identity]');

    const handleCredential = (response: { credential?: string }) => {
      if (!active) return;

      try {
        if (!response.credential) throw new Error('Google no devolvió una credencial de identidad.');
        const claims = decodeGoogleIdToken(response.credential);
        if (typeof claims.email !== 'string' || typeof claims.exp !== 'number') {
          throw new Error('Google no confirmó el correo o vencimiento de la sesión.');
        }

        const googleUser: GoogleUserProfile = {
          email: claims.email,
          name: typeof claims.name === 'string' ? claims.name : claims.email,
          picture: typeof claims.picture === 'string' ? claims.picture : undefined,
          idToken: response.credential,
          tokenExpiry: claims.exp * 1000,
        };

        DriveService.saveOAuthUser(googleUser);
        onLogin(googleUser);
        onClose();
      } catch (error) {
        setAuthStatusMessage(
          error instanceof Error ? error.message : 'No se pudo procesar la cuenta de Google.',
        );
      }
    };

    const renderGoogleButton = () => {
      if (!active || !window.google?.accounts?.id || !googleButtonRef.current) return;

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredential,
          ux_mode: 'popup',
        });
        googleButtonRef.current.replaceChildren();
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: user ? 'continue_with' : 'signin_with',
          shape: 'rectangular',
        });
        setAuthStatusMessage(null);
      } catch {
        setAuthStatusMessage('No se pudo iniciar el acceso seguro de Google.');
      }
    };

    const handleScriptError = () => {
      if (active) setAuthStatusMessage('No se pudo cargar Google Identity Services.');
    };

    setAuthStatusMessage('Cargando acceso seguro de Google...');
    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = 'true';
        document.body.appendChild(script);
      }
      script.addEventListener('load', renderGoogleButton);
      script.addEventListener('error', handleScriptError);
    }

    return () => {
      active = false;
      script?.removeEventListener('load', renderGoogleButton);
      script?.removeEventListener('error', handleScriptError);
    };
  }, [onClose, onLogin, user]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-white">
        
        {/* Header Modal */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold font-heading text-slate-100">
                Iniciar Sesión con Google
              </h3>
              <p className="text-xs text-slate-400">
                Conexión a Google Drive • Universidad del Pacífico
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Modal */}
        <div className="p-6 space-y-5 bg-slate-950">
          
          {/* Tarjeta de Estado del Usuario */}
          {user ? (
            <div className="bg-emerald-950/40 border border-emerald-800/80 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-emerald-400 shrink-0">
                  <img src={user.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'} alt="Google User" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-sm text-emerald-200">{user.name}</h4>
                    <span className="bg-emerald-900 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                      Conectado
                    </span>
                  </div>
                  <p className="text-xs text-emerald-400 font-mono">{user.email}</p>
                </div>
              </div>

              <button
                onClick={() => {
                  window.google?.accounts?.id?.disableAutoSelect();
                  onLogout();
                }}
                className="px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Salir
              </button>
            </div>
          ) : (
            <div className="bg-blue-950/30 border border-blue-900/60 p-4 rounded-xl text-xs text-blue-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-blue-300 text-sm">
                <ShieldCheck className="w-4 h-4 text-blue-400" /> Identidad verificada por Google
              </div>
              <p>
                El servidor valida la credencial contra esta aplicación y la lista autorizada de Admisiones. Los archivos se suben mediante el Apps Script institucional, sin otorgar al navegador permisos generales sobre Drive.
              </p>
            </div>
          )}

          {/* Mensaje de estado de autenticación */}
          {authStatusMessage && (
            <div className="p-3 bg-blue-950 border border-blue-800 text-blue-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{authStatusMessage}</span>
            </div>
          )}

          {/* Botón oficial de Google: entrega un ID token ligado al cliente web. */}
          <div className="pt-2 min-h-11 flex justify-center">
            <div ref={googleButtonRef} />
          </div>

          {/* Link directo a la carpeta en Drive */}
          <div className="pt-3 border-t border-slate-800 flex justify-center text-xs">
            <a
              href={GOOGLE_DRIVE_ROOT_URL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5 font-medium underline"
            >
              Abrir Carpeta Raíz de Admisiones en Google Drive <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

        </div>

      </div>
    </div>
  );
};
