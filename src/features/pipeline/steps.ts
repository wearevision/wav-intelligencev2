// Solo-servidor: escribe en R2 y lee la base. Se importa desde ./server.
import { artifactKey } from '@/server/storage/keys'
import { storage } from '@/server/storage/r2'
import type { createClient } from '@/server/supabase/server'

import type { ArtifactKind } from './model'

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface StepContext {
  supabase: Supabase
  studyId: string
  sessionId: string
  /** El código del bloque, para que el artifact quede junto a su material. */
  code: string | null
}

export interface StepOutput {
  kind: ArtifactKind
  storageKey: string
  bytes: number
}

export type StepRunner = (ctx: StepContext) => Promise<StepOutput>

/** Escribe un artifact JSON y devuelve dónde quedó y cuánto pesa. */
async function writeArtifact(
  ctx: StepContext,
  kind: ArtifactKind,
  payload: unknown,
): Promise<StepOutput> {
  const key = artifactKey(ctx.studyId, ctx.code, kind)
  const body = `${JSON.stringify(payload, null, 2)}\n`
  await storage.put(key, body, 'application/json')
  return { kind, storageKey: key, bytes: Buffer.byteLength(body) }
}

interface InventoryEntry {
  id: string
  kind: string
  storageKey: string
  originalFilename: string
  bytes: number | null
  micNumber: number | null
}

interface Inventory {
  version: 1
  sessionId: string
  generatedAt: string
  files: InventoryEntry[]
}

/**
 * Paso 1 · Inventario.
 *
 * Contrasta lo que dice la base contra lo que hay de verdad en el bucket. Es
 * la clase de desajuste que no duele hasta seis meses después, cuando alguien
 * abre el estudio para revisarlo y descubre que el bloque nunca subió entero.
 *
 * Falla si algo falta: dejar pasar un bloque incompleto hacia la transcripción
 * produce un análisis silenciosamente parcial, que es peor que un error.
 */
const runInventory: StepRunner = async (ctx) => {
  const { data, error } = await ctx.supabase
    .from('media_files')
    .select('id, kind, storage_key, original_filename, bytes, mic_number')
    .eq('session_id', ctx.sessionId)
    .order('kind', { ascending: true })

  if (error) throw new Error(`No se pudo leer el material: ${error.message}`)
  if (!data?.length) throw new Error('El bloque no tiene material subido.')

  const checked = await Promise.all(
    data.map(async (row) => ({ row, present: await storage.exists(row.storage_key) })),
  )

  const missing = checked.filter((c) => !c.present).map((c) => c.row.original_filename)
  if (missing.length > 0) {
    throw new Error(
      `Hay ${missing.length} archivo(s) registrados que no están en R2: ${missing.join(', ')}`,
    )
  }

  const inventory: Inventory = {
    version: 1,
    sessionId: ctx.sessionId,
    generatedAt: new Date().toISOString(),
    files: checked.map(({ row }) => ({
      id: row.id,
      kind: row.kind,
      storageKey: row.storage_key,
      originalFilename: row.original_filename,
      bytes: row.bytes,
      micNumber: row.mic_number,
    })),
  }

  return writeArtifact(ctx, 'session_inventory', inventory)
}

export type TranscriptionBranch = 'mic_tracks' | 'diarization' | 'hybrid'

/**
 * Paso 2 · Plan de transcripción.
 *
 * Decide la rama de D18 y con qué archivos. Se lee del inventario y no de la
 * base a propósito: es lo que convierte a `requires` en algo real, y hace que
 * un inventario producido en local por WAV Ingest sirva igual que uno hecho acá.
 */
const runTranscriptionPlan: StepRunner = async (ctx) => {
  const raw = await storage.getText(artifactKey(ctx.studyId, ctx.code, 'session_inventory'))

  let inventory: Inventory
  try {
    inventory = JSON.parse(raw) as Inventory
  } catch {
    throw new Error('El inventario no es JSON válido. Vuelve a correr el paso anterior.')
  }
  if (inventory.version !== 1 || !Array.isArray(inventory.files)) {
    throw new Error('El inventario no tiene la forma esperada.')
  }

  const micTracks = inventory.files.filter((f) => f.kind === 'audio_mic')
  const roomMix = inventory.files.filter((f) => f.kind === 'audio_room' || f.kind === 'audio_ambient')

  if (micTracks.length === 0 && roomMix.length === 0) {
    throw new Error('El bloque no tiene audio: no hay nada que transcribir.')
  }

  // Con pistas por micrófono la atribución es directa; con solo mezcla hay que
  // diarizar. Teniendo las dos, las pistas mandan y la mezcla queda de respaldo
  // para los tramos donde un micrófono falló.
  const branch: TranscriptionBranch =
    micTracks.length > 0 && roomMix.length > 0
      ? 'hybrid'
      : micTracks.length > 0
        ? 'mic_tracks'
        : 'diarization'

  const { data: participants, error } = await ctx.supabase
    .from('participants')
    .select('id, name, mic_number')
    .eq('session_id', ctx.sessionId)

  if (error) throw new Error(`No se pudieron leer los participantes: ${error.message}`)

  const byMic = new Map((participants ?? []).map((p) => [p.mic_number, p]))
  const unassignedMics = micTracks
    .map((t) => t.micNumber)
    .filter((n): n is number => n !== null && !byMic.has(n))

  return writeArtifact(ctx, 'transcription_plan', {
    version: 1,
    sessionId: ctx.sessionId,
    generatedAt: new Date().toISOString(),
    branch,
    micTracks: micTracks.map((t) => ({
      storageKey: t.storageKey,
      micNumber: t.micNumber,
      participantId: t.micNumber !== null ? (byMic.get(t.micNumber)?.id ?? null) : null,
      participantName: t.micNumber !== null ? (byMic.get(t.micNumber)?.name ?? null) : null,
    })),
    roomMix: roomMix.map((r) => ({ storageKey: r.storageKey, kind: r.kind })),
    // Micrófonos grabados que no corresponden a ningún participante del listado.
    // No frena el plan: se transcriben igual y quedan sin nombre hasta que
    // alguien complete la asignación.
    unassignedMics,
  })
}

export const RUNNERS: Record<string, StepRunner> = {
  inventario: runInventory,
  plan_transcripcion: runTranscriptionPlan,
}
