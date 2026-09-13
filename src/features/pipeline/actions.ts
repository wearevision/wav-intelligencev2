'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/server/supabase/server'

import { initialSteps, nextStep, runOutcome, type ArtifactRef, type StepRow } from './model'
import { RUNNERS, type StepContext } from './steps'

export interface ActionResult {
  ok: boolean
  message?: string
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Cota dura del bucle del orquestador.
 *
 * Cada vuelta cierra un paso, así que con el catálogo actual sobra. Está para
 * que un bug en `nextStep` —devolver siempre el mismo paso, por ejemplo— se
 * note como un error y no como un servidor girando en el vacío.
 */
const MAX_ITERATIONS = 32

async function loadSession(
  supabase: Supabase,
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

async function loadState(
  supabase: Supabase,
  runId: string,
  sessionId: string,
): Promise<{ steps: StepRow[]; artifacts: ArtifactRef[] }> {
  const [stepsResult, artifactsResult] = await Promise.all([
    supabase
      .from('pipeline_steps')
      .select('id, name, position, status, attempt, error')
      .eq('run_id', runId)
      .order('position', { ascending: true }),
    supabase.from('artifacts').select('kind, storage_key, producer').eq('session_id', sessionId),
  ])

  if (stepsResult.error) throw new Error(stepsResult.error.message)
  if (artifactsResult.error) throw new Error(artifactsResult.error.message)

  return {
    steps: (stepsResult.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      status: s.status as StepRow['status'],
      attempt: s.attempt,
      error: s.error,
    })),
    artifacts: (artifactsResult.data ?? []).map((a) => ({
      kind: a.kind,
      storageKey: a.storage_key,
      producer: a.producer as ArtifactRef['producer'],
    })),
  }
}

async function finishRun(supabase: Supabase, runId: string, steps: StepRow[], error?: string) {
  const status = error ? 'failed' : runOutcome(steps)
  await supabase
    .from('pipeline_runs')
    .update({
      status,
      error: error ?? null,
      finished_at: status === 'done' || status === 'failed' ? new Date().toISOString() : null,
    })
    .eq('id', runId)
}

/**
 * Corre la cadena hasta que termine o se caiga.
 *
 * Cada vuelta relee el estado desde la base en vez de arrastrarlo en memoria:
 * un artifact que apareció mientras tanto —WAV Ingest publicando desde el
 * escritorio— se toma en cuenta en la vuelta siguiente sin nada especial.
 */
async function drive(supabase: Supabase, ctx: StepContext, runId: string): Promise<ActionResult> {
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { steps, artifacts } = await loadState(supabase, runId, ctx.sessionId)
    const next = nextStep(steps, artifacts)

    if (next.kind === 'finished') {
      await finishRun(supabase, runId, steps)
      return { ok: true }
    }

    if (next.kind === 'skip') {
      await supabase
        .from('pipeline_steps')
        .update({ status: 'skipped', finished_at: new Date().toISOString(), error: null })
        .eq('id', next.step.id)
      continue
    }

    if (next.kind === 'blocked' || next.kind === 'unknown') {
      const message =
        next.kind === 'blocked'
          ? `Falta ${next.missing.join(', ')} para poder correr «${next.step.name}».`
          : `El paso «${next.step.name}» ya no existe en el catálogo. Empieza una corrida nueva.`

      await supabase
        .from('pipeline_steps')
        .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
        .eq('id', next.step.id)
      await finishRun(supabase, runId, steps, message)
      return { ok: false, message }
    }

    const runner = RUNNERS[next.definition.name]
    if (!runner) {
      const message = `No hay implementación para «${next.definition.name}».`
      await finishRun(supabase, runId, steps, message)
      return { ok: false, message }
    }

    await supabase
      .from('pipeline_steps')
      .update({
        status: 'running',
        attempt: next.step.attempt + 1,
        started_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', next.step.id)

    try {
      const output = await runner(ctx)

      // Upsert y no insert: re-correr un paso reemplaza su salida en vez de
      // chocar contra el único (session_id, kind).
      const { error } = await supabase.from('artifacts').upsert(
        {
          session_id: ctx.sessionId,
          kind: output.kind,
          storage_key: output.storageKey,
          producer: 'cloud',
          bytes: output.bytes,
        },
        { onConflict: 'session_id,kind' },
      )
      if (error) throw new Error(`No se pudo registrar el artifact: ${error.message}`)

      await supabase
        .from('pipeline_steps')
        .update({ status: 'done', finished_at: new Date().toISOString(), error: null })
        .eq('id', next.step.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      await supabase
        .from('pipeline_steps')
        .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
        .eq('id', next.step.id)
      const after = await loadState(supabase, runId, ctx.sessionId)
      await finishRun(supabase, runId, after.steps)
      return { ok: false, message }
    }
  }

  const message = 'El orquestador dio demasiadas vueltas sin terminar.'
  await finishRun(supabase, runId, [], message)
  return { ok: false, message }
}

const idSchema = z.uuid()

/**
 * Abre una corrida y la lleva hasta el final.
 *
 * Si ya hay una corrida viva para el bloque la reusa: el índice único de la
 * base lo impide de todos modos, y reusarla es lo que hace que el botón sirva
 * también para retomar una que quedó a medias.
 */
export async function startProcessing(studyId: string, sessionId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(sessionId).success) return { ok: false, message: 'Id inválido' }

  const supabase = await createClient()
  const session = await loadSession(supabase, studyId, sessionId)
  if (!session.ok) return { ok: false, message: session.message }

  const { data: active, error: activeError } = await supabase
    .from('pipeline_runs')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', ['pending', 'running'])
    .maybeSingle()

  if (activeError) return { ok: false, message: activeError.message }

  let runId = active?.id ?? null

  if (!runId) {
    const { data: created, error: createError } = await supabase
      .from('pipeline_runs')
      .insert({ session_id: sessionId, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single()

    if (createError) return { ok: false, message: createError.message }
    runId = created.id

    const { error: stepsError } = await supabase
      .from('pipeline_steps')
      .insert(initialSteps().map((s) => ({ ...s, run_id: runId as string })))

    if (stepsError) return { ok: false, message: stepsError.message }
  } else {
    await supabase.from('pipeline_runs').update({ status: 'running' }).eq('id', runId)
  }

  const result = await drive(
    supabase,
    { supabase, studyId, sessionId, code: session.code },
    runId,
  )
  revalidatePath(`/studies/${studyId}`)
  return result
}

/**
 * Vuelve a intentar una corrida caída.
 *
 * Solo los pasos fallados vuelven a `pending`: lo que ya salió bien se queda
 * como está y, aunque no lo estuviera, su artifact haría que se saltara igual.
 */
export async function retryRun(studyId: string, runId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(runId).success) return { ok: false, message: 'Id inválido' }

  const supabase = await createClient()
  const { data: run, error } = await supabase
    .from('pipeline_runs')
    .select('id, session_id')
    .eq('id', runId)
    .maybeSingle()

  if (error) return { ok: false, message: error.message }
  if (!run) return { ok: false, message: 'La corrida no existe.' }

  const session = await loadSession(supabase, studyId, run.session_id)
  if (!session.ok) return { ok: false, message: session.message }

  await supabase
    .from('pipeline_steps')
    .update({ status: 'pending', error: null, finished_at: null })
    .eq('run_id', runId)
    .eq('status', 'failed')

  await supabase
    .from('pipeline_runs')
    .update({ status: 'running', error: null, finished_at: null })
    .eq('id', runId)

  const result = await drive(
    supabase,
    { supabase, studyId, sessionId: run.session_id, code: session.code },
    runId,
  )
  revalidatePath(`/studies/${studyId}`)
  return result
}

/**
 * Borra un artifact para forzar que su paso se rehaga.
 *
 * Es la contracara de la regla: si el casillero decide, vaciarlo es la forma
 * de pedir que se vuelva a hacer. No hace falta un "forzar" por paso.
 *
 * El objeto en R2 se queda: la clave del artifact es determinística, así que
 * rehacer el paso lo pisa. Borrarlo acá solo abriría una ventana en la que el
 * paso ya no tiene salida y todavía no la rehizo.
 */
export async function discardArtifact(studyId: string, artifactId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(artifactId).success) return { ok: false, message: 'Id inválido' }

  const supabase = await createClient()
  const { error } = await supabase.from('artifacts').delete().eq('id', artifactId)
  if (error) return { ok: false, message: error.message }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}
