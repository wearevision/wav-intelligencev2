import type { Study, StudyStage } from './types'

/** Lo que impide cerrar una etapa. Espeja private.stage_blockers() en la base. */
export interface Blocker {
  kind: 'task' | 'file'
  label: string
}

const CLOSED: ReadonlySet<string> = new Set(['done', 'skipped'])

/**
 * Tareas bloqueantes sin hacer y archivos requeridos sin adjuntar.
 *
 * Duplica a propósito la regla que el trigger de la base ya hace cumplir: acá
 * sirve para mostrar qué falta antes de intentar; la base sigue siendo la
 * autoridad y rechaza igual si esto se equivoca.
 */
export function blockersFor(stage: StudyStage): Blocker[] {
  return [
    ...stage.tasks
      .filter((task) => task.isBlocking && task.doneAt === null)
      .map((task): Blocker => ({ kind: 'task', label: task.name })),
    ...stage.files
      .filter((file) => file.isRequired && file.storageKey === null)
      .map((file): Blocker => ({ kind: 'file', label: file.label })),
  ]
}

export function canClose(stage: StudyStage): boolean {
  return blockersFor(stage).length === 0
}

export function isClosed(stage: StudyStage): boolean {
  return CLOSED.has(stage.status)
}

/** La primera etapa que todavía no está cerrada. Null si el estudio terminó. */
export function currentStage(stages: readonly StudyStage[]): StudyStage | null {
  return [...stages].sort((a, b) => a.position - b.position).find((s) => !isClosed(s)) ?? null
}

export function progress(stages: readonly StudyStage[]): { done: number; total: number } {
  return { done: stages.filter(isClosed).length, total: stages.length }
}

/** Una etapa abierta cuyo vencimiento ya pasó. Derivado, nunca almacenado (D8). */
export function isOverdue(stage: StudyStage, today: Date): boolean {
  if (isClosed(stage) || stage.dueOn === null) return false
  return stage.dueOn < toIsoDate(today)
}

export function overdueStages(study: Study, today: Date): StudyStage[] {
  return study.stages.filter((stage) => isOverdue(stage, today))
}

/** Días hasta el vencimiento. Negativo si ya pasó. */
export function daysUntil(dueOn: string, today: Date): number {
  const due = Date.parse(`${dueOn}T00:00:00Z`)
  const now = Date.parse(`${toIsoDate(today)}T00:00:00Z`)
  return Math.round((due - now) / 86_400_000)
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
