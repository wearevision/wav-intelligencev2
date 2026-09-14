import { describe, expect, it } from 'vitest'

import {
  planFingerprintSource,
  planRosterSync,
  toApplyPayload,
  type ExistingParticipant,
  type ExistingSession,
} from '@/features/intake/roster-sync'
import type { ImportedDay } from '@/features/participants'

function day(title: string, people: ImportedDay['people'], warnings: string[] = []): ImportedDay {
  return { title, dayNumber: 0, blockLabels: ['09:00', '13:00PM'], people, warnings, absent: 0 }
}

const person = (
  name: string,
  blockNumber: number,
  micNumber: number | null,
  segment: 'client' | 'non_client' | null = 'non_client',
) => ({
  name,
  blockNumber,
  micNumber,
  role: 'participant' as const,
  segment,
})

function existing(over: Partial<ExistingParticipant>): ExistingParticipant {
  return {
    id: 'p1',
    sessionId: 's1',
    name: 'Gustavo Mendez',
    micNumber: 2,
    role: 'participant',
    segment: 'non_client',
    verbatims: 0,
    ...over,
  }
}

describe('planRosterSync', () => {
  it('crea los bloques que faltan con fecha y hora de Chile, ordenando los días por fecha', () => {
    const plan = planRosterSync({
      days: [
        day('Junio 3', [person('Roberto Gomez', 1, 5, 'client')]),
        day('Junio 2', [person('Gustavo Mendez', 2, 2)]),
      ],
      year: 2026,
      sessions: [],
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks.map((b) => [b.code, b.scheduledAt, b.isNew])).toEqual([
      ['d1b1', '2026-06-02T13:00:00.000Z', true],
      ['d1b2', '2026-06-02T17:00:00.000Z', true],
      ['d2b1', '2026-06-03T13:00:00.000Z', true],
      ['d2b2', '2026-06-03T17:00:00.000Z', true],
    ])
    expect(plan.blocks.find((b) => b.code === 'd1b2')!.add).toEqual([
      { name: 'Gustavo Mendez', micNumber: 2, role: 'participant', segment: 'non_client' },
    ])
  })

  it('corrige la hora de un bloque existente y lo marca', () => {
    const sessions: ExistingSession[] = [
      {
        id: 's1',
        dayNumber: 1,
        blockNumber: 1,
        code: 'd1b1',
        scheduledAt: '2026-05-05T21:00:00.000Z',
      },
    ]
    const plan = planRosterSync({
      days: [day('Junio 2', [])],
      year: 2026,
      sessions,
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    const block = plan.blocks.find((b) => b.code === 'd1b1')!
    expect(block.sessionId).toBe('s1')
    expect(block.isNew).toBe(false)
    expect(block.scheduleChanged).toBe(true)
  })

  it('actualiza a quien ya está conservando su id y deja igual a quien no cambió', () => {
    const sessions: ExistingSession[] = [
      {
        id: 's1',
        dayNumber: 1,
        blockNumber: 2,
        code: 'd1b2',
        scheduledAt: '2026-06-02T17:00:00.000Z',
      },
    ]
    const plan = planRosterSync({
      days: [day('Junio 2', [person('gustavo  MENDEZ', 2, 7), person('Olga Veliz', 2, 11)])],
      year: 2026,
      sessions,
      participants: [
        existing({ id: 'p1', name: 'Gustavo Mendez', micNumber: 2 }),
        existing({ id: 'p2', name: 'Olga Veliz', micNumber: 11 }),
      ],
    })
    if (!plan.ok) throw new Error(plan.error)
    const block = plan.blocks.find((b) => b.code === 'd1b2')!
    expect(block.update).toEqual([
      {
        id: 'p1',
        name: 'gustavo  MENDEZ',
        from: { name: 'Gustavo Mendez', micNumber: 2, role: 'participant', segment: 'non_client' },
        to: { name: 'gustavo  MENDEZ', micNumber: 7, role: 'participant', segment: 'non_client' },
      },
    ])
    expect(block.keep).toBe(1)
    expect(block.add).toEqual([])
    expect(block.remove).toEqual([])
  })

  it('borra a quien ya no está y dice cuántos verbatims quedan sin autor', () => {
    const sessions: ExistingSession[] = [
      { id: 's1', dayNumber: 1, blockNumber: 1, code: 'd1b1', scheduledAt: null },
    ]
    const plan = planRosterSync({
      days: [day('Junio 2', [])],
      year: 2026,
      sessions,
      participants: [existing({ id: 'p9', sessionId: 's1', name: 'Freddy Ceron', verbatims: 14 })],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks.find((b) => b.code === 'd1b1')!.remove).toEqual([
      { id: 'p9', name: 'Freddy Ceron', verbatims: 14 },
    ])
  })

  it('toma la primera fila cuando un nombre se repite en el mismo bloque y avisa', () => {
    const plan = planRosterSync({
      days: [day('Junio 2', [person('Paula Olmedo', 2, 17), person('paula olmedo ', 2, 18)])],
      year: 2026,
      sessions: [],
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks.find((b) => b.code === 'd1b2')!.add).toHaveLength(1)
    expect(plan.warnings).toContain(
      'Junio 2: «paula olmedo» aparece dos veces en el bloque 2; se toma la primera fila.',
    )
  })

  it('no toca bloques del estudio que la planilla no menciona y los lista', () => {
    const sessions: ExistingSession[] = [
      { id: 's7', dayNumber: 4, blockNumber: 1, code: 'd4b1', scheduledAt: null },
    ]
    const plan = planRosterSync({
      days: [day('Junio 2', [])],
      year: 2026,
      sessions,
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.untouchedSessions).toEqual([{ id: 's7', code: 'd4b1' }])
  })

  it('pasa los avisos del parser con el nombre de la hoja', () => {
    const plan = planRosterSync({
      days: [day('Junio 2', [], ['Freddy: no se pudo leer el micrófono.'])],
      year: 2026,
      sessions: [],
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.warnings).toContain('Junio 2: Freddy: no se pudo leer el micrófono.')
  })

  it('se niega cuando una hoja con bloques no trae una fecha legible', () => {
    expect(
      planRosterSync({ days: [day('Hoja1', [])], year: 2026, sessions: [], participants: [] }),
    ).toEqual({
      ok: false,
      error: 'La hoja «Hoja1» no dice qué día es (se espera algo como «Junio 2»).',
    })
  })

  it('se niega cuando un horario no se puede leer', () => {
    const bad: ImportedDay = { ...day('Junio 2', []), blockLabels: ['09:00', 'tarde'] }
    expect(planRosterSync({ days: [bad], year: 2026, sessions: [], participants: [] })).toEqual({
      ok: false,
      error: 'La hoja «Junio 2» tiene un horario que no se entiende: «tarde».',
    })
  })

  it('ignora hojas sin encabezado de convocatoria', () => {
    const empty: ImportedDay = {
      title: 'Resumen',
      dayNumber: 0,
      blockLabels: [],
      people: [],
      warnings: ['x'],
      absent: 0,
    }
    const plan = planRosterSync({
      days: [empty, day('Junio 2', [])],
      year: 2026,
      sessions: [],
      participants: [],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.blocks).toHaveLength(2)
  })
})

describe('planFingerprintSource', () => {
  it('es igual para el mismo plan aunque los arreglos vengan en otro orden', () => {
    const input = {
      days: [day('Junio 2', [person('A', 1, 1), person('B', 1, 2)])],
      year: 2026,
      sessions: [],
      participants: [],
    }
    const a = planRosterSync(input)
    const b = planRosterSync({
      ...input,
      days: [day('Junio 2', [person('B', 1, 2), person('A', 1, 1)])],
    })
    if (!a.ok || !b.ok) throw new Error('plan')
    expect(planFingerprintSource(a)).toBe(planFingerprintSource(b))
  })

  it('cambia cuando cambia algo que se va a escribir', () => {
    const a = planRosterSync({
      days: [day('Junio 2', [person('A', 1, 1)])],
      year: 2026,
      sessions: [],
      participants: [],
    })
    const b = planRosterSync({
      days: [day('Junio 2', [person('A', 1, 3)])],
      year: 2026,
      sessions: [],
      participants: [],
    })
    if (!a.ok || !b.ok) throw new Error('plan')
    expect(planFingerprintSource(a)).not.toBe(planFingerprintSource(b))
  })
})

describe('toApplyPayload', () => {
  it('lleva solo lo que el RPC necesita, con nombres de columna', () => {
    const sessions: ExistingSession[] = [
      { id: 's1', dayNumber: 1, blockNumber: 1, code: 'd1b1', scheduledAt: null },
    ]
    const plan = planRosterSync({
      days: [day('Junio 2', [person('A', 1, 1)])],
      year: 2026,
      sessions,
      participants: [existing({ id: 'p9', sessionId: 's1', name: 'Z' })],
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(toApplyPayload(plan)).toEqual({
      create_sessions: [
        {
          day_number: 1,
          block_number: 2,
          name: 'Día 1 · Bloque 2',
          scheduled_at: '2026-06-02T17:00:00.000Z',
        },
      ],
      update_sessions: [{ id: 's1', scheduled_at: '2026-06-02T13:00:00.000Z' }],
      blocks: [
        {
          day_number: 1,
          block_number: 1,
          remove: ['p9'],
          update: [],
          add: [{ name: 'A', mic_number: 1, role: 'participant', segment: 'non_client' }],
        },
        { day_number: 1, block_number: 2, remove: [], update: [], add: [] },
      ],
    })
  })
})
