import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  AdvanceButton,
  blockersFor,
  currentStage,
  daysUntil,
  dueLabel,
  getStudy,
  isOverdue,
  progress,
  studiesCopy,
  TaskToggle,
  type StudyStage,
} from '@/features/studies'

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const study = await getStudy(id)
  if (!study) notFound()

  const today = new Date()
  const current = currentStage(study.stages)
  const { done, total } = progress(study.stages)

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/studies" className="text-sm text-muted hover:text-ink">
          ← {studiesCopy.backToList}
        </Link>
        <h1 className="mt-3 text-2xl font-medium tracking-tight">{study.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {study.clientName ?? ''}
          {study.clientName ? ' · ' : ''}
          {study.fieldworkStart ?? studiesCopy.noFieldwork}
          {' · '}
          {studiesCopy.progress} {done}/{total}
        </p>
      </div>

      {current ? (
        <section className="rounded-lg border border-accent bg-surface p-6">
          <p className="text-sm text-muted">{studiesCopy.currentStage}</p>
          <h2 className="mt-1 text-lg font-medium">{current.name}</h2>
          <Blockers stage={current} studyId={study.id} today={today} />
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

function Blockers({
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
        <ul className="flex flex-col gap-1.5">
          {stage.files.map((file) => (
            <li key={file.id} className="flex items-baseline gap-2 text-sm">
              <span className={file.storageKey ? 'text-muted line-through' : ''}>{file.label}</span>
              <span className="text-xs text-muted">
                {file.storageKey ? studiesCopy.fileAttached : studiesCopy.fileMissing}
              </span>
            </li>
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
