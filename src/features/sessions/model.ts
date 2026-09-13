import type { StudySession } from './types'

export const MAX_DAYS = 10
export const MAX_BLOCKS_PER_DAY = 6

/**
 * La forma del estudio se deriva de sus sesiones, no de dos columnas (D16).
 *
 * Guardar `days` y `blocks_per_day` duplicaría la verdad: una sesión agregada a
 * mano las volvería mentira sin que nada lo detecte.
 */
export function studyShape(sessions: readonly StudySession[]): {
  days: number
  blocksPerDay: number
} {
  let days = 0
  let blocksPerDay = 0
  for (const s of sessions) {
    if (s.dayNumber !== null) days = Math.max(days, s.dayNumber)
    if (s.blockNumber !== null) blocksPerDay = Math.max(blocksPerDay, s.blockNumber)
  }
  return { days, blocksPerDay }
}

export function isValidShape(days: number, blocksPerDay: number): boolean {
  return (
    Number.isInteger(days) &&
    Number.isInteger(blocksPerDay) &&
    days >= 1 &&
    days <= MAX_DAYS &&
    blocksPerDay >= 1 &&
    blocksPerDay <= MAX_BLOCKS_PER_DAY
  )
}

/** Los códigos que se van a crear, para mostrarlos antes de confirmar. */
export function expectedCodes(days: number, blocksPerDay: number): string[] {
  if (!isValidShape(days, blocksPerDay)) return []
  const codes: string[] = []
  for (let day = 1; day <= days; day++) {
    for (let block = 1; block <= blocksPerDay; block++) {
      codes.push(`d${day}b${block}`)
    }
  }
  return codes
}

export interface GridCell {
  block: number
  session: StudySession | null
}

export interface GridRow {
  day: number
  cells: GridCell[]
}

/** La grilla de días × bloques. Las celdas sin sesión quedan en null. */
export function buildGrid(sessions: readonly StudySession[]): GridRow[] {
  const { days, blocksPerDay } = studyShape(sessions)
  const rows: GridRow[] = []

  for (let day = 1; day <= days; day++) {
    const cells: GridCell[] = []
    for (let block = 1; block <= blocksPerDay; block++) {
      cells.push({
        block,
        session: sessions.find((s) => s.dayNumber === day && s.blockNumber === block) ?? null,
      })
    }
    rows.push({ day, cells })
  }

  return rows
}

/**
 * Sesiones que no caen en ninguna celda por no tener día o bloque.
 *
 * No se descartan en silencio: existen y hay que poder verlas, igual que un
 * archivo mal rotulado (D17).
 */
export function sessionsOutsideGrid(sessions: readonly StudySession[]): StudySession[] {
  return sessions.filter((s) => s.dayNumber === null || s.blockNumber === null)
}

export type MissingPiece = 'schedule' | 'venue' | 'moderator'

export function missingLogistics(session: StudySession): MissingPiece[] {
  const missing: MissingPiece[] = []
  if (!session.scheduledAt) missing.push('schedule')
  if (!session.venue?.trim()) missing.push('venue')
  if (!session.moderatorName?.trim()) missing.push('moderator')
  return missing
}

/** True cuando toda sesión de la grilla tiene fecha, sala y moderador. */
export function logisticsComplete(sessions: readonly StudySession[]): boolean {
  return sessions.length > 0 && sessions.every((s) => missingLogistics(s).length === 0)
}

/**
 * Convierte lo que entrega un input datetime-local a ISO con zona.
 *
 * El input da "2026-11-10T10:00" sin zona. Guardarlo tal cual lo interpretaría
 * como UTC y una sesión de las 10:00 en Chile quedaría corrida varias horas.
 * Eso rompería el emparejamiento de archivos por hora de creación (D17), que es
 * justamente lo que hace útil guardar el horario.
 */
export function localInputToIso(value: string): string | null {
  if (value.trim() === '') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** El inverso: de ISO a lo que el input datetime-local espera, en hora local. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
