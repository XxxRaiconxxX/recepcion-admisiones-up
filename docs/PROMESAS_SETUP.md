# Dashboard de Promesas — configuración y uso

Este módulo centraliza las promesas comerciales que se cargan en un único Google Sheet maestro. Cada asesor trabaja en su propia pestaña y el nombre de esa pestaña se usa como nombre del asesor.

## 1. Estructura obligatoria del Sheet

Las columnas visibles deben conservar este orden:

| Columna | Uso |
|---|---|
| Nombre | Nombre y apellido del lead. Obligatorio. |
| Número | Teléfono. Se guarda como texto para conservar prefijos y ceros. |
| CI | Solo dígitos o vacío. Se guarda como texto. |
| Carrera | Seleccionar del desplegable. Obligatorio. |
| Becado | `Sí` o `No`. |
| Visita | `Sí` o `No`. |
| Asistió | `Sí` o `No`. |
| Inscripto | `Sí` o `No`. |
| Observaciones | Notas libres, referidos, hermanos, mellizos y cualquier aclaración. |
| Fecha de carga | Se completa automáticamente en la primera edición. |

El script agrega y oculta tres columnas técnicas (`_ID`, `_UPDATED_AT`, `_SYNCED_AT`). No deben borrarse, editarse ni mostrarse para reutilizarlas como datos.

### Migración de planillas existentes

- Mover valores como `Lau`, `melli 1`, `melli 2` o cualquier texto libre desde **CI** hacia **Observaciones**.
- Dejar **CI** vacía cuando no exista un documento numérico.
- La sincronización no descarta una fila con CI incorrecta: guarda el texto, marca `ci_valido = false`, registra una advertencia en `_SYNC_LOG` y la muestra en ámbar en el dashboard.
- No escribir manualmente el asesor: se deriva del nombre de la pestaña.

Puede importarse [`plantilla_promesas.csv`](plantilla_promesas.csv) como punto de partida, aunque la función `prepararPestanaActual()` configura encabezados, formatos, desplegables y colores automáticamente.

## 2. Preparar Supabase

1. Crear o elegir un proyecto de Supabase.
2. Ejecutar [`202608190001_promesas.sql`](../supabase/migrations/202608190001_promesas.sql) desde SQL Editor, o vincular Supabase CLI y ejecutar:

```bash
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

3. Generar un secreto aleatorio largo para Google Sheets y configurar/desplegar la Edge Function:

```bash
supabase secrets set SHEETS_SYNC_SECRET=UN_SECRETO_ALEATORIO_DE_32_O_MAS_CARACTERES
supabase functions deploy sync-promesa --no-verify-jwt
```

La Edge Function usa internamente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Nunca coloque la service role en Vercel, Google Sheets ni variables con prefijo `VITE_`.

## 3. Configurar Vercel

Agregar en **Production** y **Preview**:

```text
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon_publishable
```

Después, crear un nuevo despliegue. El frontend solo recibe la clave pública/anon; las escrituras siguen reservadas a la Edge Function.

## 4. Instalar el Apps Script

1. Crear el Sheet maestro con una pestaña por asesor.
2. Abrir **Extensiones → Apps Script**.
3. Copiar [`PromesasSync.gs`](../apps-script/PromesasSync.gs) al proyecto vinculado al Sheet.
4. Abrir **Configuración del proyecto → Propiedades de la secuencia de comandos** y crear:

```text
PROMESAS_EDGE_URL=https://TU_PROJECT_REF.supabase.co/functions/v1/sync-promesa
PROMESAS_SYNC_SECRET=EL_MISMO_SHEETS_SYNC_SECRET
```

5. Desde el selector de funciones del editor, ejecutar primero
   `prepararTodasLasPestanas()` y después `instalarTriggersPromesas()`.
   No ejecutar `configurarSincronizacionPromesas()` desde ese selector: requiere
   parámetros y el editor la invocaría sin ellos.
6. Aceptar los permisos solicitados por Google.

`instalarTriggersPromesas()` crea dos triggers instalables:

- edición: sincroniza las filas afectadas inmediatamente;
- tiempo: reintenta cada cinco minutos las filas cuyo `_SYNCED_AT` sea anterior a `_UPDATED_AT`.

No debe crearse un `onEdit(e)` simple: los triggers simples no tienen la autorización necesaria para enviar datos mediante `UrlFetchApp`.

## 5. Operación diaria

- Cada asesor edita solo su pestaña.
- Para agregar una pestaña nueva, use el nombre completo del asesor y luego ejecute `prepararPestanaActual()` sobre ella.
- Si una fila queda vacía pero conserva su `_ID`, el siguiente evento elimina ese registro de Supabase.
- Si falla una llamada, la fila queda pendiente y el trigger de respaldo vuelve a intentarlo.
- Revisar periódicamente `_SYNC_LOG`; no borrar errores de CI antes de corregir la fila fuente.
- El dashboard se actualiza mediante Supabase Realtime y no necesita recargar la página.

## 6. Verificación inicial

1. Crear una fila de prueba con Nombre, Carrera y estados.
2. Confirmar que `_SYNCED_AT` se complete.
3. Comprobar que la fila aparezca en `public.promesas`.
4. Abrir `/#/promesas` y verificar KPIs, tabla y estado `Realtime conectado`.
5. Editar `Visita` en el Sheet y confirmar que el dashboard cambie sin refrescar.
6. Escribir temporalmente `melli 1` en CI y confirmar la advertencia; luego moverlo a Observaciones y dejar CI vacía.

## Advertencia de privacidad

La versión solicitada no usa login. Por eso, la política `promesas_select_public` permite lectura con la clave pública a cualquier persona que conozca el proyecto o la URL. La tabla contiene teléfonos y cédulas: antes de usar datos reales fuera de una red/equipo controlado, se recomienda agregar autenticación y restringir la política RLS.
