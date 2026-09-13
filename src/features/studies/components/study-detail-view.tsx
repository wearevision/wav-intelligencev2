import Link from 'next/link'

import { blockersFor, currentStage, daysUntil, isOverdue, progress } from '../model'
import { dueLabel, studiesCopy } from '../copy'
import type { Study, StudyStage } from '../types'

import { AdvanceButton } from './advance-button'
import { FieldworkEditor } from './fieldwork-editor'
import { StageFileRow } from './stage-file-row'
import { TaskToggle } from './task-toggle'

/** Presentación pura: recibe el estudio ya cargado y no consulta nada. */
export function StudyDetailView({ study, today }: { study: Study; today: Date }) {
  const current = currentStage(study.stages)
  const { done, total } = progress(study.stages)

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/studies" className="text-sm text-muted hover:text-ink">
          ← {studiesCopy.backToList}
        </Link>
        <h1 className="mt-3 text-2xl font-medium tracking-tight">{study.name}</h1>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
          {study.clientName ? <span>{study.clientName} ·</span> : null}
          <FieldworkEditor studyId={study.id} value={study.fieldworkStart} />
          <span>
            · {studiesCopy.progress} {done}/{total}
          </span>
        </div>
      </div>

      {current ? (
        <section className="rounded-lg border border-accent bg-surface p-6">
          <p className="text-sm text-muted">{studiesCopy.currentStage}</p>
          <h2 className="mt-1 text-lg font-medium">{current.name}</h2>
          <StageDetail stage={current} studyId={study.id} today={today} />
        </section>
      ) : (
        <p className="text-sm text-muted">{studiesCopy.finished}</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">{studiesCopy.stages}</h2>
        <ol className="flex flex-col gap-2">
          {study.stages.map((stage) => (
            <li
              key={stage.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-border bg-surface px-4 py-3"
            >
              <span className="flex items-baseline gap-3">
                <span className="text-xs text-muted tabular-nums">{stage.position}</span>
                <span className="text-sm">{stage.name}</span>
              </span>
              <span className="flex items-baseline gap-3 text-xs">
                <span className={isOverdue(stage, today) ? 'text-danger' : 'text-muted'}>
                  {stage.dueOn ? dueLabel(daysUntil(stage.dueOn, today)) : ''}
                </span>
                <span className="text-muted">{studiesCopy.statusLabel[stage.status]}</span>
              </span>
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

  return (
    <div className="mt-5 flex flex-col gap-5">
      {stage.dueOn ? (
        <p className={isOverdue(stage, today) ? 'text-sm text-danger' : 'text-sm text-muted'}>
          {dueLabel(daysUntil(stage.dueOn, today))}
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

      <div className="border-t border-border pt-4">
        {blockers.length === 0 ? (
          <p className="mb-3 text-sm text-ok">{studiesCopy.noBlockers}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{studiesCopy.blockersTitle}</p>
            <ul className="mt-2 mb-3 flex flex-col gap-1">
              {blockers.map((blocker) => (
                <li key={`${blocker.kind}-${blocker.label}`} className="text-sm text-warn">
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
