import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Filter,
  GraduationCap,
  Loader2,
  MapPinCheck,
  RefreshCw,
  Search,
  Signal,
  SignalZero,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  PromesaDashboardView,
  PromesaFilters,
  PromesaRecord,
} from '../types/promises';
import {
  buildPromesasCsv,
  calculatePromesaKpis,
  filterPromesas,
  groupPromesas,
} from '../lib/promisesDashboard';
import {
  fetchPromesas,
  isPromisesSupabaseConfigured,
  subscribeToPromesas,
} from '../lib/promisesService';

const CHART_COLORS = ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ec4899', '#22c55e', '#06b6d4', '#f97316'];
const PAGE_SIZE = 50;

const defaultFilters: PromesaFilters = {
  search: '',
  carrera: '',
  asesor: '',
  becado: 'all',
  visita: 'all',
  asistio: 'all',
  inscripto: 'all',
  dateRange: '30',
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-PY');
};

const statusLabel = (value: boolean | null) => {
  if (value === null) return <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-300">—</span>;
  return value
    ? <span className="rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-[11px] font-bold text-white">Sí</span>
    : <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-bold text-slate-200">No</span>;
};

interface KpiCardProps {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, detail, icon: Icon, accent }) => (
  <article className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-xl backdrop-blur-sm">
    <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full ${accent} opacity-10 blur-2xl`} />
    <div className="relative flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-2 text-3xl font-extrabold text-white">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent} text-white shadow-lg`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </article>
);

interface BooleanFilterProps {
  label: string;
  value: 'all' | 'yes' | 'no';
  onChange: (value: 'all' | 'yes' | 'no') => void;
}

const BooleanFilter: React.FC<BooleanFilterProps> = ({ label, value, onChange }) => (
  <label className="space-y-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
    <span>{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as 'all' | 'yes' | 'no')}
      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold normal-case text-slate-200 outline-none transition focus:border-blue-500"
    >
      <option value="all">Todos</option>
      <option value="yes">Sí</option>
      <option value="no">No</option>
    </select>
  </label>
);

const PromisesDashboard: React.FC = () => {
  const [records, setRecords] = useState<PromesaRecord[]>([]);
  const [filters, setFilters] = useState<PromesaFilters>(defaultFilters);
  const [view, setView] = useState<PromesaDashboardView>('general');
  const [loading, setLoading] = useState(isPromisesSupabaseConfigured);
  const [error, setError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState<'offline' | 'connecting' | 'connected'>('offline');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<keyof PromesaRecord>('fecha_carga');
  const [sortAscending, setSortAscending] = useState(false);
  const [page, setPage] = useState(1);

  const loadRecords = useCallback(async () => {
    if (!isPromisesSupabaseConfigured) return;
    setLoading(true);
    setError('');
    try {
      setRecords(await fetchPromesas());
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las promesas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPromisesSupabaseConfigured) return;
    void loadRecords();
    setRealtimeStatus('connecting');
    return subscribeToPromesas(
      (payload) => {
        setRecords((current) => {
          if (payload.eventType === 'DELETE') {
            return current.filter((record) => record.id !== payload.old.id);
          }
          const next = payload.new;
          const existing = current.findIndex((record) => record.id === next.id);
          if (existing === -1) return [next, ...current];
          return current.map((record, index) => index === existing ? next : record);
        });
        setLastUpdated(new Date());
      },
      (status) => setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : status === 'CHANNEL_ERROR' ? 'offline' : 'connecting'),
    );
  }, [loadRecords]);

  useEffect(() => setPage(1), [filters, view]);

  const careers = useMemo(
    () => Array.from(new Set(records.map((record) => record.carrera).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [records],
  );
  const advisors = useMemo(
    () => Array.from(new Set(records.map((record) => record.asesor).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [records],
  );
  const filteredRecords = useMemo(() => filterPromesas(records, filters), [records, filters]);
  const kpis = useMemo(() => calculatePromesaKpis(filteredRecords), [filteredRecords]);
  const careerData = useMemo(() => groupPromesas(filteredRecords, 'carrera'), [filteredRecords]);
  const advisorData = useMemo(() => groupPromesas(filteredRecords, 'asesor'), [filteredRecords]);
  const invalidCiCount = useMemo(() => filteredRecords.filter((record) => !record.ci_valido).length, [filteredRecords]);

  const sortedRecords = useMemo(() => [...filteredRecords].sort((left, right) => {
    const leftValue = String(left[sortKey] ?? '');
    const rightValue = String(right[sortKey] ?? '');
    return leftValue.localeCompare(rightValue, 'es', { numeric: true }) * (sortAscending ? 1 : -1);
  }), [filteredRecords, sortAscending, sortKey]);
  const pageCount = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
  const visibleRecords = sortedRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const updateFilter = <K extends keyof PromesaFilters>(key: K, value: PromesaFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const changeSort = (key: keyof PromesaRecord) => {
    if (key === sortKey) setSortAscending((current) => !current);
    else {
      setSortKey(key);
      setSortAscending(true);
    }
  };

  const exportCsv = () => {
    const csv = buildPromesasCsv(sortedRecords);
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `promesas-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const chartTooltipStyle = {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    color: '#f8fafc',
  };
  const funnel = [
    { label: 'Promesas', value: kpis.total, percentage: kpis.total > 0 ? 100 : 0, color: 'from-blue-500 to-blue-600' },
    { label: 'Visita', value: kpis.visitas, percentage: kpis.porcentajeVisitas, color: 'from-cyan-400 to-teal-500' },
    { label: 'Asistió', value: kpis.asistencias, percentage: kpis.porcentajeAsistencias, color: 'from-violet-500 to-indigo-500' },
    { label: 'Inscripto', value: kpis.inscriptos, percentage: kpis.porcentajeInscriptos, color: 'from-pink-500 to-rose-500' },
  ];

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-blue-950/50 to-slate-900 p-6 shadow-xl lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-700/60 bg-blue-950/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300">
              <BarChart3 className="h-4 w-4" /> Inteligencia comercial
            </span>
            {isPromisesSupabaseConfigured && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                realtimeStatus === 'connected'
                  ? 'border-emerald-700 bg-emerald-950/70 text-emerald-300'
                  : 'border-amber-700 bg-amber-950/70 text-amber-300'
              }`}>
                {realtimeStatus === 'connected' ? <Signal className="h-3.5 w-3.5" /> : <SignalZero className="h-3.5 w-3.5" />}
                {realtimeStatus === 'connected' ? 'Realtime conectado' : 'Conectando realtime'}
              </span>
            )}
          </div>
          <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">Dashboard de Promesas</h2>
          <p className="mt-1 text-sm text-slate-400">
            Seguimiento centralizado de leads, visitas y conversiones por carrera y asesor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">
            <CalendarDays className="h-4 w-4 text-blue-400" />
            <select
              value={filters.dateRange}
              onChange={(event) => updateFilter('dateRange', event.target.value as PromesaFilters['dateRange'])}
              className="bg-transparent text-slate-200 outline-none"
            >
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="all">Todo el historial</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading || !isPromisesSupabaseConfigured}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      {!isPromisesSupabaseConfigured && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-bold">Supabase todavía no está configurado.</p>
            <p className="mt-1 text-amber-200/80">Agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Vercel para cargar datos reales. La interfaz queda disponible con valores vacíos hasta completar ese paso.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-200">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
        </div>
      )}

      <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2" aria-label="Vistas del dashboard">
        {([
          ['general', 'Vista general'],
          ['career', 'Por carrera'],
          ['advisor', 'Por asesor'],
          ['table', 'Tabla general'],
        ] as Array<[PromesaDashboardView, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${view === key ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Filter className="h-4 w-4 text-blue-400" /> Filtros combinables
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <label className="relative space-y-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:col-span-2">
            <span>Buscar</span>
            <Search className="absolute bottom-2.5 left-3 h-4 w-4 text-slate-500" />
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Nombre, CI o teléfono"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs font-semibold normal-case text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-blue-500"
            />
          </label>
          <label className="space-y-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <span>Carrera</span>
            <select value={filters.carrera} onChange={(event) => updateFilter('carrera', event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold normal-case text-slate-200 outline-none focus:border-blue-500">
              <option value="">Todas</option>
              {careers.map((career) => <option key={career} value={career}>{career}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <span>Asesor</span>
            <select value={filters.asesor} onChange={(event) => updateFilter('asesor', event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold normal-case text-slate-200 outline-none focus:border-blue-500">
              <option value="">Todos</option>
              {advisors.map((advisor) => <option key={advisor} value={advisor}>{advisor}</option>)}
            </select>
          </label>
          <BooleanFilter label="Becado" value={filters.becado} onChange={(value) => updateFilter('becado', value)} />
          <BooleanFilter label="Visita" value={filters.visita} onChange={(value) => updateFilter('visita', value)} />
          <BooleanFilter label="Asistió" value={filters.asistio} onChange={(value) => updateFilter('asistio', value)} />
          <BooleanFilter label="Inscripto" value={filters.inscripto} onChange={(value) => updateFilter('inscripto', value)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{filteredRecords.length} de {records.length} promesas visibles{lastUpdated ? ` · actualizado ${lastUpdated.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
          <button type="button" onClick={() => setFilters(defaultFilters)} className="font-bold text-blue-400 transition hover:text-blue-300">Limpiar filtros</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total promesas" value={String(kpis.total)} detail="Leads en el filtro actual" icon={Users} accent="bg-blue-600" />
        <KpiCard label="Becados" value={`${kpis.porcentajeBecados}%`} detail={`${kpis.becados} promesas`} icon={GraduationCap} accent="bg-indigo-600" />
        <KpiCard label="Con visita" value={`${kpis.porcentajeVisitas}%`} detail={`${kpis.visitas} visitas`} icon={MapPinCheck} accent="bg-cyan-600" />
        <KpiCard label="Asistieron" value={`${kpis.porcentajeAsistencias}%`} detail={`${kpis.asistencias} asistencias`} icon={CheckCircle2} accent="bg-violet-600" />
        <KpiCard label="Inscriptos" value={`${kpis.porcentajeInscriptos}%`} detail={`${kpis.inscriptos} conversiones`} icon={CircleDollarSign} accent="bg-emerald-600" />
      </div>

      {loading && records.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-400" /> Cargando promesas…
        </div>
      ) : view !== 'table' && (
        <div className="grid gap-5 xl:grid-cols-12">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl xl:col-span-5">
            <h3 className="text-base font-bold text-white">Promesas por carrera</h3>
            <p className="mt-1 text-xs text-slate-500">Distribución del filtro actual</p>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={careerData} margin={{ top: 10, right: 8, left: -18, bottom: 34 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} angle={-22} textAnchor="end" interval={0} />
                  <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: '#1e293b', opacity: 0.5 }} />
                  <Bar dataKey="value" name="Promesas" radius={[6, 6, 0, 0]}>
                    {careerData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl xl:col-span-4">
            <h3 className="text-base font-bold text-white">Embudo de conversión</h3>
            <p className="mt-1 text-xs text-slate-500">Promesa → Visita → Asistió → Inscripto</p>
            <div className="mt-5 space-y-3">
              {funnel.map((stage) => (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className="w-20 text-right">
                    <p className="text-xs font-bold text-slate-200">{stage.label}</p>
                    <p className="text-[10px] text-slate-500">{stage.value} ({stage.percentage}%)</p>
                  </div>
                  <div className="flex flex-1 justify-center">
                    <div
                      className={`h-11 rounded-lg bg-gradient-to-r ${stage.color} shadow-lg transition-[width] duration-500 motion-reduce:transition-none`}
                      style={{ width: `${Math.max(stage.percentage, stage.value > 0 ? 14 : 2)}%` }}
                      title={`${stage.label}: ${stage.value}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl xl:col-span-3">
            <h3 className="text-base font-bold text-white">Ranking de asesores</h3>
            <p className="mt-1 text-xs text-slate-500">Cantidad de promesas gestionadas</p>
            <ol className="mt-4 divide-y divide-slate-800">
              {advisorData.slice(0, 8).map((advisor, index) => (
                <li key={advisor.name} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-5 font-mono font-bold text-blue-400">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-200" title={advisor.name}>{advisor.name}</span>
                  <span className="font-mono font-bold text-cyan-300">{advisor.value}</span>
                </li>
              ))}
              {advisorData.length === 0 && <li className="py-8 text-center text-xs text-slate-600">Sin datos</li>}
            </ol>
          </article>

          {(view === 'advisor' || view === 'general') && advisorData.length > 0 && (
            <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl xl:col-span-12">
              <h3 className="text-base font-bold text-white">Promesas por asesor</h3>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={advisorData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2}>
                      {advisorData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#cbd5e1' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>
          )}
        </div>
      )}

      <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Promesas detalladas</h3>
            <p className="mt-1 text-xs text-slate-500">Ordena columnas, corrige CI marcadas y exporta el filtro actual.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {invalidCiCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-700 bg-amber-950/60 px-3 py-1.5 text-xs font-bold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {invalidCiCount} CI para corregir
              </span>
            )}
            <button type="button" onClick={exportCsv} disabled={sortedRecords.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
              <Download className="h-4 w-4" /> Exportar CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1300px] w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                {([
                  ['nombres_apellidos', 'Nombre'], ['ci', 'CI'], ['numero', 'Número'], ['carrera', 'Carrera'], ['asesor', 'Asesor'],
                ] as Array<[keyof PromesaRecord, string]>).map(([key, label]) => (
                  <th key={key} className="px-4 py-3">
                    <button type="button" onClick={() => changeSort(key)} className="font-bold transition hover:text-white">{label}{sortKey === key ? (sortAscending ? ' ↑' : ' ↓') : ''}</button>
                  </th>
                ))}
                <th className="px-3 py-3 text-center">Becado</th>
                <th className="px-3 py-3 text-center">Visita</th>
                <th className="px-3 py-3 text-center">Asistió</th>
                <th className="px-3 py-3 text-center">Inscripto</th>
                <th className="px-4 py-3">Observaciones</th>
                <th className="px-4 py-3"><button type="button" onClick={() => changeSort('fecha_carga')} className="font-bold transition hover:text-white">Fecha{sortKey === 'fecha_carga' ? (sortAscending ? ' ↑' : ' ↓') : ''}</button></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visibleRecords.map((record) => (
                <tr key={record.id} className="text-slate-300 transition hover:bg-slate-800/60">
                  <td className="max-w-60 px-4 py-3 font-semibold text-white"><span className="block truncate" title={record.nombres_apellidos}>{record.nombres_apellidos}</span></td>
                  <td className="px-4 py-3 font-mono">
                    <span className={`inline-flex items-center gap-1 ${record.ci_valido ? 'text-slate-300' : 'font-bold text-amber-300'}`} title={!record.ci_valido ? 'La CI contiene texto no numérico; mover la nota a Observaciones.' : undefined}>
                      {!record.ci_valido && <AlertTriangle className="h-3.5 w-3.5" />}{record.ci || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">{record.numero || '—'}</td>
                  <td className="px-4 py-3">{record.carrera}</td>
                  <td className="max-w-48 px-4 py-3"><span className="block truncate" title={record.asesor}>{record.asesor}</span></td>
                  <td className="px-3 py-3 text-center">{statusLabel(record.becado)}</td>
                  <td className="px-3 py-3 text-center">{statusLabel(record.visita)}</td>
                  <td className="px-3 py-3 text-center">{statusLabel(record.asistio)}</td>
                  <td className="px-3 py-3 text-center">{statusLabel(record.inscripto)}</td>
                  <td className="max-w-64 px-4 py-3 text-slate-400"><span className="block truncate" title={record.observaciones || ''}>{record.observaciones || '—'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(record.fecha_carga)}</td>
                </tr>
              ))}
              {visibleRecords.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-14 text-center text-sm text-slate-600">No hay promesas para los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Mostrando {visibleRecords.length} registros · página {page} de {pageCount}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-800 disabled:opacity-30" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-800 disabled:opacity-30" aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </article>
    </section>
  );
};

export default PromisesDashboard;
