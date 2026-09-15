/**
 * Cuándo fue cada bloque, leído de la planilla.
 *
 * La hoja nombra el día («Junio 2») sin año y la columna el horario («09:00»,
 * «13:00PM»). El año sale del inicio de terreno del estudio y la hora es de
 * Chile: guardarla con la zona del navegador de quien sube el archivo es lo que
 * dejó bloques a las 02:00 en la base.
 */

export interface CalendarDate {
  year: number
  month: number
  day: number
}

export interface ClockTime {
  hour: number
  minute: number
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const DAY = /^\d{1,2}$/

export function sheetDate(title: string, year: number): CalendarDate | null {
  const words = fold(title)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const at = words.findIndex((w) => MONTHS[w] !== undefined)
  if (at === -1) return null
  const month = MONTHS[words[at]!]!
  // El día es el número pegado al mes: «Junio 2» o «2 de junio». Cualquier
  // otro número del título («Día 1», «Sala 2») no es la fecha.
  const after = words[at + 1]
  const before = words[at - 1] === 'de' ? words[at - 2] : words[at - 1]
  const dayWord = [after, before].find((w) => w !== undefined && DAY.test(w))
  if (dayWord === undefined) return null

  const day = Number(dayWord)
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return { year, month, day }
}

const TIME = /^\s*(\d{1,2})[:.](\d{2})(?!\d)(?::\d{2})?\s*(?:([ap])\.?\s?m\b)?/i

export function blockTime(label: string): ClockTime | null {
  const match = TIME.exec(label)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  const meridiem = match[3]?.toLowerCase()
  if (meridiem === 'p' && hour < 12) hour += 12
  if (meridiem === 'a' && hour === 12) hour = 0
  return { hour, minute }
}

const CHILE = 'America/Santiago'

/** Minutos que Chile está adelante de UTC en ese instante (negativo). */
function chileOffsetMinutes(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHILE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((asUtc - instant) / 60000)
}

export function chileLocalToUtcIso(date: CalendarDate, time: ClockTime): string {
  const wall = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute)
  // Dos pasadas: el desfase depende del instante, y el instante del desfase.
  // En la hora inexistente del cambio de septiembre no converge; dos pasadas
  // dejan un resultado fijo (23:xx del día anterior).
  let instant = wall - chileOffsetMinutes(wall) * 60000
  instant = wall - chileOffsetMinutes(instant) * 60000
  return new Date(instant).toISOString()
}
