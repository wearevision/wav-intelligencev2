import { createClient } from '@/server/supabase/server'

import type { Study, StudyStage, StudySummary } from './types'

// Consultas planas en vez de selects anidados: los tipos generados que
// mantenemos no llevan `Relationships`, que es lo que supabase-js usa para
// inferir anidamientos. A esta escala son dos a cuatro viajes y el tipado es
// exacto, que vale más que ahorrar un round-trip.

function byPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position)
}

export async function listStudies(): Promise<StudySummary[]> {
  const supabase = await createClient()

  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, name, client_name, fieldwork_start, status')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los estudios: ${error.message}`)
  if (!studies?.length) return []

  const { data: stages, error: stagesError } = await supabase
    .from('study_stages')
    .select('study_id, position, name, status')
    .in(
      'study_id',
      studies.map((s) => s.id),
    )

  if (stagesError) throw new Error(`No se pudieron cargar las etapas: ${stagesError.message}`)

  return studies.map((study) => {
    const own = byPosition((stages ?? []).filter((s) => s.study_id === study.id))
    const current = own.find((s) => s.status !== 'done' && s.status !== 'skipped')

    return {
      id: study.id,
      name: study.name,
      clientName: study.client_name,
      fieldworkStart: study.fieldwork_start,
      status: study.status,
      currentStageName: current?.name ?? null,
      doneStages: own.filter((s) => s.status === 'done' || s.status === 'skipped').length,
      totalStages: own.length,
    }
  })
}

export async function getStudy(id: string): Promise<Study | null> {
  const supabase = await createClient()

  const { data: study, error } = await supabase
    .from('studies')
    .select('id, name, client_name, fieldwork_start, status')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo cargar el estudio: ${error.message}`)
  if (!study) return null

  const { data: stageRows, error: stagesError } = await supabase
    .from('study_stages')
    .select('id, position, name, status, due_on, completed_at')
    .eq('study_id', id)

  if (stagesError) throw new Error(`No se pudieron cargar las etapas: ${stagesError.message}`)

  const stageIds = (stageRows ?? []).map((s) => s.id)

  // Sin ternario: un `in` con lista vacía ya devuelve vacío, y mezclar la
  // consulta con un Promise.resolve({ data: [] }) colapsa la inferencia a never.
  const [tasks, files] = await Promise.all([
    supabase
      .from('study_tasks')
      .select('id, study_stage_id, position, name, is_blocking, due_on, done_at')
      .in('study_stage_id', stageIds),
    supabase
      .from('study_stage_files')
      .select('id, study_stage_id, label, is_required, storage_key, filename')
      .in('study_stage_id', stageIds),
  ])

  if (tasks.error) throw new Error(`No se pudieron cargar las tareas: ${tasks.error.message}`)
  if (files.error) throw new Error(`No se pudieron cargar los archivos: ${files.error.message}`)

  const stages: StudyStage[] = byPosition(stageRows ?? []).map((stage) => ({
    id: stage.id,
    position: stage.position,
    name: stage.name,
    status: stage.status,
    dueOn: stage.due_on,
    completedAt: stage.completed_at,
    tasks: byPosition((tasks.data ?? []).filter((t) => t.study_stage_id === stage.id)).map((t) => ({
      id: t.id,
      name: t.name,
      isBlocking: t.is_blocking,
      dueOn: t.due_on,
      doneAt: t.done_at,
    })),
    files: (files.data ?? [])
      .filter((f) => f.study_stage_id === stage.id)
      .map((f) => ({
        id: f.id,
        label: f.label,
        isRequired: f.is_required,
        storageKey: f.storage_key,
        filename: f.filename,
      })),
  }))

  return {
    id: study.id,
    name: study.name,
    clientName: study.client_name,
    fieldworkStart: study.fieldwork_start,
    status: study.status,
    stages,
  }
}

/**
 * Todos los estudios activos con sus etapas, tareas y archivos.
 *
 * La torre de control necesita el detalle completo para derivar alertas. A 1–3
 * estudios de diez etapas esto son cuatro consultas y unos cientos de filas;
 * si algún día son cientos de estudios, esto se paginará o se moverá a una vista.
 */
export async function listActiveStudiesDetail(): Promise<Study[]> {
  const supabase = await createClient()

  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, name, client_name, fieldwork_start, status')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los estudios: ${error.message}`)
  if (!studies?.length) return []

  const studyIds = studies.map((s) => s.id)

  const { data: stageRows, error: stagesError } = await supabase
    .from('study_stages')
    .select('id, study_id, position, name, status, due_on, completed_at')
    .in('study_id', studyIds)

  if (stagesError) throw new Error(`No se pudieron cargar las etapas: ${stagesError.message}`)

  const stageIds = (stageRows ?? []).map((s) => s.id)

  const [tasks, files] = await Promise.all([
    supabase
      .from('study_tasks')
      .select('id, study_stage_id, position, name, is_blocking, due_on, done_at')
      .in('study_stage_id', stageIds),
    supabase
      .from('study_stage_files')
      .select('id, study_stage_id, label, is_required, storage_key, filename')
      .in('study_stage_id', stageIds),
  ])

  if (tasks.error) throw new Error(`No se pudieron cargar las tareas: ${tasks.error.message}`)
  if (files.error) throw new Error(`No se pudieron cargar los archivos: ${files.error.message}`)

  return studies.map((study) => ({
    id: study.id,
    name: study.name,
    clientName: study.client_name,
    fieldworkStart: study.fieldwork_start,
    status: study.status,
    stages: byPosition((stageRows ?? []).filter((s) => s.study_id === study.id)).map((stage) => ({
      id: stage.id,
      position: stage.position,
      name: stage.name,
      status: stage.status,
      dueOn: stage.due_on,
      completedAt: stage.completed_at,
      tasks: byPosition((tasks.data ?? []).filter((t) => t.study_stage_id === stage.id)).map(
        (t) => ({
          id: t.id,
          name: t.name,
          isBlocking: t.is_blocking,
          dueOn: t.due_on,
          doneAt: t.done_at,
        }),
      ),
      files: (files.data ?? [])
        .filter((f) => f.study_stage_id === stage.id)
        .map((f) => ({
          id: f.id,
          label: f.label,
          isRequired: f.is_required,
          storageKey: f.storage_key,
          filename: f.filename,
        })),
    })),
  }))
}
