'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/server/supabase/server'

import { ROLES } from './model'

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
  } = {}
  if (parsed.data.name !== undefined) changes.name = parsed.data.name
  if (parsed.data.micNumber !== undefined) changes.mic_number = parsed.data.micNumber
  if (parsed.data.role !== undefined) changes.role = parsed.data.role
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
