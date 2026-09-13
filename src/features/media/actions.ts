'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/server/supabase/server'
import { mediaKey, randomSuffix } from '@/server/storage/keys'
import { storage } from '@/server/storage/r2'

import type { PresignResult } from './types'

export interface ActionResult {
  ok: boolean
  message?: string
}

// Un PUT prefirmado de R2 admite hasta 5 GiB. Dos horas de audio sin comprimir
// entran de sobra; el video ya llega transcodificado desde WAV Ingest (D19).
const MAX_BYTES = 5 * 1024 * 1024 * 1024

const kindSchema = z.enum(['video_360', 'video_dslr', 'audio_room', 'audio_mic', 'audio_ambient'])

const presignSchema = z.object({
  sessionId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  kind: kindSchema,
  micNumber: z.number().int().min(1).max(99).nullable(),
  contentType: z.string().trim().max(200).nullable(),
  bytes: z.number().int().min(1).max(MAX_BYTES),
})

const registerSchema = z.object({
  sessionId: z.uuid(),
  storageKey: z.string().trim().min(1).max(1024),
  filename: z.string().trim().min(1).max(255),
  kind: kindSchema,
  micNumber: z.number().int().min(1).max(99).nullable(),
  bytes: z.number().int().min(1).max(MAX_BYTES),
})

/**
 * Confirma que la sesión existe y pertenece al estudio, y devuelve su código.
 *
 * Sin esta comprobación, un `sessionId` cualquiera dejaría escribir material en
 * el estudio de otro: el id llega del cliente y el prefijo de la clave se
 * construye con el id del estudio, así que los dos tienen que coincidir acá.
 */
async function sessionCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studyId: string,
  sessionId: string,
): Promise<{ ok: true; code: string | null } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('sessions')
    .select('code')
    .eq('id', sessionId)
    .eq('study_id', studyId)
    .maybeSingle()

  if (error) return { ok: false, message: error.message }
  if (!data) return { ok: false, message: 'La sesión no pertenece a este estudio.' }
  return { ok: true, code: data.code }
}

/** Paso 1: la app entrega una URL y el navegador sube directo a R2. */
export async function presignMediaUpload(studyId: string, input: unknown): Promise<PresignResult> {
  const parsed = presignSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createClient()
  const session = await sessionCode(supabase, studyId, parsed.data.sessionId)
  if (!session.ok) return { ok: false, message: session.message }

  const key = mediaKey(studyId, session.code, parsed.data.filename, randomSuffix())

  try {
    const url = await storage.presignPut(key, parsed.data.contentType ?? undefined)
    return { ok: true, url, storageKey: key }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Error al prefirmar' }
  }
}

/**
 * Paso 2: R2 ya aceptó el objeto, se registra la fila.
 *
 * Se comprueba que el objeto exista antes de insertar. Un registro sin objeto
 * detrás es peor que no tener registro: la grilla diría que el bloque está
 * cubierto cuando no lo está.
 */
export async function registerMediaFile(studyId: string, input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createClient()
  const session = await sessionCode(supabase, studyId, parsed.data.sessionId)
  if (!session.ok) return { ok: false, message: session.message }

  if (!parsed.data.storageKey.startsWith(`studies/${studyId}/`)) {
    return { ok: false, message: 'La clave no corresponde a este estudio.' }
  }

  if (!(await storage.exists(parsed.data.storageKey))) {
    return { ok: false, message: 'El archivo no llegó a R2. Vuelve a intentar la subida.' }
  }

  const { error } = await supabase.from('media_files').insert({
    session_id: parsed.data.sessionId,
    kind: parsed.data.kind,
    storage_key: parsed.data.storageKey,
    original_filename: parsed.data.filename,
    bytes: parsed.data.bytes,
    mic_number: parsed.data.kind === 'audio_mic' ? parsed.data.micNumber : null,
  })

  if (error) {
    // El objeto quedaría huérfano: nada lo referencia y nadie lo va a encontrar.
    await storage.remove(parsed.data.storageKey).catch(() => undefined)
    return { ok: false, message: error.message }
  }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}

/** Borra la fila y después el objeto, en ese orden. */
export async function deleteMediaFile(studyId: string, mediaId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, message: 'Id inválido' }

  const supabase = await createClient()
  const { data, error: readError } = await supabase
    .from('media_files')
    .select('storage_key')
    .eq('id', mediaId)
    .maybeSingle()

  if (readError) return { ok: false, message: readError.message }
  if (!data) return { ok: true }

  if (!data.storage_key.startsWith(`studies/${studyId}/`)) {
    return { ok: false, message: 'El archivo no pertenece a este estudio.' }
  }

  const { error } = await supabase.from('media_files').delete().eq('id', mediaId)
  if (error) return { ok: false, message: error.message }

  // Si esto falla queda un objeto sin fila, que solo cuesta almacenamiento.
  // Al revés —fila sin objeto— la grilla mentiría, y eso sí importa.
  await storage.remove(data.storage_key).catch(() => undefined)

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}

/** URL de lectura, corta: sirve para reproducir o descargar en el momento. */
export async function mediaFileUrl(
  studyId: string,
  mediaId: string,
): Promise<{ ok: boolean; url?: string; message?: string }> {
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, message: 'Id inválido' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('media_files')
    .select('storage_key')
    .eq('id', mediaId)
    .maybeSingle()

  if (error) return { ok: false, message: error.message }
  if (!data) return { ok: false, message: 'El archivo no existe.' }
  if (!data.storage_key.startsWith(`studies/${studyId}/`)) {
    return { ok: false, message: 'El archivo no pertenece a este estudio.' }
  }

  try {
    return { ok: true, url: await storage.presignGet(data.storage_key) }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al firmar' }
  }
}
