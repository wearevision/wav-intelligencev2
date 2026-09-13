// Puerta client-safe: tipos, lógica pura y copy. El runner vive en ./server.
export type {
  ArtifactKind,
  ArtifactProducer,
  ArtifactRef,
  NextStep,
  RunStatus,
  StepDefinition,
  StepRow,
  StepStatus,
} from './model'
export {
  STEPS,
  findArtifact,
  initialSteps,
  isTerminal,
  isUsable,
  missingRequirements,
  nextStep,
  runOutcome,
  runProgress,
  shouldSkip,
  stepDefinition,
} from './model'
export type { Artifact, PipelineRun, SessionPipeline } from './types'
export {
  artifactLabel,
  pipelineCopy,
  producerLabels,
  runStatusLabels,
  stepStatusLabels,
} from './copy'
