import { createClient } from '@/server/supabase/server'

import type { BlockTranscriptSummary, Verbatim } from './types'

/**
 * Cuántos verbatims tiene cada bloque y cuántos quedaron sin nombre.
 *
 * Son dos conteos por bloque y no una consulta con `group by`: PostgREST no
 * agrupa, y traer todas las filas para contarlas en JS significaría mover miles
 * de textos completos para mostrar un número.
 */
export async function summarizeStudyTranscripts(
  studyId: string,
): Promise<BlockTranscriptSummary[]> {
  const supabase = await createClient()

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('study_id', studyId)

  if (error) throw new Error(`No se pudieron cargar las sesiones: ${error.message}`)
  if (!sessions?.length) return []

  return Promise.all(
    sessions.map(async ({ id }) => {
      const [total, orphan] = await Promise.all([
        supabase
          .from('verbatims')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', id),
        supabase
          .from('verbatims')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', id)
          .is('participant_id', null),
      ])

      return {
        sessionId: id,
        segments: total.count ?? 0,
        unattributed: orphan.count ?? 0,
      }
    }),
  )
}

/** La transcripción de un bloque, en orden, con los nombres ya resueltos. */
export async function listBlockVerbatims(sessionId: string): Promise<Verbatim[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('verbatims')
    .select('id, session_id, participant_id, speaker_label, start_ts, end_ts, text, confidence')
    .eq('session_id', sessionId)
    .order('start_ts', { ascending: true })

  if (error) throw new Error(`No se pudo cargar la transcripción: ${error.message}`)
  if (!data?.length) return []

  const { data: people, error: peopleError } = await supabase
    .from('participants')
    .select('id, name')
    .eq('session_id', sessionId)

  if (peopleError) throw new Error(`No se pudieron leer los nombres: ${peopleError.message}`)

  const nameById = new Map((people ?? []).map((p) => [p.id, p.name]))

  return data.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    participantId: row.participant_id,
    participantName: row.participant_id ? (nameById.get(row.participant_id) ?? null) : null,
    speakerLabel: row.speaker_label,
    startTs: Number(row.start_ts),
    endTs: Number(row.end_ts),
    text: row.text,
    confidence: row.confidence,
  }))
}
