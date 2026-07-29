import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, BorderStyle } from 'docx';
import saveAs from 'file-saver';
import type { StudentData } from '../types/admission';

export const hasVisiblePdfPixels = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) => {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return false;

  const minX = Math.floor(width * 0.05);
  const maxX = Math.ceil(width * 0.95);
  const minY = Math.floor(height * 0.05);
  const maxY = Math.ceil(height * 0.95);
  let visiblePixels = 0;

  for (let y = minY; y < maxY; y += 2) {
    for (let x = minX; x < maxX; x += 2) {
      const offset = (y * width + x) * 4;
      if (
        pixels[offset + 3] > 0 &&
        (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245)
      ) {
        visiblePixels += 1;
        if (visiblePixels >= 200) return true;
      }
    }
  }

  return false;
};

export class DocumentExporter {
  /**
   * Dispara el cuadro de diálogo de impresión nativo del navegador para encuadre A4 perfecto
   */
  public static printElement(elementId: string) {
    const elem = document.getElementById(elementId);
    if (!elem) {
      alert('No se encontró el elemento para imprimir');
      return;
    }

    const printWindow = window.open('', '_blank', 'height=800,width=1000');
    if (!printWindow) {
      window.print();
      return;
    }

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((s) => s.outerHTML)
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imprimir Comprobante</title>
          ${styles}
          <style>
            body { background: white !important; padding: 15mm !important; margin: 0 !important; }
            @page { size: A4 portrait; margin: 10mm; }
          </style>
        </head>
        <body>
          ${elem.innerHTML}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Genera un PDF en memoria para enviarlo a Drive sin descargarlo.
   */
  public static async generatePdfBlob(elementId: string): Promise<Blob> {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error('No se encontró el comprobante para generar el PDF.');
    }

    const { default: html2pdf } = await import('html2pdf.js');
    let pdf: Blob;
    const previousBodyZoom = document.body.style.getPropertyValue('zoom');

    try {
      // html2pdf monta su lienzo dentro de body; el zoom global de la UI
      // altera las dimensiones A4, por eso se neutraliza durante la captura.
      document.body.style.setProperty('zoom', '1');
      await document.fonts.ready;

      const worker = html2pdf()
        .set({
          margin: 0,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .toCanvas();
      const canvas = (await worker.get('canvas')) as HTMLCanvasElement;
      const context = canvas.getContext('2d', { willReadFrequently: true });

      if (
        !context ||
        !hasVisiblePdfPixels(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        )
      ) {
        throw new Error('El comprobante se generó en blanco y no se enviará a Google Drive.');
      }

      pdf = await worker.toPdf().outputPdf('blob');
    } finally {
      if (previousBodyZoom) {
        document.body.style.setProperty('zoom', previousBodyZoom);
      } else {
        document.body.style.removeProperty('zoom');
      }
      document.querySelectorAll('.html2pdf__overlay').forEach((overlay) => overlay.remove());
    }

    if (!(pdf instanceof Blob) || pdf.size === 0) {
      throw new Error('Google Drive recibió un PDF vacío.');
    }

    return pdf;
  }

  /**
   * Genera y descarga el archivo Microsoft Word (.docx) editable del Cargo de Entrega (Matching Imagen 2)
   */
  public static async generateCargoWordDocx(student: StudentData, documentosStr: string) {
    const fileName = `Cargo_${student.ci}-${student.nombres} ${student.apellidos}.docx`;

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `${student.numeroCargo || 'N° / 2026 Promoción'}`,
                  bold: true,
                  size: 22,
                }),
              ],
            }),

            new Paragraph({ text: '', spacing: { after: 200 } }),

            // Titulo "Cargo de Entrega"
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'Cargo de Entrega',
                  bold: true,
                  size: 28,
                  font: 'Arial',
                }),
              ],
            }),

            new Paragraph({ text: '', spacing: { after: 200 } }),

            // Metadatos Encabezado (Para, De, Referencia, Fecha)
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE },
                insideVertical: { style: BorderStyle.NONE },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({ children: [new TextRun({ text: 'Para:', bold: true }), new TextRun(` ${student.nombreRecepcionista || 'Felipa Silva'}`)] }),
                        new Paragraph({ children: [new TextRun({ text: 'De:', bold: true }), new TextRun(` ${student.nombreAsesor || 'Axel Fretes'}`)] }),
                        new Paragraph({ children: [new TextRun({ text: 'Referencia:', bold: true }), new TextRun(' Entrega de Documentos y contratos de estudiantes')] }),
                        new Paragraph({ children: [new TextRun({ text: 'Fecha:', bold: true }), new TextRun(` ${student.fecha || new Date().toLocaleDateString('es-PY')}`)] }),
                      ],
                    }),
                  ],
                }),
              ],
            }),

            new Paragraph({ text: '', spacing: { after: 300 } }),

            // Tabla de Entregas (Matching Imagen 2)
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Nombres y Apellidos', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'CARRERA', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Documentos', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Observación', bold: true })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ text: `${student.nombres.toUpperCase()} ${student.apellidos.toUpperCase()}` })] }),
                    new TableCell({ children: [new Paragraph({ text: student.carrera.toUpperCase() })] }),
                    new TableCell({ children: [new Paragraph({ text: documentosStr })] }),
                    new TableCell({ children: [new Paragraph({ text: student.observaciones || 'JULIO 2026' })] }),
                  ],
                }),
              ],
            }),

            new Paragraph({ text: '', spacing: { after: 600 } }),

            new Paragraph({
              children: [new TextRun({ text: 'Sin otro particular, me despido muy atentamente.', italics: true })],
            }),

            new Paragraph({ text: '', spacing: { after: 800 } }),

            // Bloque de Firmas
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE },
                insideVertical: { style: BorderStyle.NONE },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({ text: '_______________________________' }),
                        new Paragraph({ children: [new TextRun({ text: `${student.nombreAsesor.toUpperCase()}`, bold: true })] }),
                        new Paragraph({ text: 'Asesor Grado Promoción' }),
                      ],
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({ text: '_______________________________' }),
                        new Paragraph({ children: [new TextRun({ text: 'Recibido por:', bold: true })] }),
                        new Paragraph({ text: 'Firma de quien recepciona / Fecha' }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, fileName);
  }
}
