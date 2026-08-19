import React from 'react';
import { ArrowRight, BarChart3, Camera, FileCheck2, ShieldCheck, Sparkles } from 'lucide-react';

export type AppModuleRoute = 'home' | 'individual' | 'masivo' | 'promesas';

interface ModuleLandingProps {
  onNavigate: (route: AppModuleRoute) => void;
}

const modules = [
  {
    route: 'individual' as const,
    number: '01',
    title: 'Recepción Individual',
    subtitle: 'Recibo UP + Cargo de Entrega',
    description: 'Registra la recepción de documentos, genera ambos comprobantes y sincroniza los PDF con el legajo existente en Drive.',
    icon: FileCheck2,
    accent: 'from-blue-600 to-indigo-500',
    glow: 'bg-blue-500/10',
  },
  {
    route: 'masivo' as const,
    number: '02',
    title: 'Cargo Masivo por Fotos',
    subtitle: 'OCR para 30+ contratos',
    description: 'Extrae nombres, documento y carrera con Gemini AI para crear cargos A4 y Word a partir de fotos HEIC o JPG.',
    icon: Camera,
    accent: 'from-indigo-600 to-violet-500',
    glow: 'bg-violet-500/10',
  },
  {
    route: 'promesas' as const,
    number: '03',
    title: 'Dashboard de Promesas',
    subtitle: 'Seguimiento comercial en tiempo real',
    description: 'Centraliza leads con intención de inscripción y permite analizar conversión, carreras y desempeño por asesor.',
    icon: BarChart3,
    accent: 'from-cyan-500 to-blue-600',
    glow: 'bg-cyan-400/10',
  },
];

export const ModuleLanding: React.FC<ModuleLandingProps> = ({ onNavigate }) => (
  <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/75 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
    <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
    <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />

    <div className="relative z-10 mx-auto max-w-4xl text-center">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-700/60 bg-blue-950/70 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
        <Sparkles className="h-4 w-4" /> Centro de operaciones
      </div>
      <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
        ¿Qué módulo necesitas usar?
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
        Accede a recepción, procesa contratos por lote o consulta el seguimiento comercial del equipo desde un único sistema.
      </p>
    </div>

    <div className="relative z-10 mt-9 grid gap-5 lg:grid-cols-3">
      {modules.map((module, index) => {
        const Icon = module.icon;
        return (
          <button
            key={module.route}
            type="button"
            onClick={() => onNavigate(module.route)}
            style={{ animationDelay: `${index * 90}ms` }}
            className="group relative min-h-72 overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/70 p-6 text-left shadow-xl transition duration-300 ease-out hover:-translate-y-1 hover:border-blue-500/70 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-safe:animate-[landing-card_500ms_ease-out_both] motion-reduce:animate-none"
          >
            <div className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full ${module.glow} blur-3xl transition-transform duration-300 group-hover:scale-125`} />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${module.accent} text-white shadow-lg shadow-blue-950/50`}>
                  <Icon className="h-7 w-7" />
                </div>
                <span className="font-mono text-xs font-bold tracking-[0.2em] text-slate-600">{module.number}</span>
              </div>
              <div className="mt-7">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-400">{module.subtitle}</p>
                <h3 className="mt-2 text-xl font-bold text-white">{module.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{module.description}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-blue-300 transition-colors group-hover:text-white">
                Abrir módulo <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </div>
          </button>
        );
      })}
    </div>

    <div className="relative z-10 mt-7 flex items-center justify-center gap-2 text-xs text-slate-500">
      <ShieldCheck className="h-4 w-4 text-emerald-400" />
      Sistema interno de Admisiones y Recepción · Universidad del Pacífico
    </div>
  </section>
);
