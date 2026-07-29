var ROOT_FOLDER_ID = '1dcqt0rAR0WiQ9ZnoVo9PUSxjt9xrfAA2';
var WEBHOOK_SECRET_PROPERTY = 'WEBHOOK_SECRET';
var MAX_FILE_BYTES = 1350000;

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  var error = new Error(message);
  error.code = code;
  throw error;
}

function doGet() {
  try {
    DriveApp.getFolderById(ROOT_FOLDER_ID).getId();
    return json_({
      status: 'success',
      mode: 'find-existing-folder-only',
      rootFolderId: ROOT_FOLDER_ID
    });
  } catch (error) {
    return json_({
      status: 'error',
      code: 'DRIVE_PERMISSION_ERROR',
      message: String(error && error.message ? error.message : error)
    });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    var data = JSON.parse(e && e.postData ? e.postData.contents : '');
    var expectedSecret = PropertiesService.getScriptProperties()
      .getProperty(WEBHOOK_SECRET_PROPERTY);

    if (!expectedSecret || data.secret !== expectedSecret) {
      fail_('UNAUTHORIZED', 'Credencial del webhook inválida o no configurada.');
    }

    if (data.action !== 'findFolderAndUpload') {
      fail_('INVALID_ACTION', 'Acción de Drive inválida.');
    }

    var folderName = typeof data.folderName === 'string' ? data.folderName : '';
    if (
      !folderName ||
      folderName !== folderName.trim() ||
      folderName.length > 180 ||
      /[\/\\\u0000-\u001f]/.test(folderName)
    ) {
      fail_('INVALID_FOLDER_NAME', 'Nombre de legajo inválido.');
    }

    if (!Array.isArray(data.files) || data.files.length !== 2) {
      fail_('INVALID_FILES', 'Se requieren exactamente el Recibo y el Cargo.');
    }

    var expectedNames = {};
    expectedNames['Recibo_' + folderName + '.pdf'] = true;
    expectedNames['Cargo_' + folderName + '.pdf'] = true;

    var preparedFiles = data.files.map(function(file) {
      if (
        !file ||
        !expectedNames[file.name] ||
        file.mimeType !== 'application/pdf' ||
        typeof file.base64 !== 'string' ||
        !file.base64 ||
        file.base64.length > 1800000 ||
        file.base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)
      ) {
        fail_('INVALID_FILE', 'Uno de los comprobantes PDF es inválido.');
      }

      delete expectedNames[file.name];
      var bytes = Utilities.base64Decode(file.base64);
      if (
        !bytes.length ||
        bytes.length > MAX_FILE_BYTES ||
        bytes[0] !== 37 ||
        bytes[1] !== 80 ||
        bytes[2] !== 68 ||
        bytes[3] !== 70
      ) {
        fail_('INVALID_PDF', 'Uno de los comprobantes no es un PDF válido.');
      }

      return {
        name: file.name,
        blob: Utilities.newBlob(bytes, 'application/pdf', file.name)
      };
    });

    if (Object.keys(expectedNames).length !== 0) {
      fail_('INVALID_FILES', 'Falta uno de los comprobantes requeridos.');
    }

    if (!lock.tryLock(30000)) {
      fail_('BUSY', 'Drive está procesando otra carga. Intenta nuevamente.');
    }

    var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    var matches = rootFolder.getFoldersByName(folderName);
    if (!matches.hasNext()) {
      fail_(
        'FOLDER_NOT_FOUND',
        'No existe el legajo exacto "' + folderName + '" dentro de la carpeta raíz.'
      );
    }

    var targetFolder = matches.next();
    if (matches.hasNext()) {
      fail_(
        'DUPLICATE_FOLDER',
        'Existe más de una carpeta con el nombre exacto "' + folderName + '".'
      );
    }

    var filePlans = preparedFiles.map(function(prepared) {
      var existingFiles = targetFolder.getFilesByName(prepared.name);
      if (existingFiles.hasNext()) {
        var existingFile = existingFiles.next();
        if (existingFiles.hasNext()) {
          fail_(
            'DUPLICATE_FILE',
            'Existe más de un archivo llamado "' + prepared.name + '" en el legajo.'
          );
        }
        if (
          existingFile.getMimeType() !== 'application/pdf' ||
          existingFile.getSize() <= 0
        ) {
          fail_(
            'INVALID_EXISTING_FILE',
            'El archivo existente "' + prepared.name + '" no es un PDF válido.'
          );
        }

        return { prepared: prepared, existing: existingFile };
      }

      return { prepared: prepared, existing: null };
    });

    var results = filePlans.map(function(plan) {
      var file = plan.existing || targetFolder.createFile(plan.prepared.blob);
      return {
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        created: !plan.existing
      };
    });

    return json_({
      status: 'success',
      folderId: targetFolder.getId(),
      folderName: targetFolder.getName(),
      folderUrl: targetFolder.getUrl(),
      files: results
    });
  } catch (error) {
    return json_({
      status: 'error',
      code: error && error.code ? error.code : 'DRIVE_ERROR',
      message: String(error && error.message ? error.message : error)
    });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}
