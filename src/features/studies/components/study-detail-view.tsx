import Link from 'next/link'

import { StudyFilesSection } from '@/features/intake/components/study-files-section'
import type { MediaFile } from '@/features/media'
import { MediaSection } from '@/features/media/components/media-section'
import type { Participant } from '@/features/participants'
import { ParticipantsSection } from '@/features/participants/components/participants-section'
import type { SessionPipeline } from '@/features/pipeline'
import type { BlockTranscriptSummary } from '@/features/transcripts'
import { TranscriptSection } from '@/features/transcripts/components/transcript-section'
import { PipelineSection } from '@/features/pipeline/components/pipeline-section'
import { SessionsSection } from '@/features/sessions/components/sessions-section'
import type { StudySession } from '@/features/sessions'

import { blockersFor, currentStage, progress, stageDue } from '../model'
import { dueLabel, studiesCopy } from '../copy'
import type { Study, StudyStage } from '../types'

import { AdvanceButton } from './advance-button'
import { FieldworkEditor } from './fieldwork-editor'
import { StageFileRow } from './stage-file-row'
import { TaskToggle } from './task-toggle'

/** Presentación pura: recibe el estudio ya cargado y no consulta nada. */
export function StudyDetailView({
  study,
  sessions,
  media,
  participants,
  pipelines,
  transcripts,
  today,
}: {
  study: Study
  sessions: readonly StudySession[]
  media: readonly MediaFile[]
  participants: readonly Participant[]
  pipelines: readonly SessionPipeline[]
  transcripts: readonly BlockTranscriptSummary[]
  today: Date
}) {
  const current = currentStage(study.stages)
  const { done, total } = progress(study.stages)

  const withMedia = new Set(media.map((f) => f.sessionId))
  const blocks = sessions.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    hasMedia: withMedia.has(s.id),
    // Los micrófonos que de verdad se grabaron en el bloque: sirven para
    // cruzarlos con quién los llevaba puestos.
    recordedMics: [
      ...new Set(
        media
          .filter((f) => f.sessionId === s.id && f.kind === 'audio_mic' && f.micNumber !== null)
          .map((f) => f.micNumber as number),
      ),
    ].sort((a, b) => a - b),
  }))

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/studies" className="text-muted hover:text-ink text-sm">
          ← {studiesCopy.backToList}
        </Link>
        <h1 className="mt-3 text-2xl font-medium tracking-tight">{study.name}</h1>
        <div className="text-muted mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
          {study.clientName ? <span>{study.clientName} ·</span> : null}
          <FieldworkEditor studyId={study.id} value={study.fieldworkStart} />
          <span>
            · {studiesCopy.progress} {done}/{total}
          </span>
        </div>
      </div>

      {current ? (
        <section className="border-accent bg-surface rounded-lg border p-6">
          <p className="text-muted text-sm">{studiesCopy.currentStage}</p>
          <h2 className="mt-1 text-lg font-medium">{current.name}</h2>
          <StageDetail stage={current} studyId={study.id} today={today} />
        </section>
      ) : (
        <p className="text-muted text-sm">{studiesCopy.finished}</p>
      )}

      <StudyFilesSection studyId={study.id} />

      <SessionsSection studyId={study.id} sessions={sessions} />

      {sessions.length > 0 && (
        <ParticipantsSection studyId={study.id} blocks={blocks} participants={participants} />
      )}

      {/* Sin bloques no hay dónde poner el material: la grilla es el destino. */}
      {sessions.length > 0 && (
        <MediaSection
          studyId={study.id}
          sessions={sessions}
          files={media}
          participants={participants}
        />
      )}

      {sessions.length > 0 && (
        <PipelineSection studyId={study.id} blocks={blocks} pipelines={pipelines} />
      )}

      {sessions.length > 0 && (
        <TranscriptSection studyId={study.id} blocks={blocks} summaries={transcripts} />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-muted text-sm font-medium">{studiesCopy.stages}</h2>
        <ol className="flex flex-col gap-2">
          {study.stages.map((stage) => (
            <li
              key={stage.id}
              className="border-border bg-surface flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border px-4 py-3"
            >
              <span className="flex items-baseline gap-3">
                <span className="text-muted text-xs tabular-nums">{stage.position}</span>
                <span className="text-sm">{stage.name}</span>
              </span>
              <StageDue stage={stage} today={today} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function StageDetail({
  stage,
  studyId,
  today,
}: {
  stage: StudyStage
  studyId: string
  today: Date
}) {
  const blockers = blockersFor(stage)
  const due = stageDue(stage, today)

  return (
    <div className="mt-5 flex flex-col gap-5">
      {due ? (
        <p className={due.overdue ? 'text-danger text-sm' : 'text-muted text-sm'}>
          {dueLabel(due.days)}
        </p>
      ) : null}

      {stage.tasks.length > 0 ? (
        <div className="flex flex-col">
          {stage.tasks.map((task) => (
            <TaskToggle key={task.id} task={task} studyId={studyId} />
          ))}
        </div>
      ) : null}

      {stage.files.length > 0 ? (
        <ul className="flex flex-col">
          {stage.files.map((file) => (
            <StageFileRow key={file.id} file={file} stageId={stage.id} studyId={studyId} />
          ))}
        </ul>
      ) : null}

      <div className="border-border border-t pt-4">
        {blockers.length === 0 ? (
          <p className="text-ok mb-3 text-sm">{studiesCopy.noBlockers}</p>
        ) : (
          <>
            <p className="text-muted text-sm">{studiesCopy.blockersTitle}</p>
            <ul className="mt-2 mb-3 flex flex-col gap-1">
              {blockers.map((blocker) => (
                <li key={`${blocker.kind}-${blocker.label}`} className="text-warn text-sm">
                  {blocker.label}
                </li>
              ))}
            </ul>
          </>
        )}
        <AdvanceButton stageId={stage.id} studyId={studyId} disabled={blockers.length > 0} />
      </div>
    </div>
  )
}

/** Vencimiento y estado de una etapa en la lista. */
function StageDue({ stage, today }: { stage: StudyStage; today: Date }) {
  const due = stageDue(stage, today)

  return (
    <span className="flex items-baseline gap-3 text-xs">
      <span className={due?.overdue ? 'text-danger' : 'text-muted'}>
        {due ? dueLabel(due.days) : ''}
      </span>
      <span className="text-muted">{studiesCopy.statusLabel[stage.status]}</span>
    </span>
  )
}
