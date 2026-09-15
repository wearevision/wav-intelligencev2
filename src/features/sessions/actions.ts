'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/server/supabase/server'

import { MAX_BLOCKS_PER_DAY, MAX_DAYS } from './model'

export interface ActionResult {
  ok: boolean
  message?: string
}

const shapeSchema = z.object({
  days: z.number().int().min(1).max(MAX_DAYS),
  blocksPerDay: z.number().int().min(1).max(MAX_BLOCKS_PER_DAY),
})

/**
 * Crea las sesiones de un estudio a partir de su forma.
 *
 * Rechaza si el estudio ya tiene sesiones. Rellenar huecos es otra operación y
 * mezclarlas haría que un click accidental duplique la agenda.
 */
export async function generateSessions(
  studyId: string,
  days: number,
  blocksPerDay: number,
): Promise<ActionResult> {
  const parsed = shapeSchema.safeParse({ days, blocksPerDay })
  if (!parsed.success) {
    return {
      ok: false,
      message: `Días entre 1 y ${MAX_DAYS}, bloques entre 1 y ${MAX_BLOCKS_PER_DAY}.`,
    }
  }

  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('sessions')
    .select('id')
    .eq('study_id', studyId)
    .limit(1)

  if (readError) return { ok: false, message: readError.message }
  if (existing?.length) {
    return { ok: false, message: 'El estudio ya tiene sesiones creadas.' }
  }

  const rows = []
  for (let day = 1; day <= parsed.data.days; day++) {
    for (let block = 1; block <= parsed.data.blocksPerDay; block++) {
      // Nombre neutro a propósito: "Mañana" y "Tarde" son etiquetas derivadas
      // del número de bloques, y guardarlas rompería si esa cifra cambia.
      rows.push({
        study_id: studyId,
        day_number: day,
        block_number: block,
        name: `Día ${day} · Bloque ${block}`,
      })
    }
  }

  const { error } = await supabase.from('sessions').insert(rows)
  if (error) return { ok: false, message: error.message }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}

const logisticsSchema = z.object({
  scheduledAt: z.iso.datetime().nullable(),
  venue: z.string().trim().max(200).nullable(),
  moderatorName: z.string().trim().max(200).nullable(),
})

export async function updateSessionLogistics(
  sessionId: string,
  studyId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = logisticsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('sessions')
    .update({
      scheduled_at: parsed.data.scheduledAt,
      venue: parsed.data.venue || null,
      moderator_name: parsed.data.moderatorName || null,
    })
    .eq('id', sessionId)
    .eq('study_id', studyId)

  if (error) return { ok: false, message: error.message }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}
