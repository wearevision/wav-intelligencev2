/**
 * Grabaciones cortadas en partes.
 *
 * Los equipos no entregan un archivo por grabación: el Insta360 segmenta el
 * 360 y la grabadora parte el audio al llegar al límite de tamaño, o cuando
 * alguien la detiene entre ejercicios. Acá se reconoce qué partes son de la
 * misma grabación y en qué orden van.
 *
 * El agrupador **propone**; la persona confirma antes de subir. Juntar dos
 * grabaciones distintas bajo un mismo invitado corrompe la atribución de forma
 * invisible, que es la peor clase de error en este sistema.
 */

export type RecorderFamily = 'insta360' | 'zoom' | 'tascam' | 'generic' | 'timestamp'

export interface ParsedName {
  /** Qué grabación. Las partes de una misma grabación comparten esta clave. */
  recordingKey: string
  /** Orden dentro de la grabación, desde 1. */
  partNumber: number
  /** Pista: el micrófono en una grabadora multipista, el lente en el 360. */
  trackNumber: number | null
  family: RecorderFamily
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot <= 0 ? filename : filename.slice(0, dot)
}

/**
 * `VID_20261110_130000_00_001.insv`
 *
 * El `00` es el lente y va dentro de la clave, no fuera: los dos lentes de un
 * mismo segmento son archivos distintos, y meterlos en la misma grabación
 * haría chocar dos partes con el mismo número.
 */
function parseInsta360(name: string): ParsedName | null {
  const m = /^VID_(\d{8})_(\d{6})_(\d{2})_(\d{3,4})$/i.exec(name)
  if (!m) return null
  return {
    recordingKey: `VID_${m[1]}_${m[2]}_${m[3]}`,
    partNumber: Number(m[4]),
    trackNumber: Number(m[3]),
    family: 'insta360',
  }
}

/**
 * `ZOOM0001_Tr3.WAV`
 *
 * En una Zoom el número de arriba es la **toma** y `Tr3` la pista. Dos tomas no
 * se juntan solas: `ZOOM0001` puede ser la mañana y `ZOOM0002` la tarde, y
 * unirlas mezclaría dos bloques. Cada toma es su propia grabación de una parte,
 * y si de verdad fueron un corte del equipo, se unen a mano.
 */
function parseZoom(name: string): ParsedName | null {
  const m = /^ZOOM(\d{4})(?:_Tr(\d{1,2}))?$/i.exec(name)
  if (!m) return null
  return {
    recordingKey: `ZOOM${m[1]}${m[2] ? `_Tr${m[2]}` : ''}`,
    partNumber: 1,
    trackNumber: m[2] ? Number(m[2]) : null,
    family: 'zoom',
  }
}

/** `DR0000_0002.wav` — acá el segundo número sí es la parte. */
function parseTascam(name: string): ParsedName | null {
  const m = /^(DR\d{4})_(\d{4})$/i.exec(name)
  if (!m) return null
  return {
    recordingKey: m[1]!.toUpperCase(),
    partNumber: Number(m[2]),
    trackNumber: null,
    family: 'tascam',
  }
}

/**
 * `loquesea-002.wav`
 *
 * Exige al menos tres dígitos con cero a la izquierda porque los equipos
 * rellenan y las personas no. Sin esa exigencia, `d1b1-mic1` y `d1b1-mic3`
 * quedarían como las partes 1 y 3 de una grabación `d1b1-mic`, mezclando dos
 * micrófonos en uno.
 */
function parseGeneric(name: string): ParsedName | null {
  const m = /^(.*[^\d])[-_](\d{3,4})$/.exec(name)
  if (!m) return null
  const partNumber = Number(m[2])
  if (partNumber < 1) return null
  return { recordingKey: m[1]!, partNumber, trackNumber: null, family: 'generic' }
}

const PARSERS = [parseInsta360, parseZoom, parseTascam, parseGeneric]

/**
 * `2026-06-02-21-17-10.wav` · `20260602_211710.wav` · `2026-06-02 21.17.10.wav`
 *
 * Muchas grabadoras nombran cada corte con **la hora en que empezó**. Eso vale
 * más que la marca del archivo: copiar una carpeta de un disco a otro reescribe
 * la marca y no toca el nombre, así que después de un respaldo el nombre suele
 * ser lo único que todavía dice la verdad.
 *
 * La hora se interpreta local, que es la del reloj de la grabadora.
 */
export function parseTimestampName(filename: string): Date | null {
  const name = stripExtension(filename)
  const m = /(?:^|[^\d])(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})[-_ T]?(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2})(?:[^\d]|$)/.exec(
    name,
  )
  if (!m) return null

  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null

  const date = new Date(year, month - 1, day, hour, minute, second)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Null cuando el nombre no se parece a nada conocido: se agrupa a mano. */
export function parseNativeName(filename: string): ParsedName | null {
  const name = stripExtension(filename)
  for (const parse of PARSERS) {
    const parsed = parse(name)
    if (parsed) return parsed
  }
  return null
}

// ---------------------------------------------------------------------------
// Agrupación y desfases
// ---------------------------------------------------------------------------

export interface PartInput {
  filename: string
  /**
   * Cuándo empezó a grabarse, si el nombre lo dice. Manda sobre `modifiedAt`:
   * copiar una carpeta reescribe la marca del archivo y no toca el nombre.
   */
  startsAt?: Date | null
  /** Marca de tiempo del archivo. En un equipo es cuándo terminó de escribirse. */
  modifiedAt?: Date | null
  durationSeconds?: number | null
}

export interface RecordingPart extends PartInput {
  partNumber: number
  /** Segundos desde el inicio de la primera parte. Null si no se pudo calcular. */
  offsetSeconds: number | null
}

export interface PartGap {
  /** El hueco va después de esta parte. */
  afterPart: number
  seconds: number
}

export interface Recording {
  key: string
  family: RecorderFamily
  trackNumber: number | null
  parts: RecordingPart[]
  /** Pausas reales entre partes: minutos que no quedaron grabados. */
  gaps: PartGap[]
  /**
   * true cuando los desfases se calcularon sumando duraciones porque faltaba
   * el reloj. Se muestra: asumir continuidad en silencio es lo único que no
   * se hace.
   */
  assumedContiguous: boolean
}

/** Un hueco menor que esto es redondeo del reloj del equipo, no una pausa. */
const GAP_TOLERANCE_S = 2

/**
 * Hasta acá un hueco se lee como pausa dentro de la misma grabación; más allá,
 * como dos grabaciones distintas.
 *
 * Una pausa entre ejercicios dura minutos; entre el bloque de la mañana y el de
 * la tarde pasan horas. Veinte minutos parte las dos situaciones con holgura, y
 * de todos modos el hueco se muestra: si el corte quedó mal, se ve.
 */
const MAX_PAUSE_S = 20 * 60

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/**
 * Cuándo empezó una parte, en milisegundos.
 *
 * Si el nombre trae la hora, esa. Si no, la marca del archivo menos lo que
 * dura: esa marca es cuándo **terminó** de escribirse. Restar es lo que permite
 * ver el hueco: cuando alguien detiene la grabación cuatro minutos, el inicio
 * de la parte siguiente queda cuatro minutos más allá del final de la anterior.
 */
export function startOf(part: PartInput): number | null {
  if (isDate(part.startsAt)) return part.startsAt.getTime()
  if (isDate(part.modifiedAt) && typeof part.durationSeconds === 'number') {
    return part.modifiedAt.getTime() - part.durationSeconds * 1000
  }
  return null
}

function hasClockAndDuration(parts: readonly PartInput[]): boolean {
  return parts.every(
    (p) => startOf(p) !== null && typeof p.durationSeconds === 'number' && p.durationSeconds > 0,
  )
}

function startTimes(parts: readonly PartInput[]): number[] {
  return parts.map((p) => startOf(p) as number)
}

export function computeOffsets(parts: readonly PartInput[]): {
  offsets: (number | null)[]
  gaps: PartGap[]
  assumedContiguous: boolean
} {
  if (parts.length === 0) return { offsets: [], gaps: [], assumedContiguous: false }

  if (hasClockAndDuration(parts)) {
    const starts = startTimes(parts)
    const first = starts[0]!
    const gaps: PartGap[] = []

    for (let i = 1; i < parts.length; i++) {
      const expected = starts[i - 1]! + (parts[i - 1]!.durationSeconds as number) * 1000
      const seconds = (starts[i]! - expected) / 1000
      if (seconds > GAP_TOLERANCE_S) gaps.push({ afterPart: i, seconds: Math.round(seconds) })
    }

    return {
      offsets: starts.map((s) => Math.round((s - first) / 1000)),
      gaps,
      assumedContiguous: false,
    }
  }

  // Sin reloj utilizable solo queda encadenar duraciones, que da por sentado
  // que no hubo pausas. Puede ser falso, y por eso se marca.
  if (parts.every((p) => typeof p.durationSeconds === 'number' && p.durationSeconds > 0)) {
    let acc = 0
    const offsets = parts.map((p) => {
      const at = acc
      acc += p.durationSeconds as number
      return at
    })
    return { offsets, gaps: [], assumedContiguous: true }
  }

  return { offsets: parts.map(() => null), gaps: [], assumedContiguous: true }
}

/**
 * Agrupa una tanda de archivos en grabaciones.
 *
 * Lo que no calza con ningún patrón vuelve en `loose`: no se descarta y no se
 * inventa una grabación de un archivo para disimular.
 */
export function groupRecordings(files: readonly PartInput[]): {
  recordings: Recording[]
  loose: PartInput[]
} {
  const buckets = new Map<string, { parsed: ParsedName; file: PartInput }[]>()
  const loose: PartInput[] = []

  // Los nombres con fecha y hora no se agrupan por prefijo —no hay ninguno en
  // común— sino encadenando el final de una parte con el inicio de la
  // siguiente. Eso vale solo para los nombres que no dicen nada más que la
  // hora: cuando el equipo ya declaró la grabación y la parte, esa declaración
  // manda. Los cuatro segmentos de un 360 —dos lentes, dos partes— llevan la
  // misma hora en el nombre, y encadenarlos por reloj los junta a los cuatro
  // mezclando los lentes.
  const unnamed: PartInput[] = []

  for (const file of files) {
    const parsed = parseNativeName(file.filename)
    if (!parsed) {
      unnamed.push(file)
      continue
    }
    const bucket = buckets.get(parsed.recordingKey)
    if (bucket) bucket.push({ parsed, file })
    else buckets.set(parsed.recordingKey, [{ parsed, file }])
  }

  const chained = chainByTime(unnamed)
  const claimed = new Set(chained.flatMap((r) => r.parts.map((p) => p.filename)))
  // Lo que no se encadenó con nadie es un archivo entero, y vuelve: no se
  // descarta y no se inventa una grabación de uno para disimular.
  for (const file of unnamed) if (!claimed.has(file.filename)) loose.push(file)

  const recordings: Recording[] = []

  for (const [key, entries] of buckets) {
    // Una grabación de una sola parte no es una grabación en partes: se trata
    // como archivo suelto para no llenar la interfaz de grupos de uno.
    if (entries.length === 1) {
      loose.push(entries[0]!.file)
      continue
    }

    entries.sort((a, b) => a.parsed.partNumber - b.parsed.partNumber)
    const ordered = entries.map((e) => e.file)
    const { offsets, gaps, assumedContiguous } = computeOffsets(ordered)

    recordings.push({
      key,
      family: entries[0]!.parsed.family,
      trackNumber: entries[0]!.parsed.trackNumber,
      parts: entries.map((e, i) => ({
        ...e.file,
        partNumber: e.parsed.partNumber,
        offsetSeconds: offsets[i] ?? null,
      })),
      gaps,
      assumedContiguous,
    })
  }

  recordings.push(...chained)
  recordings.sort((a, b) => a.key.localeCompare(b.key))
  return { recordings, loose }
}

/**
 * Agrupa los archivos cuyo nombre trae la hora, encadenándolos.
 *
 * Una grabadora que corta cada media hora entrega `…21-18-09`, `…21-48-09`,
 * `…22-18-09`: no comparten prefijo, y solo el reloj dice que son la misma
 * toma. Se encadena mientras el inicio de una parte caiga donde terminó la
 * anterior, o poco después; un salto más grande abre una grabación nueva,
 * porque entre el bloque de la mañana y el de la tarde pasan horas.
 *
 * Sin duración no se puede encadenar nada: no se sabe dónde termina cada parte.
 */
function chainByTime(files: readonly PartInput[]): Recording[] {
  const dated = files
    .map((file) => ({
      file,
      startsAt: file.startsAt ?? parseTimestampName(file.filename),
    }))
    .filter(
      (e): e is { file: PartInput; startsAt: Date } =>
        e.startsAt instanceof Date &&
        !Number.isNaN(e.startsAt.getTime()) &&
        typeof e.file.durationSeconds === 'number' &&
        e.file.durationSeconds > 0,
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  if (dated.length < 2) return []

  const chains: (typeof dated)[] = []
  let current: typeof dated = [dated[0]!]

  for (let i = 1; i < dated.length; i++) {
    const previous = current[current.length - 1]!
    const endOfPrevious =
      previous.startsAt.getTime() + (previous.file.durationSeconds as number) * 1000
    const gap = (dated[i]!.startsAt.getTime() - endOfPrevious) / 1000

    if (gap <= MAX_PAUSE_S) current.push(dated[i]!)
    else {
      chains.push(current)
      current = [dated[i]!]
    }
  }
  chains.push(current)

  return chains
    .filter((chain) => chain.length > 1)
    .map((chain) => {
      const parts = chain.map((e) => ({ ...e.file, startsAt: e.startsAt }))
      const { offsets, gaps, assumedContiguous } = computeOffsets(parts)

      return {
        // La hora de inicio identifica la grabación mejor que cualquier
        // prefijo: es lo que la distingue de la del bloque siguiente.
        key: chain[0]!.file.filename,
        family: 'timestamp' as const,
        trackNumber: null,
        parts: parts.map((part, i) => ({
          ...part,
          partNumber: i + 1,
          offsetSeconds: offsets[i] ?? null,
        })),
        gaps,
        assumedContiguous,
      }
    })
}

/** `4 min` / `1 h 12 min` / `38 s` — para contar un hueco en palabras. */
export function formatGap(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
