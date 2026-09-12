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
