import { blockersFor, currentStage, daysUntil, isClosed, progress } from '@/features/studies'
import type { Blocker, Study, StudyStage } from '@/features/studies'

export type AlertKind = 'stage_overdue' | 'stage_due_soon' | 'no_fieldwork'
export type Severity = 'critical' | 'warning'

export interface Alert {
  id: string
  kind: AlertKind
  severity: Severity
  studyId: string
  studyName: string
  stageName: string | null
  /** Días respecto a hoy: negativo si ya venció. Null cuando no aplica. */
  days: number | null
}

/** Lo que hay que saber de un estudio de un vistazo. */
export interface StudyPulse {
  studyId: string
  studyName: string
  clientName: string | null
  currentStageName: string | null
  currentStageDueOn: string | null
  blockers: Blocker[]
  done: number
  total: number
  alerts: Alert[]
}

const SOON_DAYS = 7

/**
 * Las alertas se derivan de fechas y estado, nunca se almacenan (D8).
 *
 * Guardarlas obligaría a un job que las sincronice, y un job que falla produce
 * lo peor posible en una torre de control: silencio que parece calma.
 */
export function alertsFor(study: Study, today: Date, soonDays = SOON_DAYS): Alert[] {
  if (study.status === 'archived') return []

  const open = study.stages.filter((stage) => !isClosed(stage))

  if (open.length === 0) return []

  if (study.fieldworkStart === null) {
    return [
      {
        id: `${study.id}:no_fieldwork`,
        kind: 'no_fieldwork',
        severity: 'warning',
        studyId: study.id,
        studyName: study.name,
        stageName: null,
        days: null,
      },
    ]
  }

  return open.flatMap((stage) => {
    if (stage.dueOn === null) return []
    const days = daysUntil(stage.dueOn, today)

    if (days < 0) return [alert(study, stage, 'stage_overdue', 'critical', days)]
    if (days <= soonDays) return [alert(study, stage, 'stage_due_soon', 'warning', days)]
    return []
  })
}

function alert(
  study: Study,
  stage: StudyStage,
  kind: AlertKind,
  severity: Severity,
  days: number,
): Alert {
  return {
    id: `${study.id}:${stage.id}:${kind}`,
    kind,
    severity,
    studyId: study.id,
    studyName: study.name,
    stageName: stage.name,
    days,
  }
}

/** Lo más urgente primero: críticas antes que avisos, y dentro, lo más vencido. */
export function sortAlerts(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
    return (a.days ?? Number.POSITIVE_INFINITY) - (b.days ?? Number.POSITIVE_INFINITY)
  })
}

export function pulseFor(study: Study, today: Date, soonDays = SOON_DAYS): StudyPulse {
  const current = currentStage(study.stages)
  const { done, total } = progress(study.stages)

  return {
    studyId: study.id,
    studyName: study.name,
    clientName: study.clientName,
    currentStageName: current?.name ?? null,
    currentStageDueOn: current?.dueOn ?? null,
    blockers: current ? blockersFor(current) : [],
    done,
    total,
    alerts: sortAlerts(alertsFor(study, today, soonDays)),
  }
}

export function buildBoard(
  studies: readonly Study[],
  today: Date,
  soonDays = SOON_DAYS,
): { alerts: Alert[]; pulses: StudyPulse[] } {
  const pulses = studies.map((study) => pulseFor(study, today, soonDays))
  return { alerts: sortAlerts(pulses.flatMap((p) => p.alerts)), pulses }
}
