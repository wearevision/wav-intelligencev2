import Link from 'next/link'

import { transcriptsCopy } from '../copy'
import { formatTimestamp } from '../model'
import type { Verbatim } from '../types'

/**
 * La transcripción de un bloque, para leerla.
 *
 * Se agrupan las intervenciones seguidas de la misma persona: en una
 * conversación real alguien habla durante veinte segundos y el transcriptor lo
 * corta en seis segmentos; repetir el nombre seis veces convierte la lectura en
 * una lista en vez de una conversación.
 */
export function TranscriptView({
  studyId,
  blockLabel,
  verbatims,
}: {
  studyId: string
  blockLabel: string
  verbatims: readonly Verbatim[]
}) {
  const turns = groupTurns(verbatims)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/studies/${studyId}`} className="text-sm text-muted hover:text-ink">
          ← {transcriptsCopy.back}
        </Link>
        <h1 className="mt-3 text-2xl font-medium tracking-tight">
          {transcriptsCopy.title} · {blockLabel}
        </h1>
        <p className="mt-1 text-sm text-muted">{transcriptsCopy.segments(verbatims.length)}</p>
      </div>

      <div className="flex flex-col gap-4">
        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <span
                className={`text-sm font-medium ${turn.speaker === null ? 'text-warn' : ''}`}
              >
                {turn.speaker ?? transcriptsCopy.unknownSpeaker}
              </span>
              <span className="text-xs text-muted tabular-nums">
                {formatTimestamp(turn.startTs)}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted">{turn.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Turn {
  id: string
  speaker: string | null
  startTs: number
  text: string
}

/** Junta lo seguido de una misma voz en un solo turno. */
export function groupTurns(verbatims: readonly Verbatim[]): Turn[] {
  const turns: Turn[] = []

  for (const verbatim of verbatims) {
    const speaker = verbatim.participantName ?? verbatim.speakerLabel ?? null
    const previous = turns[turns.length - 1]

    if (previous && previous.speaker === speaker) {
      previous.text = `${previous.text} ${verbatim.text}`
      continue
    }

    turns.push({ id: verbatim.id, speaker, startTs: verbatim.startTs, text: verbatim.text })
  }

  return turns
}
