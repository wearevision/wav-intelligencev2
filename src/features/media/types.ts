import type { MediaKind } from './model'

/** Un archivo ya subido y registrado, tal como lo lee la app. */
export interface MediaFile {
  id: string
  sessionId: string
  kind: MediaKind
  storageKey: string
  originalFilename: string
  bytes: number | null
  durationSeconds: number | null
  micNumber: number | null
  /** Dónde quedó el master que nunca subió (D19). */
  sourcePath: string | null
  sourceHost: string | null
  createdAt: string
}

/** Lo que el cliente pide prefirmar antes de subir. */
export interface PresignInput {
  sessionId: string
  filename: string
  kind: MediaKind
  micNumber: number | null
  contentType: string | null
  bytes: number
}

export interface PresignResult {
  ok: boolean
  message?: string
  url?: string
  storageKey?: string
}

/** Lo que el cliente confirma una vez que R2 aceptó el objeto. */
export interface RegisterInput {
  sessionId: string
  storageKey: string
  filename: string
  kind: MediaKind
  micNumber: number | null
  bytes: number
}
