import { createClient } from '@/server/supabase/server'

import type { RunStatus, StepStatus } from './model'
import type { Artifact, PipelineRun, SessionPipeline } from './types'

/**
 * El estado de procesamiento de cada bloque de un estudio.
 *
 * Trae solo la corrida más reciente por bloque: el historial completo importa
 * cuando algo falla, y para eso está la vista de la corrida, no la grilla.
 */
export async function listStudyPipelines(studyId: string): Promise<SessionPipeline[]> {
  const supabase = await createClient()

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id')
    .eq('study_id', studyId)

  if (sessionsError) {
    throw new Error(`No se pudieron cargar las sesiones: ${sessionsError.message}`)
  }
  if (!sessions?.length) return []

  const sessionIds = sessions.map((s) => s.id)

  const [runsResult, artifactsResult] = await Promise.all([
    supabase
      .from('pipeline_runs')
      .select('id, session_id, status, started_at, finished_at, error, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('artifacts')
      .select('id, session_id, kind, storage_key, producer, bytes, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true }),
  ])

  if (runsResult.error) {
    throw new Error(`No se pudieron cargar las corridas: ${runsResult.error.message}`)
  }
  if (artifactsResult.error) {
    throw new Error(`No se pudieron cargar los artifacts: ${artifactsResult.error.message}`)
  }

  // La consulta viene ordenada por fecha descendente, así que la primera de
  // cada bloque es la última corrida.
  const latest = new Map<string, (typeof runsResult.data)[number]>()
  for (const run of runsResult.data ?? []) {
    if (!latest.has(run.session_id)) latest.set(run.session_id, run)
  }

  const steps = await loadSteps([...latest.values()].map((r) => r.id))

  const artifactsBySession = new Map<string, Artifact[]>()
  for (const row of artifactsResult.data ?? []) {
    const artifact: Artifact = {
      id: row.id,
      sessionId: row.session_id,
      kind: row.kind,
      storageKey: row.storage_key,
      producer: row.producer as Artifact['producer'],
      bytes: row.bytes,
      createdAt: row.created_at,
    }
    const list = artifactsBySession.get(row.session_id)
    if (list) list.push(artifact)
    else artifactsBySession.set(row.session_id, [artifact])
  }

  return sessionIds.map((sessionId) => {
    const row = latest.get(sessionId)
    const run: PipelineRun | null = row
      ? {
          id: row.id,
          sessionId: row.session_id,
          status: row.status as RunStatus,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          error: row.error,
          createdAt: row.created_at,
          steps: steps.get(row.id) ?? [],
        }
      : null

    return { sessionId, run, artifacts: artifactsBySession.get(sessionId) ?? [] }
  })
}

async function loadSteps(runIds: string[]) {
  const grouped = new Map<string, PipelineRun['steps']>()
  if (runIds.length === 0) return grouped

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pipeline_steps')
    .select('id, run_id, name, position, status, attempt, error')
    .in('run_id', runIds)
    .order('position', { ascending: true })

  if (error) throw new Error(`No se pudieron cargar los pasos: ${error.message}`)

  for (const row of data ?? []) {
    const step = {
      id: row.id,
      name: row.name,
      position: row.position,
      status: row.status as StepStatus,
      attempt: row.attempt,
      error: row.error,
    }
    const list = grouped.get(row.run_id)
    if (list) list.push(step)
    else grouped.set(row.run_id, [step])
  }

  return grouped
}
