import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { fail, json, preflight } from '@/server/api/respond'
import { artifactKey, hlsKeys, mediaKey, randomSuffix } from '@/server/storage/keys'
import { storage } from '@/server/storage/r2'
import { requireUser } from '@/server/supabase/request'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: NextRequest) {
  return preflight(request)
}

const MAX_BYTES = 5 * 1024 * 1024 * 1024

const mediaItemSchema = z.object({
  target: z.literal('media'),
  sessionId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  kind: z.enum(['video_360', 'video_dslr', 'audio_room', 'audio_mic', 'audio_ambient']),
  bytes: z.number().int().min(1).max(MAX_BYTES),
  contentType: z.string().trim().max(200).nullish(),
})

const artifactItemSchema = z.object({
  target: z.literal('artifact'),
  sessionId: z.uuid(),
  kind: z.string().trim().min(1).max(80),
})

/**
 * Un video transcodificado en local: el manifiesto y sus segmentos.
 *
 * El nombre de cada segmento se valida con severidad porque va a formar parte
 * de una clave: sin esto, un `../` en el nombre escribiría fuera del prefijo
 * del estudio.
 */
const hlsItemSchema = z.object({
  target: z.literal('hls'),
  sessionId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  kind: z.enum(['video_360', 'video_dslr']),
  segmentFilenames: z
    .array(z.string().regex(/^[A-Za-z0-9._-]+\.ts$/, 'Nombre de segmento inválido'))
    .min(1)
    .max(5000),
})

const bodySchema = z.object({
  studyId: z.uuid(),
  items: z
    .array(z.discriminatedUnion('target', [mediaItemSchema, artifactItemSchema, hlsItemSchema]))
    .min(1)
    .max(200),
})

/**
 * URLs prefirmadas para un conjunto de claves.
 *
 * En una tanda y no de a una: una carpeta de terreno son decenas de archivos, y
 * una ida y vuelta por cada uno multiplica la latencia sin ganar nada. El
 * servidor arma la clave —el escritorio no elige dónde escribe.
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser(request)
  if (!user) return fail('Sesión inválida o vencida.', request, 401)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Cuerpo inválido', request, 400)
  }

  const { studyId, items } = parsed.data

  // Una sola consulta para todas las sesiones nombradas: sin esto, un sessionId
  // de otro estudio dejaría escribir material donde no corresponde.
  const wanted = [...new Set(items.map((i) => i.sessionId))]
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, code')
    .eq('study_id', studyId)
    .in('id', wanted)

  if (error) return fail(error.message, request, 500)

  const codeById = new Map((sessions ?? []).map((s) => [s.id, s.code]))
  const missing = wanted.filter((id) => !codeById.has(id))
  if (missing.length > 0) {
    return fail(`Estas sesiones no son de este estudio: ${missing.join(', ')}`, request, 403)
  }

  try {
    const uploads = await Promise.all(
      items.map(async (item) => {
        const code = codeById.get(item.sessionId) ?? null

        if (item.target === 'hls') {
          const keys = hlsKeys(studyId, code, item.filename, randomSuffix(), item.segmentFilenames)
          return {
            target: item.target,
            sessionId: item.sessionId,
            filename: item.filename,
            // La clave del manifiesto es la del media_file: es lo que se
            // reproduce, y los segmentos viven referenciados solo por él.
            storageKey: keys.manifestKey,
            url: await storage.presignPut(keys.manifestKey, 'application/vnd.apple.mpegurl'),
            segments: await Promise.all(
              keys.segments.map(async (segment) => ({
                filename: segment.filename,
                storageKey: segment.key,
                url: await storage.presignPut(segment.key, 'video/mp2t'),
              })),
            ),
          }
        }

        if (item.target === 'artifact') {
          const key = artifactKey(studyId, code, item.kind)
          return {
            target: item.target,
            sessionId: item.sessionId,
            kind: item.kind,
            storageKey: key,
            url: await storage.presignPut(key, 'application/json'),
          }
        }

        const key = mediaKey(studyId, code, item.filename, randomSuffix())
        return {
          target: item.target,
          sessionId: item.sessionId,
          filename: item.filename,
          storageKey: key,
          url: await storage.presignPut(key, item.contentType ?? undefined),
        }
      }),
    )

    return json({ uploads }, request)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Error al prefirmar', request, 500)
  }
}
