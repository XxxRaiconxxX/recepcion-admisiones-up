import React, { useState } from 'react';
import { 
  FolderCheck, 
  CheckSquare, 
  Square, 
  FileCheck2, 
  FileSpreadsheet, 
  UploadCloud, 
  User, 
  Sparkles,
  FileText,
  UserCheck
} from 'lucide-react';
import type { StudentData } from '../types/admission';
import {
  getStudentDriveFolderName,
  type DriveUploadResult,
} from '../lib/driveClient';
import { DocumentExporter } from '../lib/pdfExport';
import { DriveSimulationModal } from './DriveSimulationModal';

interface ReceptionFormProps {
  userToken?: string;
  onOpenPreview: (student: StudentData) => void;
  onDriveStatusChange: (status: StudentData['driveSyncStatus'], folderName?: string) => void;
}

export const ReceptionForm: React.FC<ReceptionFormProps> = ({ userToken, onOpenPreview, onDriveStatusChange }) => {
  // Estado principal del alumno y formulario (Recepcionista fijado en Arlet Gonzalez)
  const [student, setStudent] = useState<StudentData>({
    ci: '5705965',
    nombres: 'Axel Miguel',
    apellidos: 'Fretes Monges',
    carrera: 'Medicina',
    nombreAsesor: 'Axel Fretes',
    nombreRecepcionista: 'Arlet Gonzalez',
    fecha: new Date().toLocaleDateString('es-PY'),
    numeroRecibo: '0030853',
    numeroCargo: 'N° 045 / 2026 Promoción',
    observaciones: 'JULIO 2026',
    
    // Checkboxes por defecto (4 documentos principales tildados)
    certificadoEstudios: true,
    fotocopiaCedula: true,
    fotosCarnet: true,
    antecedentesPoliciales: true,
    carnetMigraciones: false,
    otros: false,
    descripcionOtros: '',
    contratoFirmado: true,

    driveSyncStatus: 'idle',
  });

  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);

  // Nombre formateado de carpeta en Drive: CI-Nombre Completo Apellidos Completos
  const fullDriveFolderName = getStudentDriveFolderName(student);

  const handleChange = (field: keyof StudentData, value: any) => {
    setStudent((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDoc = (field: keyof StudentData) => {
    setStudent((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // Iniciar la generación y subida real a Google Drive.
  const handleUploadToDrive = () => {
    handleChange('driveSyncStatus', 'syncing');
    onDriveStatusChange('syncing', fullDriveFolderName);
    setSyncMessage(null);
    setIsSimulationOpen(true);
  };

  const handleSimulationStart = () => {
    handleChange('driveSyncStatus', 'syncing');
    onDriveStatusChange('syncing', fullDriveFolderName);
    setSyncMessage(null);
  };

  const handleSimulationComplete = (result: DriveUploadResult) => {
    handleChange('driveSyncStatus', 'synced');
    onDriveStatusChange('synced', result.folderName);
    setSyncMessage(`¡Recibo y Cargo confirmados en Drive: ${result.folderName}!`);
  };

  const handleSimulationError = () => {
    handleChange('driveSyncStatus', 'error');
    onDriveStatusChange('error', fullDriveFolderName);
    setSyncMessage(null);
  };

  const handleSimulationClose = () => {
    if (student.driveSyncStatus === 'syncing') {
      handleChange('driveSyncStatus', 'idle');
      onDriveStatusChange('idle', fullDriveFolderName);
    }
    setIsSimulationOpen(false);
  };

  // Descarga directa del Cargo en Word (.docx)
  const handleDownloadWord = () => {
    const docsList: string[] = [];
    if (student.contratoFirmado) docsList.push(`CONTRATO ${student.carrera.toUpperCase()}`);
    if (student.certificadoEstudios) docsList.push('CERTIFICADO DE ESTUDIO');
    if (student.fotosCarnet) docsList.push('FOTO TIPO CARNET 2');
    if (student.antecedentesPoliciales) docsList.push('ANTECEDENTES POLICIALES');
    if (student.fotocopiaCedula) docsList.push('CEDULA FOTOCOPIA AUTENTICADA');

    DocumentExporter.generateCargoWordDocx(student, docsList.join(', '));
  };

  return (
    <div className="space-y-6">
      
      {/* Tarjeta de Búsqueda Inteligente en Google Drive */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FolderCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-slate-100 font-heading">
                Buscador y Vinculación con Google Drive
              </h2>
              {userToken && (
                <span className="bg-emerald-950 border border-emerald-700 text-emerald-300 text-[10px] px-2.5 py-0.5 rounded-md font-medium flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" /> Conectado a Drive
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Nombre de carpeta del alumno: <span className="text-emerald-400 font-mono">CI-Nombre Completo Apellidos</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Carpeta Destino:</span>
              <span className="text-sm font-mono font-bold text-emerald-300">
                {fullDriveFolderName}
              </span>
            </div>
          </div>
        </div>

        {/* Indicador de Estado de Drive */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-blue-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-400" /> Al subir se buscará este legajo exacto; nunca se creará una carpeta.
            </span>
          </div>

          {syncMessage && (
            <div className="text-emerald-300 font-mono font-medium bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-800">
              {syncMessage}
            </div>
          )}
        </div>
      </div>

      {/* Formulario Principal de Recepción */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Datos del Alumno e Inscripción (Admisiones UP)
            </h3>
            <p className="text-xs text-slate-500">
              Completa los datos para autogenerar el Recibo (Imagen 1) y Cargo de Entrega (Imagen 2).
            </p>
          </div>

          <div className="flex items-center gap-2 bg-blue-50 text-blue-800 text-xs px-3 py-1.5 rounded-lg border border-blue-200 font-semibold font-mono">
            Recibo N°: {student.numeroRecibo}
          </div>
        </div>

        {/* Fila 1: Cédula, Nombres, Apellidos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Cédula de Identidad (CI) *
            </label>
            <input
              type="text"
              value={student.ci}
              onChange={(e) => handleChange('ci', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
              placeholder="Ej: 5705965"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Nombres Completos *
            </label>
            <input
              type="text"
              value={student.nombres}
              onChange={(e) => handleChange('nombres', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
              placeholder="Ej: Axel Miguel"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Apellidos Completos *
            </label>
            <input
              type="text"
              value={student.apellidos}
              onChange={(e) => handleChange('apellidos', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
              placeholder="Ej: Fretes Monges"
            />
          </div>
        </div>

        {/* Fila 2: Carrera, Asesor (Dropdown), Recepcionista (Fijado), Fecha */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Carrera / Facultad *
            </label>
            <select
              value={student.carrera}
              onChange={(e) => handleChange('carrera', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none bg-white font-medium cursor-pointer"
            >
              <option value="Medicina">Medicina</option>
              <option value="Odontología">Odontología</option>
              <option value="Derecho">Derecho</option>
              <option value="Administración de Empresas">Administración de Empresas</option>
              <option value="Kinesiología y Fisioterapia">Kinesiología y Fisioterapia</option>
              <option value="Nutrición">Nutrición</option>
              <option value="Posgrado">Posgrado</option>
            </select>
          </div>

          {/* Desplegable de Asesor Comercial */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Asesor Comercial (Entrega) *
            </label>
            <select
              value={student.nombreAsesor}
              onChange={(e) => handleChange('nombreAsesor', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none bg-white font-semibold cursor-pointer"
            >
              <option value="Axel Fretes">Axel Fretes</option>
              <option value="Malu Villanueva">Malu Villanueva</option>
              <option value="Kamila Sarsa">Kamila Sarsa</option>
              <option value="Yamila">Yamila</option>
            </select>
          </div>

          {/* Recepcionista Fijado Permanente en Arlet Gonzalez */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Recepcionista (Recibe) *
            </label>
            <input
              type="text"
              readOnly
              value="Arlet Gonzalez"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-sm font-bold text-slate-800 outline-none cursor-not-allowed shadow-inner"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Fecha de Emisión *
            </label>
            <input
              type="text"
              value={student.fecha}
              onChange={(e) => handleChange('fecha', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
            />
          </div>
        </div>

        {/* Sección de Checkboxes de Documentos Físicos (Matching Exacto Imagen 1) */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              Verificación de Documentación Física Recibida (4 Documentos Obligatorios)
            </h4>
            <span className="text-xs text-slate-500 font-medium">
              Marcar las casillas de los documentos entregados por el alumno
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            {/* Doc 1 */}
            <div 
              onClick={() => toggleDoc('certificadoEstudios')}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-3 ${
                student.certificadoEstudios 
                  ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {student.certificadoEstudios ? (
                <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-medium">
                <p className="font-bold">Certificados de Estudios</p>
                <p className="text-[11px] text-slate-500">Original Visado por la Supervisión Administrativa</p>
              </div>
            </div>

            {/* Doc 2 */}
            <div 
              onClick={() => toggleDoc('fotocopiaCedula')}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-3 ${
                student.fotocopiaCedula 
                  ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {student.fotocopiaCedula ? (
                <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-medium">
                <p className="font-bold">Fotocopia de Cédula Autenticada</p>
                <p className="text-[11px] text-slate-500">Autenticada por Escribanía Paraguaya</p>
              </div>
            </div>

            {/* Doc 3 */}
            <div 
              onClick={() => toggleDoc('fotosCarnet')}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-3 ${
                student.fotosCarnet 
                  ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {student.fotosCarnet ? (
                <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-medium">
                <p className="font-bold">2 Fotografías Tamaño Carné</p>
                <p className="text-[11px] text-slate-500">Fotografías físicas tipo carnet 2 unidades</p>
              </div>
            </div>

            {/* Doc 4 */}
            <div 
              onClick={() => toggleDoc('antecedentesPoliciales')}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-3 ${
                student.antecedentesPoliciales 
                  ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {student.antecedentesPoliciales ? (
                <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-medium">
                <p className="font-bold">Certificado de Antecedentes Policiales</p>
                <p className="text-[11px] text-slate-500">Original vigente</p>
              </div>
            </div>

            {/* Extranjeros */}
            <div 
              onClick={() => toggleDoc('carnetMigraciones')}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-3 ${
                student.carnetMigraciones 
                  ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {student.carnetMigraciones ? (
                <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-medium">
                <p className="font-bold">Carné de Migraciones (Extranjeros)</p>
                <p className="text-[11px] text-slate-500">Fotocopia Autenticada</p>
              </div>
            </div>

            {/* Contrato Firmado */}
            <div 
              onClick={() => toggleDoc('contratoFirmado')}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-3 ${
                student.contratoFirmado 
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {student.contratoFirmado ? (
                <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-medium">
                <p className="font-bold">Contrato de Estudios Firmado</p>
                <p className="text-[11px] text-slate-500">Contrato entregado por el Asesor</p>
              </div>
            </div>

          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Observaciones / Período (Aparecerá en el Cargo y Recibo)
            </label>
            <input
              type="text"
              value={student.observaciones}
              onChange={(e) => handleChange('observaciones', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
              placeholder="Ej: JULIO 2026"
            />
          </div>

        </div>

        {/* Barra de Acciones y Botones de Generación */}
        <div className="border-t border-slate-200 pt-6 flex flex-wrap items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenPreview(student)}
              className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Ver y Generar Comprobantes (Vista Previa)
            </button>

            <button
              onClick={handleDownloadWord}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Descargar Cargo en Word (.docx)
            </button>
          </div>

          <button
            onClick={handleUploadToDrive}
            disabled={student.driveSyncStatus === 'syncing' || !userToken}
            title={!userToken ? 'Verifica primero una cuenta de Google desde la barra superior.' : undefined}
            className={`px-5 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              student.driveSyncStatus === 'synced'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            {!userToken
              ? 'Verifica Google para enviar a Drive'
              : student.driveSyncStatus === 'syncing'
                ? 'Subiendo a Drive...'
                : 'Enviar Recibo + Cargo al legajo existente'}
          </button>

        </div>

      </div>

      {/* Modal de generación y subida real a Google Drive */}
      {isSimulationOpen && (
        <DriveSimulationModal
          student={student}
          idToken={userToken}
          onClose={handleSimulationClose}
          onStart={handleSimulationStart}
          onComplete={handleSimulationComplete}
          onError={handleSimulationError}
        />
      )}

    </div>
  );
};
