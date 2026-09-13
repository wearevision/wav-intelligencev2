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

export type RecorderFamily = 'insta360' | 'zoom' | 'tascam' | 'generic'

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

function hasClockAndDuration(parts: readonly PartInput[]): boolean {
  return parts.every(
    (p) =>
      p.modifiedAt instanceof Date &&
      !Number.isNaN(p.modifiedAt.getTime()) &&
      typeof p.durationSeconds === 'number' &&
      p.durationSeconds > 0,
  )
}

/**
 * Cuándo empezó cada parte.
 *
 * La marca del archivo es cuándo **terminó** de escribirse, así que el inicio
 * es esa marca menos lo que dura. Restar es lo que permite ver el hueco: si
 * alguien detuvo la grabación cuatro minutos, el inicio de la parte siguiente
 * queda cuatro minutos más allá de donde terminó la anterior.
 */
function startTimes(parts: readonly PartInput[]): number[] {
  return parts.map((p) => (p.modifiedAt as Date).getTime() - (p.durationSeconds as number) * 1000)
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

  for (const file of files) {
    const parsed = parseNativeName(file.filename)
    if (!parsed) {
      loose.push(file)
      continue
    }
    const bucket = buckets.get(parsed.recordingKey)
    if (bucket) bucket.push({ parsed, file })
    else buckets.set(parsed.recordingKey, [{ parsed, file }])
  }

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

  recordings.sort((a, b) => a.key.localeCompare(b.key))
  return { recordings, loose }
}

/** `4 min` / `1 h 12 min` / `38 s` — para contar un hueco en palabras. */
export function formatGap(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
