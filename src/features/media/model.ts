import type { Enums } from '@/lib/supabase/database.types'

export type MediaKind = Enums<'media_kind'>

/** Lo mínimo que el emparejador necesita saber de un bloque. */
export interface BlockRef {
  sessionId: string
  code: string | null
  scheduledAt: string | null
}

export interface FileRef {
  filename: string
  /** Fecha de creación o modificación del archivo, si el sistema la entrega. */
  modifiedAt?: Date | null
}

export type MatchReason = 'code' | 'schedule' | 'ambiguous' | 'unmatched'

export interface FileMatch {
  filename: string
  sessionId: string | null
  code: string | null
  kind: MediaKind | null
  micNumber: number | null
  reason: MatchReason
}

// Un bloque de focus group dura unas dos horas. La ventana se abre media hora
// antes —la cámara suele partir antes que la sesión— y se cierra cuatro después.
const WINDOW_BEFORE_MS = 30 * 60_000
const WINDOW_AFTER_MS = 4 * 60 * 60_000

const VIDEO_EXT = new Set(['mp4', 'mov', 'mkv', 'insv', 'avi'])
const AUDIO_EXT = new Set(['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'])

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

/**
 * Busca `d{día}b{bloque}` en el nombre.
 *
 * Exige que no venga pegado a otras letras o dígitos, para no leer un código
 * dentro de algo que no lo es.
 */
export function parseCode(filename: string): { day: number; block: number } | null {
  const match = /(?:^|[^a-z0-9])d(\d{1,2})b(\d{1,2})(?:[^a-z0-9]|$)/i.exec(filename)
  if (!match) return null

  const day = Number(match[1])
  const block = Number(match[2])
  if (day < 1 || block < 1) return null

  return { day, block }
}

/** El número de micrófono, cuando el nombre lo trae: `mic3`, `mic_03`, `MIC-12`. */
export function parseMicNumber(filename: string): number | null {
  const match = /mic[\s_-]*(\d{1,2})/i.exec(filename)
  if (!match) return null
  const n = Number(match[1])
  return n >= 1 ? n : null
}

/**
 * Adivina el tipo por extensión y pistas del nombre.
 *
 * Devuelve null si la extensión no es de audio ni de video. Para audio sin
 * pistas asume mezcla de sala, que es el caso más común de un solo archivo —
 * y siempre queda corregible antes de subir.
 */
export function classifyKind(filename: string): MediaKind | null {
  const lower = filename.toLowerCase()
  const ext = extensionOf(lower)

  if (VIDEO_EXT.has(ext)) {
    const is360 = ext === 'insv' || /360|insta/.test(lower)
    return is360 ? 'video_360' : 'video_dslr'
  }

  if (AUDIO_EXT.has(ext)) {
    if (parseMicNumber(lower) !== null) return 'audio_mic'
    if (/ambient|ambiente|zona|zone/.test(lower)) return 'audio_ambient'
    return 'audio_room'
  }

  return null
}

function blockWindowContains(scheduledAt: string, when: Date): boolean {
  const start = Date.parse(scheduledAt)
  if (Number.isNaN(start)) return false
  const t = when.getTime()
  return t >= start - WINDOW_BEFORE_MS && t <= start + WINDOW_AFTER_MS
}

/**
 * Empareja un archivo con su bloque: primero por código, después por horario.
 *
 * Si el horario calza con más de un bloque, no se elige ninguno: se marca
 * ambiguo para que lo resuelva una persona. Adivinar acá significaría atribuir
 * material al bloque equivocado, que es peor que pedir ayuda.
 */
export function matchFile(file: FileRef, blocks: readonly BlockRef[]): FileMatch {
  const kind = classifyKind(file.filename)
  const micNumber = kind === 'audio_mic' ? parseMicNumber(file.filename) : null

  const parsed = parseCode(file.filename)
  if (parsed) {
    const code = `d${parsed.day}b${parsed.block}`
    const block = blocks.find((b) => b.code === code)
    if (block) {
      return { filename: file.filename, sessionId: block.sessionId, code, kind, micNumber, reason: 'code' }
    }
    // El nombre trae un código que no corresponde a ningún bloque del estudio.
    return { filename: file.filename, sessionId: null, code, kind, micNumber, reason: 'unmatched' }
  }

  if (file.modifiedAt) {
    const inWindow = blocks.filter(
      (b) => b.scheduledAt !== null && blockWindowContains(b.scheduledAt, file.modifiedAt as Date),
    )
    if (inWindow.length === 1) {
      const block = inWindow[0]!
      return {
        filename: file.filename,
        sessionId: block.sessionId,
        code: block.code,
        kind,
        micNumber,
        reason: 'schedule',
      }
    }
    if (inWindow.length > 1) {
      return { filename: file.filename, sessionId: null, code: null, kind, micNumber, reason: 'ambiguous' }
    }
  }

  return { filename: file.filename, sessionId: null, code: null, kind, micNumber, reason: 'unmatched' }
}

export function matchFiles(files: readonly FileRef[], blocks: readonly BlockRef[]): FileMatch[] {
  return files.map((f) => matchFile(f, blocks))
}

/** Los que necesitan que una persona los asigne. Nunca se descartan (D17). */
export function needsAttention(matches: readonly FileMatch[]): FileMatch[] {
  return matches.filter((m) => m.sessionId === null)
}

// ---------------------------------------------------------------------------
// Cobertura: qué tiene cada bloque de lo que debería tener.
// ---------------------------------------------------------------------------

/** Lo mínimo de un archivo ya subido que la cobertura necesita saber. */
export interface StoredMedia {
  sessionId: string
  kind: MediaKind
  micNumber: number | null
}

export interface BlockCoverage {
  hasVideo: boolean
  hasAudio: boolean
  /** Ordenados y sin repetir, para poder leer los huecos de un vistazo. */
  micNumbers: number[]
  count: number
}

const VIDEO_KINDS = new Set<MediaKind>(['video_360', 'video_dslr'])

export function coverageOf(files: readonly StoredMedia[]): BlockCoverage {
  const mics = new Set<number>()
  let hasVideo = false
  let hasAudio = false

  for (const f of files) {
    if (VIDEO_KINDS.has(f.kind)) hasVideo = true
    else hasAudio = true
    if (f.kind === 'audio_mic' && f.micNumber !== null) mics.add(f.micNumber)
  }

  return {
    hasVideo,
    hasAudio,
    micNumbers: [...mics].sort((a, b) => a - b),
    count: files.length,
  }
}

export function coverageByBlock(files: readonly StoredMedia[]): Map<string, BlockCoverage> {
  const grouped = new Map<string, StoredMedia[]>()
  for (const f of files) {
    const list = grouped.get(f.sessionId)
    if (list) list.push(f)
    else grouped.set(f.sessionId, [f])
  }

  const result = new Map<string, BlockCoverage>()
  for (const [sessionId, list] of grouped) result.set(sessionId, coverageOf(list))
  return result
}

/**
 * Los bloques que todavía no tienen audio.
 *
 * El audio es lo que decide si un bloque se puede analizar: el video ilustra,
 * pero la transcripción sale del sonido. Un bloque sin audio es un bloque
 * perdido, y por eso es lo único que se marca como faltante.
 */
export function blocksMissingAudio(
  blocks: readonly BlockRef[],
  files: readonly StoredMedia[],
): BlockRef[] {
  const coverage = coverageByBlock(files)
  return blocks.filter((b) => !coverage.get(b.sessionId)?.hasAudio)
}

/** Tamaño legible. Base 1000 porque es la que usan los sistemas operativos. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return '—'
  if (bytes < 1000) return `${bytes} B`
  const units = ['kB', 'MB', 'GB', 'TB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
