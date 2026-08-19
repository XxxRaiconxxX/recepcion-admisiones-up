const PROMESAS = Object.freeze({
  HEADER_ROW: 1,
  FIRST_DATA_ROW: 2,
  SYNC_HANDLER: 'sincronizarEdicionPromesa',
  BACKUP_HANDLER: 'sincronizarPromesasPendientes',
  LOG_SHEET: '_SYNC_LOG',
  INTERNAL_PREFIX: '_',
  EDGE_URL_PROPERTY: 'PROMESAS_EDGE_URL',
  SECRET_PROPERTY: 'PROMESAS_SYNC_SECRET',
  CARRERAS: [
    'Medicina',
    'Odontología',
    'Derecho',
    'Administración de Empresas',
    'Kinesiología y Fisioterapia',
    'Nutrición',
    'Ingeniería Informática',
    'Contaduría Pública',
    'Marketing',
    'Posgrado'
  ]
});

const PROMESA_COL = Object.freeze({
  NOMBRE: 1,
  NUMERO: 2,
  CI: 3,
  CARRERA: 4,
  BECADO: 5,
  VISITA: 6,
  ASISTIO: 7,
  INSCRIPTO: 8,
  OBSERVACIONES: 9,
  FECHA_CARGA: 10,
  ID: 11,
  UPDATED_AT: 12,
  SYNCED_AT: 13
});

function configurarSincronizacionPromesas(edgeUrl, secreto) {
  if (!/^https:\/\/.+\.supabase\.co\/functions\/v1\/sync-promesa$/.test(String(edgeUrl || '').trim())) {
    throw new Error('La URL debe terminar en /functions/v1/sync-promesa.');
  }
  if (String(secreto || '').length < 24) throw new Error('Use un secreto de al menos 24 caracteres.');
  PropertiesService.getScriptProperties().setProperties({
    [PROMESAS.EDGE_URL_PROPERTY]: String(edgeUrl).trim(),
    [PROMESAS.SECRET_PROPERTY]: String(secreto)
  });
}

function prepararTodasLasPestanas() {
  SpreadsheetApp.getActive().getSheets()
    .filter((sheet) => !sheet.getName().startsWith(PROMESAS.INTERNAL_PREFIX))
    .forEach(prepararPestanaDeAsesor_);
}

function prepararPestanaActual() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName().startsWith(PROMESAS.INTERNAL_PREFIX)) {
    throw new Error('La pestaña activa es interna y no puede prepararse como asesor.');
  }
  prepararPestanaDeAsesor_(sheet);
}

function instalarTriggersPromesas() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if ([PROMESAS.SYNC_HANDLER, PROMESAS.BACKUP_HANDLER].includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(PROMESAS.SYNC_HANDLER).forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger(PROMESAS.BACKUP_HANDLER).timeBased().everyMinutes(5).create();
}

function sincronizarEdicionPromesa(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  if (sheet.getName().startsWith(PROMESAS.INTERNAL_PREFIX) || event.range.getRow() < PROMESAS.FIRST_DATA_ROW) return;
  if (event.range.getColumn() > PROMESA_COL.FECHA_CARGA) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    registrarError_('onEdit', sheet.getName(), event.range.getRow(), 'No se pudo adquirir el lock de sincronización.');
    return;
  }
  try {
    const startRow = event.range.getRow();
    const rows = [];
    for (let row = startRow; row < startRow + event.range.getNumRows(); row++) {
      const payload = construirPayloadFila_(sheet, row, true);
      if (payload) rows.push(payload);
    }
    if (rows.length > 0) enviarFilas_(rows, sheet);
  } catch (error) {
    registrarError_('onEdit', sheet.getName(), event.range.getRow(), error);
  } finally {
    lock.releaseLock();
  }
}

function sincronizarPromesasPendientes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    SpreadsheetApp.getActive().getSheets()
      .filter((sheet) => !sheet.getName().startsWith(PROMESAS.INTERNAL_PREFIX))
      .forEach((sheet) => {
        const lastRow = sheet.getLastRow();
        if (lastRow < PROMESAS.FIRST_DATA_ROW) return;
        const values = sheet.getRange(PROMESAS.FIRST_DATA_ROW, 1, lastRow - 1, PROMESA_COL.SYNCED_AT).getValues();
        const pending = [];
        values.forEach((rowValues, index) => {
          const updatedAt = rowValues[PROMESA_COL.UPDATED_AT - 1];
          const syncedAt = rowValues[PROMESA_COL.SYNCED_AT - 1];
          if (updatedAt && syncedAt && new Date(syncedAt).getTime() >= new Date(updatedAt).getTime()) return;
          const payload = construirPayloadFila_(sheet, index + PROMESAS.FIRST_DATA_ROW, false);
          if (payload) pending.push(payload);
        });
        for (let offset = 0; offset < pending.length; offset += 100) {
          enviarFilas_(pending.slice(offset, offset + 100), sheet);
        }
      });
  } catch (error) {
    registrarError_('backup', '', '', error);
  } finally {
    lock.releaseLock();
  }
}

function construirPayloadFila_(sheet, row, markUpdated) {
  const range = sheet.getRange(row, 1, 1, PROMESA_COL.SYNCED_AT);
  const values = range.getValues()[0];
  const meaningfulValues = values.slice(0, PROMESA_COL.OBSERVACIONES);
  const isBlank = meaningfulValues.every((value) => String(value || '').trim() === '');
  let id = String(values[PROMESA_COL.ID - 1] || '').trim();

  if (isBlank) return id ? { sheet_row_key: id, deleted: true } : null;
  if (!id) {
    id = Utilities.getUuid();
    sheet.getRange(row, PROMESA_COL.ID).setValue(id);
  }

  const now = new Date();
  if (markUpdated || !values[PROMESA_COL.UPDATED_AT - 1]) {
    sheet.getRange(row, PROMESA_COL.UPDATED_AT).setValue(now);
    values[PROMESA_COL.UPDATED_AT - 1] = now;
  }
  if (!values[PROMESA_COL.FECHA_CARGA - 1]) {
    sheet.getRange(row, PROMESA_COL.FECHA_CARGA).setValue(now);
    values[PROMESA_COL.FECHA_CARGA - 1] = now;
  }

  const nombre = String(values[PROMESA_COL.NOMBRE - 1] || '').trim();
  const carrera = String(values[PROMESA_COL.CARRERA - 1] || '').trim();
  if (!nombre || !carrera) {
    if (markUpdated) registrarError_('validación', sheet.getName(), row, 'La fila requiere Nombre y Carrera antes de sincronizar.');
    return null;
  }

  return {
    sheet_row_key: id,
    nombres_apellidos: nombre,
    numero: String(values[PROMESA_COL.NUMERO - 1] || '').trim(),
    ci: String(values[PROMESA_COL.CI - 1] || '').trim(),
    carrera,
    asesor: sheet.getName().trim(),
    becado: values[PROMESA_COL.BECADO - 1],
    visita: values[PROMESA_COL.VISITA - 1],
    asistio: values[PROMESA_COL.ASISTIO - 1],
    inscripto: values[PROMESA_COL.INSCRIPTO - 1],
    observaciones: String(values[PROMESA_COL.OBSERVACIONES - 1] || '').trim(),
    fecha_carga: fechaIso_(values[PROMESA_COL.FECHA_CARGA - 1]),
    source_updated_at: fechaIso_(values[PROMESA_COL.UPDATED_AT - 1])
  };
}

function enviarFilas_(rows, sheet) {
  const properties = PropertiesService.getScriptProperties();
  const edgeUrl = properties.getProperty(PROMESAS.EDGE_URL_PROPERTY);
  const secret = properties.getProperty(PROMESAS.SECRET_PROPERTY);
  if (!edgeUrl || !secret) throw new Error('Ejecute configurarSincronizacionPromesas(edgeUrl, secreto).');

  const response = UrlFetchApp.fetch(edgeUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': secret },
    payload: JSON.stringify({ rows }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  let body;
  try {
    body = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('La Edge Function no devolvió JSON válido (HTTP ' + code + ').');
  }
  if (code < 200 || code >= 300 || body.status !== 'success') {
    throw new Error(body.message || ('Error HTTP ' + code));
  }

  const rowByKey = {};
  const lastRow = sheet.getLastRow();
  if (lastRow >= PROMESAS.FIRST_DATA_ROW) {
    sheet.getRange(PROMESAS.FIRST_DATA_ROW, PROMESA_COL.ID, lastRow - 1, 1).getValues()
      .forEach((value, index) => { if (value[0]) rowByKey[String(value[0])] = index + PROMESAS.FIRST_DATA_ROW; });
  }
  const syncedAt = new Date();
  (body.synced_keys || []).forEach((key) => {
    if (rowByKey[key]) sheet.getRange(rowByKey[key], PROMESA_COL.SYNCED_AT).setValue(syncedAt);
  });
  (body.warnings || []).forEach((warning) => registrarError_('validación CI', sheet.getName(), rowByKey[warning.sheet_row_key] || '', warning.warning));
}

function prepararPestanaDeAsesor_(sheet) {
  const headers = ['Nombre', 'Número', 'CI', 'Carrera', 'Becado', 'Visita', 'Asistió', 'Inscripto', 'Observaciones', 'Fecha de carga', '_ID', '_UPDATED_AT', '_SYNCED_AT'];
  sheet.getRange(PROMESAS.HEADER_ROW, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange('A1:M1').setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('B:B').setNumberFormat('@');
  sheet.getRange('C:C').setNumberFormat('@');
  sheet.getRange('J:M').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.setColumnWidths(1, 1, 220);
  sheet.setColumnWidths(2, 2, 130);
  sheet.setColumnWidth(PROMESA_COL.CARRERA, 210);
  sheet.setColumnWidth(PROMESA_COL.OBSERVACIONES, 280);

  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  const careerValidation = SpreadsheetApp.newDataValidation().requireValueInList(PROMESAS.CARRERAS, true).setAllowInvalid(false).build();
  const yesNoValidation = SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'No'], true).setAllowInvalid(false).build();
  sheet.getRange(PROMESAS.FIRST_DATA_ROW, PROMESA_COL.CARRERA, rowCount, 1).setDataValidation(careerValidation);
  sheet.getRange(PROMESAS.FIRST_DATA_ROW, PROMESA_COL.BECADO, rowCount, 4).setDataValidation(yesNoValidation);

  const careerColors = ['#bfdbfe', '#99f6e4', '#ddd6fe', '#fed7aa', '#fbcfe8', '#bbf7d0', '#a5f3fc', '#fde68a', '#fecaca', '#c7d2fe'];
  const rules = PROMESAS.CARRERAS.map((career, index) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(career)
    .setBackground(careerColors[index % careerColors.length])
    .setRanges([sheet.getRange(PROMESAS.FIRST_DATA_ROW, PROMESA_COL.CARRERA, rowCount, 1)])
    .build());
  rules.push(
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Sí').setBackground('#bbf7d0').setRanges([sheet.getRange(PROMESAS.FIRST_DATA_ROW, PROMESA_COL.BECADO, rowCount, 4)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('No').setBackground('#e2e8f0').setRanges([sheet.getRange(PROMESAS.FIRST_DATA_ROW, PROMESA_COL.BECADO, rowCount, 4)]).build()
  );
  sheet.setConditionalFormatRules(rules);
  sheet.hideColumns(PROMESA_COL.ID, 3);
}

function fechaIso_(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function registrarError_(origen, pestana, fila, error) {
  const spreadsheet = SpreadsheetApp.getActive();
  let logSheet = spreadsheet.getSheetByName(PROMESAS.LOG_SHEET);
  if (!logSheet) {
    logSheet = spreadsheet.insertSheet(PROMESAS.LOG_SHEET);
    logSheet.appendRow(['Fecha', 'Origen', 'Pestaña', 'Fila', 'Error']);
    logSheet.setFrozenRows(1);
  }
  const message = error && error.message ? error.message : String(error);
  logSheet.appendRow([new Date(), origen, pestana, fila, message]);
}
