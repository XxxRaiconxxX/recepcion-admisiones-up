import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, BorderStyle } from 'docx';
import saveAs from 'file-saver';
import type { StudentData } from '../types/admission';
import type { BatchCargoData } from '../types/batchCargo';

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
          <title>Imprimir Cargo de Entrega</title>
          ${styles}
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 10mm 10mm 10mm;
            }
            *, *:before, *:after {
              box-sizing: border-box !important;
            }
            html, body {
              background: white !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              font-family: Arial, sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #print-batch-cargo-content {
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .batch-cargo-a4-page {
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              box-sizing: border-box !important;
              width: 100% !important;
              max-width: 100% !important;
              min-height: 275mm !important;
              height: auto !important;
              padding: 0 !important;
              margin: 0 0 10mm 0 !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              border: none !important;
              box-shadow: none !important;
            }
            .batch-cargo-a4-page:last-child,
            .batch-cargo-a4-page:last-of-type {
              page-break-after: auto !important;
              break-after: auto !important;
              margin-bottom: 0 !important;
            }
          </style>
        </head>
        <body>
          ${elem.innerHTML}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 400);
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
   * Genera y descarga el archivo Microsoft Word (.docx) editable del Cargo de Entrega Individual
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

            // Tabla de Entregas
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
                    new TableCell({
                      children: [
                        new Paragraph({ text: `${student.nombres.toUpperCase()} ${student.apellidos.toUpperCase()}` }),
                        ...(student.ci
                          ? [
                              new Paragraph({
                                children: [
                                  new TextRun({
                                    text: `C.I. N°: ${student.ci}`,
                                    size: 18,
                                    color: '555555',
                                  }),
                                ],
                              }),
                            ]
                          : []),
                      ],
                    }),
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

  /**
   * Genera y descarga el archivo Microsoft Word (.docx) del Cargo de Entrega Masivo (30+ alumnos)
   * Incluye Nombres y Apellidos junto con C.I. N° de cada estudiante.
   */
  public static async generateBatchCargoWordDocx(batchData: BatchCargoData) {
    const cleanDate = batchData.header.fecha.replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `Cargo_Entrega_Masivo_${cleanDate}.docx`;

    // Filas de la tabla de estudiantes
    const tableRows = [
      // Fila de encabezado
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Nombres y Apellidos', bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'CARRERA', bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Documentos', bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Observación', bold: true })] })],
          }),
        ],
      }),
      // Filas para cada estudiante
      ...batchData.students.map((student) => {
        // Generar párrafos para cada documento entregado
        const docParagraphs = student.documentos.length > 0
          ? student.documentos.map((doc) => new Paragraph({ text: `-   ${doc.toUpperCase()}` }))
          : [new Paragraph({ text: `-   CONTRATO ${student.carrera.toUpperCase()}` })];

        const nameCellChildren = [
          new Paragraph({ text: student.nombresApellidos.toUpperCase() })
        ];

        if (student.ci) {
          nameCellChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `C.I. N°: ${student.ci}`,
                  size: 18,
                  color: '555555',
                }),
              ],
            })
          );
        }

        return new TableRow({
          children: [
            new TableCell({
              children: nameCellChildren,
            }),
            new TableCell({
              children: [new Paragraph({ text: student.carrera.toUpperCase() })],
            }),
            new TableCell({
              children: docParagraphs,
            }),
            new TableCell({
              children: [new Paragraph({ text: student.observacion || batchData.header.observacionGlobal || 'JULIO 2026' })],
            }),
          ],
        });
      }),
    ];

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `${batchData.header.numeroCargo || 'N° / 2026 Promoción'}`,
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
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'Para:            ', bold: true }),
                            new TextRun({ text: `${batchData.header.para} `, bold: true }),
                            new TextRun({ text: `(${batchData.header.paraCargo || 'Archivo'})`, italics: true }),
                          ],
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'De:                ', bold: true }),
                            new TextRun({ text: `${batchData.header.de} `, bold: true }),
                            new TextRun({ text: `(${batchData.header.deCargo || 'Promoción/ Grado'})`, italics: true }),
                          ],
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'Referencia:  ', bold: true }),
                            new TextRun({ text: ` ${batchData.header.referencia}` }),
                          ],
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'Fecha:          ', bold: true }),
                            new TextRun({ text: ` ${batchData.header.fecha}` }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),

            new Paragraph({ text: '', spacing: { after: 300 } }),

            // Tabla Completa de Entregas (Multi-fila)
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
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
                        new Paragraph({ children: [new TextRun({ text: `${batchData.header.de.toUpperCase()}`, bold: true })] }),
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
