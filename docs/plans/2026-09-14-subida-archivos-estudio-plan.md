# Plan de implementación · Archivos del estudio y convocatoria (A + B)

> **Para agentes:** usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans, tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Objetivo:** Una zona «Archivos del estudio» que reconoce la convocatoria, la pauta y las respuestas del formulario; interpreta la convocatoria, muestra el plan (bloques a crear/corregir, personas a agregar/actualizar/borrar) y lo aplica en una transacción.

**Arquitectura:** Un feature nuevo `src/features/intake/` con lógica pura probada (`schedule`, `detect`, `roster-sync`), acciones de servidor que leen el archivo, recalculan el plan y comparan su huella, y una función de Postgres `apply_roster_sync` que escribe todo o nada. Reusa el parser existente de `participants` y el adjunto de etapa de `studies`, siempre por su puerta pública.

**Stack:** Next.js 16 (server actions) · React 19 · Supabase (Postgres + RLS) · exceljs · Vitest

**Spec:** [2026-09-14-subida-archivos-estudio.md](2026-09-14-subida-archivos-estudio.md) · D26 en `ARCHITECTURE.md`.
**Rama:** `claude/f0-foundation`. Antes de cada commit: `npm run typecheck && npm test` (el typecheck incluye la copia suelta `wav-ingest/` sin trackear; si falla solo por `wav-ingest/vite.config.ts`, correr `npx tsc --noEmit -p tsconfig.json` excluyéndola no es necesario: basta verificar que ningún error venga de `src/` o `tests/`).

---

## Mapa de archivos

| Archivo | Cambio | Responsabilidad |
|---|---|---|
| `src/features/intake/schedule.ts` | crear | fecha de la hoja, hora del bloque, hora de Chile → ISO UTC |
| `src/features/intake/detect.ts` | crear | tipo de archivo por contenido |
| `src/features/intake/roster-sync.ts` | crear | plan de sincronización + huella + payload del RPC |
| `src/features/intake/copy.ts`, `index.ts`, `server.ts` | crear | textos; puerta client-safe; puerta de servidor |
| `src/features/intake/actions.ts` | crear | `previewStudyFiles`, `applyStudyFiles` |
| `src/features/intake/components/study-files-section.tsx` | crear | subida, vista previa, confirmar |
| `supabase/migrations/20260914100000_apply_roster_sync.sql` | crear | RPC transaccional |
| `src/lib/supabase/database.types.ts` | regenerar | tipo del RPC |
| `src/features/studies/components/study-detail-view.tsx` | modificar | montar la sección siempre |
| `src/features/participants/components/participants-section.tsx`, `actions.ts`, `server.ts`, `copy.ts` | modificar | quitar la importación vieja |
| `tests/unit/features/intake/*.test.ts` | crear | tests de lo puro y de las acciones |

---

### Tarea 1: Fecha de la hoja, hora del bloque y hora de Chile

**Archivos:** crear `src/features/intake/schedule.ts`, `tests/unit/features/intake/schedule.test.ts`

- [ ] **Paso 1: tests que fallan** — `tests/unit/features/intake/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { blockTime, chileLocalToUtcIso, sheetDate } from '@/features/intake/schedule'

describe('sheetDate', () => {
  it('lee «Junio 2» con el año del terreno', () => {
    expect(sheetDate('Junio 2', 2026)).toEqual({ year: 2026, month: 6, day: 2 })
  })

  it('acepta el día antes del mes, con «de» y con día de la semana', () => {
    expect(sheetDate('2 de junio', 2026)).toEqual({ year: 2026, month: 6, day: 2 })
    expect(sheetDate('Martes 3 Junio', 2026)).toEqual({ year: 2026, month: 6, day: 3 })
    expect(sheetDate('SETIEMBRE 10', 2026)).toEqual({ year: 2026, month: 9, day: 10 })
  })

  it('devuelve null cuando la hoja no nombra una fecha válida', () => {
    expect(sheetDate('Hoja1', 2026)).toBeNull()
    expect(sheetDate('Junio 31', 2026)).toBeNull()
  })
})

describe('blockTime', () => {
  it('lee la hora que Excel entrega como texto «09:00»', () => {
    expect(blockTime('09:00')).toEqual({ hour: 9, minute: 0 })
  })

  it('suma doce horas a una hora PM con o sin espacio', () => {
    expect(blockTime('13:00PM')).toEqual({ hour: 13, minute: 0 })
    expect(blockTime('1:30 PM')).toEqual({ hour: 13, minute: 30 })
    expect(blockTime('12:00 am')).toEqual({ hour: 0, minute: 0 })
  })

  it('devuelve null cuando no hay hora', () => {
    expect(blockTime('Mañana')).toBeNull()
    expect(blockTime('25:00')).toBeNull()
  })
})

describe('chileLocalToUtcIso', () => {
  it('convierte una hora de invierno (UTC-4)', () => {
    expect(chileLocalToUtcIso({ year: 2026, month: 6, day: 2 }, { hour: 9, minute: 0 })).toBe(
      '2026-06-02T13:00:00.000Z',
    )
  })

  it('convierte una hora de verano (UTC-3)', () => {
    expect(chileLocalToUtcIso({ year: 2026, month: 1, day: 15 }, { hour: 9, minute: 0 })).toBe(
      '2026-01-15T12:00:00.000Z',
    )
  })
})
```

- [ ] **Paso 2:** `npx vitest run tests/unit/features/intake/schedule.test.ts` → FALLA (módulo inexistente).

- [ ] **Paso 3: implementación** — `src/features/intake/schedule.ts`:

```ts
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
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function sheetDate(title: string, year: number): CalendarDate | null {
  const words = fold(title).split(/[^a-z0-9]+/).filter(Boolean)
  const month = words.map((w) => MONTHS[w]).find((m) => m !== undefined)
  const dayWord = words.find((w) => /^\d{1,2}$/.test(w))
  if (month === undefined || dayWord === undefined) return null

  const day = Number(dayWord)
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return { year, month, day }
}

export function blockTime(label: string): ClockTime | null {
  const match = /^\s*(\d{1,2})[:.](\d{2})/.exec(label)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  if (/pm/i.test(label) && hour < 12) hour += 12
  if (/am/i.test(label) && hour === 12) hour = 0
  return { hour, minute }
}

const CHILE = 'America/Santiago'

/** Minutos que Chile está adelante de UTC en ese instante (negativo). */
function chileOffsetMinutes(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHILE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant) / 60000)
}

export function chileLocalToUtcIso(date: CalendarDate, time: ClockTime): string {
  const wall = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute)
  // Dos pasadas: el desfase depende del instante, y el instante del desfase.
  let instant = wall - chileOffsetMinutes(wall) * 60000
  instant = wall - chileOffsetMinutes(instant) * 60000
  return new Date(instant).toISOString()
}
```

- [ ] **Paso 4:** mismo comando → PASA (9 tests). `npx tsc --noEmit` sin errores en `src/`/`tests/`.
- [ ] **Paso 5: commit**

```bash
git add src/features/intake/schedule.ts tests/unit/features/intake/schedule.test.ts
git commit -m "feat: fecha de la hoja y hora del bloque en hora de Chile"
```

---

### Tarea 2: Reconocer el tipo de archivo

**Archivos:** crear `src/features/intake/detect.ts`, `tests/unit/features/intake/detect.test.ts`

- [ ] **Paso 1: tests que fallan**:

```ts
import { describe, expect, it } from 'vitest'

import { detectStudyFile } from '@/features/intake/detect'
import type { SheetInput } from '@/features/participants'

const convocatoria: SheetInput = {
  title: 'Junio 2',
  rows: [[], [null, 'RUT', 'Nombre', 'N° Micrófono', '09:00', '13:00PM', 'ROL']],
}

const formulario: SheetInput = {
  title: 'Respuestas de formulario 1',
  rows: [['Marca temporal', '¿Qué fue lo primero que te llamó la atención?']],
}

describe('detectStudyFile', () => {
  it('reconoce la convocatoria por «Nombre» y las columnas de horario', () => {
    expect(detectStudyFile({ kind: 'xlsx', sheets: [convocatoria] })).toBe('roster')
  })

  it('reconoce las respuestas por «Marca temporal» en la primera celda', () => {
    expect(detectStudyFile({ kind: 'xlsx', sheets: [formulario] })).toBe('survey')
  })

  it('reconoce la pauta como documento de Word', () => {
    expect(detectStudyFile({ kind: 'docx' })).toBe('guide')
  })

  it('da desconocido para una planilla sin ninguna de las dos formas', () => {
    expect(detectStudyFile({ kind: 'xlsx', sheets: [{ title: 'Hoja1', rows: [['a', 'b']] }] })).toBe('unknown')
    expect(detectStudyFile({ kind: 'unknown' })).toBe('unknown')
  })

  it('prefiere la convocatoria si una planilla trae las dos formas', () => {
    expect(detectStudyFile({ kind: 'xlsx', sheets: [formulario, convocatoria] })).toBe('roster')
  })
})
```

- [ ] **Paso 2:** `npx vitest run tests/unit/features/intake/detect.test.ts` → FALLA.

- [ ] **Paso 3: implementación** — `src/features/intake/detect.ts`:

```ts
import { parseRosterWorkbook, type SheetInput } from '@/features/participants'

/**
 * Qué es un archivo del estudio, por lo que trae adentro.
 *
 * El nombre no sirve: «Agenda Horarios.xlsx» es la convocatoria y el próximo
 * estudio le va a poner otro. Leer el archivo es trabajo del servidor; esto
 * recibe lo ya leído y se prueba sin abrir ninguno.
 */

export type StudyFileKind = 'roster' | 'survey' | 'guide' | 'unknown'

export type StudyFileContent =
  | { kind: 'xlsx'; sheets: readonly SheetInput[] }
  | { kind: 'docx' }
  | { kind: 'unknown' }

function firstCell(sheet: SheetInput): string {
  const row = sheet.rows.find((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
  const cell = row?.find((c) => c !== null && c !== undefined && String(c).trim() !== '')
  return cell === undefined ? '' : String(cell).trim().toLowerCase()
}

export function detectStudyFile(content: StudyFileContent): StudyFileKind {
  if (content.kind === 'docx') return 'guide'
  if (content.kind === 'unknown') return 'unknown'

  // El parser ya sabe encontrar «Nombre» y los horarios; un día con bloques
  // es la firma de la convocatoria.
  if (parseRosterWorkbook(content.sheets).some((day) => day.blockLabels.length > 0)) return 'roster'
  if (content.sheets.some((sheet) => firstCell(sheet) === 'marca temporal')) return 'survey'
  return 'unknown'
}
```

- [ ] **Paso 4:** PASA (5 tests).
- [ ] **Paso 5: commit**

```bash
git add src/features/intake/detect.ts tests/unit/features/intake/detect.test.ts
git commit -m "feat: reconocer convocatoria, pauta y respuestas por su contenido"
```

---

### Tarea 3: Plan de sincronización de la convocatoria

**Archivos:** crear `src/features/intake/roster-sync.ts`, `tests/unit/features/intake/roster-sync.test.ts`

- [ ] **Paso 1: tests que fallan** — `tests/unit/features/intake/roster-sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  planFingerprintSource,
  planRosterSync,
  toApplyPayload,
  type ExistingParticipant,
  type ExistingSession,
} from '@/features/intake/roster-sync'
import type { ImportedDay } from '@/features/participants'

function day(title: string, people: ImportedDay['people'], warnings: string[] = []): ImportedDay {
  return { title, dayNumber: 0, blockLabels: ['09:00', '13:00PM'], people, warnings, absent: 0 }
}

const person = (name: string, blockNumber: number, micNumber: number | null, segment: 'client' | 'non_client' | null = 'non_client') => ({
  name, blockNumber, micNumber, role: 'participant' as const, segment,
})

function existing(over: Partial<ExistingParticipant>): ExistingParticipant {
  return { id: 'p1', sessionId: 's1', name: 'Gustavo Mendez', micNumber: 2, role: 'participant', segment: 'non_client', verbatims: 0, ...over }
}

describe('planRosterSync', () => {
  it('crea los bloques que faltan con fecha y hora de Chile, ordenando los días por fecha', () => {
    const plan = planRosterSync({
      days: [day('Junio 3', [person('Roberto Gomez', 1, 5, 'client')]), day('Junio 2', [person('Gustavo Mendez', 2, 2)])],
      year: 2026,
      sessions: [],
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks.map((b) => [b.code, b.scheduledAt, b.isNew])).toEqual([
      ['d1b1', '2026-06-02T13:00:00.000Z', true],
      ['d1b2', '2026-06-02T17:00:00.000Z', true],
      ['d2b1', '2026-06-03T13:00:00.000Z', true],
      ['d2b2', '2026-06-03T17:00:00.000Z', true],
    ])
    expect(plan.blocks.find((b) => b.code === 'd1b2')!.add).toEqual([
      { name: 'Gustavo Mendez', micNumber: 2, role: 'participant', segment: 'non_client' },
    ])
  })

  it('corrige la hora de un bloque existente y lo marca', () => {
    const sessions: ExistingSession[] = [{ id: 's1', dayNumber: 1, blockNumber: 1, code: 'd1b1', scheduledAt: '2026-05-05T21:00:00.000Z' }]
    const plan = planRosterSync({ days: [day('Junio 2', [])], year: 2026, sessions, participants: [] })
    if (!plan.ok) throw new Error(plan.error)
    const block = plan.blocks.find((b) => b.code === 'd1b1')!
    expect(block.sessionId).toBe('s1')
    expect(block.isNew).toBe(false)
    expect(block.scheduleChanged).toBe(true)
  })

  it('actualiza a quien ya está conservando su id y deja igual a quien no cambió', () => {
    const sessions: ExistingSession[] = [{ id: 's1', dayNumber: 1, blockNumber: 2, code: 'd1b2', scheduledAt: '2026-06-02T17:00:00.000Z' }]
    const plan = planRosterSync({
      days: [day('Junio 2', [person('gustavo  MENDEZ', 2, 7), person('Olga Veliz', 2, 11)])],
      year: 2026,
      sessions,
      participants: [
        existing({ id: 'p1', name: 'Gustavo Mendez', micNumber: 2 }),
        existing({ id: 'p2', name: 'Olga Veliz', micNumber: 11 }),
      ],
    })
    if (!plan.ok) throw new Error(plan.error)
    const block = plan.blocks.find((b) => b.code === 'd1b2')!
    expect(block.update).toEqual([
      {
        id: 'p1',
        name: 'gustavo  MENDEZ',
        from: { name: 'Gustavo Mendez', micNumber: 2, role: 'participant', segment: 'non_client' },
        to: { name: 'gustavo  MENDEZ', micNumber: 7, role: 'participant', segment: 'non_client' },
      },
    ])
    expect(block.keep).toBe(1)
    expect(block.add).toEqual([])
    expect(block.remove).toEqual([])
  })

  it('borra a quien ya no está y dice cuántos verbatims quedan sin autor', () => {
    const sessions: ExistingSession[] = [{ id: 's1', dayNumber: 1, blockNumber: 1, code: 'd1b1', scheduledAt: null }]
    const plan = planRosterSync({
      days: [day('Junio 2', [])],
      year: 2026,
      sessions,
      participants: [existing({ id: 'p9', sessionId: 's1', name: 'Freddy Ceron', verbatims: 14 })],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks.find((b) => b.code === 'd1b1')!.remove).toEqual([{ id: 'p9', name: 'Freddy Ceron', verbatims: 14 }])
  })

  it('toma la primera fila cuando un nombre se repite en el mismo bloque y avisa', () => {
    const plan = planRosterSync({
      days: [day('Junio 2', [person('Paula Olmedo', 2, 17), person('paula olmedo ', 2, 18)])],
      year: 2026,
      sessions: [],
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks.find((b) => b.code === 'd1b2')!.add).toHaveLength(1)
    expect(plan.warnings).toContain('Junio 2: «paula olmedo» aparece dos veces en el bloque 2; se toma la primera fila.')
  })

  it('no toca bloques del estudio que la planilla no menciona y los lista', () => {
    const sessions: ExistingSession[] = [{ id: 's7', dayNumber: 4, blockNumber: 1, code: 'd4b1', scheduledAt: null }]
    const plan = planRosterSync({ days: [day('Junio 2', [])], year: 2026, sessions, participants: [] })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.untouchedSessions).toEqual([{ id: 's7', code: 'd4b1' }])
  })

  it('pasa los avisos del parser con el nombre de la hoja', () => {
    const plan = planRosterSync({ days: [day('Junio 2', [], ['Freddy: no se pudo leer el micrófono.'])], year: 2026, sessions: [], participants: [] })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.warnings).toContain('Junio 2: Freddy: no se pudo leer el micrófono.')
  })

  it('se niega cuando una hoja con bloques no trae una fecha legible', () => {
    expect(planRosterSync({ days: [day('Hoja1', [])], year: 2026, sessions: [], participants: [] })).toEqual({
      ok: false,
      error: 'La hoja «Hoja1» no dice qué día es (se espera algo como «Junio 2»).',
    })
  })

  it('se niega cuando un horario no se puede leer', () => {
    const bad: ImportedDay = { ...day('Junio 2', []), blockLabels: ['09:00', 'tarde'] }
    expect(planRosterSync({ days: [bad], year: 2026, sessions: [], participants: [] })).toEqual({
      ok: false,
      error: 'La hoja «Junio 2» tiene un horario que no se entiende: «tarde».',
    })
  })

  it('ignora hojas sin encabezado de convocatoria', () => {
    const empty: ImportedDay = { title: 'Resumen', dayNumber: 0, blockLabels: [], people: [], warnings: ['x'], absent: 0 }
    const plan = planRosterSync({ days: [empty, day('Junio 2', [])], year: 2026, sessions: [], participants: [] })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks).toHaveLength(2)
  })
})

describe('planFingerprintSource', () => {
  it('es igual para el mismo plan aunque los arreglos vengan en otro orden', () => {
    const input = { days: [day('Junio 2', [person('A', 1, 1), person('B', 1, 2)])], year: 2026, sessions: [], participants: [] }
    const a = planRosterSync(input)
    const b = planRosterSync({ ...input, days: [day('Junio 2', [person('B', 1, 2), person('A', 1, 1)])] })
    if (!a.ok || !b.ok) throw new Error('plan')
    expect(planFingerprintSource(a)).toBe(planFingerprintSource(b))
  })

  it('cambia cuando cambia algo que se va a escribir', () => {
    const a = planRosterSync({ days: [day('Junio 2', [person('A', 1, 1)])], year: 2026, sessions: [], participants: [] })
    const b = planRosterSync({ days: [day('Junio 2', [person('A', 1, 3)])], year: 2026, sessions: [], participants: [] })
    if (!a.ok || !b.ok) throw new Error('plan')
    expect(planFingerprintSource(a)).not.toBe(planFingerprintSource(b))
  })
})

describe('toApplyPayload', () => {
  it('lleva solo lo que el RPC necesita, con nombres de columna', () => {
    const sessions: ExistingSession[] = [{ id: 's1', dayNumber: 1, blockNumber: 1, code: 'd1b1', scheduledAt: null }]
    const plan = planRosterSync({
      days: [day('Junio 2', [person('A', 1, 1)])],
      year: 2026,
      sessions,
      participants: [existing({ id: 'p9', sessionId: 's1', name: 'Z' })],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(toApplyPayload(plan)).toEqual({
      create_sessions: [{ day_number: 1, block_number: 2, name: 'Día 1 · Bloque 2', scheduled_at: '2026-06-02T17:00:00.000Z' }],
      update_sessions: [{ id: 's1', scheduled_at: '2026-06-02T13:00:00.000Z' }],
      blocks: [
        { day_number: 1, block_number: 1, remove: ['p9'], update: [], add: [{ name: 'A', mic_number: 1, role: 'participant', segment: 'non_client' }] },
        { day_number: 1, block_number: 2, remove: [], update: [], add: [] },
      ],
    })
  })
})
```

- [ ] **Paso 2:** `npx vitest run tests/unit/features/intake/roster-sync.test.ts` → FALLA.

- [ ] **Paso 3: implementación** — `src/features/intake/roster-sync.ts`:

```ts
import type { ImportedDay, ParticipantRole, Segment } from '@/features/participants'

import { blockTime, chileLocalToUtcIso, sheetDate } from './schedule'

/**
 * Qué cambia en el estudio si se aplica la convocatoria (D26).
 *
 * Los bloques salen de la planilla: se crean los que faltan y se corrige la
 * hora de los que existen, nunca se borran. En personas cada bloque queda igual
 * a la planilla, y quien sigue en ella conserva su id para no dejar a sus
 * verbatims sin autor. Todo esto es puro: el servidor lo calcula dos veces
 * (vista previa y confirmación) y compara las huellas.
 */

export interface ExistingSession {
  id: string
  dayNumber: number
  blockNumber: number
  code: string
  scheduledAt: string | null
}

export interface ExistingParticipant {
  id: string
  sessionId: string
  name: string
  micNumber: number | null
  role: ParticipantRole
  segment: Segment | null
  verbatims: number
}

export interface SyncPerson {
  name: string
  micNumber: number | null
  role: ParticipantRole
  segment: Segment | null
}

export interface BlockSync {
  dayNumber: number
  blockNumber: number
  code: string
  sheetTitle: string
  label: string
  scheduledAt: string
  sessionId: string | null
  isNew: boolean
  scheduleChanged: boolean
  add: SyncPerson[]
  update: { id: string; name: string; from: SyncPerson; to: SyncPerson }[]
  remove: { id: string; name: string; verbatims: number }[]
  keep: number
}

export type RosterSyncPlan =
  | { ok: true; blocks: BlockSync[]; untouchedSessions: { id: string; code: string }[]; warnings: string[] }
  | { ok: false; error: string }

export interface RosterSyncInput {
  days: readonly ImportedDay[]
  year: number
  sessions: readonly ExistingSession[]
  participants: readonly ExistingParticipant[]
}

export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function samePerson(a: SyncPerson, b: SyncPerson): boolean {
  return a.name === b.name && a.micNumber === b.micNumber && a.role === b.role && a.segment === b.segment
}

export function planRosterSync(input: RosterSyncInput): RosterSyncPlan {
  const warnings: string[] = []
  const dated: { day: ImportedDay; at: number; date: NonNullable<ReturnType<typeof sheetDate>> }[] = []

  for (const day of input.days) {
    for (const w of day.warnings) warnings.push(`${day.title}: ${w}`)
    if (day.blockLabels.length === 0) continue
    const date = sheetDate(day.title, input.year)
    if (!date) return { ok: false, error: `La hoja «${day.title}» no dice qué día es (se espera algo como «Junio 2»).` }
    for (const label of day.blockLabels) {
      if (!blockTime(label)) return { ok: false, error: `La hoja «${day.title}» tiene un horario que no se entiende: «${label}».` }
    }
    dated.push({ day, date, at: Date.UTC(date.year, date.month - 1, date.day) })
  }
  dated.sort((a, b) => a.at - b.at)

  const blocks: BlockSync[] = []
  const mentioned = new Set<string>()

  dated.forEach(({ day, date }, index) => {
    const dayNumber = index + 1
    day.blockLabels.forEach((label, i) => {
      const blockNumber = i + 1
      const code = `d${dayNumber}b${blockNumber}`
      const scheduledAt = chileLocalToUtcIso(date, blockTime(label)!)
      const session = input.sessions.find((s) => s.dayNumber === dayNumber && s.blockNumber === blockNumber) ?? null
      if (session) mentioned.add(session.id)

      const wanted = new Map<string, SyncPerson>()
      for (const p of day.people.filter((person) => person.blockNumber === blockNumber)) {
        const key = normalizeName(p.name)
        if (wanted.has(key)) {
          warnings.push(`${day.title}: «${key}» aparece dos veces en el bloque ${blockNumber}; se toma la primera fila.`)
          continue
        }
        wanted.set(key, { name: p.name, micNumber: p.micNumber, role: p.role, segment: p.segment })
      }

      const current = session ? input.participants.filter((p) => p.sessionId === session.id) : []
      const block: BlockSync = {
        dayNumber, blockNumber, code, sheetTitle: day.title, label, scheduledAt,
        sessionId: session?.id ?? null,
        isNew: session === null,
        scheduleChanged:
          session !== null && (session.scheduledAt === null || new Date(session.scheduledAt).getTime() !== new Date(scheduledAt).getTime()),
        add: [], update: [], remove: [], keep: 0,
      }

      const matched = new Set<string>()
      for (const p of current) {
        const key = normalizeName(p.name)
        const target = wanted.get(key)
        if (!target || matched.has(key)) {
          block.remove.push({ id: p.id, name: p.name, verbatims: p.verbatims })
          continue
        }
        matched.add(key)
        const from: SyncPerson = { name: p.name, micNumber: p.micNumber, role: p.role, segment: p.segment }
        if (samePerson(from, target)) block.keep++
        else block.update.push({ id: p.id, name: target.name, from, to: target })
      }
      for (const [key, person] of wanted) if (!matched.has(key)) block.add.push(person)

      blocks.push(block)
    })
  })

  const untouchedSessions = input.sessions
    .filter((s) => !mentioned.has(s.id))
    .map((s) => ({ id: s.id, code: s.code }))

  return { ok: true, blocks, untouchedSessions, warnings }
}

/** Texto canónico de lo que se va a escribir: la huella se calcula sobre esto. */
export function planFingerprintSource(plan: Extract<RosterSyncPlan, { ok: true }>): string {
  const byName = <T extends { name: string }>(list: readonly T[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))
  return JSON.stringify(
    plan.blocks.map((b) => ({
      code: b.code,
      scheduledAt: b.scheduledAt,
      sessionId: b.sessionId,
      scheduleChanged: b.scheduleChanged,
      add: byName(b.add),
      update: [...b.update].sort((x, y) => x.id.localeCompare(y.id)),
      remove: [...b.remove].sort((x, y) => x.id.localeCompare(y.id)),
    })),
  )
}

export interface ApplyPayload {
  create_sessions: { day_number: number; block_number: number; name: string; scheduled_at: string }[]
  update_sessions: { id: string; scheduled_at: string }[]
  blocks: {
    day_number: number
    block_number: number
    remove: string[]
    update: { id: string; name: string; mic_number: number | null; role: ParticipantRole; segment: Segment | null }[]
    add: { name: string; mic_number: number | null; role: ParticipantRole; segment: Segment | null }[]
  }[]
}

export function toApplyPayload(plan: Extract<RosterSyncPlan, { ok: true }>): ApplyPayload {
  const row = (p: SyncPerson) => ({ name: p.name, mic_number: p.micNumber, role: p.role, segment: p.segment })
  return {
    create_sessions: plan.blocks
      .filter((b) => b.isNew)
      .map((b) => ({ day_number: b.dayNumber, block_number: b.blockNumber, name: `Día ${b.dayNumber} · Bloque ${b.blockNumber}`, scheduled_at: b.scheduledAt })),
    update_sessions: plan.blocks
      .filter((b) => !b.isNew && b.scheduleChanged)
      .map((b) => ({ id: b.sessionId as string, scheduled_at: b.scheduledAt })),
    blocks: plan.blocks.map((b) => ({
      day_number: b.dayNumber,
      block_number: b.blockNumber,
      remove: b.remove.map((r) => r.id),
      update: b.update.map((u) => ({ id: u.id, ...row(u.to) })),
      add: b.add.map(row),
    })),
  }
}
```

Nota para quien implemente: si `ParticipantRole`/`Segment` no se exportan desde `@/features/participants`, verificar `src/features/participants/index.ts` (sí se exportan `Segment` y los tipos de participante) y agregar la exportación que falte ahí, no importar desde el interior del feature. El test de `toApplyPayload` espera `blocks` en el orden de `plan.blocks`; si la huella o el payload fallan por orden, arreglar la implementación, no el test.

- [ ] **Paso 4:** PASA (13 tests). `npx tsc --noEmit` limpio en `src/`/`tests/`.
- [ ] **Paso 5: commit**

```bash
git add src/features/intake/roster-sync.ts tests/unit/features/intake/roster-sync.test.ts
git commit -m "feat: plan de sincronización de la convocatoria con espejo exacto por bloque"
```

(Si hubo que exportar tipos en `src/features/participants/index.ts`, agregarlo al `git add`.)

---

### Tarea 4: Función de Postgres `apply_roster_sync`

**Archivos:** crear `supabase/migrations/20260914100000_apply_roster_sync.sql`; regenerar `src/lib/supabase/database.types.ts`

- [ ] **Paso 1: migración**

```sql
-- Aplica en una transacción el plan de sincronización de la convocatoria (D26).
-- El plan lo calcula el servidor; esta función solo escribe, y si algo falla no
-- queda un estudio a medio cargar.
create or replace function public.apply_roster_sync(p_study_id uuid, p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_block   jsonb;
  v_session uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede importar la convocatoria.';
  end if;

  insert into public.sessions (study_id, day_number, block_number, name, scheduled_at)
  select p_study_id,
         (s ->> 'day_number')::smallint,
         (s ->> 'block_number')::smallint,
         s ->> 'name',
         (s ->> 'scheduled_at')::timestamptz
  from jsonb_array_elements(coalesce(p_plan -> 'create_sessions', '[]'::jsonb)) as s;

  update public.sessions as t
  set scheduled_at = (s ->> 'scheduled_at')::timestamptz,
      updated_at   = now()
  from jsonb_array_elements(coalesce(p_plan -> 'update_sessions', '[]'::jsonb)) as s
  where t.id = (s ->> 'id')::uuid
    and t.study_id = p_study_id;

  for v_block in
    select value from jsonb_array_elements(coalesce(p_plan -> 'blocks', '[]'::jsonb))
  loop
    select id into v_session
    from public.sessions
    where study_id = p_study_id
      and day_number = (v_block ->> 'day_number')::smallint
      and block_number = (v_block ->> 'block_number')::smallint;

    if v_session is null then
      raise exception 'El bloque día % · bloque % no existe en el estudio.',
        v_block ->> 'day_number', v_block ->> 'block_number';
    end if;

    delete from public.participants
    where session_id = v_session
      and id in (select value::uuid from jsonb_array_elements_text(coalesce(v_block -> 'remove', '[]'::jsonb)));

    -- El micrófono es único por bloque: se libera antes de reasignarlo, o un
    -- intercambio entre dos personas choca a mitad de la actualización.
    update public.participants
    set mic_number = null
    where session_id = v_session
      and id in (select (u ->> 'id')::uuid from jsonb_array_elements(coalesce(v_block -> 'update', '[]'::jsonb)) as u);

    update public.participants as p
    set name       = u ->> 'name',
        mic_number = (u ->> 'mic_number')::smallint,
        role       = u ->> 'role',
        segment    = u ->> 'segment'
    from jsonb_array_elements(coalesce(v_block -> 'update', '[]'::jsonb)) as u
    where p.session_id = v_session
      and p.id = (u ->> 'id')::uuid;

    insert into public.participants (session_id, name, mic_number, role, segment)
    select v_session,
           a ->> 'name',
           (a ->> 'mic_number')::smallint,
           a ->> 'role',
           a ->> 'segment'
    from jsonb_array_elements(coalesce(v_block -> 'add', '[]'::jsonb)) as a;
  end loop;
end;
$$;

revoke all on function public.apply_roster_sync(uuid, jsonb) from public, anon;
grant execute on function public.apply_roster_sync(uuid, jsonb) to authenticated;
```

Antes de aplicar, verificar contra la base (`mcp__…__execute_sql`, solo lectura): tipos de `participants.role` y `participants.segment` (texto con check o enum; si es enum, castear `::public.<enum>`), y que `private.is_admin()` se pueda llamar desde `authenticated` (las policies ya la usan). Ajustar los casts si hace falta.

- [ ] **Paso 2: aplicar** con `mcp__6e7cc486-b591-40bf-b310-481fb371f13c__apply_migration` (project `lrnaiwilairvvnqlyxdq`, name `apply_roster_sync`, query = el SQL). El archivo local debe quedar idéntico a lo aplicado.

- [ ] **Paso 3: prueba en transacción que se deshace** (`execute_sql`), simulando un admin real. Tomar el `id` de un admin (`select id from public.profiles where role = 'admin' limit 1`) y un estudio vacío o crear uno dentro de la transacción:

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.studies (name) values ('prueba apply_roster_sync') returning id \gset
-- con el id devuelto:
select public.apply_roster_sync('<STUDY_ID>', '{
  "create_sessions":[{"day_number":1,"block_number":1,"name":"Día 1 · Bloque 1","scheduled_at":"2026-06-02T13:00:00Z"}],
  "update_sessions":[],
  "blocks":[{"day_number":1,"block_number":1,"remove":[],"update":[],"add":[
    {"name":"A","mic_number":1,"role":"participant","segment":"client"},
    {"name":"B","mic_number":2,"role":"participant","segment":"non_client"}]}]
}'::jsonb);
select name, mic_number from public.participants p join public.sessions s on s.id = p.session_id where s.study_id = '<STUDY_ID>' order by name;
rollback;
```

`\gset` no existe en `execute_sql`: correr el `insert … returning id` primero en la misma sentencia múltiple usando un `do $$ … $$` o un CTE; lo importante es que todo quede entre `begin` y `rollback`. Esperado: A→1, B→2. Repetir con un segundo `apply` en la misma transacción que intercambie micrófonos (update A→2, B→1) y verificar que no hay error de unicidad.

Si `studies` exige más columnas (`template_id`, `created_by`), usar un estudio existente de prueba y dejar todo dentro de `begin … rollback`.

- [ ] **Paso 4: advisors** — `mcp__…__get_advisors` (security y performance). Resolver lo que marque sobre la función nueva (p. ej. `function_search_path_mutable` no debería aparecer por `set search_path = ''`).

- [ ] **Paso 5: tipos** — `mcp__…__generate_typescript_types` y reemplazar `src/lib/supabase/database.types.ts` con el resultado (verificar que aparece `apply_roster_sync` en `Functions`). `npm run typecheck`.

- [ ] **Paso 6: commit**

```bash
git add supabase/migrations/20260914100000_apply_roster_sync.sql src/lib/supabase/database.types.ts
git commit -m "feat: apply_roster_sync escribe la convocatoria en una transacción"
```

---

### Tarea 5: Acciones de servidor

**Archivos:** crear `src/features/intake/actions.ts`, `src/features/intake/server.ts`, `src/features/intake/index.ts`, `tests/unit/features/intake/actions.test.ts`

- [ ] **Paso 1: test que falla** — la regla crítica es «no aplicar si el plan cambió». `tests/unit/features/intake/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const plans: unknown[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/xlsx/read', () => ({ readWorkbook: vi.fn(async () => []) }))
vi.mock('@/features/studies/server', () => ({ attachStageFile: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/features/intake/roster-sync', async (original) => {
  const actual = await original<typeof import('@/features/intake/roster-sync')>()
  return { ...actual, planRosterSync: vi.fn(() => plans.shift()) }
})
vi.mock('@/features/intake/detect', () => ({ detectStudyFile: vi.fn(() => 'roster') }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    rpc,
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'limit']) chain[m] = () => chain
      chain.single = async () => ({ data: { fieldwork_start: '2026-06-02' }, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
      return chain
    },
  })),
}))

const { applyStudyFiles, previewStudyFiles } = await import('@/features/intake/actions')

function planWith(mic: number) {
  return {
    ok: true,
    untouchedSessions: [],
    warnings: [],
    blocks: [{ dayNumber: 1, blockNumber: 1, code: 'd1b1', sheetTitle: 'Junio 2', label: '09:00', scheduledAt: '2026-06-02T13:00:00.000Z', sessionId: null, isNew: true, scheduleChanged: false, add: [{ name: 'A', micNumber: mic, role: 'participant', segment: 'client' }], update: [], remove: [], keep: 0 }],
  }
}

function form() {
  const f = new FormData()
  f.append('files', new File([new Uint8Array([80, 75, 3, 4])], 'Agenda Horarios.xlsx'))
  return f
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null })
  plans.length = 0
})

describe('applyStudyFiles', () => {
  it('aplica cuando el plan recalculado tiene la misma huella que la vista previa', async () => {
    plans.push(planWith(1), planWith(1))
    const preview = await previewStudyFiles('study-1', form())
    expect(preview.roster).not.toBeNull()
    const result = await applyStudyFiles('study-1', form(), preview.roster!.fingerprint)
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('apply_roster_sync', expect.objectContaining({ p_study_id: 'study-1' }))
  })

  it('no escribe nada y devuelve la vista previa nueva si el plan cambió desde la vista previa', async () => {
    plans.push(planWith(1), planWith(3))
    const preview = await previewStudyFiles('study-1', form())
    const result = await applyStudyFiles('study-1', form(), preview.roster!.fingerprint)
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    if (!result.ok) expect(result.preview?.roster?.fingerprint).not.toBe(preview.roster!.fingerprint)
  })
})
```

Ajustar el mock de `createClient` a las consultas reales que haga la acción (el objetivo del test es la huella, no la forma exacta de las consultas); usar `@/lib/supabase/server` si ese es el módulo que usan las otras acciones (`grep -n "createClient" src/features/participants/actions.ts`).

- [ ] **Paso 2:** `npx vitest run tests/unit/features/intake/actions.test.ts` → FALLA (módulo inexistente).

- [ ] **Paso 3: implementación** — `src/features/intake/actions.ts`:

```ts
'use server'

import { createHash } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { parseRosterWorkbook } from '@/features/participants'
import { attachStageFile } from '@/features/studies/server'
import { createClient } from '@/lib/supabase/server'
import { readWorkbook } from '@/server/xlsx/read'

import { detectStudyFile, type StudyFileContent, type StudyFileKind } from './detect'
import {
  planFingerprintSource,
  planRosterSync,
  toApplyPayload,
  type ExistingParticipant,
  type ExistingSession,
  type RosterSyncPlan,
} from './roster-sync'

const MAX_FILE_BYTES = 25 * 1024 * 1024

export interface StudyFileReport {
  filename: string
  kind: StudyFileKind
  message: string | null
}

export interface StudyFilesPreview {
  ok: boolean
  message?: string
  files: StudyFileReport[]
  roster: { filename: string; plan: Extract<RosterSyncPlan, { ok: true }>; fingerprint: string } | null
}

/** `notice`: los datos quedaron escritos pero algo secundario (el adjunto del original) falló. */
export type ApplyResult = { ok: true; notice: string | null } | { ok: false; message: string; preview?: StudyFilesPreview }

async function readContent(file: File): Promise<StudyFileContent> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  const name = file.name.toLowerCase()
  if (isZip && (name.endsWith('.xlsx') || name.endsWith('.xlsm'))) {
    return { kind: 'xlsx', sheets: await readWorkbook(bytes.buffer as ArrayBuffer) }
  }
  if (isZip && name.endsWith('.docx')) return { kind: 'docx' }
  return { kind: 'unknown' }
}

async function buildPreview(studyId: string, formData: FormData): Promise<StudyFilesPreview> {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { ok: false, message: 'No llegó ningún archivo.', files: [], roster: null }

  const supabase = await createClient()
  const reports: StudyFileReport[] = []
  let roster: StudyFilesPreview['roster'] = null

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      reports.push({ filename: file.name, kind: 'unknown', message: 'Supera los 25 MB.' })
      continue
    }
    let content: StudyFileContent
    try {
      content = await readContent(file)
    } catch (error) {
      reports.push({ filename: file.name, kind: 'unknown', message: `No se pudo leer: ${error instanceof Error ? error.message : 'formato desconocido'}` })
      continue
    }
    const kind = detectStudyFile(content)

    if (kind !== 'roster' || content.kind !== 'xlsx') {
      reports.push({ filename: file.name, kind, message: null })
      continue
    }
    if (roster) {
      reports.push({ filename: file.name, kind, message: 'Ya hay otra convocatoria en esta subida; se usa la primera.' })
      continue
    }

    const { data: study, error: studyError } = await supabase.from('studies').select('fieldwork_start').eq('id', studyId).single()
    if (studyError) return { ok: false, message: studyError.message, files: reports, roster: null }
    if (!study?.fieldwork_start) {
      reports.push({ filename: file.name, kind, message: 'El estudio no tiene fecha de inicio de terreno; hace falta para saber el año de las hojas.' })
      continue
    }

    const { data: sessionRows, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, day_number, block_number, code, scheduled_at')
      .eq('study_id', studyId)
    if (sessionsError) return { ok: false, message: sessionsError.message, files: reports, roster: null }

    const sessions: ExistingSession[] = (sessionRows ?? []).map((s) => ({
      id: s.id, dayNumber: s.day_number ?? 0, blockNumber: s.block_number ?? 0, code: s.code ?? '', scheduledAt: s.scheduled_at,
    }))
    const sessionIds = sessions.map((s) => s.id)

    const { data: people, error: peopleError } = sessionIds.length
      ? await supabase.from('participants').select('id, session_id, name, mic_number, role, segment').in('session_id', sessionIds)
      : { data: [], error: null }
    if (peopleError) return { ok: false, message: peopleError.message, files: reports, roster: null }

    const { data: authored, error: verbatimsError } = sessionIds.length
      ? await supabase.from('verbatims').select('participant_id').in('session_id', sessionIds).not('participant_id', 'is', null)
      : { data: [], error: null }
    if (verbatimsError) return { ok: false, message: verbatimsError.message, files: reports, roster: null }

    const verbatimsByParticipant = new Map<string, number>()
    for (const v of authored ?? []) {
      if (v.participant_id) verbatimsByParticipant.set(v.participant_id, (verbatimsByParticipant.get(v.participant_id) ?? 0) + 1)
    }
    const participants: ExistingParticipant[] = (people ?? []).map((p) => ({
      id: p.id, sessionId: p.session_id, name: p.name, micNumber: p.mic_number,
      role: p.role as ExistingParticipant['role'], segment: p.segment as ExistingParticipant['segment'],
      verbatims: verbatimsByParticipant.get(p.id) ?? 0,
    }))

    const plan = planRosterSync({
      days: parseRosterWorkbook(content.sheets),
      year: Number(String(study.fieldwork_start).slice(0, 4)),
      sessions,
      participants,
    })
    if (!plan.ok) {
      reports.push({ filename: file.name, kind, message: plan.error })
      continue
    }

    const fingerprint = createHash('sha256').update(planFingerprintSource(plan)).digest('hex')
    reports.push({ filename: file.name, kind, message: null })
    roster = { filename: file.name, plan, fingerprint }
  }

  return { ok: true, files: reports, roster }
}

/** Lee los archivos y muestra qué haría, sin escribir nada. */
export async function previewStudyFiles(studyId: string, formData: FormData): Promise<StudyFilesPreview> {
  return buildPreview(studyId, formData)
}

const STAGE_LABEL: Partial<Record<StudyFileKind, string>> = {
  roster: 'Listado de invitados',
  guide: 'Guía del focus',
}

async function attachOriginal(studyId: string, file: File, label: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_stage_files')
    .select('id, study_stage_id, study_stages!inner(study_id)')
    .eq('study_stages.study_id', studyId)
    .eq('label', label)
    .limit(1)
  if (error) return error.message
  const target = data?.[0]
  if (!target) return `El estudio no tiene el adjunto «${label}».`

  const form = new FormData()
  form.set('fileId', target.id)
  form.set('studyId', studyId)
  form.set('stageId', target.study_stage_id)
  form.set('file', file)
  const result = await attachStageFile(form)
  return result.ok ? null : (result.message ?? 'No se pudo adjuntar.')
}

/**
 * Recalcula el plan con el mismo archivo y lo aplica solo si su huella es la de
 * la vista previa: nunca se borra a alguien que la persona no vio en la lista.
 */
export async function applyStudyFiles(studyId: string, formData: FormData, fingerprint: string): Promise<ApplyResult> {
  const preview = await buildPreview(studyId, formData)
  if (!preview.ok) return { ok: false, message: preview.message ?? 'No se pudo leer.' }

  if (preview.roster) {
    if (preview.roster.fingerprint !== fingerprint) {
      return { ok: false, message: 'El estudio cambió desde la vista previa. Revisa la nueva antes de confirmar.', preview }
    }
    const supabase = await createClient()
    const { error } = await supabase.rpc('apply_roster_sync', {
      p_study_id: studyId,
      p_plan: toApplyPayload(preview.roster.plan) as unknown as import('@/lib/supabase/database.types').Json,
    })
    if (error) return { ok: false, message: error.message }
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  const problems: string[] = []
  for (const report of preview.files) {
    const label = STAGE_LABEL[report.kind]
    const file = files.find((f) => f.name === report.filename)
    if (!label || !file || report.message) continue
    const problem = await attachOriginal(studyId, file, label)
    if (problem) problems.push(`${report.filename}: ${problem}`)
  }

  revalidatePath(`/studies/${studyId}`)
  return {
    ok: true,
    notice: problems.length === 0 ? null : `Los datos quedaron cargados, pero no se pudo guardar el original: ${problems.join(' · ')}`,
  }
}
```

Notas: si `database.types.ts` no exporta `Json`, usar el tipo que declare para `p_plan` (`Args` de la función regenerada). Si `@/lib/supabase/server` no es la ruta de `createClient`, usar la que usan `src/features/participants/actions.ts`. `attachStageFile` devuelve `ActionResult` con `message?`; ajustar si su forma difiere.

`src/features/intake/server.ts`:

```ts
// Solo-servidor: leen cookies y validan el entorno al importarse.
export { applyStudyFiles, previewStudyFiles } from './actions'
export type { ApplyResult, StudyFileReport, StudyFilesPreview } from './actions'
```

`src/features/intake/index.ts`:

```ts
// Puerta client-safe: tipos, lógica pura y copy. Las acciones viven en ./server.
export { detectStudyFile } from './detect'
export type { StudyFileContent, StudyFileKind } from './detect'
export { normalizeName, planFingerprintSource, planRosterSync, toApplyPayload } from './roster-sync'
export type { BlockSync, ExistingParticipant, ExistingSession, RosterSyncPlan, SyncPerson } from './roster-sync'
export { intakeCopy } from './copy'
```

(`copy.ts` se crea en la Tarea 6; si se hace esta tarea antes, dejar fuera la línea de `intakeCopy` y agregarla en la 6.)

- [ ] **Paso 4:** `npx vitest run tests/unit/features/intake/actions.test.ts` → PASA (2). `npm run typecheck` sin errores en `src/`/`tests/`. `npm test` completo verde.
- [ ] **Paso 5: commit**

```bash
git add src/features/intake/actions.ts src/features/intake/server.ts src/features/intake/index.ts tests/unit/features/intake/actions.test.ts
git commit -m "feat: vista previa y aplicación de archivos del estudio con huella del plan"
```

---

### Tarea 6: Sección «Archivos del estudio» y retiro de la importación vieja

**Archivos:** crear `src/features/intake/copy.ts`, `src/features/intake/components/study-files-section.tsx`; modificar `src/features/studies/components/study-detail-view.tsx`, `src/features/participants/components/participants-section.tsx`, `src/features/participants/actions.ts`, `src/features/participants/server.ts`, `src/features/participants/copy.ts`

Presentación sin lógica nueva (lo decidible ya está probado): verificación con typecheck, suite y build.

- [ ] **Paso 1: copy** — `src/features/intake/copy.ts`:

```ts
import type { StudyFileKind } from './detect'

export const intakeCopy = {
  title: 'Archivos del estudio',
  hint: 'Convocatoria, pauta y respuestas del formulario. Se reconoce cada archivo, se muestra qué cambiaría y nada se guarda hasta confirmar.',
  choose: 'Elegir archivos',
  reading: 'Leyendo…',
  apply: 'Aplicar',
  applying: 'Aplicando…',
  cancel: 'Cancelar',
  done: 'Listo: el estudio quedó actualizado.',
  kind: {
    roster: 'Convocatoria',
    survey: 'Respuestas del formulario',
    guide: 'Pauta',
    unknown: 'No reconocido',
  } satisfies Record<StudyFileKind, string>,
  kindNote: {
    roster: null,
    survey: 'Se reconoce; su interpretación llega en la próxima etapa.',
    guide: 'Se adjunta como «Guía del focus»; su interpretación llega en la próxima etapa.',
    unknown: 'Se espera la convocatoria (.xlsx), la pauta (.docx) o las respuestas del formulario (.xlsx).',
  } satisfies Record<StudyFileKind, string | null>,
  newBlock: 'bloque nuevo',
  movedBlock: 'hora corregida',
  add: (n: number) => `${n} a agregar`,
  update: (n: number) => `${n} a actualizar`,
  remove: (n: number) => `${n} a borrar`,
  keep: (n: number) => `${n} sin cambios`,
  orphanVerbatims: (n: number) => (n === 1 ? '1 verbatim queda sin autor' : `${n} verbatims quedan sin autor`),
  untouched: (codes: string) => `Bloques del estudio que la planilla no menciona (no se tocan): ${codes}`,
  change: (from: string, to: string) => `${from} → ${to}`,
  mic: (n: number | null) => (n === null ? 'sin mic' : `mic ${n}`),
} as const
```

Agregar `export { intakeCopy } from './copy'` a `src/features/intake/index.ts` si no estaba.

- [ ] **Paso 2: componente** — `src/features/intake/components/study-files-section.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type ChangeEvent } from 'react'

import { applyStudyFiles, previewStudyFiles, type StudyFilesPreview } from '../actions'
import { blockLabel, dayLabel } from '@/features/sessions'

import { intakeCopy } from '../copy'

function when(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Subir los archivos del estudio.
 *
 * El formulario se guarda en memoria entre la vista previa y la confirmación:
 * al aplicar se vuelve a mandar el mismo archivo y el servidor recalcula el
 * plan, en vez de confiar en lo que la pantalla muestra.
 */
export function StudyFilesSection({ studyId }: { studyId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<FormData | null>(null)
  const [preview, setPreview] = useState<StudyFilesPreview | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return
    const form = new FormData()
    for (const file of picked) form.append('files', file)
    formRef.current = form
    setNotice(null)
    startTransition(async () => setPreview(await previewStudyFiles(studyId, form)))
  }

  function apply() {
    const form = formRef.current
    const fingerprint = preview?.roster?.fingerprint ?? ''
    if (!form) return
    startTransition(async () => {
      const result = await applyStudyFiles(studyId, form, fingerprint)
      if (result.ok) {
        setPreview(null)
        formRef.current = null
        setNotice(result.notice ?? intakeCopy.done)
        router.refresh()
        return
      }
      setNotice(result.message)
      if (result.preview) setPreview(result.preview)
    })
  }

  const plan = preview?.roster?.plan ?? null
  const canApply = !!preview?.ok && preview.files.some((f) => f.message === null && f.kind !== 'unknown')

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{intakeCopy.title}</h2>
        <p className="text-xs text-muted">{intakeCopy.hint}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink disabled:opacity-40"
        >
          {pending ? intakeCopy.reading : intakeCopy.choose}
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => { setPreview(null); formRef.current = null }}
            className="text-xs text-muted underline underline-offset-4 hover:text-ink"
          >
            {intakeCopy.cancel}
          </button>
        )}
        <input ref={inputRef} type="file" hidden multiple accept=".xlsx,.xlsm,.docx" aria-label={intakeCopy.choose} onChange={onPick} />
      </div>

      {notice && <p className="text-xs text-muted">{notice}</p>}
      {preview && !preview.ok && <p className="text-xs text-danger">{preview.message}</p>}

      {preview?.ok && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <ul className="flex flex-col gap-1">
            {preview.files.map((file) => (
              <li key={file.filename} className="flex flex-wrap gap-x-3 text-xs">
                <span className="font-medium">{file.filename}</span>
                <span className="text-muted">{intakeCopy.kind[file.kind]}</span>
                {(file.message ?? intakeCopy.kindNote[file.kind]) && (
                  <span className={file.message ? 'text-warn' : 'text-muted'}>{file.message ?? intakeCopy.kindNote[file.kind]}</span>
                )}
              </li>
            ))}
          </ul>

          {plan && (
            <ul className="flex flex-col gap-2">
              {plan.blocks.map((block) => (
                <li key={block.code} className="flex flex-col gap-0.5 text-xs">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="tabular-nums text-muted">{block.code}</span>
                    <span>{dayLabel(block.dayNumber)} · {blockLabel(block.blockNumber)}</span>
                    <span className="text-muted">{when(block.scheduledAt)}</span>
                    {block.isNew && <span className="text-accent">{intakeCopy.newBlock}</span>}
                    {block.scheduleChanged && <span className="text-warn">{intakeCopy.movedBlock}</span>}
                    <span className="text-muted">
                      {[intakeCopy.add(block.add.length), intakeCopy.update(block.update.length), intakeCopy.remove(block.remove.length), intakeCopy.keep(block.keep)].join(' · ')}
                    </span>
                  </div>
                  {block.update.map((u) => (
                    <span key={u.id} className="pl-4 text-muted">
                      {u.name}: {intakeCopy.change(intakeCopy.mic(u.from.micNumber), intakeCopy.mic(u.to.micNumber))}
                    </span>
                  ))}
                  {block.remove.map((r) => (
                    <span key={r.id} className="pl-4 text-danger">
                      − {r.name}{r.verbatims > 0 ? ` (${intakeCopy.orphanVerbatims(r.verbatims)})` : ''}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}

          {plan && plan.untouchedSessions.length > 0 && (
            <p className="text-xs text-muted">{intakeCopy.untouched(plan.untouchedSessions.map((s) => s.code).join(', '))}</p>
          )}

          {plan && plan.warnings.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {plan.warnings.map((w) => <li key={w} className="text-xs text-warn">{w}</li>)}
            </ul>
          )}

          {canApply && (
            <div>
              <button
                type="button"
                disabled={pending}
                onClick={apply}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink disabled:opacity-40"
              >
                {pending ? intakeCopy.applying : intakeCopy.apply}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
```

Verificar la firma de `blockLabel`/`dayLabel` en `src/features/sessions/copy.ts` y ajustar la llamada. El componente importa las acciones por ruta interna del feature (`../actions`), igual que `participants-section.tsx`; `server.ts` es la puerta para otros features. Revisar la diferencia visual contra `participants-section.tsx` para tokens (`text-muted`, `text-warn`, `text-danger`, `bg-accent`) — no introducir colores crudos.

- [ ] **Paso 3: montar** — en `src/features/studies/components/study-detail-view.tsx`, importar `StudyFilesSection` y renderizarlo **siempre** (no dentro de `sessions.length > 0`), justo antes de `SessionsSection`:

```tsx
<StudyFilesSection studyId={study.id} />
```

- [ ] **Paso 4: retirar la importación vieja** — en `participants-section.tsx` borrar `RosterImport` y su uso (`<RosterImport studyId={…} />`), imports y estado que queden sin uso; en `participants/actions.ts` borrar `previewRoster`, `importRoster`, `RosterPreview`, `RosterTarget`, `importSchema` y `MAX_FILE_BYTES` si quedan sin uso; en `participants/server.ts` quitar sus exportaciones; en `participants/copy.ts` borrar las claves `import*` y `absent` que queden sin uso (verificar con `grep -rn "participantsCopy\.\(import\|absent\)" src`). `parseRosterWorkbook` y `readWorkbook` se mantienen (los usa intake).

- [ ] **Paso 5: verificar** — `npm run typecheck && npm test && npx next build` (o `npm run build`). Todo verde; sin errores en `src/`/`tests/`.

- [ ] **Paso 6: commit**

```bash
git add src/features/intake/copy.ts src/features/intake/index.ts src/features/intake/components/study-files-section.tsx src/features/studies/components/study-detail-view.tsx src/features/participants/components/participants-section.tsx src/features/participants/actions.ts src/features/participants/server.ts src/features/participants/copy.ts
git commit -m "feat: sección Archivos del estudio reemplaza la importación de participantes"
```

---

### Tarea 7: Verificación con los archivos reales (con el operador)

**Precondiciones:** dev server de v2 corriendo; sesión admin; archivos en `/Volumes/SSD WAV/MG FG S2/_Contexto S2/`. La base es la única del proyecto: **preguntar al operador** en qué estudio probar (uno nuevo «MG FG S2» con inicio de terreno 2026-06-02, o uno de prueba) antes de aplicar nada.

- [x] **Paso 1:** en ese estudio, subir los tres archivos a la vez. Esperado en la vista previa:
  - `Agenda Horarios.xlsx` → Convocatoria; `Guion Pauta S2.docx` → Pauta (nota de próxima etapa); `Respuestas Google Form….xlsx` → Respuestas del formulario (nota de próxima etapa).
  - 6 bloques `d1b1`…`d3b2` con fechas 2, 3 y 4 de junio a las 09:00 y 13:00 (hora de Chile).
  - Personas por bloque con sus micrófonos; avisos de micrófonos repetidos o notas si los hay.
- [x] **Paso 2:** Aplicar. Verificar por SQL (solo lectura) conteos por bloque y que ningún RUT/correo quedó en la base:

```sql
select s.code, to_char(s.scheduled_at at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI') as local, count(p.id) as personas, count(p.mic_number) as con_mic, count(p.segment) as con_segmento
from public.sessions s left join public.participants p on p.session_id = s.id
where s.study_id = '<STUDY_ID>' group by s.code, s.scheduled_at order by s.code;
```

- [x] **Paso 3:** Volver a subir la misma planilla. Esperado: todos los bloques existentes, `0 a agregar · 0 a actualizar · 0 a borrar`, sin «hora corregida».
- [x] **Paso 4:** Probar la huella: abrir la vista previa, cambiar un micrófono de un participante desde la sección de participantes en otra pestaña, y confirmar en la primera. Esperado: «El estudio cambió desde la vista previa…» y la vista previa nueva muestra la actualización.
- [x] **Paso 5:** Verificar que «Listado de invitados» y «Guía del focus» quedaron adjuntos en las etapas del estudio.

**Verificado 2026-09-15** en estudio real `MG FG S2` (`30e41165-2aba-48b1-b272-af5e3811eebe`). Los 5 pasos pasaron sin hallazgos: conteos por bloque correctos, sin RUT/correo en `participants` (columnas no existen), re-subida idempotente, huella detectó el cambio externo, y adjuntos confirmados por SQL en `study_stage_files` (Diseño → Guía del focus, Convocatoria → Listado de invitados).
