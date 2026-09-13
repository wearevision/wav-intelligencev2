// Puerta client-safe: tipos, lógica pura y copy. Las consultas viven en ./server.
export type { Participant, ParticipantInput, ParticipantRole } from './types'
export type { MicCoverage, ParsedRosterLine, RosterSummary } from './model'
export {
  ROLES,
  countsInAnalysis,
  duplicateMics,
  micCoverage,
  nextFreeMic,
  parseRoster,
  summarize,
} from './model'
export { participantsCopy, roleLabels, roleNotes } from './copy'
