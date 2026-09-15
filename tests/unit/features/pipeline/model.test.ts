import { describe, expect, it } from 'vitest'

import {
  STEPS,
  findArtifact,
  initialSteps,
  isTerminal,
  isUsable,
  missingRequirements,
  nextStep,
  runOutcome,
  runProgress,
  shouldSkip,
  stepDefinition,
  type ArtifactRef,
  type StepRow,
  type StepStatus,
} from '@/features/pipeline/model'

function row(name: string, position: number, status: StepStatus = 'pending'): StepRow {
  return { id: `r-${name}`, name, position, status, attempt: 0, error: null }
}

function artifact(kind: string, storageKey = `k/${kind}`): ArtifactRef {
  return { kind, storageKey, producer: 'cloud' }
}

const ROWS = [row('inventario', 1), row('plan_transcripcion', 2)]

describe('catálogo de pasos', () => {
  it('las posiciones son únicas y consecutivas desde 1', () => {
    const positions = STEPS.map((s) => s.position)
    expect(positions).toEqual(positions.map((_, i) => i + 1))
  })

  it('ningún paso produce el mismo artifact que otro', () => {
    const produced = STEPS.map((s) => s.produces)
    expect(new Set(produced).size).toBe(produced.length)
  })

  it('lo que un paso requiere lo produce alguno anterior', () => {
    for (const step of STEPS) {
      for (const required of step.requires) {
        const producer = STEPS.find((s) => s.produces === required)
        expect(producer, `nadie produce ${required}`).toBeDefined()
        expect(producer!.position).toBeLessThan(step.position)
      }
    }
  })

  it('initialSteps devuelve una fila por paso del catálogo', () => {
    expect(initialSteps()).toHaveLength(STEPS.length)
    expect(initialSteps()[0]).toEqual({ name: 'inventario', position: 1 })
  })

  it('un nombre que no está en el catálogo no se inventa', () => {
    expect(stepDefinition('inventario')).not.toBeNull()
    expect(stepDefinition('transcribir_todo')).toBeNull()
  })
})

describe('isUsable', () => {
  it('un artifact sin clave no sirve, aunque la fila exista', () => {
    expect(isUsable(artifact('session_inventory'))).toBe(true)
    expect(isUsable({ kind: 'x', storageKey: '', producer: 'local' })).toBe(false)
    expect(isUsable({ kind: 'x', storageKey: '   ', producer: 'local' })).toBe(false)
    expect(isUsable(null)).toBe(false)
    expect(isUsable(undefined)).toBe(false)
  })
})

describe('findArtifact', () => {
  it('busca por tipo y devuelve null si no está', () => {
    const list = [artifact('session_inventory')]
    expect(findArtifact('session_inventory', list)?.storageKey).toBe('k/session_inventory')
    expect(findArtifact('waveform', list)).toBeNull()
  })
})

describe('shouldSkip — la regla de F6b', () => {
  const inventario = stepDefinition('inventario')!

  it('se salta si su artifact de salida ya está', () => {
    expect(shouldSkip(inventario, [artifact('session_inventory')])).toBe(true)
  })

  it('no se salta si el casillero está vacío', () => {
    expect(shouldSkip(inventario, [])).toBe(false)
  })

  it('no se salta por el artifact de otro paso', () => {
    expect(shouldSkip(inventario, [artifact('transcription_plan')])).toBe(false)
  })

  it('da igual quién lo produjo: local cuenta como cloud', () => {
    const local: ArtifactRef = {
      kind: 'session_inventory',
      storageKey: 'k',
      producer: 'local',
    }
    expect(shouldSkip(inventario, [local])).toBe(true)
  })
})

describe('missingRequirements', () => {
  const plan = stepDefinition('plan_transcripcion')!

  it('nombra lo que falta', () => {
    expect(missingRequirements(plan, [])).toEqual(['session_inventory'])
  })

  it('vacío cuando están todos', () => {
    expect(missingRequirements(plan, [artifact('session_inventory')])).toEqual([])
  })

  it('un paso sin requisitos nunca está bloqueado', () => {
    expect(missingRequirements(stepDefinition('inventario')!, [])).toEqual([])
  })
})

describe('nextStep', () => {
  it('empieza por el primero cuando no hay nada hecho', () => {
    const next = nextStep(ROWS, [])
    expect(next.kind).toBe('run')
    expect(next.kind === 'run' && next.step.name).toBe('inventario')
  })

  it('respeta la posición y no el orden en que vienen las filas', () => {
    const next = nextStep([row('plan_transcripcion', 2), row('inventario', 1)], [])
    expect(next.kind === 'run' && next.step.name).toBe('inventario')
  })

  it('salta el paso cuyo artifact ya existe y sigue con el siguiente', () => {
    const next = nextStep(ROWS, [artifact('session_inventory')])
    expect(next.kind).toBe('skip')
    expect(next.kind === 'skip' && next.step.name).toBe('inventario')
  })

  it('no vuelve sobre lo que ya salió bien', () => {
    const rows = [row('inventario', 1, 'done'), row('plan_transcripcion', 2)]
    const next = nextStep(rows, [artifact('session_inventory')])
    expect(next.kind === 'run' && next.step.name).toBe('plan_transcripcion')
  })

  it('tampoco vuelve sobre lo que se saltó', () => {
    const rows = [row('inventario', 1, 'skipped'), row('plan_transcripcion', 2)]
    expect(nextStep(rows, [artifact('session_inventory')]).kind).toBe('run')
  })

  it('re-toma el paso que falló, sin repetir los anteriores', () => {
    const rows = [row('inventario', 1, 'done'), row('plan_transcripcion', 2, 'failed')]
    const next = nextStep(rows, [artifact('session_inventory')])
    expect(next.kind).toBe('run')
    expect(next.kind === 'run' && next.step.name).toBe('plan_transcripcion')
  })

  it('marca bloqueado el paso al que le falta un insumo', () => {
    const rows = [row('inventario', 1, 'done'), row('plan_transcripcion', 2)]
    const next = nextStep(rows, [])
    expect(next.kind).toBe('blocked')
    expect(next.kind === 'blocked' && next.missing).toEqual(['session_inventory'])
  })

  it('una fila de un paso que ya no existe no se adivina', () => {
    const next = nextStep([row('paso_viejo', 1)], [])
    expect(next.kind).toBe('unknown')
  })

  it('sin pasos por hacer, termina', () => {
    const rows = [row('inventario', 1, 'done'), row('plan_transcripcion', 2, 'skipped')]
    expect(nextStep(rows, []).kind).toBe('finished')
  })

  it('una corrida sin filas también termina', () => {
    expect(nextStep([], []).kind).toBe('finished')
  })
})

describe('runProgress', () => {
  it('cuenta lo saltado como avance: el resultado está igual', () => {
    const rows = [row('inventario', 1, 'skipped'), row('plan_transcripcion', 2, 'done')]
    expect(runProgress(rows)).toEqual({ done: 2, total: 2 })
  })

  it('lo fallado no cuenta como avance', () => {
    const rows = [row('inventario', 1, 'done'), row('plan_transcripcion', 2, 'failed')]
    expect(runProgress(rows)).toEqual({ done: 1, total: 2 })
  })
})

describe('runOutcome', () => {
  it('sin pasos, pendiente', () => {
    expect(runOutcome([])).toBe('pending')
  })

  it('corriendo mientras haya un paso en curso, aunque otro haya fallado', () => {
    const rows = [row('inventario', 1, 'failed'), row('plan_transcripcion', 2, 'running')]
    expect(runOutcome(rows)).toBe('running')
  })

  it('fallada si algo falló y ya nada corre', () => {
    const rows = [row('inventario', 1, 'done'), row('plan_transcripcion', 2, 'failed')]
    expect(runOutcome(rows)).toBe('failed')
  })

  it('lista cuando todo terminó bien o se saltó', () => {
    const rows = [row('inventario', 1, 'skipped'), row('plan_transcripcion', 2, 'done')]
    expect(runOutcome(rows)).toBe('done')
  })

  it('pendiente mientras quede algo sin empezar', () => {
    const rows = [row('inventario', 1, 'done'), row('plan_transcripcion', 2, 'pending')]
    expect(runOutcome(rows)).toBe('pending')
  })
})

describe('isTerminal', () => {
  it('solo done y failed cierran una corrida', () => {
    expect(isTerminal('done')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('running')).toBe(false)
    expect(isTerminal('pending')).toBe(false)
  })
})
