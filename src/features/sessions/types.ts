export interface StudySession {
  id: string
  dayNumber: number | null
  blockNumber: number | null
  /** `d{día}b{bloque}`, generado por la base. Null si falta día o bloque. */
  code: string | null
  name: string
  scheduledAt: string | null
  venue: string | null
  moderatorName: string | null
  participantCount: number
}

export interface LogisticsInput {
  scheduledAt?: string | null
  venue?: string | null
  moderatorName?: string | null
}
