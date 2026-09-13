// Puerta client-safe: tipos, lógica pura y copy. Las consultas viven en ./server.
export type { StudySession, LogisticsInput } from './types'
export type { GridCell, GridRow, MissingPiece } from './model'
export {
  MAX_BLOCKS_PER_DAY,
  MAX_DAYS,
  buildGrid,
  expectedCodes,
  isValidShape,
  isoToLocalInput,
  localInputToIso,
  logisticsComplete,
  missingLogistics,
  sessionsOutsideGrid,
  studyShape,
} from './model'
export { sessionsCopy, blockLabel, dayLabel } from './copy'
