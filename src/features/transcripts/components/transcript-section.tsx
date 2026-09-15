import Link from 'next/link'

import { transcriptsCopy } from '../copy'
import type { BlockTranscriptSummary } from '../types'

export interface TranscriptBlock {
  id: string
  code: string | null
  name: string
}

/** Presentación pura: una línea por bloque, con el enlace a leerla. */
export function TranscriptSection({
  studyId,
  blocks,
  summaries,
}: {
  studyId: string
  blocks: readonly TranscriptBlock[]
  summaries: readonly BlockTranscriptSummary[]
}) {
  const bySession = new Map(summaries.map((s) => [s.sessionId, s]))

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-muted">{transcriptsCopy.title}</h2>
        <p className="mt-1 text-xs text-muted">{transcriptsCopy.hint}</p>
      </div>

      <div className="flex flex-col gap-2">
        {blocks.map((block) => {
          const summary = bySession.get(block.id)
          const segments = summary?.segments ?? 0

          return (
            <div
              key={block.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-border bg-surface px-4 py-3"
            >
              <span className="flex items-baseline gap-3">
                <span className="text-xs text-muted tabular-nums">
                  {block.code ?? block.name}
                </span>
                {segments === 0 ? (
                  <span className="text-xs text-muted">{transcriptsCopy.empty}</span>
                ) : (
                  <>
                    <span className="text-sm">{transcriptsCopy.segments(segments)}</span>
                    {summary!.unattributed > 0 && (
                      <span className="text-xs text-warn">
                        {transcriptsCopy.unattributed(summary!.unattributed)}
                      </span>
                    )}
                  </>
                )}
              </span>

              {segments > 0 && (
                <Link
                  href={`/studies/${studyId}/bloques/${block.id}`}
                  className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                >
                  {transcriptsCopy.read}
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
