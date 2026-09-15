import type { Enums } from '@/lib/supabase/database.types'

export type StageStatus = Enums<'stage_status'>
export type StudyStatus = Enums<'study_status'>

export interface StudyTask {
  id: string
  name: string
  isBlocking: boolean
  dueOn: string | null
  doneAt: string | null
}

export interface StudyStageFile {
  id: string
  label: string
  isRequired: boolean
  storageKey: string | null
  filename: string | null
}

export interface StudyStage {
  id: string
  position: number
  name: string
  status: StageStatus
  dueOn: string | null
  completedAt: string | null
  tasks: StudyTask[]
  files: StudyStageFile[]
}

export interface Study {
  id: string
  name: string
  clientName: string | null
  fieldworkStart: string | null
  status: StudyStatus
  stages: StudyStage[]
}

export interface StudySummary {
  id: string
  name: string
  clientName: string | null
  fieldworkStart: string | null
  status: StudyStatus
  currentStageName: string | null
  doneStages: number
  totalStages: number
}
