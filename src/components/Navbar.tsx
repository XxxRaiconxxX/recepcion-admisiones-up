import React from 'react';
import { Building2, CloudCheck, FileText, UserCheck, ExternalLink } from 'lucide-react';
import type { GoogleUserProfile } from '../types/admission';
import { GOOGLE_DRIVE_ROOT_URL } from '../lib/driveClient';

interface NavbarProps {
  user: GoogleUserProfile | null;
  driveStatus: 'idle' | 'searching' | 'found' | 'syncing' | 'synced' | 'error';
  folderName?: string;
  onOpenOAuthModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, driveStatus, folderName, onOpenOAuthModal }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-lg">
      <div className="w-full max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 h-22 flex items-center justify-between gap-6">
        
        {/* Logo Branding UP - Limpio y Espacioso */}
        <div className="flex items-center space-x-4 shrink-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md border border-blue-400/30 shrink-0">
            <span className="text-xl tracking-tighter">UP</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-heading whitespace-nowrap">
              UNIVERSIDAD DEL PACÍFICO
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 whitespace-nowrap">
              <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              Gestión Digital de Admisiones • Recepción & Cargo de Entrega
            </p>
          </div>
        </div>

        {/* Dynamic Drive Sync Badge & Google OAuth - Holgado y Desahogado */}
        <div className="flex items-center gap-4 sm:gap-5 overflow-x-auto py-1">
          
          {/* Direct Link to Google Drive Root Folder */}
          <a
            href={GOOGLE_DRIVE_ROOT_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-2 bg-slate-800/90 hover:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-700 text-xs text-blue-300 transition-colors whitespace-nowrap font-medium shadow-sm"
          >
            <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Drive Raíz</span>
          </a>

          {folderName && (
            <div className="hidden lg:flex items-center gap-2.5 bg-slate-800/90 px-4 py-2 rounded-xl border border-slate-700 text-xs whitespace-nowrap shadow-sm">
              <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-400 font-medium">Carpeta Alumno:</span>
              <span className="text-emerald-300 font-mono font-bold">{folderName}</span>
            </div>
          )}

          {/* Drive Status Badge */}
          <div className="flex items-center gap-2.5 bg-slate-800/90 px-4 py-2 rounded-xl border border-slate-700 text-xs whitespace-nowrap shadow-inner">
            <CloudCheck className={`w-4.5 h-4.5 shrink-0 ${
              driveStatus === 'synced' ? 'text-emerald-400 animate-bounce' :
              driveStatus === 'syncing' ? 'text-amber-400 animate-spin' :
              'text-blue-400'
            }`} />
            <span className="font-semibold text-slate-200">
              {driveStatus === 'synced' ? 'Sincronizado' :
               driveStatus === 'syncing' ? 'Subiendo PDFs...' :
               driveStatus === 'found' ? 'Carpeta Vinculada' :
               'Drive API Lista'}
            </span>
          </div>

          {/* Google OAuth Login Button (Option 2) */}
          <button
            onClick={onOpenOAuthModal}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 border shadow-sm whitespace-nowrap shrink-0 ${
              user 
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900' 
                : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {user ? (
              <>
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-mono text-xs">{user.name}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Google Sign-In</span>
              </>
            )}
          </button>

        </div>

      </div>
    </header>
  );
};
