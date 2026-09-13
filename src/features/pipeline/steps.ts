// Solo-servidor: escribe en R2 y lee la base. Se importa desde ./server.
import { computeOffsets } from '@/features/media/parts'
import { parseTranscriptArtifact } from '@/features/transcripts/contract'
import { statsFor, toVerbatims, type PartRef } from '@/features/transcripts/model'

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
  /** Cuando el archivo es una parte: de qué grabación y en qué orden. */
  recordingKey: string | null
  partNumber: number | null
  recordedAt: string | null
  durationSeconds: number | null
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
    .select(
      'id, kind, storage_key, original_filename, bytes, mic_number, recording_key, part_number, recorded_at, duration_seconds',
    )
    .eq('session_id', ctx.sessionId)
    .order('kind', { ascending: true })
    .order('recording_key', { ascending: true, nullsFirst: true })
    .order('part_number', { ascending: true, nullsFirst: true })

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
      recordingKey: row.recording_key,
      partNumber: row.part_number,
      recordedAt: row.recorded_at,
      durationSeconds: row.duration_seconds,
    })),
  }

  return writeArtifact(ctx, 'session_inventory', inventory)
}

export type TranscriptionBranch = 'mic_tracks' | 'diarization' | 'hybrid'

interface PlanPart {
  storageKey: string
  partNumber: number
  /** Segundos desde el inicio de la fuente. Null si no se pudo calcular. */
  offsetSeconds: number | null
  durationSeconds: number | null
}

interface PlanSource {
  /** Null cuando la fuente es un archivo entero y no una grabación cortada. */
  recordingKey: string | null
  micNumber: number | null
  parts: PlanPart[]
  /** Minutos que no quedaron grabados entre una parte y la siguiente. */
  gaps: { afterPart: number; seconds: number }[]
  /** true si los desfases salen de sumar duraciones por falta de reloj. */
  assumedContiguous: boolean
}

/**
 * Junta las partes de cada grabación en una fuente ordenada.
 *
 * La transcripción recorre las partes en secuencia y desplaza los tiempos con
 * `offsetSeconds`: nunca se pegan los archivos, porque mover gigabytes para
 * producir algo que se usa una vez es caro y frágil. Los huecos viajan con la
 * fuente para que un silencio de cuatro minutos no se lea como parte de la
 * conversación.
 */
function buildSources(entries: readonly InventoryEntry[]): PlanSource[] {
  const grouped = new Map<string, InventoryEntry[]>()
  const singles: InventoryEntry[] = []

  for (const entry of entries) {
    // Se comprueba por falsedad y no contra null: un inventario producido en
    // local puede omitir los campos en vez de mandarlos nulos, y una clave
    // vacía tampoco identifica ninguna grabación.
    if (!entry.recordingKey || !entry.partNumber) {
      singles.push(entry)
      continue
    }
    const list = grouped.get(entry.recordingKey)
    if (list) list.push(entry)
    else grouped.set(entry.recordingKey, [entry])
  }

  const sources: PlanSource[] = singles.map((entry) => ({
    recordingKey: null,
    micNumber: entry.micNumber,
    parts: [
      {
        storageKey: entry.storageKey,
        partNumber: 1,
        offsetSeconds: 0,
        durationSeconds: entry.durationSeconds ?? null,
      },
    ],
    gaps: [],
    assumedContiguous: false,
  }))

  for (const [recordingKey, list] of grouped) {
    list.sort((a, b) => (a.partNumber as number) - (b.partNumber as number))
    const { offsets, gaps, assumedContiguous } = computeOffsets(
      list.map((e) => ({
        filename: e.originalFilename,
        modifiedAt: e.recordedAt ? new Date(e.recordedAt) : null,
        durationSeconds: e.durationSeconds,
      })),
    )

    sources.push({
      recordingKey,
      micNumber: list[0]!.micNumber,
      parts: list.map((entry, i) => ({
        storageKey: entry.storageKey,
        partNumber: entry.partNumber as number,
        offsetSeconds: offsets[i] ?? null,
        durationSeconds: entry.durationSeconds ?? null,
      })),
      gaps,
      assumedContiguous,
    })
  }

  return sources
}

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
    .select('id, name, mic_number, role')
    .eq('session_id', ctx.sessionId)

  if (error) throw new Error(`No se pudieron leer los participantes: ${error.message}`)

  const byMic = new Map((participants ?? []).map((p) => [p.mic_number, p]))
  const unassignedMics = micTracks
    .map((t) => t.micNumber)
    .filter((n): n is number => n !== null && !byMic.has(n))

  return writeArtifact(ctx, 'transcription_plan', {
    version: 2,
    sessionId: ctx.sessionId,
    generatedAt: new Date().toISOString(),
    branch,
    micTracks: buildSources(micTracks).map((source) => {
      const person = source.micNumber !== null ? byMic.get(source.micNumber) : undefined
      return {
        ...source,
        participantId: person?.id ?? null,
        participantName: person?.name ?? null,
        role: person?.role ?? null,
        // Lo que dice el moderador o la marca no es opinión de consumidor. Se
        // transcribe igual —hace falta para leer la conversación— pero viaja
        // marcado para que los agregados no lo cuenten.
        countsInAnalysis: person ? person.role === 'participant' : null,
      }
    }),
    roomMix: buildSources(roomMix),
    // Micrófonos grabados que no corresponden a ningún participante del listado.
    // No frena el plan: se transcriben igual y quedan sin nombre hasta que
    // alguien complete la asignación.
    unassignedMics,
  })
}

/**
 * Paso 3 · Transcripción.
 *
 * La app no transcribe. El audio de un bloque son gigas que ya están en el
 * disco del operador, y volver a subirlos a una API en trozos cuesta más que
 * correr el modelo ahí mismo (D19, D23). WAV Ingest publica el artifact y este
 * paso se salta solo.
 *
 * Mientras ese lado no exista, el paso falla diciendo exactamente qué falta.
 * Es preferible a un paso que no está: así la cadena nombra el hueco en vez de
 * terminar en verde sin transcripción.
 */
const runTranscribe: StepRunner = async () => {
  throw new Error(
    'Todavía no hay transcripción para este bloque. La produce WAV Ingest en local ' +
      'y la publica como artifact; la app no transcribe en la nube.',
  )
}

/** La clave del artifact ya publicado, sea quien sea que lo haya dejado. */
async function artifactKeyFor(ctx: StepContext, kind: string): Promise<string | null> {
  const { data } = await ctx.supabase
    .from('artifacts')
    .select('storage_key')
    .eq('session_id', ctx.sessionId)
    .eq('kind', kind)
    .maybeSingle()
  return data?.storage_key ?? null
}

/**
 * Paso 4 · Atribución.
 *
 * Lee la transcripción, alinea los tiempos contra el inicio del bloque y le
 * pone nombre a quien habla cruzando el número de micrófono con el listado de
 * participantes. Escribe verbatims.
 *
 * Su artifact es el acuse: existe si y solo si los verbatims quedaron escritos.
 */
const runAttribute: StepRunner = async (ctx) => {
  const key = await artifactKeyFor(ctx, 'transcript_json')
  if (!key) throw new Error('No hay artifact de transcripción para este bloque.')

  const artifact = parseTranscriptArtifact(await storage.getText(key))

  const [{ data: participants, error: peopleError }, { data: files, error: filesError }] =
    await Promise.all([
      ctx.supabase
        .from('participants')
        .select('id, mic_number')
        .eq('session_id', ctx.sessionId),
      ctx.supabase
        .from('media_files')
        .select('id, recording_key, part_number, duration_seconds, recorded_at')
        .eq('session_id', ctx.sessionId),
    ])

  if (peopleError) throw new Error(`No se pudieron leer los participantes: ${peopleError.message}`)
  if (filesError) throw new Error(`No se pudo leer el material: ${filesError.message}`)

  const participantByMic = new Map<number, string>()
  for (const person of participants ?? []) {
    if (person.mic_number !== null) participantByMic.set(person.mic_number, person.id)
  }

  // Las partes de cada grabación, con su desfase dentro de ella: es lo que
  // permite decir de qué archivo salió cada tramo.
  const grouped = new Map<string, typeof files>()
  for (const file of files ?? []) {
    if (!file.recording_key) continue
    const list = grouped.get(file.recording_key)
    if (list) list.push(file)
    else grouped.set(file.recording_key, [file])
  }

  const partsByRecording = new Map<string, PartRef[]>()
  for (const [recordingKey, list] of grouped) {
    list!.sort((a, b) => (a.part_number ?? 0) - (b.part_number ?? 0))
    const { offsets } = computeOffsets(
      list!.map((f) => ({
        filename: f.id,
        startsAt: f.recorded_at ? new Date(f.recorded_at) : null,
        durationSeconds: f.duration_seconds,
      })),
    )
    partsByRecording.set(
      recordingKey,
      list!.map((file, i) => ({
        mediaFileId: file.id,
        offsetSeconds: offsets[i] ?? 0,
        durationSeconds: file.duration_seconds,
      })),
    )
  }

  const drafts = toVerbatims(artifact, { participantByMic, partsByRecording })
  if (drafts.length === 0) throw new Error('La transcripción no trajo ningún segmento.')

  // Borrar antes de insertar: re-correr el paso reemplaza la transcripción en
  // vez de duplicarla. Es la contracara de que descartar el artifact sea la
  // forma de pedir que se rehaga.
  const { error: clearError } = await ctx.supabase
    .from('verbatims')
    .delete()
    .eq('session_id', ctx.sessionId)
  if (clearError) throw new Error(`No se pudo limpiar lo anterior: ${clearError.message}`)

  // En tandas: un bloque de tres horas son miles de segmentos y un insert
  // único se pasa del límite de tamaño del request.
  const BATCH = 500
  for (let i = 0; i < drafts.length; i += BATCH) {
    const { error } = await ctx.supabase.from('verbatims').insert(
      drafts.slice(i, i + BATCH).map((draft) => ({
        session_id: ctx.sessionId,
        participant_id: draft.participantId,
        speaker_label: draft.speakerLabel,
        start_ts: draft.startTs,
        end_ts: draft.endTs,
        text: draft.text,
        confidence: draft.confidence,
        media_file_id: draft.mediaFileId,
      })),
    )
    if (error) throw new Error(`No se pudieron escribir los verbatims: ${error.message}`)
  }

  return writeArtifact(ctx, 'verbatims_index', {
    version: 1,
    sessionId: ctx.sessionId,
    generatedAt: new Date().toISOString(),
    producer: artifact.producer,
    language: artifact.language,
    ...statsFor(drafts),
  })
}

export const RUNNERS: Record<string, StepRunner> = {
  inventario: runInventory,
  plan_transcripcion: runTranscriptionPlan,
  transcribir: runTranscribe,
  atribuir: runAttribute,
}
