import type { NextRequest } from 'next/server'

import { fail, json, preflight } from '@/server/api/respond'
import { requireUser } from '@/server/supabase/request'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: NextRequest) {
  return preflight(request)
}

/**
 * La grilla esperada de un estudio: qué bloques hay, cuándo, y qué material ya
 * tienen.
 *
 * Es la inversión que hace concreto a D17: en vez de que el escritorio adivine
 * a partir del nombre del archivo, v2 publica la lista y el escritorio empareja
 * contra ella. La nomenclatura deja de depender de la disciplina de una persona.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser(request)
  if (!user) return fail('Sesión inválida o vencida.', request, 401)

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, code, name, day_number, block_number, scheduled_at, venue, moderator_name')
    .eq('study_id', id)
    .order('day_number', { ascending: true })
    .order('block_number', { ascending: true })

  if (error) return fail(error.message, request, 500)
  if (!sessions?.length) return json({ blocks: [] }, request)

  const sessionIds = sessions.map((s) => s.id)

  const [media, participants] = await Promise.all([
    supabase
      .from('media_files')
      .select('session_id, kind, mic_number, recording_key, original_filename, bytes')
      .in('session_id', sessionIds),
    supabase.from('participants').select('session_id, name, mic_number, role').in('session_id', sessionIds),
  ])

  if (media.error) return fail(media.error.message, request, 500)
  if (participants.error) return fail(participants.error.message, request, 500)

  return json(
    {
      blocks: sessions.map((session) => {
        const files = (media.data ?? []).filter((f) => f.session_id === session.id)
        const people = (participants.data ?? []).filter((p) => p.session_id === session.id)

        return {
          sessionId: session.id,
          code: session.code,
          name: session.name,
          dayNumber: session.day_number,
          blockNumber: session.block_number,
          scheduledAt: session.scheduled_at,
          venue: session.venue,
          moderatorName: session.moderator_name,
          // Lo ya subido, para que el escritorio no vuelva a mandar lo mismo:
          // nombre y tamaño son la clave con la que la app detecta repetidos.
          uploaded: files.map((f) => ({
            filename: f.original_filename,
            bytes: f.bytes,
            kind: f.kind,
            micNumber: f.mic_number,
            recordingKey: f.recording_key,
          })),
          // Quién lleva cada micrófono: el escritorio lo necesita para poder
          // etiquetar las pistas antes de subirlas.
          participants: people.map((p) => ({
            name: p.name,
            micNumber: p.mic_number,
            role: p.role,
          })),
        }
      }),
    },
    request,
  )
}
