/**
 * El pipeline como datos (F6b).
 *
 * La regla que hace que todo esto valga la pena: **un paso se salta si y solo
 * si su artifact de salida ya existe**. No hay un `if` por paso repartido por
 * el orquestador preguntando "¿esto ya se hizo?" — lo contesta el casillero.
 *
 * La consecuencia práctica: cuando WAV Ingest transcodifica en local y publica
 * el artifact, el pipeline se ajusta solo. No hace falta una columna nueva ni
 * una rama nueva; el paso simplemente encuentra su salida hecha y se corre al
 * costado.
 */

export type RunStatus = 'pending' | 'running' | 'done' | 'failed'
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'
export type ArtifactProducer = 'local' | 'cloud'

/**
 * Los tipos de artifact que la app conoce. La base los guarda como texto libre
 * a propósito: WAV Ingest publica los suyos y no debería necesitar una
 * migración para estrenar uno.
 */
export type ArtifactKind =
  | 'session_inventory'
  | 'transcription_plan'
  | 'hls_manifest'
  | 'transcript_json'
  | 'waveform'

export interface ArtifactRef {
  kind: string
  storageKey: string
  producer: ArtifactProducer
}

export interface StepDefinition {
  name: string
  position: number
  label: string
  /** Lo que este paso deja en el casillero al terminar. */
  produces: ArtifactKind
  /** Lo que necesita encontrar ya hecho para poder correr. */
  requires: readonly ArtifactKind[]
}

export interface StepRow {
  id: string
  name: string
  position: number
  status: StepStatus
  attempt: number
  error: string | null
}

/**
 * El catálogo de pasos vive en el código y no en la base: es lógica de la app,
 * y una fila por paso solo registra qué pasó con él en una corrida concreta.
 */
export const STEPS: readonly StepDefinition[] = [
  {
    name: 'inventario',
    position: 1,
    label: 'Inventario',
    produces: 'session_inventory',
    requires: [],
  },
  {
    name: 'plan_transcripcion',
    position: 2,
    label: 'Plan de transcripción',
    produces: 'transcription_plan',
    requires: ['session_inventory'],
  },
] as const

export function stepDefinition(name: string): StepDefinition | null {
  return STEPS.find((s) => s.name === name) ?? null
}

/**
 * Un artifact sirve si está y apunta a algún lado.
 *
 * Que el objeto exista de verdad en R2 lo comprueba el runner, que es quien
 * puede preguntarle al bucket. Acá se decide con lo que hay en la base.
 */
export function isUsable(artifact: ArtifactRef | null | undefined): boolean {
  return artifact !== null && artifact !== undefined && artifact.storageKey.trim().length > 0
}

export function findArtifact(
  kind: string,
  artifacts: readonly ArtifactRef[],
): ArtifactRef | null {
  return artifacts.find((a) => a.kind === kind) ?? null
}

/** La regla. */
export function shouldSkip(step: StepDefinition, artifacts: readonly ArtifactRef[]): boolean {
  return isUsable(findArtifact(step.produces, artifacts))
}

/** Lo que le falta a un paso para poder correr. Vacío significa que puede. */
export function missingRequirements(
  step: StepDefinition,
  artifacts: readonly ArtifactRef[],
): ArtifactKind[] {
  return step.requires.filter((kind) => !isUsable(findArtifact(kind, artifacts)))
}

export type NextStep =
  | { kind: 'run'; step: StepRow; definition: StepDefinition }
  | { kind: 'skip'; step: StepRow; definition: StepDefinition }
  | { kind: 'blocked'; step: StepRow; missing: ArtifactKind[] }
  | { kind: 'unknown'; step: StepRow }
  | { kind: 'finished' }

/**
 * Qué hacer a continuación, mirando los pasos por orden de posición.
 *
 * Un paso ya `done` o `skipped` no se vuelve a tocar: eso es lo que hace que
 * re-correr una corrida caída no repita lo que ya salió bien.
 */
export function nextStep(
  rows: readonly StepRow[],
  artifacts: readonly ArtifactRef[],
): NextStep {
  const ordered = [...rows].sort((a, b) => a.position - b.position)

  for (const step of ordered) {
    if (step.status === 'done' || step.status === 'skipped') continue

    const definition = stepDefinition(step.name)
    // Una fila cuyo paso ya no existe en el catálogo: una corrida vieja de
    // antes de un renombre. No se adivina qué era.
    if (!definition) return { kind: 'unknown', step }

    if (shouldSkip(definition, artifacts)) return { kind: 'skip', step, definition }

    const missing = missingRequirements(definition, artifacts)
    if (missing.length > 0) return { kind: 'blocked', step, missing }

    return { kind: 'run', step, definition }
  }

  return { kind: 'finished' }
}

export function runProgress(rows: readonly StepRow[]): { done: number; total: number } {
  return {
    done: rows.filter((s) => s.status === 'done' || s.status === 'skipped').length,
    total: rows.length,
  }
}

/** El estado de la corrida se deriva de sus pasos, no se guarda aparte. */
export function runOutcome(rows: readonly StepRow[]): RunStatus {
  if (rows.length === 0) return 'pending'
  if (rows.some((s) => s.status === 'running')) return 'running'
  if (rows.some((s) => s.status === 'failed')) return 'failed'
  if (rows.every((s) => s.status === 'done' || s.status === 'skipped')) return 'done'
  return 'pending'
}

export function isTerminal(status: RunStatus): boolean {
  return status === 'done' || status === 'failed'
}

/** Las filas que hay que crear al abrir una corrida. */
export function initialSteps(): { name: string; position: number }[] {
  return STEPS.map((s) => ({ name: s.name, position: s.position }))
}
