import type { ParticipantRole } from './types'

/**
 * Lectura de la planilla de convocatoria.
 *
 * La forma real, aprendida de una planilla de terreno: una hoja por día, y el
 * bloque **es una columna** —`09:00` y `13:00`— con un `1` que marca en cuál
 * estuvo cada persona. No una fila por bloque.
 *
 * Esto es solo interpretación: recibe una matriz de celdas y no sabe nada de
 * xlsx. Leer el archivo es trabajo del servidor; entender lo que dice se prueba
 * acá sin abrir ninguno.
 */

export type Cell = string | number | Date | null | undefined

export interface SheetInput {
  title: string
  rows: Cell[][]
}

export type Segment = 'client' | 'non_client'

export interface ImportedPerson {
  name: string
  micNumber: number | null
  role: ParticipantRole
  segment: Segment | null
  /** 1 = la primera columna de horario de la hoja. */
  blockNumber: number
}

export interface ImportedDay {
  title: string
  dayNumber: number
  /** Los encabezados de horario, en orden: son los bloques del día. */
  blockLabels: string[]
  /**
   * Todos los encabezados no vacíos de la fila de encabezados, tal como venían.
   * Sirve para responder «¿cómo se llama esa columna en tu planilla?» sin tener
   * que abrirla.
   */
  headers: string[]
  people: ImportedPerson[]
  /** Lo que hubo que decidir y conviene mirar antes de importar. */
  warnings: string[]
  /** Cuántas filas se dejaron fuera por no haber asistido. */
  absent: number
}

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  // Excel guarda «09:00» como una hora, no como texto, y el lector la entrega
  // como Date. Sin esto el encabezado de la mañana no se reconoce como columna
  // de bloque y todo el bloque de la mañana desaparece en silencio.
  if (cell instanceof Date) {
    const hh = String(cell.getUTCHours()).padStart(2, '0')
    const mm = String(cell.getUTCMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  return String(cell).trim()
}

/** Sin tildes y en minúsculas, para comparar encabezados escritos a mano. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const ROLE_BY_LABEL: [RegExp, ParticipantRole][] = [
  [/moderador/, 'moderator'],
  [/marca|brand/, 'brand_staff'],
  [/observador/, 'observer'],
  [/entrevistad/, 'participant'],
]

export function roleFromLabel(label: string): ParticipantRole {
  const folded = fold(label)
  for (const [pattern, role] of ROLE_BY_LABEL) if (pattern.test(folded)) return role
  return 'participant'
}

/**
 * `CLIENTE` / `NO` para los invitados; `WAV` y `MG` marcan a la agencia y a la
 * marca, que no tienen segmento.
 */
const NO_SEGMENT = new Set(['wav', 'mg', ''])

export function segmentFromLabel(label: string): Segment | null {
  const folded = fold(label)
  if (NO_SEGMENT.has(folded)) return null
  if (folded.startsWith('no')) return 'non_client'
  if (folded.startsWith('cliente')) return 'client'
  return null
}

/**
 * `NO ASISTIÓ` contiene `ASISTIÓ`, así que el orden de las comprobaciones no es
 * un detalle: al revés, todo el mundo habría asistido.
 */
export function attendedFromLabel(label: string): boolean {
  const folded = fold(label)
  if (folded === '') return true
  if (/\bno\s*asisti/.test(folded)) return false
  return /asisti/.test(folded)
}

export interface MicReading {
  /** Micrófono por número de bloque. Vacío significa que no se pudo leer. */
  byBlock: Map<number, number>
  note: string | null
}

/**
 * Lee la celda del micrófono.
 *
 * Tres formas reales: un número; `MIC03 am / MIC06 pm` cuando alguien está en
 * los dos bloques con equipo distinto; y una nota escrita a mano contando que
 * el micrófono cambió de dueño a mitad de sesión.
 *
 * La nota **no** se interpreta. Sacarle el número a "mic 17 al principio, luego
 * lo cambiamos" le daría ese micrófono a dos personas del mismo bloque, y la
 * atribución quedaría cruzada sin que nada lo delate. Se devuelve la nota para
 * mostrarla y la persona entra sin micrófono.
 */
export function readMic(cell: Cell, blockCount: number): MicReading {
  const byBlock = new Map<number, number>()

  if (typeof cell === 'number' && Number.isInteger(cell) && cell >= 1 && cell <= 99) {
    for (let block = 1; block <= blockCount; block++) byBlock.set(block, cell)
    return { byBlock, note: null }
  }

  const raw = text(cell)
  if (raw === '') return { byBlock, note: null }

  if (/^\d{1,2}$/.test(raw)) {
    const mic = Number(raw)
    for (let block = 1; block <= blockCount; block++) byBlock.set(block, mic)
    return { byBlock, note: null }
  }

  // `MIC03 am / MIC06 pm` — un micrófono por bloque, en orden.
  const perBlock = [...raw.matchAll(/mic\s*(\d{1,2})\s*(am|pm)/gi)]
  if (perBlock.length > 0 && perBlock.length <= blockCount) {
    for (const match of perBlock) {
      const block = match[2]!.toLowerCase() === 'am' ? 1 : 2
      byBlock.set(block, Number(match[1]))
    }
    return { byBlock, note: null }
  }

  return { byBlock, note: raw }
}

interface Columns {
  name: number
  mic: number | null
  role: number | null
  segment: number | null
  attendance: number | null
  blocks: { label: string; index: number }[]
}

/**
 * Las tres columnas cuya ausencia hay que decir en voz alta.
 *
 * El caso real: seis bloques importados y el segmento vacío en las ochenta
 * personas. La planilla lo traía; el encabezado se llamaba distinto y el
 * buscador no lo reconoció. Nadie avisó, porque «no encontré la columna» y
 * «la columna estaba vacía» producían el mismo resultado en pantalla.
 *
 * De las cuatro cosas que entran de la planilla —nombre, micrófono, rol y
 * segmento— el nombre ya se reporta al no encontrar el encabezado. Estas tres
 * faltaban en silencio.
 */
const NAMED_COLUMNS: { key: 'mic' | 'role' | 'segment'; what: string; looksLike: string }[] = [
  { key: 'mic', what: 'micrófono', looksLike: 'micrófono' },
  { key: 'role', what: 'rol', looksLike: 'rol' },
  { key: 'segment', what: 'segmento', looksLike: 'cliente / no cliente' },
]

const TIME = /^\d{1,2}[:.]\d{2}/

function locateColumns(header: Cell[]): Columns | null {
  const name = header.findIndex((c) => fold(text(c)) === 'nombre')
  if (name === -1) return null

  const find = (test: (folded: string) => boolean) => {
    const at = header.findIndex((c) => test(fold(text(c))))
    return at === -1 ? null : at
  }

  return {
    name,
    // El encabezado cambia entre hojas de la misma planilla: "N° Micrófono" en
    // una, "Micrófono" en otra.
    mic: find((f) => f.includes('micr')),
    role: find((f) => f === 'rol'),
    segment: find((f) => f.includes('cliente')),
    attendance: find((f) => f.includes('observ')),
    blocks: header
      .map((c, index) => ({ label: text(c), index }))
      .filter(({ label }) => TIME.test(label)),
  }
}

/** Una hoja por día; las columnas de horario, sus bloques. */
export function parseRosterWorkbook(sheets: readonly SheetInput[]): ImportedDay[] {
  return sheets.map((sheet, sheetIndex) => parseSheet(sheet, sheetIndex + 1))
}

function parseSheet(sheet: SheetInput, dayNumber: number): ImportedDay {
  const warnings: string[] = []
  const headerIndex = sheet.rows.findIndex(
    (row) => locateColumns(row) !== null && locateColumns(row)!.blocks.length > 0,
  )

  if (headerIndex === -1) {
    return {
      title: sheet.title,
      dayNumber,
      blockLabels: [],
      headers: [],
      people: [],
      warnings: ['No se encontró la fila de encabezados con «Nombre» y las horas.'],
      absent: 0,
    }
  }

  const columns = locateColumns(sheet.rows[headerIndex]!)!
  const blockLabels = columns.blocks.map((b) => b.label)
  const headers = sheet.rows[headerIndex]!.map(text).filter((h) => h !== '')

  for (const { key, what, looksLike } of NAMED_COLUMNS) {
    if (columns[key] !== null) continue
    warnings.push(
      `No se encontró la columna de ${what} (se busca un encabezado que diga «${looksLike}»). ` +
        `Los encabezados de esta hoja son: ${headers.join(' · ')}.`,
    )
  }

  const people: ImportedPerson[] = []
  // Un micrófono por persona dentro de un bloque; el segundo se deja sin
  // asignar en vez de dejar que la base rechace la importación entera.
  const takenByBlock = new Map<number, Set<number>>()
  let absent = 0

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    const name = text(row[columns.name])
    if (name === '') continue

    if (columns.attendance !== null && !attendedFromLabel(text(row[columns.attendance]))) {
      absent++
      continue
    }

    const blocks = columns.blocks
      .map((block, i) => ({ number: i + 1, marked: text(row[block.index]) !== '' }))
      .filter((b) => b.marked)
      .map((b) => b.number)

    if (blocks.length === 0) {
      warnings.push(`${name} asistió pero no tiene bloque marcado.`)
      continue
    }

    const role = columns.role === null ? 'participant' : roleFromLabel(text(row[columns.role]))
    let segment: Segment | null = null
    if (role === 'participant' && columns.segment !== null) {
      const raw = text(row[columns.segment])
      segment = segmentFromLabel(raw)
      // `WAV` y `MG` son ausencias por diseño; cualquier otra cosa escrita que
      // no se entienda es un dato que se estaba perdiendo sin decirlo.
      if (segment === null && !NO_SEGMENT.has(fold(raw))) {
        warnings.push(`${name}: no se entendió el segmento («${raw}»). Entra sin segmento.`)
      }
    }
    const mic =
      columns.mic === null
        ? { byBlock: new Map(), note: null }
        : readMic(row[columns.mic], blockLabels.length)

    if (mic.note !== null) {
      warnings.push(`${name}: no se pudo leer el micrófono («${mic.note}»). Entra sin asignar.`)
    }

    for (const blockNumber of blocks) {
      let micNumber = mic.byBlock.get(blockNumber) ?? null
      const taken = takenByBlock.get(blockNumber) ?? new Set<number>()

      if (micNumber !== null && taken.has(micNumber)) {
        warnings.push(
          `El micrófono ${micNumber} del bloque ${blockNumber} ya estaba tomado; ${name} entra sin asignar.`,
        )
        micNumber = null
      }
      if (micNumber !== null) taken.add(micNumber)
      takenByBlock.set(blockNumber, taken)

      people.push({ name, micNumber, role, segment, blockNumber })
    }
  }

  return { title: sheet.title, dayNumber, blockLabels, headers, people, warnings, absent }
}
