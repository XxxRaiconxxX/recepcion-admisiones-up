import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import type { StudentData } from '../types/admission';

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
