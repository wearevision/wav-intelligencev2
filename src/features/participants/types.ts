export type ParticipantRole = 'participant' | 'moderator' | 'brand_staff' | 'observer'

export interface Participant {
  id: string
  sessionId: string
  name: string
  /** Qué micrófono lleva puesto. Es lo que permite saber quién dijo qué. */
  micNumber: number | null
  seatNumber: number | null
  role: ParticipantRole
}

export interface ParticipantInput {
  name: string
  micNumber: number | null
  role: ParticipantRole
}
