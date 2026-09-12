import { describe, expect, it } from 'vitest'

import { alertsFor, buildBoard, pulseFor, sortAlerts } from '@/features/control/model'
import type { Alert } from '@/features/control/model'
import type { Study, StudyStage } from '@/features/studies'

const TODAY = new Date('2026-09-12T14:30:00Z')

function stage(over: Partial<StudyStage> = {}): StudyStage {
  return {
    id: 's',
    position: 1,
    name: 'Brief',
    status: 'pending',
    dueOn: null,
    completedAt: null,
    tasks: [],
    files: [],
    ...over,
  }
}

function study(over: Partial<Study> = {}): Study {
  return {
    id: 'study-1',
    name: 'FG MG Motor',
    clientName: 'MG Motor',
    fieldworkStart: '2026-11-10',
    status: 'active',
    stages: [],
    ...over,
  }
}

describe('alertsFor', () => {
  it('no alerta sobre un estudio archivado', () => {
    const s = study({ status: 'archived', stages: [stage({ dueOn: '2020-01-01' })] })
    expect(alertsFor(s, TODAY)).toEqual([])
  })

  it('no alerta cuando todas las etapas están cerradas', () => {
    const s = study({ stages: [stage({ status: 'done', dueOn: '2020-01-01' })] })
    expect(alertsFor(s, TODAY)).toEqual([])
  })

  it('avisa cuando el estudio no tiene fecha de terreno', () => {
    const s = study({ fieldworkStart: null, stages: [stage()] })
    const alerts = alertsFor(s, TODAY)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'no_fieldwork', severity: 'warning', days: null })
  })

  it('sin fecha de terreno no emite además alertas por etapa', () => {
    const s = study({
      fieldworkStart: null,
      stages: [stage({ id: 'a', dueOn: '2020-01-01' }), stage({ id: 'b', dueOn: '2020-02-01' })],
    })
    expect(alertsFor(s, TODAY).map((a) => a.kind)).toEqual(['no_fieldwork'])
  })

  it('marca crítica una etapa vencida, con los días en negativo', () => {
    const s = study({ stages: [stage({ name: 'Convocatoria', dueOn: '2026-09-05' })] })
    expect(alertsFor(s, TODAY)[0]).toMatchObject({
      kind: 'stage_overdue',
      severity: 'critical',
      stageName: 'Convocatoria',
      days: -7,
    })
  })

  it('marca aviso una etapa que vence dentro de la semana', () => {
    const s = study({ stages: [stage({ dueOn: '2026-09-17' })] })
    expect(alertsFor(s, TODAY)[0]).toMatchObject({ kind: 'stage_due_soon', days: 5 })
  })

  it('trata el vencimiento de hoy como aviso, no como vencido', () => {
    const s = study({ stages: [stage({ dueOn: '2026-09-12' })] })
    expect(alertsFor(s, TODAY)[0]).toMatchObject({ kind: 'stage_due_soon', days: 0 })
  })

  it('no alerta sobre lo que vence más allá del horizonte', () => {
    const s = study({ stages: [stage({ dueOn: '2026-10-30' })] })
    expect(alertsFor(s, TODAY)).toEqual([])
  })

  it('respeta un horizonte distinto', () => {
    const s = study({ stages: [stage({ dueOn: '2026-09-25' })] })
    expect(alertsFor(s, TODAY, 30)).toHaveLength(1)
    expect(alertsFor(s, TODAY, 7)).toHaveLength(0)
  })

  it('ignora las etapas cerradas aunque estén vencidas', () => {
    const s = study({
      stages: [
        stage({ id: 'a', status: 'done', dueOn: '2020-01-01' }),
        stage({ id: 'b', status: 'skipped', dueOn: '2020-01-01' }),
        stage({ id: 'c', dueOn: '2026-09-01' }),
      ],
    })
    expect(alertsFor(s, TODAY).map((a) => a.stageName)).toEqual(['Brief'])
  })

  it('ignora etapas abiertas sin fecha', () => {
    const s = study({ stages: [stage({ dueOn: null })] })
    expect(alertsFor(s, TODAY)).toEqual([])
  })
})

describe('sortAlerts', () => {
  it('pone las críticas antes que los avisos, y lo más vencido primero', () => {
    const make = (severity: Alert['severity'], days: number, id: string): Alert => ({
      id,
      kind: severity === 'critical' ? 'stage_overdue' : 'stage_due_soon',
      severity,
      studyId: 'x',
      studyName: 'X',
      stageName: 'S',
      days,
    })

    const sorted = sortAlerts([
      make('warning', 2, 'w2'),
      make('critical', -1, 'c1'),
      make('warning', 0, 'w0'),
      make('critical', -9, 'c9'),
    ])

    expect(sorted.map((a) => a.id)).toEqual(['c9', 'c1', 'w0', 'w2'])
  })

  it('manda al final las alertas sin días', () => {
    const base = { kind: 'no_fieldwork' as const, studyId: 'x', studyName: 'X', stageName: null }
    const sorted = sortAlerts([
      { ...base, id: 'sin', severity: 'warning', days: null },
      { ...base, id: 'con', severity: 'warning', days: 3 },
    ])
    expect(sorted.map((a) => a.id)).toEqual(['con', 'sin'])
  })
})

describe('pulseFor', () => {
  it('resume etapa actual, avance y pendientes de cierre', () => {
    const s = study({
      stages: [
        stage({ id: 'a', position: 1, name: 'Brief', status: 'done' }),
        stage({
          id: 'b',
          position: 2,
          name: 'Diseño',
          dueOn: '2026-09-20',
          files: [
            { id: 'f', label: 'Guía del focus', isRequired: true, storageKey: null, filename: null },
          ],
        }),
        stage({ id: 'c', position: 3, name: 'Convocatoria' }),
      ],
    })

    expect(pulseFor(s, TODAY)).toMatchObject({
      currentStageName: 'Diseño',
      currentStageDueOn: '2026-09-20',
      blockers: [{ kind: 'file', label: 'Guía del focus' }],
      done: 1,
      total: 3,
    })
  })

  it('deja la etapa actual en null cuando el estudio terminó', () => {
    const s = study({ stages: [stage({ status: 'done' })] })
    expect(pulseFor(s, TODAY).currentStageName).toBeNull()
  })
})

describe('buildBoard', () => {
  it('junta las alertas de todos los estudios y las ordena', () => {
    const a = study({
      id: 'a',
      name: 'Estudio A',
      stages: [stage({ id: 'a1', dueOn: '2026-09-14' })],
    })
    const b = study({
      id: 'b',
      name: 'Estudio B',
      stages: [stage({ id: 'b1', dueOn: '2026-09-01' })],
    })

    const board = buildBoard([a, b], TODAY)

    expect(board.pulses).toHaveLength(2)
    expect(board.alerts.map((x) => x.studyName)).toEqual(['Estudio B', 'Estudio A'])
    expect(board.alerts[0]?.severity).toBe('critical')
  })

  it('no devuelve alertas cuando todo está en orden', () => {
    const s = study({ stages: [stage({ dueOn: '2026-12-31' })] })
    expect(buildBoard([s], TODAY).alerts).toEqual([])
  })
})
