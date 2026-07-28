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
   - Simulador visual de subida de archivos PDF con barra de progreso.

5. **Generación y Exportación**:
   - Impresión nativa en A4 sin descuadre de márgenes.
   - Exportación directa a **Microsoft Word (.docx)** para el Cargo de Entrega.

---

## 🛠️ Tecnologías Utilizadas

- **Framework**: [Next.js](https://nextjs.org/) / [React 18](https://react.dev/) + TypeScript
- **Estilos**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Iconos**: [Lucide React](https://lucide.dev/)
- **Exportación Word**: `docx` + `file-saver`
- **Integración Cloud**: Google Drive REST API v3

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
