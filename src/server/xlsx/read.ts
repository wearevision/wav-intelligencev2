import ExcelJS from 'exceljs'

import type { Cell, SheetInput } from '@/features/participants/roster-import'

/**
 * Lee un .xlsx a una matriz de celdas.
 *
 * Solo lectura y sin interpretar nada: qué significa cada columna lo decide el
 * parser, que es puro y se prueba sin abrir archivos.
 *
 * Corre en el servidor a propósito. Meter un lector de xlsx en el navegador
 * sumaría cientos de kilobytes al bundle para algo que se usa una vez por
 * estudio.
 */
export async function readWorkbook(buffer: ArrayBuffer): Promise<SheetInput[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  return workbook.worksheets.map((sheet) => {
    const rows: Cell[][] = []

    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: Cell[] = []
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(normalize(cell.value)))
      rows.push(cells)
    })

    return { title: sheet.name, rows }
  })
}

/**
 * Aplana los valores de exceljs a algo simple.
 *
 * Las horas llegan como Date y se dejan como Date: el parser las necesita para
 * reconocer las columnas de bloque, y convertirlas a texto acá perdería la
 * distinción entre una hora y un número cualquiera.
 */
function normalize(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object') {
    // Texto con formato, hipervínculos y fórmulas ya calculadas.
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('text' in value) return String(value.text)
    if ('result' in value) return value.result === undefined ? null : String(value.result)
  }
  return String(value)
}
