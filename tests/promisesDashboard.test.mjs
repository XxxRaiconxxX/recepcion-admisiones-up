import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPromesasCsv,
  calculatePromesaKpis,
  filterPromesas,
  groupPromesas,
} from '../src/lib/promisesDashboard.ts';

const record = (id, overrides = {}) => ({
  id,
  sheet_row_key: id,
  ci: `${6000000 + Number(id)}`,
  ci_valido: true,
  nombres_apellidos: `Alumno ${id}`,
  carrera: 'Medicina',
  asesor: 'María Gómez',
  numero: '0981000000',
  becado: false,
  visita: false,
  asistio: false,
  inscripto: false,
  observaciones: null,
  fecha_carga: '2026-08-10T12:00:00.000Z',
  source_updated_at: '2026-08-10T12:00:00.000Z',
  updated_at: '2026-08-10T12:00:00.000Z',
  created_at: '2026-08-10T12:00:00.000Z',
  ...overrides,
});

const filters = {
  search: '', carrera: '', asesor: '', becado: 'all', visita: 'all',
  asistio: 'all', inscripto: 'all', dateRange: '30',
};

test('calcula KPIs, filtros y agrupaciones sin mezclar asesores ni carreras', () => {
  const records = [
    record('1', { becado: true, visita: true, asistio: true, inscripto: true }),
    record('2', { carrera: 'Derecho', asesor: 'Carlos Rojas', visita: true }),
    record('3', { carrera: 'Derecho', fecha_carga: '2026-06-01T12:00:00.000Z' }),
  ];
  const visible = filterPromesas(records, filters, new Date('2026-08-19T12:00:00.000Z'));
  assert.equal(visible.length, 2);
  assert.deepEqual(calculatePromesaKpis(visible), {
    total: 2,
    becados: 1,
    visitas: 2,
    asistencias: 1,
    inscriptos: 1,
    porcentajeBecados: 50,
    porcentajeVisitas: 100,
    porcentajeAsistencias: 50,
    porcentajeInscriptos: 50,
  });
  assert.deepEqual(groupPromesas(visible, 'carrera'), [
    { name: 'Derecho', value: 1 },
    { name: 'Medicina', value: 1 },
  ]);
  assert.equal(filterPromesas(records, { ...filters, carrera: 'Derecho', visita: 'yes' }, new Date('2026-08-19')).length, 1);
  assert.equal(filterPromesas(records, { ...filters, search: '6000001' }, new Date('2026-08-19')).length, 1);
});

test('exporta CSV compatible con Excel y conserva observaciones con comillas', () => {
  const csv = buildPromesasCsv([record('1', { observaciones: 'Hermana de "Ana"' })]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"Hermana de ""Ana"""/);
  assert.match(csv, /"Nombre";"Número";"CI"/);
});

test('la app expone landing, tres rutas y evita una pantalla vacía si falla un módulo', async () => {
  const [source, main] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /ModuleLanding/);
  assert.match(source, /recepcion/);
  assert.match(source, /cargo/);
  assert.match(source, /promesas/);
  assert.match(source, /import PromisesDashboard from '\.\/components\/PromisesDashboard'/);
  assert.doesNotMatch(source, /lazy\(\(\) => import\('\.\/components\/PromisesDashboard'\)\)/);
  assert.match(main, /class AppErrorBoundary/);
  assert.match(main, /Recargar aplicación/);
});

test('la sincronización usa trigger instalable, respaldo y validación visible de CI', async () => {
  const [appsScript, edgeFunction, migration] = await Promise.all([
    readFile(new URL('../apps-script/PromesasSync.gs', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/sync-promesa/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608190001_promesas.sql', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(appsScript, /function\s+onEdit\s*\(/);
  assert.match(appsScript, /\.onEdit\(\)\.create\(\)/);
  assert.match(appsScript, /everyMinutes\(5\)/);
  assert.match(appsScript, /_SYNC_LOG/);
  assert.match(edgeFunction, /x-sync-secret/);
  assert.match(edgeFunction, /ci_valido: ciValido/);
  assert.match(edgeFunction, /\^\\d\+\$/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /supabase_realtime add table public\.promesas/);
});
