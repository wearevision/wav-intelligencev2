import { describe, expect, it } from 'vitest'

import {
  ROLES,
  countsInAnalysis,
  duplicateMics,
  micCoverage,
  nextFreeMic,
  parseRoster,
  summarize,
} from '@/features/participants/model'
import type { Participant, ParticipantRole } from '@/features/participants/types'

function person(
  name: string,
  micNumber: number | null,
  role: ParticipantRole = 'participant',
): Participant {
  return { id: `p-${name}`, sessionId: 's1', name, micNumber, seatNumber: null, role, segment: null }
}

describe('countsInAnalysis', () => {
  it('solo el invitado aporta el dato', () => {
    expect(countsInAnalysis('participant')).toBe(true)
    expect(countsInAnalysis('moderator')).toBe(false)
    expect(countsInAnalysis('brand_staff')).toBe(false)
    expect(countsInAnalysis('observer')).toBe(false)
  })

  it('todos los roles del catálogo están decididos', () => {
    for (const role of ROLES) expect(typeof countsInAnalysis(role)).toBe('boolean')
  })
})

describe('duplicateMics', () => {
  it('encuentra el micrófono compartido', () => {
    expect(duplicateMics([person('A', 3), person('B', 3), person('C', 5)])).toEqual([3])
  })

  it('varios sin micrófono no son un duplicado', () => {
    expect(duplicateMics([person('A', null), person('B', null)])).toEqual([])
  })

  it('los devuelve ordenados', () => {
    const gente = [person('A', 7), person('B', 7), person('C', 2), person('D', 2)]
    expect(duplicateMics(gente)).toEqual([2, 7])
  })

  it('sin repetidos, vacío', () => {
    expect(duplicateMics([person('A', 1), person('B', 2)])).toEqual([])
  })
})

describe('micCoverage', () => {
  it('señala la pista grabada que no tiene dueño', () => {
    const { unassignedMics } = micCoverage([person('A', 1)], [1, 4])
    expect(unassignedMics).toEqual([4])
  })

  it('señala a quien lleva un micrófono del que no llegó grabación', () => {
    const { peopleWithoutTrack } = micCoverage([person('A', 1), person('B', 9)], [1])
    expect(peopleWithoutTrack.map((p) => p.name)).toEqual(['B'])
  })

  it('quien no lleva micrófono no falta en ninguna pista', () => {
    const { peopleWithoutTrack } = micCoverage([person('A', null)], [1])
    expect(peopleWithoutTrack).toEqual([])
  })

  it('cuando todo calza, los dos lados quedan vacíos', () => {
    const cobertura = micCoverage([person('A', 1), person('B', 2)], [2, 1])
    expect(cobertura.unassignedMics).toEqual([])
    expect(cobertura.peopleWithoutTrack).toEqual([])
  })
})

describe('summarize', () => {
  it('separa quiénes están de quiénes cuentan', () => {
    const gente = [
      person('Moderadora', 1, 'moderator'),
      person('Invitada', 2),
      person('Marca', null, 'brand_staff'),
    ]
    expect(summarize(gente)).toEqual({ total: 3, analyzed: 1, withMic: 2 })
  })
})

describe('nextFreeMic', () => {
  it('propone el primer hueco, no el siguiente número', () => {
    expect(nextFreeMic([person('A', 1), person('B', 3)])).toBe(2)
  })

  it('empieza en 1 cuando no hay nadie', () => {
    expect(nextFreeMic([])).toBe(1)
  })

  it('sin micrófonos libres devuelve null en vez de inventar uno', () => {
    const llenos = Array.from({ length: 4 }, (_, i) => person(`P${i}`, i + 1))
    expect(nextFreeMic(llenos, 4)).toBeNull()
  })
})

describe('parseRoster', () => {
  it('lee nombre y micrófono separados por coma', () => {
    expect(parseRoster('Carolina Reyes, 3')).toEqual([
      { name: 'Carolina Reyes', micNumber: 3, role: 'participant' },
    ])
  })

  it('lee el micrófono adelante', () => {
    expect(parseRoster('3 Carolina Reyes')).toEqual([
      { name: 'Carolina Reyes', micNumber: 3, role: 'participant' },
    ])
  })

  it('lee lo pegado desde una planilla, con tabulación', () => {
    expect(parseRoster('Carolina Reyes\t3\nPaula Contreras\t4')).toEqual([
      { name: 'Carolina Reyes', micNumber: 3, role: 'participant' },
      { name: 'Paula Contreras', micNumber: 4, role: 'participant' },
    ])
  })

  it('reconoce el rol cuando está escrito y lo saca del nombre', () => {
    expect(parseRoster('Carolina Reyes, moderadora, 1')).toEqual([
      { name: 'Carolina Reyes', micNumber: 1, role: 'moderator' },
    ])
    expect(parseRoster('Rodrigo Ávila, marca')).toEqual([
      { name: 'Rodrigo Ávila', micNumber: null, role: 'brand_staff' },
    ])
  })

  it('un nombre sin número queda sin micrófono, no con uno inventado', () => {
    expect(parseRoster('Carolina Reyes')).toEqual([
      { name: 'Carolina Reyes', micNumber: null, role: 'participant' },
    ])
  })

  it('ignora líneas vacías', () => {
    expect(parseRoster('\n  \nCarolina, 1\n\n')).toHaveLength(1)
  })

  it('descarta una línea que no deja ningún nombre', () => {
    expect(parseRoster('7')).toEqual([])
  })

  it('un número fuera de rango no se toma como micrófono', () => {
    expect(parseRoster('Carolina Reyes, 0')).toEqual([
      { name: 'Carolina Reyes', micNumber: null, role: 'participant' },
    ])
  })

  it('no confunde un número dentro del nombre con el micrófono', () => {
    expect(parseRoster('Ana Maria Perez')).toEqual([
      { name: 'Ana Maria Perez', micNumber: null, role: 'participant' },
    ])
  })

  it('acepta el punto después del número, como en una lista numerada', () => {
    expect(parseRoster('1. Carolina Reyes')).toEqual([
      { name: 'Carolina Reyes', micNumber: 1, role: 'participant' },
    ])
  })
})
