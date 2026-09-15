'use server'

import { createHash } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseRosterWorkbook } from '@/features/participants'
import { attachStageFile } from '@/features/studies/server'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/server/supabase/server'
import { readWorkbook } from '@/server/xlsx/read'

import {
  detectStudyFile,
  hasSurveySignature,
  type StudyFileContent,
  type StudyFileKind,
} from './detect'
import {
  planFingerprintSource,
  planRosterSync,
  toApplyPayload,
  type ExistingParticipant,
  type ExistingSession,
  type RosterSyncPlan,
} from './roster-sync'

const MAX_FILE_BYTES = 25 * 1024 * 1024

const studyIdSchema = z.string().uuid()
const fingerprintSchema = z.union([z.literal(''), z.string().regex(/^[0-9a-f]{64}$/)])

export interface StudyFileReport {
  filename: string
  kind: StudyFileKind
  message: string | null
}

export interface StudyFilesPreview {
  ok: boolean
  message?: string
  files: StudyFileReport[]
  roster: {
    filename: string
    plan: Extract<RosterSyncPlan, { ok: true }>
    fingerprint: string
  } | null
}

/** `notice`: los datos quedaron escritos pero algo secundario (el adjunto del original) falló. */
export type ApplyResult =
  { ok: true; notice: string | null } | { ok: false; message: string; preview?: StudyFilesPreview }

async function readContent(file: File): Promise<StudyFileContent> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  const name = file.name.toLowerCase()
  if (isZip && (name.endsWith('.xlsx') || name.endsWith('.xlsm'))) {
    return { kind: 'xlsx', sheets: await readWorkbook(bytes.buffer as ArrayBuffer) }
  }
  if (isZip && name.endsWith('.docx')) return { kind: 'docx' }
  return { kind: 'unknown' }
}

async function buildPreview(studyId: string, formData: FormData): Promise<StudyFilesPreview> {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0)
    return { ok: false, message: 'No llegó ningún archivo.', files: [], roster: null }

  const supabase = await createClient()
  const reports: StudyFileReport[] = []
  let roster: StudyFilesPreview['roster'] = null

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      reports.push({ filename: file.name, kind: 'unknown', message: 'Supera los 25 MB.' })
      continue
    }
    let content: StudyFileContent
    try {
      content = await readContent(file)
    } catch (error) {
      reports.push({
        filename: file.name,
        kind: 'unknown',
        message: `No se pudo leer: ${error instanceof Error ? error.message : 'formato desconocido'}`,
      })
      continue
    }
    const kind = detectStudyFile(content)

    if (kind !== 'roster' || content.kind !== 'xlsx') {
      reports.push({ filename: file.name, kind, message: null })
      continue
    }
    if (roster) {
      reports.push({
        filename: file.name,
        kind,
        message: 'Ya hay otra convocatoria en esta subida; se usa la primera.',
      })
      continue
    }

    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('fieldwork_start')
      .eq('id', studyId)
      .single()
    if (studyError) return { ok: false, message: studyError.message, files: reports, roster: null }
    if (!study?.fieldwork_start) {
      reports.push({
        filename: file.name,
        kind,
        message:
          'El estudio no tiene fecha de inicio de terreno; hace falta para saber el año de las hojas.',
      })
      continue
    }

    const { data: sessionRows, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, day_number, block_number, code, scheduled_at')
      .eq('study_id', studyId)
    if (sessionsError)
      return { ok: false, message: sessionsError.message, files: reports, roster: null }

    const sessions: ExistingSession[] = (sessionRows ?? []).map((s) => ({
      id: s.id,
      dayNumber: s.day_number ?? 0,
      blockNumber: s.block_number ?? 0,
      code: s.code ?? '',
      scheduledAt: s.scheduled_at,
    }))
    const sessionIds = sessions.map((s) => s.id)

    const { data: people, error: peopleError } = sessionIds.length
      ? await supabase
          .from('participants')
          .select('id, session_id, name, mic_number, role, segment')
          .in('session_id', sessionIds)
      : { data: [], error: null }
    if (peopleError)
      return { ok: false, message: peopleError.message, files: reports, roster: null }

    const { data: authored, error: verbatimsError } = sessionIds.length
      ? await supabase
          .from('verbatims')
          .select('participant_id')
          .in('session_id', sessionIds)
          .not('participant_id', 'is', null)
      : { data: [], error: null }
    if (verbatimsError)
      return { ok: false, message: verbatimsError.message, files: reports, roster: null }

    const verbatimsByParticipant = new Map<string, number>()
    for (const v of authored ?? []) {
      if (v.participant_id)
        verbatimsByParticipant.set(
          v.participant_id,
          (verbatimsByParticipant.get(v.participant_id) ?? 0) + 1,
        )
    }
    const participants: ExistingParticipant[] = (people ?? []).map((p) => ({
      id: p.id,
      sessionId: p.session_id,
      name: p.name,
      micNumber: p.mic_number,
      role: p.role as ExistingParticipant['role'],
      segment: p.segment as ExistingParticipant['segment'],
      verbatims: verbatimsByParticipant.get(p.id) ?? 0,
    }))

    const plan = planRosterSync({
      days: parseRosterWorkbook(content.sheets),
      year: Number(String(study.fieldwork_start).slice(0, 4)),
      sessions,
      participants,
    })
    if (!plan.ok) {
      reports.push({ filename: file.name, kind, message: plan.error })
      continue
    }

    if (hasSurveySignature(content.sheets)) {
      plan.warnings.push(
        `${file.name}: también trae la forma de las respuestas del formulario; se interpreta como convocatoria.`,
      )
    }

    const fingerprint = createHash('sha256').update(planFingerprintSource(plan)).digest('hex')
    reports.push({ filename: file.name, kind, message: null })
    roster = { filename: file.name, plan, fingerprint }
  }

  return { ok: true, files: reports, roster }
}

/** Lee los archivos y muestra qué haría, sin escribir nada. */
export async function previewStudyFiles(
  studyId: string,
  formData: FormData,
): Promise<StudyFilesPreview> {
  if (!studyIdSchema.safeParse(studyId).success) {
    return { ok: false, message: 'Estudio inválido.', files: [], roster: null }
  }
  return buildPreview(studyId, formData)
}

const STAGE_LABEL: Partial<Record<StudyFileKind, string>> = {
  roster: 'Listado de invitados',
  guide: 'Guía del focus',
}

async function attachOriginal(studyId: string, file: File, label: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_stage_files')
    .select('id, study_stage_id, study_stages!inner(study_id)')
    .eq('study_stages.study_id', studyId)
    .eq('label', label)
    .limit(1)
  if (error) return error.message
  const target = data?.[0]
  if (!target) return `El estudio no tiene el adjunto «${label}».`

  const form = new FormData()
  form.set('fileId', target.id)
  form.set('studyId', studyId)
  form.set('stageId', target.study_stage_id)
  form.set('file', file)
  const result = await attachStageFile(form)
  return result.ok ? null : (result.message ?? 'No se pudo adjuntar.')
}

/**
 * Recalcula el plan con el mismo archivo y lo aplica solo si su huella es la de
 * la vista previa: nunca se borra a alguien que la persona no vio en la lista.
 */
export async function applyStudyFiles(
  studyId: string,
  formData: FormData,
  fingerprint: string,
): Promise<ApplyResult> {
  if (!studyIdSchema.safeParse(studyId).success) return { ok: false, message: 'Estudio inválido.' }
  if (!fingerprintSchema.safeParse(fingerprint).success) {
    return { ok: false, message: 'La vista previa no es válida. Vuelve a subir los archivos.' }
  }
  const preview = await buildPreview(studyId, formData)
  if (!preview.ok) return { ok: false, message: preview.message ?? 'No se pudo leer.' }

  if (preview.roster) {
    if (preview.roster.fingerprint !== fingerprint) {
      return {
        ok: false,
        message: 'El estudio cambió desde la vista previa. Revisa la nueva antes de confirmar.',
        preview,
      }
    }
    const supabase = await createClient()
    const { error } = await supabase.rpc('apply_roster_sync', {
      p_study_id: studyId,
      p_plan: toApplyPayload(preview.roster.plan) as unknown as Json,
    })
    if (error) return { ok: false, message: error.message }
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  const problems: string[] = []
  for (const report of preview.files) {
    const label = STAGE_LABEL[report.kind]
    const file = files.find((f) => f.name === report.filename)
    if (!label || !file || report.message) continue
    const problem = await attachOriginal(studyId, file, label)
    if (problem) problems.push(`${report.filename}: ${problem}`)
  }

  revalidatePath(`/studies/${studyId}`)
  return {
    ok: true,
    notice:
      problems.length === 0
        ? null
        : `Los datos quedaron cargados, pero no se pudo guardar el original: ${problems.join(' · ')}`,
  }
}
