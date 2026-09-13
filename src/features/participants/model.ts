import type { Participant, ParticipantRole } from './types'

export const ROLES: readonly ParticipantRole[] = [
  'participant',
  'moderator',
  'brand_staff',
  'observer',
] as const

/**
 * Los roles cuyas palabras son el dato.
 *
 * El moderador y la gente de la marca también llevan micrófono, pero lo que
 * dicen no es opinión de consumidor: una pregunta del moderador contada como
 * sentimiento del grupo corre el promedio sin que nada lo delate.
 */
export function countsInAnalysis(role: ParticipantRole): boolean {
  return role === 'participant'
}

/** Micrófonos asignados a más de una persona. La base lo rechaza; esto avisa antes. */
export function duplicateMics(people: readonly Participant[]): number[] {
  const seen = new Map<number, number>()
  for (const person of people) {
    if (person.micNumber === null) continue
    seen.set(person.micNumber, (seen.get(person.micNumber) ?? 0) + 1)
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([mic]) => mic)
    .sort((a, b) => a - b)
}

export interface MicCoverage {
  /** Micrófonos que se grabaron y no tienen a nadie asignado. */
  unassignedMics: number[]
  /** Personas con micrófono asignado del que no llegó ninguna grabación. */
  peopleWithoutTrack: Participant[]
}

/**
 * Cruza el listado con lo que de verdad se grabó.
 *
 * Los dos lados del desajuste importan y por razones distintas: una pista sin
 * dueño deja verbatims sin nombre, y una persona sin pista es alguien que habló
 * y no quedó registrado. Se muestran por separado porque se arreglan distinto.
 */
export function micCoverage(
  people: readonly Participant[],
  recordedMics: readonly number[],
): MicCoverage {
  const assigned = new Set(
    people.map((p) => p.micNumber).filter((m): m is number => m !== null),
  )
  const recorded = new Set(recordedMics)

  return {
    unassignedMics: [...recorded].filter((m) => !assigned.has(m)).sort((a, b) => a - b),
    peopleWithoutTrack: people.filter((p) => p.micNumber !== null && !recorded.has(p.micNumber)),
  }
}

export interface RosterSummary {
  total: number
  /** Cuántos cuentan en el análisis. */
  analyzed: number
  withMic: number
}

export function summarize(people: readonly Participant[]): RosterSummary {
  return {
    total: people.length,
    analyzed: people.filter((p) => countsInAnalysis(p.role)).length,
    withMic: people.filter((p) => p.micNumber !== null).length,
  }
}

/** El primer micrófono libre, para no tener que buscarlo a mano al agregar. */
export function nextFreeMic(people: readonly Participant[], max = 99): number | null {
  const used = new Set(people.map((p) => p.micNumber))
  for (let mic = 1; mic <= max; mic++) if (!used.has(mic)) return mic
  return null
}

export interface ParsedRosterLine {
  name: string
  micNumber: number | null
  role: ParticipantRole
}

const ROLE_HINTS: [RegExp, ParticipantRole][] = [
  [/\b(moderador|moderadora|moderator)\b/i, 'moderator'],
  [/\b(marca|cliente|brand)\b/i, 'brand_staff'],
  [/\b(observador|observadora|observer)\b/i, 'observer'],
]

/**
 * Lee un listado pegado desde una planilla.
 *
 * Acepta lo que sale de copiar una columna o dos: `Carolina Reyes, 3`,
 * `3 Carolina Reyes`, o separado por tabulaciones. Un número suelto al
 * principio o al final se lee como micrófono; el resto es el nombre.
 *
 * No adivina más de la cuenta: una línea sin nombre se descarta, y el rol solo
 * cambia si la palabra está escrita.
 */
export function parseRoster(text: string): ParsedRosterLine[] {
  const lines: ParsedRosterLine[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue

    let role: ParticipantRole = 'participant'
    for (const [pattern, value] of ROLE_HINTS) {
      if (pattern.test(line)) {
        role = value
        break
      }
    }

    // Se parte por tabulación, punto y coma o coma; si no hay separador, por
    // el número al principio o al final.
    const cells = line
      .split(/[\t;,]+/)
      .map((c) => c.trim())
      .filter(Boolean)

    let micNumber: number | null = null
    let name: string

    if (cells.length > 1) {
      const numeric = cells.findIndex((c) => /^\d{1,2}$/.test(c))
      if (numeric !== -1) {
        micNumber = Number(cells[numeric])
        name = cells.filter((_, i) => i !== numeric).join(' ')
      } else {
        name = cells.join(' ')
      }
    } else {
      const single = cells[0] ?? ''
      const edge = /^(\d{1,2})[\s.)-]+(.+)$|^(.+?)[\s.)-]+(\d{1,2})$/.exec(single)
      if (edge) {
        micNumber = Number(edge[1] ?? edge[4])
        name = (edge[2] ?? edge[3] ?? '').trim()
      } else {
        name = single
      }
    }

    // Las palabras que solo indicaban el rol no son parte del nombre.
    for (const [pattern] of ROLE_HINTS) name = name.replace(pattern, '').trim()
    name = name.replace(/\s{2,}/g, ' ').replace(/^[\s.)-]+|[\s.)-]+$/g, '')

    // Una línea que es solo un número no nombra a nadie: un micrófono sin
    // dueño no es una persona que agregar.
    if (name === '' || /^\d+$/.test(name)) continue
    if (micNumber !== null && (micNumber < 1 || micNumber > 99)) micNumber = null

    lines.push({ name, micNumber, role })
  }

  return lines
}
