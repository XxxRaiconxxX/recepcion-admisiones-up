# 🎓 Sistema Web de Recepción de Documentos y Cargo de Entrega (Universidad del Pacífico)

Sistema web integral diseñado para automatizar y acelerar el proceso de recepción de documentos de alumnos, emisión de **Recibo Oficial UP** (Imagen 1), **Cargo de Entrega Interno** (Imagen 2) e integración directa con **Google Drive**.

![Universidad del Pacífico](public/logo-up.png)

---

## 🌟 Características Principales

1. **Recepción de Alumnos y Verificación de Documentación**:
   - Formulario rápido de recepción con validación de los 4 documentos físicos obligatorios (*Certificados de Estudio, Fotocopia Cédula Autenticada, 2 Fotos Carné, Antecedentes Policiales*).
   - Selección rápida de Asesores Comerciales (*Axel Fretes, Malu Villanueva, Kamila Sarsa, Yamila*).
   - Recepcionista fijada en **Arlet Gonzalez**.

2. **Formatos 100% Fieles a los Modelos Físicos**:
   - **Recibo de Recepción UP (Imagen 1)**: Modelo de la Universidad del Pacífico con casillas tildables y firmas físicas.
   - **Cargo de Entrega Interno (Imagen 2)**: Legajo de la Promoción con tabla de entregas e impresiones cruzadas.

3. **Nomenclatura Estricta de Legajos**:
   - Formato automático: `CI-Nombre Completo Apellidos Completos`  
     *(Ejemplo: `5705965-Axel Miguel Fretes Monges`)*

4. **Integración con Google Drive**:
   - Conexión a la carpeta raíz de admisiones (ID: `1dcqt0rAR0WiQ9ZnoVo9PUSxjt9xrfAA2`).
   - Busca un legajo ya existente, incluso dentro de carpetas de asesor y carrera, mediante coincidencia exacta y sube allí el Recibo y el Cargo en PDF.
   - Nunca crea carpetas. Si el legajo no existe o está duplicado, muestra el error y no usa otra ubicación.
   - Los reintentos conservan los archivos del mismo nombre que ya estén en el legajo, sin duplicarlos ni borrarlos.

5. **Generación y Exportación**:
   - Impresión nativa en A4 sin descuadre de márgenes.
   - Exportación directa a **Microsoft Word (.docx)** para el Cargo de Entrega.

---

## 🛠️ Tecnologías Utilizadas

- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vite.dev/) + TypeScript
- **Estilos**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Iconos**: [Lucide React](https://lucide.dev/)
- **Exportación Word**: `docx` + `file-saver`
- **Generación PDF**: `html2pdf.js`
- **Integración Cloud**: Vercel Function + Google Apps Script + `DriveApp`
- **Verificación de identidad**: Google Identity Services + `google-auth-library`

---

## 🚀 Instalación y Ejecución Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/XxxRaiconxxX/recepcion-admisiones-up.git
cd recepcion-admisiones-up

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor de desarrollo
npm run dev
```

Abra [http://localhost:5173/](http://localhost:5173/) en su navegador para ver la aplicación.

Para probar también las rutas `/api/drive` y `/api/ocr` localmente, use `npx vercel dev` en lugar de `npm run dev`.

## Configuración segura de Gemini OCR

Gemini se invoca exclusivamente desde `/api/ocr`; las claves no se guardan en `localStorage`, no se incluyen en el bundle web y no viajan en la URL. El proxy exige la misma sesión Google y las mismas cuentas autorizadas configuradas para Drive.

Configure en Vercel, para Production y Preview:

```text
GEMINI_API_KEYS=clave-1,clave-2
GEMINI_MODEL=gemini-2.5-flash
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
DRIVE_ALLOWED_GOOGLE_DOMAIN=upacifico.edu.py
```

`GEMINI_MODEL` es opcional. Para una sola clave puede usar `GEMINI_API_KEY`. La variable antigua `VITE_GEMINI_API_KEY` se acepta temporalmente en el servidor para facilitar la migración, pero debe renombrarse y eliminarse de los entornos del cliente. Las claves que alguna vez estuvieron incrustadas en una compilación deben revocarse y regenerarse en Google AI Studio.

El modo **Solo OCR local** no realiza solicitudes a Gemini. Las fotos enviadas a Gemini se reducen en el navegador, se validan por índice en ambos extremos y solo se aceptan si los campos `Nombres`, `Apellidos`, `Carrera` y `Nro.` quedan legibles.

## Configuración de Google Drive

1. Copie [`apps-script/Code.gs`](apps-script/Code.gs) en el proyecto de Google Apps Script.
2. En **Configuración del proyecto → Propiedades de la secuencia de comandos**, cree `WEBHOOK_SECRET` con un valor aleatorio largo.
3. Despliegue una versión nueva como aplicación web:
   - **Ejecutar como**: la cuenta que despliega.
   - **Quién tiene acceso**: cualquier persona, porque Vercel llama al endpoint sin una sesión de Google.
4. Confirme que esa cuenta tenga permiso de edición sobre la carpeta raíz.
5. Cree un cliente OAuth 2.0 de tipo **Aplicación web** en Google Cloud y agregue la URL de Vercel a **Orígenes autorizados de JavaScript**.
6. Configure en Vercel, para Production y Preview:

```text
APPS_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_WEBHOOK_SECRET=el-mismo-valor-de-WEBHOOK_SECRET
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
DRIVE_ALLOWED_GOOGLE_DOMAIN=upacifico.edu.py
```

Si se autorizarán cuentas personales o una lista cerrada, use `DRIVE_ALLOWED_GOOGLE_EMAILS=correo1@gmail.com,correo2@upacifico.edu.py` en lugar del dominio. Debe configurarse al menos un dominio o una lista de correos. La opción de dominio valida el atributo administrado `hd` de Google Workspace; no basta con que el texto del correo termine igual.

La variable antigua `VITE_APPS_SCRIPT_WEBHOOK_URL` puede eliminarse después de configurar `APPS_SCRIPT_WEBHOOK_URL`. Las variables con prefijo `VITE_` se incorporan al cliente; el secreto nunca debe usar ese prefijo.

El contrato es deliberadamente estricto:

- sólo acepta los dos PDF esperados;
- busca en cualquier nivel debajo de la raíz una carpeta cuyo nombre sea exactamente `CI-Nombre Completo Apellidos Completos`;
- falla si no encuentra el legajo o si encuentra más de uno;
- exige un ID token real de Google, valida firma, audiencia, emisor y vencimiento contra `VITE_GOOGLE_CLIENT_ID`, y comprueba la cuenta o dominio autorizado;
- devuelve el ID de la carpeta y los dos IDs de archivo antes de que la interfaz muestre éxito.

## Verificación

```bash
npm test
npm run lint
npm run build
```

Para el smoke test real, abra **Ejecuciones** en Apps Script, pulse **Enviar Recibo + Cargo al legajo existente** y compruebe que la ejecución termine correctamente. La carpeta exacta debe contener ambos PDF y el modal debe enlazar a ese legajo.
