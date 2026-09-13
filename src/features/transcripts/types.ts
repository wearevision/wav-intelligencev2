export interface Verbatim {
  id: string
  sessionId: string
  participantId: string | null
  /** El nombre ya resuelto, para no volver a cruzarlo en cada vista. */
  participantName: string | null
  speakerLabel: string | null
  startTs: number
  endTs: number
  text: string
  confidence: number | null
}

export interface BlockTranscriptSummary {
  sessionId: string
  segments: number
  /** Cuántos quedaron sin persona: es lo que hay que ir a arreglar. */
  unattributed: number
}
