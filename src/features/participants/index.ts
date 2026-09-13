// Puerta client-safe: tipos, lógica pura y copy. Las consultas viven en ./server.
export type { Participant, ParticipantInput, ParticipantRole, Segment } from './types'
export type { MicCoverage, ParsedRosterLine, RosterSummary } from './model'
export type { ImportedDay, ImportedPerson, SheetInput } from './roster-import'
export { parseRosterWorkbook } from './roster-import'
export {
  ROLES,
  countsInAnalysis,
  duplicateMics,
  micCoverage,
  nextFreeMic,
  parseRoster,
  summarize,
} from './model'
export { participantsCopy, roleLabels, roleNotes, segmentLabels } from './copy'
