'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/server/supabase/server'

export interface ActionResult {
  ok: boolean
  message?: string
}

const createStudySchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  clientName: z.string().trim().max(200).optional(),
  fieldworkStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD')
    .optional(),
})

export async function createStudy(input: unknown): Promise<ActionResult & { studyId?: string }> {
  const parsed = createStudySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createClient()

  const { data: template, error: templateError } = await supabase
    .from('study_templates')
    .select('id')
    .eq('is_default', true)
    .maybeSingle()

  if (templateError) return { ok: false, message: templateError.message }
  if (!template) return { ok: false, message: 'No hay una plantilla por defecto configurada.' }

  const { data, error } = await supabase.rpc('create_study_from_template', {
    p_name: parsed.data.name,
    p_template_id: template.id,
    p_client_name: parsed.data.clientName || undefined,
    p_fieldwork_start: parsed.data.fieldworkStart || undefined,
  })

  if (error) return { ok: false, message: error.message }

  revalidatePath('/studies')
  return { ok: true, studyId: data }
}

/**
 * Cierra una etapa y pone en curso la siguiente.
 *
 * La compuerta la hace cumplir un trigger en la base, así que acá no se
 * revalida: se intenta y se traduce el rechazo. Si esto y la base discrepan,
 * gana la base.
 */
export async function advanceStage(stageId: string, studyId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: stage, error: readError } = await supabase
    .from('study_stages')
    .select('position')
    .eq('id', stageId)
    .maybeSingle()

  if (readError) return { ok: false, message: readError.message }
  if (!stage) return { ok: false, message: 'La etapa no existe.' }

  const { error } = await supabase
    .from('study_stages')
    .update({ status: 'done' })
    .eq('id', stageId)

  if (error) return { ok: false, message: error.message }

  const { data: next } = await supabase
    .from('study_stages')
    .select('id')
    .eq('study_id', studyId)
    .eq('status', 'pending')
    .gt('position', stage.position)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (next) {
    await supabase.from('study_stages').update({ status: 'in_progress' }).eq('id', next.id)
  }

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/studies')
  return { ok: true }
}

export async function setTaskDone(
  taskId: string,
  done: boolean,
  studyId: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('study_tasks')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', taskId)

  if (error) return { ok: false, message: error.message }

  revalidatePath(`/studies/${studyId}`)
  return { ok: true }
}

const BUCKET = 'study-files'
const MAX_BYTES = 25 * 1024 * 1024

/** Deja el nombre utilizable como parte de una ruta de storage. */
function safeFilename(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'archivo'
  )
}

export async function attachStageFile(formData: FormData): Promise<ActionResult> {
  const fileId = String(formData.get('fileId') ?? '')
  const studyId = String(formData.get('studyId') ?? '')
  const stageId = String(formData.get('stageId') ?? '')
  const upload = formData.get('file')

  if (!fileId || !studyId || !stageId) return { ok: false, message: 'Faltan datos del adjunto.' }
  if (!(upload instanceof File) || upload.size === 0) {
    return { ok: false, message: 'Selecciona un archivo.' }
  }
  if (upload.size > MAX_BYTES) {
    return { ok: false, message: 'El archivo supera los 25 MB.' }
  }

  const supabase = await createClient()
  const key = `${studyId}/${stageId}/${fileId}-${safeFilename(upload.name)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(key, upload, { upsert: true, contentType: upload.type || undefined })

  if (uploadError) return { ok: false, message: uploadError.message }

  const { error } = await supabase
    .from('study_stage_files')
    .update({
      storage_key: key,
      filename: upload.name,
      bytes: upload.size,
      uploaded_at: new Date().toISOString(),
    })
    .eq('id', fileId)

  if (error) {
    // La fila manda: si no se pudo registrar, el objeto huérfano se borra para
    // no dejar storage con archivos que nada referencia.
    await supabase.storage.from(BUCKET).remove([key])
    return { ok: false, message: error.message }
  }

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/')
  return { ok: true }
}

export async function detachStageFile(fileId: string, studyId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: row, error: readError } = await supabase
    .from('study_stage_files')
    .select('storage_key')
    .eq('id', fileId)
    .maybeSingle()

  if (readError) return { ok: false, message: readError.message }
  if (!row?.storage_key) return { ok: true }

  const { error } = await supabase
    .from('study_stage_files')
    .update({ storage_key: null, filename: null, bytes: null, uploaded_at: null })
    .eq('id', fileId)

  if (error) return { ok: false, message: error.message }

  // Best-effort: si el objeto no se borra, la fila ya dice que no hay adjunto.
  await supabase.storage.from(BUCKET).remove([row.storage_key])

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/')
  return { ok: true }
}

export async function stageFileUrl(fileId: string): Promise<ActionResult & { url?: string }> {
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('study_stage_files')
    .select('storage_key')
    .eq('id', fileId)
    .maybeSingle()

  if (error) return { ok: false, message: error.message }
  if (!row?.storage_key) return { ok: false, message: 'El archivo no está adjunto.' }

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_key, 60)
  if (signed.error) return { ok: false, message: signed.error.message }

  return { ok: true, url: signed.data.signedUrl }
}

const fieldworkSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD')
  .nullable()

/**
 * Mueve la fecha de terreno. El recálculo de toda la línea de tiempo lo hace un
 * trigger en la base (D14), respetando las etapas ya cerradas.
 */
export async function setFieldworkStart(
  studyId: string,
  value: string | null,
): Promise<ActionResult> {
  const parsed = fieldworkSchema.safeParse(value === '' ? null : value)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Fecha inválida' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('studies')
    .update({ fieldwork_start: parsed.data })
    .eq('id', studyId)

  if (error) return { ok: false, message: error.message }

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/')
  return { ok: true }
}
