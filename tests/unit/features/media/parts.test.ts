import { describe, expect, it } from 'vitest'

import {
  computeOffsets,
  formatGap,
  groupRecordings,
  parseNativeName,
  parseTimestampName,
} from '@/features/media/parts'

const T0 = new Date('2026-11-10T13:00:00.000Z').getTime()
/** Un archivo que terminó de escribirse en T0 + `endsAt` segundos. */
function part(filename: string, endsAtSeconds: number, durationSeconds: number) {
  return {
    filename,
    modifiedAt: new Date(T0 + endsAtSeconds * 1000),
    durationSeconds,
  }
}

describe('parseNativeName · Insta360', () => {
  it('separa grabación, lente y parte', () => {
    expect(parseNativeName('VID_20261110_130000_00_001.insv')).toEqual({
      recordingKey: 'VID_20261110_130000_00',
      partNumber: 1,
      trackNumber: 0,
      family: 'insta360',
    })
  })

  it('los dos lentes de un mismo segmento no comparten grabación', () => {
    const a = parseNativeName('VID_20261110_130000_00_001.insv')!
    const b = parseNativeName('VID_20261110_130000_10_001.insv')!
    expect(a.recordingKey).not.toBe(b.recordingKey)
    expect(b.trackNumber).toBe(10)
  })

  it('las partes siguientes caen en la misma grabación', () => {
    const a = parseNativeName('VID_20261110_130000_00_001.insv')!
    const b = parseNativeName('VID_20261110_130000_00_002.insv')!
    expect(a.recordingKey).toBe(b.recordingKey)
    expect(b.partNumber).toBe(2)
  })
})

describe('parseNativeName · Zoom', () => {
  it('la pista es el micrófono', () => {
    expect(parseNativeName('ZOOM0001_Tr3.WAV')).toEqual({
      recordingKey: 'ZOOM0001_Tr3',
      partNumber: 1,
      trackNumber: 3,
      family: 'zoom',
    })
  })

  it('dos tomas no se juntan solas: podrían ser mañana y tarde', () => {
    const a = parseNativeName('ZOOM0001_Tr3.WAV')!
    const b = parseNativeName('ZOOM0002_Tr3.WAV')!
    expect(a.recordingKey).not.toBe(b.recordingKey)
  })

  it('acepta la toma sin pista', () => {
    expect(parseNativeName('ZOOM0007.WAV')).toMatchObject({
      recordingKey: 'ZOOM0007',
      trackNumber: null,
    })
  })
})

describe('parseNativeName · Tascam', () => {
  it('el segundo número sí es la parte', () => {
    const a = parseNativeName('DR0000_0001.wav')!
    const b = parseNativeName('DR0000_0002.wav')!
    expect(a.recordingKey).toBe('DR0000')
    expect(b.partNumber).toBe(2)
  })
})

describe('parseNativeName · genérico', () => {
  it('agrupa por el número final relleno con ceros', () => {
    expect(parseNativeName('reunion-002.wav')).toMatchObject({
      recordingKey: 'reunion',
      partNumber: 2,
      family: 'generic',
    })
  })

  it('NO confunde el número de micrófono con un número de parte', () => {
    expect(parseNativeName('d1b1-mic1.wav')).toBeNull()
    expect(parseNativeName('d1b1-mic3.wav')).toBeNull()
  })

  it('un nombre sin número no se fuerza', () => {
    expect(parseNativeName('d1b1-sala.wav')).toBeNull()
    expect(parseNativeName('grabacion-suelta.wav')).toBeNull()
  })
})

describe('computeOffsets', () => {
  it('con reloj y duración, el corte del equipo no deja hueco', () => {
    // Dos partes de 600 s pegadas: la primera termina en 600, la segunda en 1200.
    const result = computeOffsets([part('a-001.wav', 600, 600), part('a-002.wav', 1200, 600)])

    expect(result.offsets).toEqual([0, 600])
    expect(result.gaps).toEqual([])
    expect(result.assumedContiguous).toBe(false)
  })

  it('una pausa real se detecta y se cuenta', () => {
    // La segunda parte empieza 240 s después de que terminó la primera.
    const result = computeOffsets([part('a-001.wav', 600, 600), part('a-002.wav', 1440, 600)])

    expect(result.gaps).toEqual([{ afterPart: 1, seconds: 240 }])
    expect(result.offsets).toEqual([0, 840])
  })

  it('un desfase de un segundo es redondeo del equipo, no una pausa', () => {
    const result = computeOffsets([part('a-001.wav', 600, 600), part('a-002.wav', 1201, 600)])
    expect(result.gaps).toEqual([])
  })

  it('sin reloj encadena duraciones y lo declara', () => {
    const result = computeOffsets([
      { filename: 'a-001.wav', durationSeconds: 600 },
      { filename: 'a-002.wav', durationSeconds: 300 },
    ])

    expect(result.offsets).toEqual([0, 600])
    expect(result.assumedContiguous).toBe(true)
  })

  it('sin duración no inventa desfases', () => {
    const result = computeOffsets([{ filename: 'a-001.wav' }, { filename: 'a-002.wav' }])
    expect(result.offsets).toEqual([null, null])
    expect(result.assumedContiguous).toBe(true)
  })

  it('sin partes no falla', () => {
    expect(computeOffsets([])).toEqual({ offsets: [], gaps: [], assumedContiguous: false })
  })
})

describe('groupRecordings', () => {
  it('junta las partes y las ordena por número, no por cómo llegaron', () => {
    const { recordings } = groupRecordings([
      part('DR0000_0003.wav', 1800, 600),
      part('DR0000_0001.wav', 600, 600),
      part('DR0000_0002.wav', 1200, 600),
    ])

    expect(recordings).toHaveLength(1)
    expect(recordings[0]!.parts.map((p) => p.partNumber)).toEqual([1, 2, 3])
    expect(recordings[0]!.parts.map((p) => p.offsetSeconds)).toEqual([0, 600, 1200])
  })

  it('separa grabaciones distintas', () => {
    const { recordings } = groupRecordings([
      part('DR0000_0001.wav', 600, 600),
      part('DR0000_0002.wav', 1200, 600),
      part('DR0009_0001.wav', 600, 600),
      part('DR0009_0002.wav', 1200, 600),
    ])

    expect(recordings.map((r) => r.key)).toEqual(['DR0000', 'DR0009'])
  })

  it('una grabación de una sola parte se trata como archivo suelto', () => {
    const { recordings, loose } = groupRecordings([part('DR0000_0001.wav', 600, 600)])

    expect(recordings).toHaveLength(0)
    expect(loose.map((f) => f.filename)).toEqual(['DR0000_0001.wav'])
  })

  it('lo que no calza con ningún patrón vuelve, no se descarta', () => {
    const { recordings, loose } = groupRecordings([
      part('DR0000_0001.wav', 600, 600),
      part('DR0000_0002.wav', 1200, 600),
      part('d1b1-sala.wav', 7200, 7200),
    ])

    expect(recordings).toHaveLength(1)
    expect(loose.map((f) => f.filename)).toEqual(['d1b1-sala.wav'])
  })

  it('los archivos con la convención del estudio no se agrupan entre sí', () => {
    const { recordings, loose } = groupRecordings([
      part('d1b1-mic1.wav', 7200, 7200),
      part('d1b1-mic3.wav', 7200, 7200),
      part('d1b1-sala.wav', 7200, 7200),
    ])

    expect(recordings).toHaveLength(0)
    expect(loose).toHaveLength(3)
  })

  it('conserva el hueco detectado en la grabación', () => {
    const { recordings } = groupRecordings([
      part('DR0000_0001.wav', 600, 600),
      part('DR0000_0002.wav', 1440, 600),
    ])

    expect(recordings[0]!.gaps).toEqual([{ afterPart: 1, seconds: 240 }])
  })
})

describe('formatGap', () => {
  it('dice el hueco en palabras', () => {
    expect(formatGap(38)).toBe('38 s')
    expect(formatGap(240)).toBe('4 min')
    expect(formatGap(4320)).toBe('1 h 12 min')
  })
})

describe('parseTimestampName', () => {
  it('lee la hora que la grabadora puso en el nombre', () => {
    const at = parseTimestampName('2026-06-02-21-17-10.wav')!
    expect(at.getFullYear()).toBe(2026)
    expect(at.getMonth()).toBe(5)
    expect(at.getDate()).toBe(2)
    expect(at.getHours()).toBe(21)
    expect(at.getMinutes()).toBe(17)
    expect(at.getSeconds()).toBe(10)
  })

  it('acepta las formas compactas', () => {
    expect(parseTimestampName('20260602_211710.wav')).toEqual(
      parseTimestampName('2026-06-02-21-17-10.wav'),
    )
  })

  it('no confunde otras convenciones con una fecha', () => {
    expect(parseTimestampName('d1b1-sala.wav')).toBeNull()
    expect(parseTimestampName('DR0000_0001.wav')).toBeNull()
    expect(parseTimestampName('ZOOM0001_Tr3.WAV')).toBeNull()
  })

  it('rechaza una fecha imposible en vez de corregirla sola', () => {
    expect(parseTimestampName('2026-13-02-21-17-10.wav')).toBeNull()
    expect(parseTimestampName('2026-06-02-25-17-10.wav')).toBeNull()
  })
})

describe('groupRecordings · encadenado por hora', () => {
  /** El listado real: la grabadora corta cada 30 min desde las 21:18. */
  const REAL = [
    { filename: '2026-06-02-21-17-10.wav', durationSeconds: 4 },
    { filename: '2026-06-02-21-18-09.wav', durationSeconds: 1800 },
    { filename: '2026-06-02-21-48-09.wav', durationSeconds: 1800 },
    { filename: '2026-06-02-22-18-09.wav', durationSeconds: 1800 },
    { filename: '2026-06-02-22-48-09.wav', durationSeconds: 1800 },
    { filename: '2026-06-02-23-18-09.wav', durationSeconds: 1800 },
    { filename: '2026-06-02-23-48-09.wav', durationSeconds: 1800 },
    { filename: '2026-06-03-00-18-09.wav', durationSeconds: 1588 },
  ]

  it('encadena los ocho archivos en una sola grabación', () => {
    const { recordings, loose } = groupRecordings(REAL)

    expect(recordings).toHaveLength(1)
    expect(recordings[0]!.parts).toHaveLength(8)
    expect(recordings[0]!.family).toBe('timestamp')
    expect(loose).toEqual([])
  })

  it('los desfases salen de la hora del nombre y cruzan la medianoche', () => {
    const { recordings } = groupRecordings(REAL)
    const offsets = recordings[0]!.parts.map((p) => p.offsetSeconds)

    expect(offsets[1]).toBe(59)
    // 00:18:09 del día siguiente, a tres horas y un minuto del primer archivo.
    expect(offsets[7]).toBe(10_859)
  })

  it('marca el arranque en falso como una pausa, no lo esconde', () => {
    const { recordings } = groupRecordings(REAL)
    expect(recordings[0]!.gaps).toEqual([{ afterPart: 1, seconds: 55 }])
  })

  it('un salto de horas abre una grabación nueva: mañana y tarde', () => {
    const { recordings } = groupRecordings([
      { filename: '2026-06-02-10-00-00.wav', durationSeconds: 1800 },
      { filename: '2026-06-02-10-30-00.wav', durationSeconds: 1800 },
      { filename: '2026-06-02-16-00-00.wav', durationSeconds: 1800 },
      { filename: '2026-06-02-16-30-00.wav', durationSeconds: 1800 },
    ])

    expect(recordings).toHaveLength(2)
    expect(recordings.map((r) => r.parts.length)).toEqual([2, 2])
  })

  it('los ordena por hora aunque lleguen desordenados', () => {
    const { recordings } = groupRecordings([
      { filename: '2026-06-02-21-48-09.wav', durationSeconds: 1800 },
      { filename: '2026-06-02-21-18-09.wav', durationSeconds: 1800 },
    ])

    expect(recordings[0]!.parts.map((p) => p.filename)).toEqual([
      '2026-06-02-21-18-09.wav',
      '2026-06-02-21-48-09.wav',
    ])
  })

  it('sin duración no se encadena: no se sabe dónde termina cada parte', () => {
    const { recordings, loose } = groupRecordings([
      { filename: '2026-06-02-21-18-09.wav' },
      { filename: '2026-06-02-21-48-09.wav' },
    ])

    expect(recordings).toEqual([])
    expect(loose).toHaveLength(2)
  })

  it('un solo archivo con fecha sigue siendo un archivo suelto', () => {
    const { recordings, loose } = groupRecordings([
      { filename: '2026-06-02-21-18-09.wav', durationSeconds: 1800 },
    ])

    expect(recordings).toEqual([])
    expect(loose).toHaveLength(1)
  })
})
