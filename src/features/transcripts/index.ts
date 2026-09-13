// Puerta client-safe: contrato, lógica pura y copy. Las consultas viven en ./server.
export type {
  TranscriptArtifact,
  TranscriptSegment,
  TranscriptSource,
} from './contract'
export { parseTranscriptArtifact, transcriptArtifactSchema } from './contract'
export type { AttributionContext, DraftVerbatim, PartRef, TranscriptStats } from './model'
export {
  blockStartMs,
  formatTimestamp,
  resolvePart,
  sourceOffset,
  statsFor,
  toVerbatims,
} from './model'
export type { BlockTranscriptSummary, Verbatim } from './types'
export { transcriptsCopy } from './copy'
