import { createClient } from '@/server/supabase/server'

import type { StudySession } from './types'

/** Las sesiones de un estudio, con cuántos participantes tiene cada una. */
export async function listStudySessions(studyId: string): Promise<StudySession[]> {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('sessions')
    .select('id, day_number, block_number, code, name, scheduled_at, venue, moderator_name')
    .eq('study_id', studyId)
    .order('day_number', { ascending: true })
    .order('block_number', { ascending: true })

  if (error) throw new Error(`No se pudieron cargar las sesiones: ${error.message}`)
  if (!rows?.length) return []

  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('session_id')
    .in(
      'session_id',
      rows.map((r) => r.id),
    )

  if (participantsError) {
    throw new Error(`No se pudieron contar los participantes: ${participantsError.message}`)
  }

  const counts = new Map<string, number>()
  for (const p of participants ?? []) {
    counts.set(p.session_id, (counts.get(p.session_id) ?? 0) + 1)
  }

  return rows.map((r) => ({
    id: r.id,
    dayNumber: r.day_number,
    blockNumber: r.block_number,
    code: r.code,
    name: r.name,
    scheduledAt: r.scheduled_at,
    venue: r.venue,
    moderatorName: r.moderator_name,
    participantCount: counts.get(r.id) ?? 0,
  }))
}
