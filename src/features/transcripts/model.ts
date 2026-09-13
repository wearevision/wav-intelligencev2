import type { TranscriptArtifact, TranscriptSource } from './contract'

/**
 * De artifact a verbatims: alinear los tiempos y ponerle nombre a quien habla.
 *
 * Las dos cosas se hacen acá, puras y probadas, porque las dos fallan en
 * silencio: un tiempo corrido no rompe nada —simplemente el reproductor salta
 * al momento equivocado— y una atribución cruzada pone en boca de una persona
 * lo que dijo otra.
 */

export interface DraftVerbatim {
  participantId: string | null
  speakerLabel: string | null
  /** Segundos desde el inicio del bloque. */
  startTs: number
  endTs: number
  text: string
  confidence: number | null
  mediaFileId: string | null
}

/** Una parte ya subida, para saber de qué archivo salió cada tramo. */
export interface PartRef {
  mediaFileId: string
  /** Segundos desde el inicio de su grabación. */
  offsetSeconds: number
  durationSeconds: number | null
}

export interface AttributionContext {
  /** Micrófono → id del participante que lo llevaba. */
  participantByMic: ReadonlyMap<number, string>
  /** Clave de grabación → sus partes en orden. */
  partsByRecording: ReadonlyMap<string, readonly PartRef[]>
}

/**
 * El instante cero del bloque: la primera fuente que empezó a grabar.
 *
 * En un bloque real conviven varias grabadoras que arrancaron a horas
 * distintas —una 21:26, otra 22:10—. Sin un cero común cada transcripción
 * empezaría en su propio cero y quedarían superpuestas.
 */
export function blockStartMs(sources: readonly TranscriptSource[]): number | null {
  const times = sources
    .map((s) => Date.parse(s.startedAt))
    .filter((t) => !Number.isNaN(t))
  return times.length === 0 ? null : Math.min(...times)
}

/** Cuántos segundos después del inicio del bloque empezó esta fuente. */
export function sourceOffset(source: TranscriptSource, blockStart: number): number {
  const start = Date.parse(source.startedAt)
  if (Number.isNaN(start)) return 0
  return Math.max(0, (start - blockStart) / 1000)
}

/**
 * Qué archivo contiene un instante dado de la grabación.
 *
 * Sirve para poder rehacer una parte sin tocar el resto. Si las partes no
 * declaran duración se devuelve la última que empieza antes: es una
 * aproximación, y es mejor que no decir nada.
 */
export function resolvePart(
  offsetInRecording: number,
  parts: readonly PartRef[],
): string | null {
  let candidate: PartRef | null = null

  for (const part of parts) {
    if (part.offsetSeconds > offsetInRecording) break
    if (
      part.durationSeconds !== null &&
      offsetInRecording < part.offsetSeconds + part.durationSeconds
    ) {
      return part.mediaFileId
    }
    candidate = part
  }

  return candidate?.mediaFileId ?? null
}

/**
 * Convierte el artifact en verbatims listos para insertar.
 *
 * Los segmentos salen ordenados por tiempo de bloque y no por fuente: quien lee
 * la transcripción sigue la conversación, no una pista a la vez.
 */
export function toVerbatims(
  artifact: TranscriptArtifact,
  context: AttributionContext,
): DraftVerbatim[] {
  const blockStart = blockStartMs(artifact.sources)
  if (blockStart === null) return []

  const drafts: DraftVerbatim[] = []

  for (const source of artifact.sources) {
    const offset = sourceOffset(source, blockStart)
    // Una pista de micrófono es de una persona: el nombre sale del número, no
    // de lo que haya adivinado el diarizador.
    const participantId =
      source.micNumber !== null && source.micNumber !== undefined
        ? (context.participantByMic.get(source.micNumber) ?? null)
        : null
    const parts = source.recordingKey
      ? (context.partsByRecording.get(source.recordingKey) ?? [])
      : []

    for (const segment of source.segments) {
      if (segment.end < segment.start) continue

      drafts.push({
        participantId,
        speakerLabel: segment.speakerLabel ?? null,
        startTs: round(offset + segment.start),
        endTs: round(offset + segment.end),
        text: segment.text,
        confidence: segment.confidence ?? null,
        mediaFileId: resolvePart(segment.start, parts),
      })
    }
  }

  return drafts.sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs)
}

/** Tres decimales: es lo que guarda la columna, y redondear acá evita sorpresas. */
function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

export interface TranscriptStats {
  segments: number
  /** Cuántos quedaron sin persona asignada. */
  unattributed: number
  /** Duración cubierta, en segundos, del primer al último segmento. */
  spanSeconds: number
}

export function statsFor(drafts: readonly DraftVerbatim[]): TranscriptStats {
  if (drafts.length === 0) return { segments: 0, unattributed: 0, spanSeconds: 0 }

  return {
    segments: drafts.length,
    unattributed: drafts.filter((d) => d.participantId === null).length,
    spanSeconds: round(
      Math.max(...drafts.map((d) => d.endTs)) - Math.min(...drafts.map((d) => d.startTs)),
    ),
  }
}

/** `1:23:45` / `4:07` — para leer un tiempo en la transcripción. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
