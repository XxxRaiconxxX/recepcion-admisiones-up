import type {
  PromesaFilters,
  PromesaGroupedValue,
  PromesaKpis,
  PromesaRecord,
} from '../types/promises';

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PY')
    .trim();

const matchesBoolean = (value: boolean | null, filter: 'all' | 'yes' | 'no') =>
  filter === 'all' || (filter === 'yes' ? value === true : value === false);

export const filterPromesas = (
  records: PromesaRecord[],
  filters: PromesaFilters,
  now = new Date(),
) => {
  const search = normalizeSearch(filters.search);
  const cutoff = filters.dateRange === 'all'
    ? null
    : now.getTime() - Number(filters.dateRange) * 24 * 60 * 60 * 1000;

  return records.filter((record) => {
    const recordDate = record.fecha_carga || record.created_at;
    if (cutoff !== null && new Date(recordDate).getTime() < cutoff) return false;
    if (filters.carrera && record.carrera !== filters.carrera) return false;
    if (filters.asesor && record.asesor !== filters.asesor) return false;
    if (!matchesBoolean(record.becado, filters.becado)) return false;
    if (!matchesBoolean(record.visita, filters.visita)) return false;
    if (!matchesBoolean(record.asistio, filters.asistio)) return false;
    if (!matchesBoolean(record.inscripto, filters.inscripto)) return false;
    if (!search) return true;

    return normalizeSearch([
      record.nombres_apellidos,
      record.ci || '',
      record.numero || '',
      record.carrera,
      record.asesor,
    ].join(' ')).includes(search);
  });
};

const percentage = (value: number, total: number) =>
  total === 0 ? 0 : Math.round((value / total) * 100);

export const calculatePromesaKpis = (records: PromesaRecord[]): PromesaKpis => {
  const total = records.length;
  const becados = records.filter((record) => record.becado === true).length;
  const visitas = records.filter((record) => record.visita === true).length;
  const asistencias = records.filter((record) => record.asistio === true).length;
  const inscriptos = records.filter((record) => record.inscripto === true).length;

  return {
    total,
    becados,
    visitas,
    asistencias,
    inscriptos,
    porcentajeBecados: percentage(becados, total),
    porcentajeVisitas: percentage(visitas, total),
    porcentajeAsistencias: percentage(asistencias, total),
    porcentajeInscriptos: percentage(inscriptos, total),
  };
};

export const groupPromesas = (
  records: PromesaRecord[],
  field: 'carrera' | 'asesor',
): PromesaGroupedValue[] => {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = record[field].trim() || 'Sin especificar';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'es'));
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const buildPromesasCsv = (records: PromesaRecord[]) => {
  const headers = [
    'Nombre', 'Número', 'CI', 'CI válido', 'Carrera', 'Asesor', 'Becado',
    'Visita', 'Asistió', 'Inscripto', 'Observaciones', 'Fecha de carga', 'Actualizado',
  ];
  const booleanLabel = (value: boolean | null) => value === null ? '' : value ? 'Sí' : 'No';
  const rows = records.map((record) => [
    record.nombres_apellidos,
    record.numero,
    record.ci,
    record.ci_valido ? 'Sí' : 'No',
    record.carrera,
    record.asesor,
    booleanLabel(record.becado),
    booleanLabel(record.visita),
    booleanLabel(record.asistio),
    booleanLabel(record.inscripto),
    record.observaciones,
    record.fecha_carga,
    record.updated_at,
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
};
