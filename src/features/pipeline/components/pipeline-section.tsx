'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  artifactLabel,
  pipelineCopy,
  producerLabels,
  runStatusLabels,
  stepStatusLabels,
} from '../copy'
import { STEPS, runProgress, stepDefinition, type RunStatus, type StepRow } from '../model'
import { discardArtifact, retryRun, startProcessing } from '../actions'
import type { SessionPipeline } from '../types'

/** Un bloque, con lo justo para decidir si se puede procesar. */
export interface PipelineBlock {
  id: string
  code: string | null
  name: string
  hasMedia: boolean
}

const RUN_TONE: Record<RunStatus, string> = {
  pending: 'text-muted',
  running: 'text-accent',
  done: 'text-ok',
  failed: 'text-danger',
}

const STEP_TONE: Record<StepRow['status'], string> = {
  pending: 'text-muted',
  running: 'text-accent',
  done: 'text-ok',
  failed: 'text-danger',
  skipped: 'text-muted',
}

export function PipelineSection({
  studyId,
  blocks,
  pipelines,
}: {
  studyId: string
  blocks: readonly PipelineBlock[]
  pipelines: readonly SessionPipeline[]
}) {
  const bySession = new Map(pipelines.map((p) => [p.sessionId, p]))

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted">{pipelineCopy.title}</h2>
      <div className="flex flex-col gap-2">
        {blocks.map((block) => (
          <BlockPipeline
            key={block.id}
            studyId={studyId}
            block={block}
            pipeline={bySession.get(block.id) ?? { sessionId: block.id, run: null, artifacts: [] }}
          />
        ))}
      </div>
    </section>
  )
}

function BlockPipeline({
  studyId,
  block,
  pipeline,
}: {
  studyId: string
  block: PipelineBlock
  pipeline: SessionPipeline
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = pipeline.run
  const status: RunStatus = run?.status ?? 'pending'
  const failed = status === 'failed'
  const { done, total } = runProgress(run?.steps ?? [])

  function act(operation: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      setError(null)
      const result = await operation()
      if (!result.ok) setError(result.message ?? 'No se pudo procesar.')
      router.refresh()
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="flex items-baseline gap-3">
          <span className="text-xs text-muted tabular-nums">{block.code ?? block.name}</span>
          <span className={`text-sm ${run ? RUN_TONE[status] : 'text-muted'}`}>
            {run ? runStatusLabels[status] : pipelineCopy.idle}
          </span>
          {run && total > 0 && (
            <span className="text-xs text-muted tabular-nums">
              {done}/{total}
            </span>
          )}
        </span>

        {block.hasMedia ? (
          <button
            type="button"
            disabled={pending || status === 'running'}
            onClick={() =>
              act(() =>
                failed && run ? retryRun(studyId, run.id) : startProcessing(studyId, block.id),
              )
            }
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink disabled:opacity-40"
          >
            {pending
              ? pipelineCopy.running
              : failed
                ? pipelineCopy.retry
                : status === 'done'
                  ? pipelineCopy.again
                  : pipelineCopy.start}
          </button>
        ) : (
          <span className="text-xs text-muted">{pipelineCopy.noMedia}</span>
        )}
      </div>

      {run && run.steps.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {[...run.steps]
            .sort((a, b) => a.position - b.position)
            .map((step) => (
              <li key={step.id} className="flex flex-wrap items-baseline gap-x-3 text-xs">
                <span className="w-40 shrink-0 text-muted">
                  {stepDefinition(step.name)?.label ?? step.name}
                </span>
                <span className={STEP_TONE[step.status]}>{stepStatusLabels[step.status]}</span>
                {pipelineCopy.attempt(step.attempt) && (
                  <span className="text-muted">{pipelineCopy.attempt(step.attempt)}</span>
                )}
                {step.error && <span className="w-full text-danger">{step.error}</span>}
              </li>
            ))}
        </ul>
      )}

      {pipeline.artifacts.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <p className="text-xs text-muted">{pipelineCopy.artifacts}</p>
          {pipeline.artifacts.map((artifact) => (
            <div key={artifact.id} className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span>{artifactLabel(artifact.kind)}</span>
              <span className="text-muted">
                {producerLabels[artifact.producer] ?? artifact.producer}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => discardArtifact(studyId, artifact.id))}
                className="text-muted underline underline-offset-4 hover:text-ink disabled:opacity-40"
              >
                {pipelineCopy.discard}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lo que todavía no dejó rastro: útil para ver el catálogo completo
          antes de la primera corrida, y no solo lo que ya pasó. */}
      {!run && (
        <p className="mt-2 text-xs text-muted">{STEPS.map((s) => s.label).join(' → ')}</p>
      )}

      {/* El error de la corrida se muestra solo si ningún paso lo cuenta ya:
          repetido dos veces parece que fallaron dos cosas distintas. */}
      {(error ?? (run?.steps.some((s) => s.error) ? null : run?.error)) && (
        <p className="mt-2 text-xs text-danger">{error ?? run?.error}</p>
      )}
    </div>
  )
}
