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
  | {
      ok: true
      blocks: BlockSync[]
      untouchedSessions: { id: string; code: string }[]
      warnings: string[]
    }
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
  return (
    a.name === b.name && a.micNumber === b.micNumber && a.role === b.role && a.segment === b.segment
  )
}

export function planRosterSync(input: RosterSyncInput): RosterSyncPlan {
  const warnings: string[] = []
  const dated: { day: ImportedDay; at: number; date: NonNullable<ReturnType<typeof sheetDate>> }[] =
    []

  for (const day of input.days) {
    for (const w of day.warnings) warnings.push(`${day.title}: ${w}`)
    if (day.blockLabels.length === 0) continue
    const date = sheetDate(day.title, input.year)
    if (!date)
      return {
        ok: false,
        error: `La hoja «${day.title}» no dice qué día es (se espera algo como «Junio 2»).`,
      }
    for (const label of day.blockLabels) {
      if (!blockTime(label))
        return {
          ok: false,
          error: `La hoja «${day.title}» tiene un horario que no se entiende: «${label}».`,
        }
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
      const session =
        input.sessions.find((s) => s.dayNumber === dayNumber && s.blockNumber === blockNumber) ??
        null
      if (session) mentioned.add(session.id)

      const wanted = new Map<string, SyncPerson>()
      for (const p of day.people.filter((person) => person.blockNumber === blockNumber)) {
        const key = normalizeName(p.name)
        if (wanted.has(key)) {
          warnings.push(
            `${day.title}: «${key}» aparece dos veces en el bloque ${blockNumber}; se toma la primera fila.`,
          )
          continue
        }
        wanted.set(key, { name: p.name, micNumber: p.micNumber, role: p.role, segment: p.segment })
      }

      const current = session ? input.participants.filter((p) => p.sessionId === session.id) : []
      const block: BlockSync = {
        dayNumber,
        blockNumber,
        code,
        sheetTitle: day.title,
        label,
        scheduledAt,
        sessionId: session?.id ?? null,
        isNew: session === null,
        scheduleChanged:
          session !== null &&
          (session.scheduledAt === null ||
            new Date(session.scheduledAt).getTime() !== new Date(scheduledAt).getTime()),
        add: [],
        update: [],
        remove: [],
        keep: 0,
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
        const from: SyncPerson = {
          name: p.name,
          micNumber: p.micNumber,
          role: p.role,
          segment: p.segment,
        }
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
  const byName = <T extends { name: string }>(list: readonly T[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name))
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
  create_sessions: {
    day_number: number
    block_number: number
    name: string
    scheduled_at: string
  }[]
  update_sessions: { id: string; scheduled_at: string }[]
  blocks: {
    day_number: number
    block_number: number
    remove: string[]
    update: {
      id: string
      name: string
      mic_number: number | null
      role: ParticipantRole
      segment: Segment | null
    }[]
    add: {
      name: string
      mic_number: number | null
      role: ParticipantRole
      segment: Segment | null
    }[]
  }[]
}

export function toApplyPayload(plan: Extract<RosterSyncPlan, { ok: true }>): ApplyPayload {
  const row = (p: SyncPerson) => ({
    name: p.name,
    mic_number: p.micNumber,
    role: p.role,
    segment: p.segment,
  })
  return {
    create_sessions: plan.blocks
      .filter((b) => b.isNew)
      .map((b) => ({
        day_number: b.dayNumber,
        block_number: b.blockNumber,
        name: `Día ${b.dayNumber} · Bloque ${b.blockNumber}`,
        scheduled_at: b.scheduledAt,
      })),
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
