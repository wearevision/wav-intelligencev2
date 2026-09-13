import { createClient } from '@/server/supabase/server'

import type { Participant, ParticipantRole, Segment } from './types'

/** Los participantes de todas las sesiones de un estudio. */
export async function listStudyParticipants(studyId: string): Promise<Participant[]> {
  const supabase = await createClient()

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id')
    .eq('study_id', studyId)

  if (sessionsError) {
    throw new Error(`No se pudieron cargar las sesiones: ${sessionsError.message}`)
  }
  if (!sessions?.length) return []

  const { data, error } = await supabase
    .from('participants')
    .select('id, session_id, name, mic_number, seat_number, role, segment')
    .in(
      'session_id',
      sessions.map((s) => s.id),
    )
    // Primero los que tienen micrófono, por número; después el resto por nombre.
    .order('mic_number', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) throw new Error(`No se pudieron cargar los participantes: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    micNumber: row.mic_number,
    seatNumber: row.seat_number,
    role: row.role as ParticipantRole,
    segment: (row.segment as Segment | null) ?? null,
  }))
}
