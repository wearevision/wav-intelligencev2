// Puerta client-safe: tipos, lógica pura y copy. Las consultas viven en ./server.
export type {
  BlockCoverage,
  BlockRef,
  FileMatch,
  FileRef,
  MatchReason,
  MediaKind,
  StoredMedia,
  UploadedRef,
} from './model'
export {
  blocksMissingAudio,
  classifyKind,
  coverageByBlock,
  coverageOf,
  findDuplicate,
  formatBytes,
  matchFile,
  matchFiles,
  needsAttention,
  parseCode,
  parseMicNumber,
} from './model'
export type { MediaFile, PresignInput, PresignResult, RegisterInput } from './types'
export { kindLabels, mediaCopy, reasonLabels } from './copy'
