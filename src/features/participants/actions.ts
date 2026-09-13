'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/server/supabase/server'

import { readWorkbook } from '@/server/xlsx/read'

import { ROLES } from './model'
import { parseRosterWorkbook, type ImportedDay } from './roster-import'

export interface ActionResult {
  ok: boolean
  message?: string
}

type Supabase = Awaited<ReturnType<typeof createClient>>

const roleSchema = z.enum(ROLES as unknown as [string, ...string[]])

const personSchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede quedar vacío').max(120),
  micNumber: z.number().int().min(1).max(99).nullable(),
  role: roleSchema,
  segment: z.enum(['client', 'non_client']).nullish(),
})

/** Que la sesión sea de este estudio: el id llega del cliente. */
async function belongsToStudy(
  supabase: Supabase,
  studyId: string,
  sessionId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('study_id', studyId)
    .maybeSingle()
  return data !== null
}

/**
 * Traduce el choque del índice único a algo que se entienda.
 *
 * "duplicate key value violates unique constraint participants_session_mic" no
 * le dice nada a quien está armando el listado.
 */
function readable(message: string): string {
  if (message.includes('participants_session_mic')) {
    return 'Ese micrófono ya está asignado a otra persona en este bloque.'
  }
  if (message.includes('participants_session_id_seat_number_key')) {
    return 'Ese asiento ya está ocupado en este bloque.'
  }
  return message
}

export async function addParticipants(
  studyId: string,
  sessionId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = z.array(personSchema).min(1).max(50).safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createClient()
  if (!(await belongsToStudy(supabase, studyId, sessionId))) {
    return { ok: false, message: 'La sesión no pertenece a este estudio.' }
  }

  const { error } = await supabase.from('participants').insert(
    parsed.data.map((person) => ({
      session_id: sessionId,
      name: person.name,
      mic_number: person.micNumber,
      role: person.role,
      segment: person.segment ?? null,
    })),
  )

  if (error) return { ok: false, message: readable(error.message) }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}

export async function updateParticipant(
  studyId: string,
  participantId: string,
  input: unknown,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(participantId).success) return { ok: false, message: 'Id inválido' }

  const parsed = personSchema.partial().safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createClient()
  const { data: row, error: readError } = await supabase
    .from('participants')
    .select('session_id')
    .eq('id', participantId)
    .maybeSingle()

  if (readError) return { ok: false, message: readError.message }
  if (!row) return { ok: false, message: 'La persona ya no existe.' }
  if (!(await belongsToStudy(supabase, studyId, row.session_id))) {
    return { ok: false, message: 'La persona no pertenece a este estudio.' }
  }

  // Se arma con el tipo de la tabla y no con un Record suelto: así el
  // compilador sigue vigilando que los nombres de columna existan.
  const changes: {
    name?: string
    mic_number?: number | null
    role?: string
    segment?: string | null
  } = {}
  if (parsed.data.name !== undefined) changes.name = parsed.data.name
  if (parsed.data.micNumber !== undefined) changes.mic_number = parsed.data.micNumber
  if (parsed.data.role !== undefined) changes.role = parsed.data.role
  if (parsed.data.segment !== undefined) changes.segment = parsed.data.segment ?? null
  if (Object.keys(changes).length === 0) return { ok: true }

  const { error } = await supabase.from('participants').update(changes).eq('id', participantId)
  if (error) return { ok: false, message: readable(error.message) }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}

export async function removeParticipant(
  studyId: string,
  participantId: string,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(participantId).success) return { ok: false, message: 'Id inválido' }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('participants')
    .select('session_id')
    .eq('id', participantId)
    .maybeSingle()

  if (!row) return { ok: true }
  if (!(await belongsToStudy(supabase, studyId, row.session_id))) {
    return { ok: false, message: 'La persona no pertenece a este estudio.' }
  }

  const { error } = await supabase.from('participants').delete().eq('id', participantId)
  if (error) return { ok: false, message: error.message }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Importación desde la planilla de convocatoria
// ---------------------------------------------------------------------------

/** Un bloque del estudio al que la planilla dice que va gente. */
export interface RosterTarget {
  dayNumber: number
  blockNumber: number
  blockLabel: string
  /** El bloque que le corresponde en el estudio, si existe. */
  sessionId: string | null
  code: string | null
  people: number
  /** Cuántos de esos ya están cargados, por nombre. */
  alreadyThere: number
}

export interface RosterPreview {
  ok: boolean
  message?: string
  days?: ImportedDay[]
  targets?: RosterTarget[]
}

const MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * Lee la planilla y muestra qué se importaría, sin escribir nada.
 *
 * El paso de vista previa no es cortesía: el archivo trae decisiones tomadas a
 * mano —un micrófono anotado como frase, alguien sin bloque marcado— y meter
 * cien personas y después descubrirlo cuesta mucho más que mirarlo antes.
 */
export async function previewRoster(studyId: string, formData: FormData): Promise<RosterPreview> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'No llegó ningún archivo.' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'El archivo supera los 5 MB.' }
  }

  let days: ImportedDay[]
  try {
    days = parseRosterWorkbook(await readWorkbook(await file.arrayBuffer()))
  } catch (error) {
    return {
      ok: false,
      message: `No se pudo leer la planilla: ${error instanceof Error ? error.message : 'formato desconocido'}`,
    }
  }

  const supabase = await createClient()
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, code, day_number, block_number')
    .eq('study_id', studyId)

  if (error) return { ok: false, message: error.message }

  const { data: existing } = await supabase
    .from('participants')
    .select('session_id, name')
    .in('session_id', (sessions ?? []).map((s) => s.id))

  const namesBySession = new Map<string, Set<string>>()
  for (const person of existing ?? []) {
    const set = namesBySession.get(person.session_id) ?? new Set<string>()
    set.add(person.name.trim().toLowerCase())
    namesBySession.set(person.session_id, set)
  }

  const targets: RosterTarget[] = []
  for (const day of days) {
    for (let block = 1; block <= day.blockLabels.length; block++) {
      const people = day.people.filter((p) => p.blockNumber === block)
      if (people.length === 0) continue

      const session = (sessions ?? []).find(
        (s) => s.day_number === day.dayNumber && s.block_number === block,
      )
      const already = session ? (namesBySession.get(session.id) ?? new Set<string>()) : new Set<string>()

      targets.push({
        dayNumber: day.dayNumber,
        blockNumber: block,
        blockLabel: day.blockLabels[block - 1]!,
        sessionId: session?.id ?? null,
        code: session?.code ?? null,
        people: people.length,
        alreadyThere: people.filter((p) => already.has(p.name.trim().toLowerCase())).length,
      })
    }
  }

  return { ok: true, days, targets }
}

const importSchema = z.object({
  sessionId: z.uuid(),
  people: z.array(personSchema).min(1).max(60),
})

/**
 * Escribe lo que la vista previa mostró.
 *
 * Se salta a quien ya está en el bloque por nombre: volver a importar la
 * planilla después de corregir una fila no debería duplicar a los otros
 * noventa.
 */
export async function importRoster(studyId: string, input: unknown): Promise<ActionResult> {
  const parsed = z.array(importSchema).min(1).max(20).safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createClient()

  for (const group of parsed.data) {
    if (!(await belongsToStudy(supabase, studyId, group.sessionId))) {
      return { ok: false, message: 'Un bloque de la planilla no es de este estudio.' }
    }

    const { data: existing } = await supabase
      .from('participants')
      .select('name')
      .eq('session_id', group.sessionId)

    const taken = new Set((existing ?? []).map((p) => p.name.trim().toLowerCase()))
    const rows = group.people.filter((p) => !taken.has(p.name.trim().toLowerCase()))
    if (rows.length === 0) continue

    const { error } = await supabase.from('participants').insert(
      rows.map((person) => ({
        session_id: group.sessionId,
        name: person.name,
        mic_number: person.micNumber,
        role: person.role,
        segment: person.segment ?? null,
      })),
    )
    if (error) return { ok: false, message: readable(error.message) }
  }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}
