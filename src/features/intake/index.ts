// Puerta client-safe: tipos y lógica pura. Las acciones viven en ./server.
export { detectStudyFile, hasSurveySignature } from './detect'
export type { StudyFileContent, StudyFileKind } from './detect'
export { normalizeName, planFingerprintSource, planRosterSync, toApplyPayload } from './roster-sync'
export type {
  ApplyPayload,
  BlockSync,
  ExistingParticipant,
  ExistingSession,
  RosterSyncPlan,
  SyncPerson,
} from './roster-sync'
