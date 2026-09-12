import Link from 'next/link'

import { buildBoard, controlCopy, type Alert, type StudyPulse } from '@/features/control'
import { studiesCopy } from '@/features/studies'
import { listActiveStudiesDetail } from '@/features/studies/server'

export default async function ControlTowerPage() {
  const studies = await listActiveStudiesDetail()
  const { alerts, pulses } = buildBoard(studies, new Date())

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-medium tracking-tight">{controlCopy.title}</h1>

      {alerts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">{controlCopy.attention}</h2>
          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-ok">{controlCopy.allClear}</p>
          <p className="mt-1 text-sm text-muted">{controlCopy.allClearHint}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">{controlCopy.studies}</h2>
        {pulses.length === 0 ? (
          <p className="text-sm text-muted">
            {controlCopy.noStudies}{' '}
            <Link href="/studies" className="underline underline-offset-4">
              {controlCopy.createFirst}
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pulses.map((pulse) => (
              <PulseCard key={pulse.studyId} pulse={pulse} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AlertRow({ alert }: { alert: Alert }) {
  const critical = alert.severity === 'critical'

  return (
    <li>
      <Link
        href={`/studies/${alert.studyId}`}
        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-md border-l-2 border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
        style={{ borderLeftColor: `var(--color-${critical ? 'danger' : 'warn'})` }}
      >
        <span className={critical ? 'text-sm text-danger' : 'text-sm text-warn'}>
          {alertText(alert)}
        </span>
        <span className="text-sm text-muted">{alert.studyName}</span>
      </Link>
    </li>
  )
}

function alertText(alert: Alert): string {
  const stage = alert.stageName ?? ''
  switch (alert.kind) {
    case 'stage_overdue':
      return controlCopy.alert.stage_overdue(stage, Math.abs(alert.days ?? 0))
    case 'stage_due_soon':
      return controlCopy.alert.stage_due_soon(stage, alert.days ?? 0)
    case 'no_fieldwork':
      return controlCopy.alert.no_fieldwork()
  }
}

function PulseCard({ pulse }: { pulse: StudyPulse }) {
  const pct = pulse.total === 0 ? 0 : Math.round((pulse.done / pulse.total) * 100)
  const finished = pulse.currentStageName === null

  return (
    <li>
      <Link
        href={`/studies/${pulse.studyId}`}
        className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <span className="font-medium">{pulse.studyName}</span>
          <span className="text-sm text-muted">{pulse.clientName ?? ''}</span>
        </div>

        <p className="mt-2 text-sm text-muted">
          {finished
            ? controlCopy.finished
            : `${studiesCopy.currentStage}: ${pulse.currentStageName}`}
        </p>

        {!finished ? (
          <p className="mt-1 text-sm">
            {pulse.blockers.length === 0 ? (
              <span className="text-ok">{controlCopy.readyToClose}</span>
            ) : (
              <span className="text-warn">{controlCopy.blockersCount(pulse.blockers.length)}</span>
            )}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={studiesCopy.progress}
          >
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted tabular-nums">
            {pulse.done}/{pulse.total}
          </span>
        </div>
      </Link>
    </li>
  )
}
