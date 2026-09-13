import { describe, expect, it } from 'vitest'

import {
  blockersFor,
  canClose,
  currentStage,
  daysUntil,
  isOverdue,
  overdueStages,
  progress,
  stageDue,
} from '@/features/studies/model'
import type { Study, StudyStage, StudyStageFile, StudyTask } from '@/features/studies/types'

function task(over: Partial<StudyTask> = {}): StudyTask {
  return { id: 't', name: 'Tarea', isBlocking: false, dueOn: null, doneAt: null, ...over }
}

function file(over: Partial<StudyStageFile> = {}): StudyStageFile {
  return { id: 'f', label: 'Archivo', isRequired: false, storageKey: null, filename: null, ...over }
}

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

const TODAY = new Date('2026-09-12T14:30:00Z')

describe('blockersFor', () => {
  it('no reporta nada cuando no hay pendientes bloqueantes', () => {
    expect(blockersFor(stage())).toEqual([])
  })

  it('reporta la tarea bloqueante sin hacer', () => {
    const s = stage({ tasks: [task({ name: 'Recibir brief', isBlocking: true })] })
    expect(blockersFor(s)).toEqual([{ kind: 'task', label: 'Recibir brief' }])
  })

  it('ignora la tarea bloqueante ya hecha', () => {
    const s = stage({
      tasks: [task({ isBlocking: true, doneAt: '2026-09-01T00:00:00Z' })],
    })
    expect(blockersFor(s)).toEqual([])
  })

  it('ignora la tarea pendiente que no bloquea', () => {
    expect(blockersFor(stage({ tasks: [task({ isBlocking: false })] }))).toEqual([])
  })

  it('reporta el archivo requerido sin adjuntar', () => {
    const s = stage({ files: [file({ label: 'Brief del cliente', isRequired: true })] })
    expect(blockersFor(s)).toEqual([{ kind: 'file', label: 'Brief del cliente' }])
  })

  it('ignora el archivo requerido ya adjunto', () => {
    const s = stage({ files: [file({ isRequired: true, storageKey: 'k' })] })
    expect(blockersFor(s)).toEqual([])
  })

  it('junta tareas y archivos, en ese orden', () => {
    const s = stage({
      tasks: [task({ name: 'Acordar terreno', isBlocking: true })],
      files: [file({ label: 'Brief del cliente', isRequired: true })],
    })
    expect(blockersFor(s)).toEqual([
      { kind: 'task', label: 'Acordar terreno' },
      { kind: 'file', label: 'Brief del cliente' },
    ])
  })
})

describe('canClose', () => {
  it('deja cerrar sin pendientes', () => {
    expect(canClose(stage())).toBe(true)
  })

  it('no deja cerrar con un archivo requerido faltante', () => {
    expect(canClose(stage({ files: [file({ isRequired: true })] }))).toBe(false)
  })
})

describe('currentStage', () => {
  it('devuelve la primera etapa no cerrada', () => {
    const stages = [
      stage({ id: 'a', position: 1, status: 'done' }),
      stage({ id: 'b', position: 2, status: 'in_progress' }),
      stage({ id: 'c', position: 3 }),
    ]
    expect(currentStage(stages)?.id).toBe('b')
  })

  it('salta las etapas omitidas', () => {
    const stages = [
      stage({ id: 'a', position: 1, status: 'done' }),
      stage({ id: 'b', position: 2, status: 'skipped' }),
      stage({ id: 'c', position: 3 }),
    ]
    expect(currentStage(stages)?.id).toBe('c')
  })

  it('ordena por posición aunque lleguen desordenadas', () => {
    const stages = [
      stage({ id: 'c', position: 3 }),
      stage({ id: 'a', position: 1 }),
      stage({ id: 'b', position: 2 }),
    ]
    expect(currentStage(stages)?.id).toBe('a')
  })

  it('devuelve null cuando el estudio terminó', () => {
    expect(currentStage([stage({ status: 'done' })])).toBeNull()
  })

  it('devuelve null sin etapas', () => {
    expect(currentStage([])).toBeNull()
  })
})

describe('progress', () => {
  it('cuenta cerradas y omitidas como avance', () => {
    const stages = [
      stage({ position: 1, status: 'done' }),
      stage({ position: 2, status: 'skipped' }),
      stage({ position: 3, status: 'pending' }),
    ]
    expect(progress(stages)).toEqual({ done: 2, total: 3 })
  })
})

describe('stageDue', () => {
  it('no devuelve vencimiento para una etapa cerrada, aunque su fecha haya pasado', () => {
    // El bug que originó esta función: la fila mostraba "Atrasada · 24 d"
    // al lado de "Cerrada", que se contradicen.
    expect(stageDue(stage({ status: 'done', dueOn: '2026-08-19' }), TODAY)).toBeNull()
  })

  it('tampoco para una etapa omitida', () => {
    expect(stageDue(stage({ status: 'skipped', dueOn: '2026-08-19' }), TODAY)).toBeNull()
  })

  it('no devuelve nada para una etapa abierta sin fecha', () => {
    expect(stageDue(stage({ dueOn: null }), TODAY)).toBeNull()
  })

  it('marca atrasada una etapa abierta con fecha pasada', () => {
    expect(stageDue(stage({ dueOn: '2026-09-03' }), TODAY)).toEqual({ days: -9, overdue: true })
  })

  it('no marca atrasada la que vence hoy', () => {
    expect(stageDue(stage({ dueOn: '2026-09-12' }), TODAY)).toEqual({ days: 0, overdue: false })
  })

  it('devuelve los días que faltan cuando aún no vence', () => {
    expect(stageDue(stage({ dueOn: '2026-09-20' }), TODAY)).toEqual({ days: 8, overdue: false })
  })
})

describe('isOverdue', () => {
  it('marca atrasada la etapa abierta con vencimiento pasado', () => {
    expect(isOverdue(stage({ dueOn: '2026-09-11' }), TODAY)).toBe(true)
  })

  it('no marca atrasada la que vence hoy', () => {
    expect(isOverdue(stage({ dueOn: '2026-09-12' }), TODAY)).toBe(false)
  })

  it('no marca atrasada una etapa ya cerrada', () => {
    expect(isOverdue(stage({ dueOn: '2026-01-01', status: 'done' }), TODAY)).toBe(false)
  })

  it('no marca atrasada una etapa sin fecha', () => {
    expect(isOverdue(stage({ dueOn: null }), TODAY)).toBe(false)
  })
})

describe('overdueStages', () => {
  it('devuelve solo las atrasadas del estudio', () => {
    const study: Study = {
      id: 'x',
      name: 'FG MG',
      clientName: 'MG Motor',
      fieldworkStart: '2026-11-10',
      status: 'active',
      stages: [
        stage({ id: 'a', position: 1, dueOn: '2026-09-01' }),
        stage({ id: 'b', position: 2, dueOn: '2026-12-01' }),
        stage({ id: 'c', position: 3, dueOn: '2026-09-01', status: 'done' }),
      ],
    }
    expect(overdueStages(study, TODAY).map((s) => s.id)).toEqual(['a'])
  })
})

describe('daysUntil', () => {
  it('cuenta los días que faltan', () => {
    expect(daysUntil('2026-09-15', TODAY)).toBe(3)
  })

  it('devuelve negativo si ya pasó', () => {
    expect(daysUntil('2026-09-10', TODAY)).toBe(-2)
  })

  it('devuelve cero el mismo día, sin importar la hora', () => {
    expect(daysUntil('2026-09-12', TODAY)).toBe(0)
  })
})
