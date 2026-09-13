import { createClient } from '@/server/supabase/server'

import type { MediaFile } from './types'

/**
 * El material de todas las sesiones de un estudio.
 *
 * Se piden primero los ids de las sesiones y después sus archivos, en dos
 * consultas planas: el resto del proyecto une en JS y no en PostgREST, para no
 * depender de que las relaciones estén declaradas en los tipos generados.
 */
export async function listStudyMedia(studyId: string): Promise<MediaFile[]> {
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
    .from('media_files')
    .select(
      'id, session_id, kind, storage_key, original_filename, bytes, duration_seconds, mic_number, source_path, source_host, created_at',
    )
    .in(
      'session_id',
      sessions.map((s) => s.id),
    )
    .order('created_at', { ascending: true })

  if (error) throw new Error(`No se pudo cargar el material: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    kind: r.kind,
    storageKey: r.storage_key,
    originalFilename: r.original_filename,
    bytes: r.bytes,
    durationSeconds: r.duration_seconds,
    micNumber: r.mic_number,
    sourcePath: r.source_path,
    sourceHost: r.source_host,
    createdAt: r.created_at,
  }))
}
