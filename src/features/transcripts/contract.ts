import { z } from 'zod'

/**
 * El artifact de transcripción, tal como lo publica quien la produjo.
 *
 * Lo produce WAV Ingest con whisper.cpp sobre los archivos que ya están en el
 * disco del operador (D19/D23). La app lo ingesta; no transcribe.
 *
 * Va versionado y se valida al leerlo: un artifact con otra forma tiene que
 * fallar diciendo qué pasa, no escribir verbatims a medias que después nadie
 * sabe de dónde salieron.
 */

const segmentSchema = z.object({
  /** Segundos desde el inicio de **esta fuente**, no del bloque. */
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().trim().min(1),
  /** Lo que dijo el diarizador cuando no hay una pista por persona. */
  speakerLabel: z.string().trim().max(80).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
})

const sourceSchema = z.object({
  /** La grabación de la que salió. Null si era un archivo entero. */
  recordingKey: z.string().min(1).nullish(),
  /**
   * Qué parte de la grabación es esta fuente.
   *
   * Cuando viene, cada parte es su propia fuente con su propio cero, y el
   * archivo del que salió cada tramo se resuelve por `(grabación, parte)` en
   * vez de calcularlo desde el desfase. Es exacto y le ahorra al productor
   * tener que concatenar nada.
   */
  partNumber: z.number().int().min(1).max(999).nullish(),
  /** El micrófono, que es lo que permite ponerle nombre a quien habla. */
  micNumber: z.number().int().min(1).max(99).nullish(),
  /**
   * Cuándo empezó a grabar esta fuente, en absoluto.
   *
   * Es lo que permite alinear varias grabadoras que arrancaron a horas
   * distintas: en un bloque real una empieza 21:26 y otra 22:10, y sin la hora
   * absoluta las dos parecerían empezar en el mismo instante.
   */
  startedAt: z.iso.datetime(),
  segments: z.array(segmentSchema),
})

export const transcriptArtifactSchema = z.object({
  version: z.literal(1),
  sessionId: z.uuid(),
  generatedAt: z.iso.datetime(),
  /** Quién y con qué: "wav-ingest 3.0.0 · whisper.cpp large-v3". */
  producer: z.string().trim().min(1).max(200),
  language: z.string().trim().min(2).max(10),
  sources: z.array(sourceSchema).min(1),
})

export type TranscriptArtifact = z.infer<typeof transcriptArtifactSchema>
export type TranscriptSource = z.infer<typeof sourceSchema>
export type TranscriptSegment = z.infer<typeof segmentSchema>

/** Parsea con errores que dicen qué pasa, no "unexpected token". */
export function parseTranscriptArtifact(raw: string): TranscriptArtifact {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('El artifact de transcripción no es JSON válido.')
  }

  const parsed = transcriptArtifactSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.join('.') || 'la raíz'
    throw new Error(`El artifact de transcripción no tiene la forma esperada: ${where} — ${issue?.message ?? 'inválido'}`)
  }
  return parsed.data
}
