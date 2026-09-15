import type { ArtifactProducer, RunStatus, StepRow } from './model'

export interface PipelineRun {
  id: string
  sessionId: string
  status: RunStatus
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  createdAt: string
  steps: StepRow[]
}

export interface Artifact {
  id: string
  sessionId: string
  kind: string
  storageKey: string
  producer: ArtifactProducer
  bytes: number | null
  createdAt: string
}

/** Lo que la interfaz necesita de un bloque para mostrar su procesamiento. */
export interface SessionPipeline {
  sessionId: string
  run: PipelineRun | null
  artifacts: Artifact[]
}
