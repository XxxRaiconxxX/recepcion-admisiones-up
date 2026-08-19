import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_BODY_BYTES = 1_000_000;
const MAX_ROWS = 500;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const constantTimeEquals = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
};

const text = (value: unknown, maxLength: number) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().slice(0, maxLength)
    : '';

const nullableText = (value: unknown, maxLength: number) => text(value, maxLength) || null;

const booleanValue = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  const normalized = text(value, 12).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (['SI', 'TRUE', '1'].includes(normalized)) return true;
  if (['NO', 'FALSE', '0'].includes(normalized)) return false;
  return null;
};

const isoDate = (value: unknown) => {
  const candidate = text(value, 64);
  if (!candidate) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ status: 'error', message: 'Método no permitido.' }, 405);

  const expectedSecret = Deno.env.get('SHEETS_SYNC_SECRET') || '';
  const receivedSecret = request.headers.get('x-sync-secret') || '';
  if (!expectedSecret || !receivedSecret || !constantTimeEquals(receivedSecret, expectedSecret)) {
    return json({ status: 'error', message: 'Sincronización no autorizada.' }, 401);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload demasiado grande.' }, 413);
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload demasiado grande.' }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ status: 'error', message: 'JSON inválido.' }, 400);
  }

  const rawRows = Array.isArray(body.rows) ? body.rows : [body];
  if (rawRows.length === 0 || rawRows.length > MAX_ROWS) {
    return json({ status: 'error', message: `Se requieren entre 1 y ${MAX_ROWS} filas.` }, 400);
  }

  const rows: Record<string, unknown>[] = [];
  const deleteKeys: string[] = [];
  const warnings: Array<{ sheet_row_key: string; warning: string }> = [];

  for (const rawRow of rawRows) {
    if (!rawRow || typeof rawRow !== 'object') return json({ status: 'error', message: 'Fila inválida.' }, 400);
    const source = rawRow as Record<string, unknown>;
    const sheetRowKey = text(source.sheet_row_key, 200);
    if (!sheetRowKey) return json({ status: 'error', message: 'Falta sheet_row_key.' }, 400);
    if (source.deleted === true) {
      deleteKeys.push(sheetRowKey);
      continue;
    }

    const nombresApellidos = text(source.nombres_apellidos, 240);
    const carrera = text(source.carrera, 160);
    const asesor = text(source.asesor, 160);
    if (!nombresApellidos || !carrera || !asesor) {
      return json({ status: 'error', message: `La fila ${sheetRowKey} no tiene Nombre, Carrera o Asesor.` }, 400);
    }

    const ci = nullableText(source.ci, 80);
    const ciValido = !ci || /^\d+$/.test(ci);
    const syncWarning = ciValido
      ? null
      : 'CI no numérica: mover la nota a Observaciones y dejar CI vacía.';
    if (syncWarning) warnings.push({ sheet_row_key: sheetRowKey, warning: syncWarning });

    rows.push({
      sheet_row_key: sheetRowKey,
      ci,
      ci_valido: ciValido,
      sync_warning: syncWarning,
      nombres_apellidos: nombresApellidos,
      carrera,
      asesor,
      numero: nullableText(source.numero, 80),
      becado: booleanValue(source.becado),
      visita: booleanValue(source.visita),
      asistio: booleanValue(source.asistio),
      inscripto: booleanValue(source.inscripto),
      observaciones: nullableText(source.observaciones, 2_000),
      fecha_carga: isoDate(source.fecha_carga),
      source_updated_at: isoDate(source.source_updated_at) || new Date().toISOString(),
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ status: 'error', message: 'Edge Function sin configurar.' }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (deleteKeys.length > 0) {
      const { error } = await supabase.from('promesas').delete().in('sheet_row_key', deleteKeys);
      if (error) throw error;
    }
    if (rows.length > 0) {
      const { error } = await supabase.from('promesas').upsert(rows, { onConflict: 'sheet_row_key' });
      if (error) throw error;
    }
  } catch (error) {
    console.error('sync-promesa failed', error);
    return json({ status: 'error', message: 'No se pudo guardar la sincronización.' }, 502);
  }

  return json({
    status: 'success',
    upserted: rows.length,
    deleted: deleteKeys.length,
    warnings,
    synced_keys: [...rows.map((row) => row.sheet_row_key), ...deleteKeys],
  });
});
