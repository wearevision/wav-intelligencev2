import { describe, expect, it } from 'vitest'

import {
  attendedFromLabel,
  parseRosterWorkbook,
  readMic,
  roleFromLabel,
  segmentFromLabel,
  type Cell,
  type SheetInput,
} from '@/features/participants/roster-import'

// La forma es la de una planilla de terreno real; los nombres son inventados.
const ENCABEZADO = [
  null,
  'RUT',
  'Nombre',
  'Celular',
  'Mail',
  'Patente',
  'N° Micrófono',
  'Nº Giftcard',
  '09:00:00',
  '13:00PM',
  'Cliente / NO Cliente',
  'observación',
  null,
  'ROL',
]

function fila(
  nombre: string,
  mic: string | number | null,
  am: boolean,
  pm: boolean,
  segmento: string,
  observacion: string,
  rol: string,
) {
  return [
    null,
    '11.111.111-1',
    nombre,
    '900000000',
    'x@y.cl',
    'ABCD12',
    mic,
    4700,
    am ? 1 : null,
    pm ? 1 : null,
    segmento,
    observacion,
    null,
    rol,
  ]
}

const HOJA: SheetInput = {
  title: 'Junio 2',
  rows: [
    [null, null, null],
    ENCABEZADO,
    fila('Ana Silva', 5, true, false, 'NO', 'ASISTIÓ', 'Entrevistado'),
    fila('Bruno Pardo', 2, true, false, 'CLIENTE', 'ASISTIÓ', 'Entrevistado'),
    fila('Clara Rivas', 5, false, true, 'NO', 'ASISTIÓ', 'Entrevistado'),
    fila('Diego Mena', null, false, false, 'NO', 'NO ASISTIÓ', 'Entrevistado'),
    fila('Elena Prat', 'MIC03 am / MIC06 pm', true, true, 'WAV', 'ASISTIÓ', 'Moderadora'),
  ],
}

describe('roleFromLabel', () => {
  it('traduce los rótulos de la planilla', () => {
    expect(roleFromLabel('Entrevistado')).toBe('participant')
    expect(roleFromLabel('Moderadora')).toBe('moderator')
    expect(roleFromLabel('Representante Marca')).toBe('brand_staff')
    expect(roleFromLabel('Observador')).toBe('observer')
  })

  it('sin rótulo asume invitado, que es el caso común', () => {
    expect(roleFromLabel('')).toBe('participant')
  })
})

describe('segmentFromLabel', () => {
  it('lee cliente y no cliente escritos de cualquier forma', () => {
    expect(segmentFromLabel('CLIENTE')).toBe('client')
    expect(segmentFromLabel('Cliente')).toBe('client')
    expect(segmentFromLabel('NO')).toBe('non_client')
    expect(segmentFromLabel('No')).toBe('non_client')
  })

  it('la agencia y la marca no tienen segmento', () => {
    expect(segmentFromLabel('WAV')).toBeNull()
    expect(segmentFromLabel('MG')).toBeNull()
    expect(segmentFromLabel('')).toBeNull()
  })
})

describe('attendedFromLabel', () => {
  it('«NO ASISTIÓ» contiene «ASISTIÓ» y no debe leerse como que asistió', () => {
    expect(attendedFromLabel('ASISTIÓ')).toBe(true)
    expect(attendedFromLabel('NO ASISTIÓ')).toBe(false)
    expect(attendedFromLabel('NO aSISTIÓ')).toBe(false)
  })

  it('sin dato se asume que estuvo: la planilla marca las ausencias', () => {
    expect(attendedFromLabel('')).toBe(true)
  })
})

describe('readMic', () => {
  it('un número vale para todos los bloques en que esté la persona', () => {
    const { byBlock, note } = readMic(7, 2)
    expect([...byBlock.entries()]).toEqual([
      [1, 7],
      [2, 7],
    ])
    expect(note).toBeNull()
  })

  it('lee un micrófono distinto por bloque', () => {
    const { byBlock } = readMic('MIC03 am / MIC06 pm', 2)
    expect(byBlock.get(1)).toBe(3)
    expect(byBlock.get(2)).toBe(6)
  })

  it('una nota escrita a mano no se interpreta, se devuelve', () => {
    const nota = 'mic 17 al principio, luego lo cambiamos para otra persona'
    const { byBlock, note } = readMic(nota, 2)

    // Sacarle el 17 se lo daría a dos personas del mismo bloque.
    expect(byBlock.size).toBe(0)
    expect(note).toBe(nota)
  })

  it('una celda vacía no es una nota', () => {
    expect(readMic(null, 2)).toEqual({ byBlock: new Map(), note: null })
    expect(readMic('  ', 2).note).toBeNull()
  })
})

describe('parseRosterWorkbook', () => {
  const [dia] = parseRosterWorkbook([HOJA])

  it('una hoja es un día y las columnas de horario son sus bloques', () => {
    expect(dia!.dayNumber).toBe(1)
    expect(dia!.title).toBe('Junio 2')
    expect(dia!.blockLabels).toEqual(['09:00:00', '13:00PM'])
  })

  it('reparte a cada persona en el bloque que tiene marcado', () => {
    const am = dia!.people.filter((p) => p.blockNumber === 1).map((p) => p.name)
    const pm = dia!.people.filter((p) => p.blockNumber === 2).map((p) => p.name)

    expect(am).toEqual(['Ana Silva', 'Bruno Pardo', 'Elena Prat'])
    expect(pm).toEqual(['Clara Rivas', 'Elena Prat'])
  })

  it('el mismo número de micrófono en dos bloques no es un conflicto', () => {
    const ana = dia!.people.find((p) => p.name === 'Ana Silva')
    const clara = dia!.people.find((p) => p.name === 'Clara Rivas')

    expect(ana!.micNumber).toBe(5)
    expect(clara!.micNumber).toBe(5)
    expect(ana!.blockNumber).not.toBe(clara!.blockNumber)
  })

  it('una persona en los dos bloques lleva el micrófono que le tocó en cada uno', () => {
    const elena = dia!.people.filter((p) => p.name === 'Elena Prat')
    expect(elena.map((p) => [p.blockNumber, p.micNumber])).toEqual([
      [1, 3],
      [2, 6],
    ])
  })

  it('quien no asistió queda fuera y se cuenta', () => {
    expect(dia!.people.some((p) => p.name === 'Diego Mena')).toBe(false)
    expect(dia!.absent).toBe(1)
  })

  it('el rol y el segmento salen de sus columnas', () => {
    expect(dia!.people.find((p) => p.name === 'Elena Prat')!.role).toBe('moderator')
    expect(dia!.people.find((p) => p.name === 'Bruno Pardo')!.segment).toBe('client')
    expect(dia!.people.find((p) => p.name === 'Ana Silva')!.segment).toBe('non_client')
  })

  it('la moderadora no lleva segmento aunque la columna diga algo', () => {
    expect(dia!.people.find((p) => p.name === 'Elena Prat')!.segment).toBeNull()
  })

  it('acepta el encabezado escrito distinto en otra hoja', () => {
    const otra: SheetInput = {
      title: 'Junio 3',
      rows: [
        ENCABEZADO.map((h) => (h === 'N° Micrófono' ? 'Micrófono' : h)),
        fila('Ana Silva', 4, true, false, 'NO', 'ASISTIÓ', 'Entrevistado'),
      ],
    }
    const [, tres] = parseRosterWorkbook([HOJA, otra])
    expect(tres!.dayNumber).toBe(2)
    expect(tres!.people[0]!.micNumber).toBe(4)
  })
})

describe('parseRosterWorkbook · avisos', () => {
  it('avisa del segmento que no reconoce y deja a la persona sin segmento', () => {
    const hoja: SheetInput = {
      title: 'Junio 2',
      rows: [
        ENCABEZADO,
        fila('Ana Silva', 5, true, false, 'Quizás', 'ASISTIÓ', 'Entrevistado'),
        fila('Bruno Pardo', 2, true, false, '', 'ASISTIÓ', 'Entrevistado'),
      ],
    }
    const [dia] = parseRosterWorkbook([hoja])

    expect(dia!.people.find((p) => p.name === 'Ana Silva')!.segment).toBeNull()
    expect(dia!.warnings).toContain(
      'Ana Silva: no se entendió el segmento («Quizás»). Entra sin segmento.',
    )
    expect(dia!.warnings.some((w) => w.includes('Bruno Pardo'))).toBe(false)
  })

  it('avisa del micrófono repetido dentro de un bloque y deja al segundo sin asignar', () => {
    const hoja: SheetInput = {
      title: 'Junio 2',
      rows: [
        ENCABEZADO,
        fila('Ana Silva', 5, true, false, 'NO', 'ASISTIÓ', 'Entrevistado'),
        fila('Bruno Pardo', 5, true, false, 'NO', 'ASISTIÓ', 'Entrevistado'),
      ],
    }
    const [dia] = parseRosterWorkbook([hoja])

    expect(dia!.people.find((p) => p.name === 'Ana Silva')!.micNumber).toBe(5)
    expect(dia!.people.find((p) => p.name === 'Bruno Pardo')!.micNumber).toBeNull()
    expect(dia!.warnings.some((w) => w.includes('ya estaba tomado'))).toBe(true)
  })

  it('avisa de quien asistió sin bloque marcado y no lo mete en ninguno', () => {
    const hoja: SheetInput = {
      title: 'Junio 2',
      rows: [ENCABEZADO, fila('Ana Silva', 5, false, false, 'NO', 'ASISTIÓ', 'Entrevistado')],
    }
    const [dia] = parseRosterWorkbook([hoja])

    expect(dia!.people).toEqual([])
    expect(dia!.warnings[0]).toContain('no tiene bloque marcado')
  })

  it('avisa cuando el micrófono venía escrito como nota', () => {
    const hoja: SheetInput = {
      title: 'Junio 2',
      rows: [
        ENCABEZADO,
        fila(
          'Ana Silva',
          'se lo pasamos a otra a mitad',
          false,
          true,
          'NO',
          'ASISTIÓ',
          'Entrevistado',
        ),
      ],
    }
    const [dia] = parseRosterWorkbook([hoja])

    expect(dia!.people[0]!.micNumber).toBeNull()
    expect(dia!.warnings[0]).toContain('no se pudo leer el micrófono')
  })

  it('una hoja sin encabezado reconocible se reporta en vez de romper', () => {
    const [dia] = parseRosterWorkbook([{ title: 'Notas', rows: [['algo', 'otra cosa']] }])
    expect(dia!.people).toEqual([])
    expect(dia!.warnings[0]).toContain('No se encontró la fila de encabezados')
  })
})

describe('parseRosterWorkbook · la hora como Date', () => {
  /**
   * Excel guarda «09:00» como una hora, no como texto, y el lector la entrega
   * como Date. Cuando esto no se contemplaba, la columna de la mañana no se
   * reconocía como bloque y **el bloque de la mañana entero desaparecía**: su
   * gente salía como "asistió pero no tiene bloque marcado". Las pruebas con
   * encabezados de texto no podían verlo; el archivo real sí.
   */
  const conFecha = ENCABEZADO.map((h) =>
    h === '09:00:00' ? new Date(Date.UTC(1899, 11, 30, 9, 0, 0)) : h,
  )

  it('reconoce la columna de la mañana aunque venga como hora', () => {
    const hoja: SheetInput = {
      title: 'Junio 2',
      rows: [conFecha, fila('Ana Silva', 5, true, false, 'NO', 'ASISTIÓ', 'Entrevistado')],
    }
    const [dia] = parseRosterWorkbook([hoja])

    expect(dia!.blockLabels).toEqual(['09:00', '13:00PM'])
    expect(dia!.people).toHaveLength(1)
    expect(dia!.people[0]!.blockNumber).toBe(1)
    expect(dia!.warnings).toEqual([])
  })

  it('con la mañana reconocida, el micrófono por bloque se lee bien', () => {
    const hoja: SheetInput = {
      title: 'Junio 2',
      rows: [
        conFecha,
        fila('Elena Prat', 'MIC03 am / MIC06 pm', true, true, 'WAV', 'ASISTIÓ', 'Moderadora'),
      ],
    }
    const [dia] = parseRosterWorkbook([hoja])

    // Con un solo bloque detectado, «MIC03 am / MIC06 pm» caía a nota.
    expect(dia!.people.map((p) => [p.blockNumber, p.micNumber])).toEqual([
      [1, 3],
      [2, 6],
    ])
    expect(dia!.warnings).toEqual([])
  })
})

describe('parseRosterWorkbook · una columna que no se encontró', () => {
  /**
   * El caso real: seis bloques importados, ochenta personas, y el segmento
   * —cliente / no cliente— vacío en todas. La planilla lo tenía; el encabezado
   * se llamaba de otra forma y el buscador no lo reconoció. El importador no
   * dijo nada: de las cuatro cosas que entran de la planilla (nombre,
   * micrófono, rol, segmento) faltaba una entera y el resultado se veía bien.
   *
   * Nombrar los encabezados que sí se vieron es lo que convierte "está vacío"
   * en "se llama así".
   */
  function sinColumna(nombre: string): SheetInput {
    const at = ENCABEZADO.indexOf(nombre)
    const quitar = (row: Cell[]) => row.map((c, i) => (i === at ? null : c))
    return {
      title: 'Junio 2',
      rows: [
        quitar(ENCABEZADO),
        quitar(fila('Ana Silva', 5, true, false, 'NO', 'ASISTIÓ', 'Entrevistado')),
      ],
    }
  }

  it('avisa cuando falta la columna de segmento y dice qué encabezados vio', () => {
    const [dia] = parseRosterWorkbook([sinColumna('Cliente / NO Cliente')])

    expect(dia!.people[0]!.segment).toBeNull()
    expect(dia!.warnings.join(' ')).toContain('cliente / no cliente')
    expect(dia!.headers).toContain('N° Micrófono')
    expect(dia!.headers).not.toContain('Cliente / NO Cliente')
  })

  it('avisa cuando falta la columna de micrófono', () => {
    const [dia] = parseRosterWorkbook([sinColumna('N° Micrófono')])

    expect(dia!.people[0]!.micNumber).toBeNull()
    expect(dia!.warnings.join(' ')).toContain('micrófono')
  })

  it('avisa cuando falta la columna de rol: sin ella todos entran como invitados', () => {
    const [dia] = parseRosterWorkbook([sinColumna('ROL')])

    expect(dia!.people[0]!.role).toBe('participant')
    expect(dia!.warnings.join(' ')).toContain('rol')
  })

  it('con todas las columnas presentes no avisa de ninguna', () => {
    const [dia] = parseRosterWorkbook([HOJA])
    expect(dia!.warnings.filter((w) => w.includes('No se encontró la columna'))).toEqual([])
    expect(dia!.headers).toContain('Cliente / NO Cliente')
  })

  it('un segmento escrito de una forma que no se entiende se avisa, no se ignora', () => {
    const hoja: SheetInput = {
      title: 'Junio 2',
      rows: [
        ENCABEZADO,
        fila('Ana Silva', 5, true, false, 'Usuaria MG', 'ASISTIÓ', 'Entrevistado'),
      ],
    }
    const [dia] = parseRosterWorkbook([hoja])

    expect(dia!.people[0]!.segment).toBeNull()
    expect(dia!.warnings.join(' ')).toContain('Usuaria MG')
  })

  it('una hoja sin encabezado también devuelve los encabezados vacíos', () => {
    const [dia] = parseRosterWorkbook([{ title: 'Notas', rows: [['algo']] }])
    expect(dia!.headers).toEqual([])
  })
})
