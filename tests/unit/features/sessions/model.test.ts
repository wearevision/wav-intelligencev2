import { describe, expect, it } from 'vitest'

import {
  buildGrid,
  expectedCodes,
  isValidShape,
  isoToLocalInput,
  localInputToIso,
  logisticsComplete,
  missingLogistics,
  sessionsOutsideGrid,
  studyShape,
} from '@/features/sessions/model'
import type { StudySession } from '@/features/sessions/types'

function session(over: Partial<StudySession> = {}): StudySession {
  return {
    id: 's',
    dayNumber: 1,
    blockNumber: 1,
    code: 'd1b1',
    name: 'Día 1 · Bloque 1',
    scheduledAt: '2026-11-10T13:00:00.000Z',
    venue: 'Sala Providencia',
    moderatorName: 'Carolina Reyes',
    participantCount: 8,
    ...over,
  }
}

function grid3x2(): StudySession[] {
  const out: StudySession[] = []
  for (let d = 1; d <= 3; d++) {
    for (let b = 1; b <= 2; b++) {
      out.push(session({ id: `s${d}${b}`, dayNumber: d, blockNumber: b, code: `d${d}b${b}` }))
    }
  }
  return out
}

describe('studyShape', () => {
  it('deriva la forma de las sesiones y no de columnas guardadas', () => {
    expect(studyShape(grid3x2())).toEqual({ days: 3, blocksPerDay: 2 })
  })

  it('sin sesiones no hay forma', () => {
    expect(studyShape([])).toEqual({ days: 0, blocksPerDay: 0 })
  })

  it('una sesión agregada a mano ensancha la forma, en vez de contradecirla', () => {
    // Es justamente el caso que D16 evita: con columnas guardadas, esta séptima
    // sesión dejaría 'blocksPerDay = 2' mintiendo y nada lo detectaría.
    const sessions = [...grid3x2(), session({ id: 'extra', dayNumber: 3, blockNumber: 3 })]
    expect(studyShape(sessions)).toEqual({ days: 3, blocksPerDay: 3 })
  })

  it('ignora las sesiones sin día ni bloque', () => {
    expect(studyShape([session({ dayNumber: null, blockNumber: null })])).toEqual({
      days: 0,
      blocksPerDay: 0,
    })
  })
})

describe('isValidShape', () => {
  it('acepta lo razonable', () => {
    expect(isValidShape(3, 2)).toBe(true)
    expect(isValidShape(1, 1)).toBe(true)
    expect(isValidShape(10, 6)).toBe(true)
  })

  it('rechaza cero, negativos y fuera de rango', () => {
    expect(isValidShape(0, 2)).toBe(false)
    expect(isValidShape(3, 0)).toBe(false)
    expect(isValidShape(-1, 2)).toBe(false)
    expect(isValidShape(11, 2)).toBe(false)
    expect(isValidShape(3, 7)).toBe(false)
  })

  it('rechaza decimales', () => {
    expect(isValidShape(2.5, 2)).toBe(false)
  })
})

describe('expectedCodes', () => {
  it('produce los códigos en orden', () => {
    expect(expectedCodes(2, 2)).toEqual(['d1b1', 'd1b2', 'd2b1', 'd2b2'])
  })

  it('devuelve vacío para una forma inválida', () => {
    expect(expectedCodes(0, 2)).toEqual([])
  })
})

describe('buildGrid', () => {
  it('arma la grilla completa', () => {
    const rows = buildGrid(grid3x2())
    expect(rows).toHaveLength(3)
    expect(rows[0]?.cells).toHaveLength(2)
    expect(rows[1]?.cells[1]?.session?.code).toBe('d2b2')
  })

  it('deja en null las celdas sin sesión', () => {
    const sessions = [
      session({ id: 'a', dayNumber: 1, blockNumber: 1 }),
      session({ id: 'b', dayNumber: 2, blockNumber: 2 }),
    ]
    const rows = buildGrid(sessions)
    expect(rows[0]?.cells[1]?.session).toBeNull()
    expect(rows[1]?.cells[0]?.session).toBeNull()
  })

  it('sin sesiones no hay filas', () => {
    expect(buildGrid([])).toEqual([])
  })
})

describe('sessionsOutsideGrid', () => {
  it('devuelve las que no caen en ninguna celda', () => {
    const suelta = session({ id: 'suelta', dayNumber: null, blockNumber: null })
    expect(sessionsOutsideGrid([...grid3x2(), suelta]).map((s) => s.id)).toEqual(['suelta'])
  })

  it('vacío cuando todas tienen día y bloque', () => {
    expect(sessionsOutsideGrid(grid3x2())).toEqual([])
  })
})

describe('missingLogistics', () => {
  it('nada falta cuando está completa', () => {
    expect(missingLogistics(session())).toEqual([])
  })

  it('detecta cada pieza', () => {
    expect(missingLogistics(session({ scheduledAt: null }))).toEqual(['schedule'])
    expect(missingLogistics(session({ venue: null }))).toEqual(['venue'])
    expect(missingLogistics(session({ moderatorName: null }))).toEqual(['moderator'])
  })

  it('trata el texto en blanco como faltante', () => {
    expect(missingLogistics(session({ venue: '   ' }))).toEqual(['venue'])
  })

  it('las acumula', () => {
    expect(missingLogistics(session({ scheduledAt: null, venue: null, moderatorName: null }))).toEqual([
      'schedule',
      'venue',
      'moderator',
    ])
  })
})

describe('logisticsComplete', () => {
  it('true cuando todas están completas', () => {
    expect(logisticsComplete(grid3x2())).toBe(true)
  })

  it('false si a una le falta algo', () => {
    expect(logisticsComplete([...grid3x2(), session({ id: 'x', venue: null })])).toBe(false)
  })

  it('false sin sesiones: no hay agenda que completar', () => {
    expect(logisticsComplete([])).toBe(false)
  })
})

describe('conversión de fecha y hora', () => {
  it('ida y vuelta conserva lo que el usuario escribió', () => {
    // Independiente de la zona horaria del entorno: lo que importa es que el
    // valor mostrado al editar sea el mismo que se escribió.
    const escrito = '2026-11-10T10:00'
    const iso = localInputToIso(escrito)
    expect(iso).not.toBeNull()
    expect(isoToLocalInput(iso)).toBe(escrito)
  })

  it('vacío es null y no una fecha inventada', () => {
    expect(localInputToIso('')).toBeNull()
    expect(localInputToIso('   ')).toBeNull()
  })

  it('una entrada inválida es null', () => {
    expect(localInputToIso('no soy fecha')).toBeNull()
  })

  it('null se muestra como campo vacío', () => {
    expect(isoToLocalInput(null)).toBe('')
  })
})
