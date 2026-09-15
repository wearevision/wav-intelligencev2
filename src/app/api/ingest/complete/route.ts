import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { fail, json, preflight } from '@/server/api/respond'
import { storage } from '@/server/storage/r2'
import { requireUser } from '@/server/supabase/request'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: NextRequest) {
  return preflight(request)
}

const MAX_BYTES = 5 * 1024 * 1024 * 1024

const mediaSchema = z.object({
  sessionId: z.uuid(),
  storageKey: z.string().trim().min(1).max(1024),
  filename: z.string().trim().min(1).max(255),
  kind: z.enum(['video_360', 'video_dslr', 'audio_room', 'audio_mic', 'audio_ambient']),
  bytes: z.number().int().min(1).max(MAX_BYTES),
  micNumber: z.number().int().min(1).max(99).nullish(),
  durationSeconds: z.number().int().min(0).nullish(),
  recordingKey: z.string().trim().min(1).max(200).nullish(),
  partNumber: z.number().int().min(1).max(999).nullish(),
  extraSessionIds: z.array(z.uuid()).max(1).nullish(),
  recordedAt: z.iso.datetime().nullish(),
  checksum: z.string().trim().min(1).max(200).nullish(),
  // Dónde quedó el master que nunca subió (D19). Sin esto, en dos años nadie
  // lo encuentra.
  sourcePath: z.string().trim().min(1).max(1024).nullish(),
  sourceHost: z.string().trim().min(1).max(200).nullish(),
})

const artifactSchema = z.object({
  sessionId: z.uuid(),
  kind: z.string().trim().min(1).max(80),
  storageKey: z.string().trim().min(1).max(1024),
  bytes: z.number().int().min(0).nullish(),
  checksum: z.string().trim().min(1).max(200).nullish(),
})

const bodySchema = z.object({
  studyId: z.uuid(),
  media: z.array(mediaSchema).max(200).default([]),
  artifacts: z.array(artifactSchema).max(50).default([]),
})

/**
 * Registra lo que ya está en R2.
 *
 * Se comprueba que cada objeto exista antes de escribir la fila: un registro
 * sin objeto detrás hace que la grilla diga que el bloque está cubierto cuando
 * no lo está, que es peor que no tener registro.
 *
 * Los artifacts se marcan `producer: 'local'`. No es un adorno: es lo que
 * después permite leer qué se hizo dónde, aunque para saltarse el paso alcance
 * con que el casillero esté lleno (D20).
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser(request)
  if (!user) return fail('Sesión inválida o vencida.', request, 401)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Cuerpo inválido', request, 400)
  }

  const { studyId, media, artifacts } = parsed.data
  if (media.length === 0 && artifacts.length === 0) {
    return fail('No hay nada que registrar.', request, 400)
  }

  const wanted = [
    ...new Set([
      ...media.flatMap((m) => [m.sessionId, ...(m.extraSessionIds ?? [])]),
      ...artifacts.map((a) => a.sessionId),
    ]),
  ]
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('study_id', studyId)
    .in('id', wanted)

  if (error) return fail(error.message, request, 500)

  const known = new Set((sessions ?? []).map((s) => s.id))
  const missing = wanted.filter((id) => !known.has(id))
  if (missing.length > 0) {
    return fail(`Estas sesiones no son de este estudio: ${missing.join(', ')}`, request, 403)
  }

  const prefix = `studies/${studyId}/`
  const rejected: { storageKey: string; reason: string }[] = []

  const presence = await Promise.all(
    [...media, ...artifacts].map(async (item) => ({
      item,
      inStudy: item.storageKey.startsWith(prefix),
      exists: item.storageKey.startsWith(prefix) ? await storage.exists(item.storageKey) : false,
    })),
  )

  const usable = new Set<string>()
  for (const { item, inStudy, exists } of presence) {
    if (!inStudy)
      rejected.push({ storageKey: item.storageKey, reason: 'La clave no es de este estudio.' })
    else if (!exists)
      rejected.push({ storageKey: item.storageKey, reason: 'El objeto no está en R2.' })
    else usable.add(item.storageKey)
  }

  const mediaRows = media.filter((m) => usable.has(m.storageKey))
  const artifactRows = artifacts.filter((a) => usable.has(a.storageKey))

  if (mediaRows.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from('media_files')
      .insert(
        mediaRows.map((m) => ({
          session_id: m.sessionId,
          kind: m.kind,
          storage_key: m.storageKey,
          original_filename: m.filename,
          bytes: m.bytes,
          mic_number: m.kind === 'audio_mic' ? (m.micNumber ?? null) : null,
          duration_seconds: m.durationSeconds ?? null,
          recording_key: m.recordingKey ?? null,
          part_number: m.partNumber ?? null,
          recorded_at: m.recordedAt ?? null,
          checksum: m.checksum ?? null,
          source_path: m.sourcePath ?? null,
          source_host: m.sourceHost ?? null,
        })),
      )
      .select('id, storage_key')
    if (insertError) return fail(insertError.message, request, 409)

    const idByStorageKey = new Map((inserted ?? []).map((row) => [row.storage_key, row.id]))
    const bridgeRows = mediaRows.flatMap((m) => {
      const mediaId = idByStorageKey.get(m.storageKey)
      if (!mediaId || !m.extraSessionIds?.length) return []
      return m.extraSessionIds.map((sessionId) => ({
        media_file_id: mediaId,
        session_id: sessionId,
      }))
    })
    if (bridgeRows.length > 0) {
      const { error: bridgeError } = await supabase.from('media_file_sessions').insert(bridgeRows)
      if (bridgeError) return fail(bridgeError.message, request, 409)
    }
  }

  for (const artifact of artifactRows) {
    // Upsert: volver a producir un artifact en local reemplaza el anterior en
    // vez de chocar contra el único (session_id, kind).
    const { error: upsertError } = await supabase.from('artifacts').upsert(
      {
        session_id: artifact.sessionId,
        kind: artifact.kind,
        storage_key: artifact.storageKey,
        producer: 'local',
        bytes: artifact.bytes ?? null,
        checksum: artifact.checksum ?? null,
      },
      { onConflict: 'session_id,kind' },
    )
    if (upsertError) return fail(upsertError.message, request, 409)
  }

  return json(
    {
      registered: { media: mediaRows.length, artifacts: artifactRows.length },
      rejected,
    },
    request,
    rejected.length > 0 ? 207 : 200,
  )
}
