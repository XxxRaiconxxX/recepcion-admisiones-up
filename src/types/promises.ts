export type PromesaBooleanFilter = 'all' | 'yes' | 'no';
export type PromesaDateRange = '30' | '90' | 'all';
export type PromesaDashboardView = 'general' | 'career' | 'advisor' | 'table';
export type PromesaCareerChartType = 'horizontal' | 'vertical' | 'donut';
export type PromesaFunnelChartType = 'funnel' | 'bars';
export type PromesaAdvisorChartType = 'donut' | 'horizontal';

export interface PromesaChartPreferences {
  career: PromesaCareerChartType;
  funnel: PromesaFunnelChartType;
  advisor: PromesaAdvisorChartType;
}

export interface PromesaRecord {
  id: string;
  sheet_row_key: string;
  ci: string | null;
  ci_valido: boolean;
  nombres_apellidos: string;
  carrera: string;
  asesor: string;
  numero: string | null;
  becado: boolean | null;
  visita: boolean | null;
  asistio: boolean | null;
  inscripto: boolean | null;
  observaciones: string | null;
  fecha_carga: string | null;
  source_updated_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface PromesaFilters {
  search: string;
  carrera: string;
  asesor: string;
  becado: PromesaBooleanFilter;
  visita: PromesaBooleanFilter;
  asistio: PromesaBooleanFilter;
  inscripto: PromesaBooleanFilter;
  dateRange: PromesaDateRange;
}

export interface PromesaKpis {
  total: number;
  becados: number;
  visitas: number;
  asistencias: number;
  inscriptos: number;
  porcentajeBecados: number;
  porcentajeVisitas: number;
  porcentajeAsistencias: number;
  porcentajeInscriptos: number;
}

export interface PromesaGroupedValue {
  name: string;
  value: number;
}
