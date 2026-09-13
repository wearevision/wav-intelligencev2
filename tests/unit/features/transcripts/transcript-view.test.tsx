import { describe, expect, it } from 'vitest'

import { groupTurns } from '@/features/transcripts/components/transcript-view'
import type { Verbatim } from '@/features/transcripts/types'

function verbatim(over: Partial<Verbatim>): Verbatim {
  return {
    id: 'v1',
    sessionId: 's1',
    participantId: null,
    participantName: null,
    speakerLabel: null,
    startTs: 0,
    endTs: 1,
    text: 'texto',
    confidence: null,
    ...over,
  }
}

describe('groupTurns', () => {
  it('junta lo seguido de la misma persona en un turno', () => {
    const turnos = groupTurns([
      verbatim({ id: 'a', participantName: 'Paula', text: 'Yo creo' }),
      verbatim({ id: 'b', participantName: 'Paula', text: 'que el precio importa.' }),
    ])

    expect(turnos).toHaveLength(1)
    expect(turnos[0]!.text).toBe('Yo creo que el precio importa.')
  })

  it('corta el turno cuando cambia la voz', () => {
    const turnos = groupTurns([
      verbatim({ id: 'a', participantName: 'Paula', text: 'Uno' }),
      verbatim({ id: 'b', participantName: 'Ignacio', text: 'Dos' }),
      verbatim({ id: 'c', participantName: 'Paula', text: 'Tres' }),
    ])

    expect(turnos.map((t) => t.speaker)).toEqual(['Paula', 'Ignacio', 'Paula'])
  })

  it('conserva el tiempo del primer segmento del turno', () => {
    const turnos = groupTurns([
      verbatim({ id: 'a', participantName: 'Paula', startTs: 12, text: 'Uno' }),
      verbatim({ id: 'b', participantName: 'Paula', startTs: 15, text: 'Dos' }),
    ])

    expect(turnos[0]!.startTs).toBe(12)
  })

  it('cae a la etiqueta del diarizador cuando no hay nombre', () => {
    const turnos = groupTurns([verbatim({ speakerLabel: 'SPEAKER_02', text: 'Hola' })])
    expect(turnos[0]!.speaker).toBe('SPEAKER_02')
  })

  it('sin nombre ni etiqueta el turno queda sin voz, no con una inventada', () => {
    expect(groupTurns([verbatim({})])[0]!.speaker).toBeNull()
  })

  it('dos sin identificar seguidos no se funden con uno con nombre', () => {
    const turnos = groupTurns([
      verbatim({ id: 'a', text: 'Uno' }),
      verbatim({ id: 'b', participantName: 'Paula', text: 'Dos' }),
    ])
    expect(turnos).toHaveLength(2)
  })

  it('sin verbatims no hay turnos', () => {
    expect(groupTurns([])).toEqual([])
  })
})
