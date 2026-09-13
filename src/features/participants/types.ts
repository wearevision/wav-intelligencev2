export type ParticipantRole = 'participant' | 'moderator' | 'brand_staff' | 'observer'

export type Segment = 'client' | 'non_client'

export interface Participant {
  id: string
  sessionId: string
  name: string
  /** Qué micrófono lleva puesto. Es lo que permite saber quién dijo qué. */
  micNumber: number | null
  seatNumber: number | null
  role: ParticipantRole
  /** Si ya es cliente de la marca. Null para moderador, marca y observadores. */
  segment: Segment | null
}

export interface ParticipantInput {
  name: string
  micNumber: number | null
  role: ParticipantRole
  segment: Segment | null
}
