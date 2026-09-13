import { describe, expect, it } from 'vitest'

import {
  classifyKind,
  matchFile,
  matchFiles,
  needsAttention,
  parseCode,
  parseMicNumber,
  type BlockRef,
} from '@/features/media/model'

const BLOCKS: BlockRef[] = [
  { sessionId: 's-d1b1', code: 'd1b1', scheduledAt: '2026-11-10T13:00:00.000Z' },
  { sessionId: 's-d1b2', code: 'd1b2', scheduledAt: '2026-11-10T20:00:00.000Z' },
  { sessionId: 's-d2b1', code: 'd2b1', scheduledAt: '2026-11-11T13:00:00.000Z' },
]

describe('parseCode', () => {
  it('lee el código al inicio del nombre', () => {
    expect(parseCode('d1b1.mp4')).toEqual({ day: 1, block: 1 })
  })

  it('lo lee en medio del nombre', () => {
    expect(parseCode('MG_d2b2_room.wav')).toEqual({ day: 2, block: 2 })
  })

  it('acepta dos dígitos', () => {
    expect(parseCode('d10b1.mov')).toEqual({ day: 10, block: 1 })
  })

  it('no distingue mayúsculas', () => {
    expect(parseCode('D1B2.wav')).toEqual({ day: 1, block: 2 })
  })

  it('no inventa un código donde no lo hay', () => {
    expect(parseCode('VID_20260913_101500_00_007.insv')).toBeNull()
    expect(parseCode('grabacion.wav')).toBeNull()
  })

  it('no lee un código pegado a otras letras', () => {
    // "dvd1b1" no es un código: leerlo sería atribuir material a ciegas.
    expect(parseCode('dvd1b1.mp4')).toBeNull()
  })

  it('rechaza día o bloque cero', () => {
    expect(parseCode('d0b1.mp4')).toBeNull()
    expect(parseCode('d1b0.mp4')).toBeNull()
  })
})

describe('parseMicNumber', () => {
  it('lee las formas habituales', () => {
    expect(parseMicNumber('mic3.wav')).toBe(3)
    expect(parseMicNumber('audio_mic_03.wav')).toBe(3)
    expect(parseMicNumber('MIC-12.wav')).toBe(12)
  })

  it('null cuando no hay micrófono en el nombre', () => {
    expect(parseMicNumber('d1b1_room.wav')).toBeNull()
  })

  it('rechaza el cero', () => {
    expect(parseMicNumber('mic0.wav')).toBeNull()
  })
})

describe('classifyKind', () => {
  it('reconoce video 360 por extensión y por nombre', () => {
    expect(classifyKind('VID_001.insv')).toBe('video_360')
    expect(classifyKind('d1b1_360.mp4')).toBe('video_360')
    expect(classifyKind('insta360_d1b1.mp4')).toBe('video_360')
  })

  it('el resto del video es DSLR', () => {
    expect(classifyKind('d1b1_camara.mov')).toBe('video_dslr')
    expect(classifyKind('d1b1.mp4')).toBe('video_dslr')
  })

  it('reconoce pista por micrófono', () => {
    expect(classifyKind('d1b1_mic3.wav')).toBe('audio_mic')
  })

  it('reconoce audio ambiente', () => {
    expect(classifyKind('d1b1_ambiente.wav')).toBe('audio_ambient')
    expect(classifyKind('d1b1_zona2.wav')).toBe('audio_ambient')
  })

  it('el audio sin pistas se asume mezcla de sala', () => {
    expect(classifyKind('d1b1.wav')).toBe('audio_room')
    expect(classifyKind('d1b1_sala.mp3')).toBe('audio_room')
  })

  it('null para lo que no es audio ni video', () => {
    expect(classifyKind('notas.pdf')).toBeNull()
    expect(classifyKind('sin_extension')).toBeNull()
  })
})

describe('matchFile', () => {
  it('empareja por código cuando el bloque existe', () => {
    expect(matchFile({ filename: 'd2b1_room.wav' }, BLOCKS)).toMatchObject({
      sessionId: 's-d2b1',
      code: 'd2b1',
      kind: 'audio_room',
      reason: 'code',
    })
  })

  it('adjunta el micrófono cuando el nombre lo trae', () => {
    expect(matchFile({ filename: 'd1b1_mic7.wav' }, BLOCKS)).toMatchObject({
      sessionId: 's-d1b1',
      kind: 'audio_mic',
      micNumber: 7,
    })
  })

  it('un código que no corresponde a ningún bloque queda sin asignar, pero conserva el código', () => {
    const m = matchFile({ filename: 'd9b9.wav' }, BLOCKS)
    expect(m.sessionId).toBeNull()
    expect(m.code).toBe('d9b9')
    expect(m.reason).toBe('unmatched')
  })

  it('empareja por horario cuando el nombre no trae código', () => {
    // La cámara escribió el archivo media hora después de empezar el bloque.
    expect(
      matchFile(
        { filename: 'VID_001.insv', modifiedAt: new Date('2026-11-10T13:30:00.000Z') },
        BLOCKS,
      ),
    ).toMatchObject({ sessionId: 's-d1b1', reason: 'schedule', kind: 'video_360' })
  })

  it('acepta un archivo escrito poco antes del horario', () => {
    expect(
      matchFile({ filename: 'a.wav', modifiedAt: new Date('2026-11-10T12:45:00.000Z') }, BLOCKS),
    ).toMatchObject({ sessionId: 's-d1b1', reason: 'schedule' })
  })

  it('no adivina cuando el horario calza con más de un bloque', () => {
    const solapados: BlockRef[] = [
      { sessionId: 'a', code: 'd1b1', scheduledAt: '2026-11-10T13:00:00.000Z' },
      { sessionId: 'b', code: 'd1b2', scheduledAt: '2026-11-10T14:00:00.000Z' },
    ]
    const m = matchFile({ filename: 'x.wav', modifiedAt: new Date('2026-11-10T14:30:00.000Z') }, solapados)
    expect(m.sessionId).toBeNull()
    expect(m.reason).toBe('ambiguous')
  })

  it('el código gana sobre el horario', () => {
    expect(
      matchFile(
        { filename: 'd2b1.wav', modifiedAt: new Date('2026-11-10T13:30:00.000Z') },
        BLOCKS,
      ),
    ).toMatchObject({ sessionId: 's-d2b1', reason: 'code' })
  })

  it('sin código ni hora utilizable, queda sin asignar', () => {
    expect(matchFile({ filename: 'grabacion.wav' }, BLOCKS)).toMatchObject({
      sessionId: null,
      reason: 'unmatched',
    })
  })

  it('una hora fuera de toda ventana no se fuerza a ningún bloque', () => {
    expect(
      matchFile({ filename: 'a.wav', modifiedAt: new Date('2026-12-25T13:00:00.000Z') }, BLOCKS),
    ).toMatchObject({ sessionId: null, reason: 'unmatched' })
  })
})

describe('needsAttention', () => {
  it('junta lo que una persona tiene que resolver, sin descartar nada', () => {
    const matches = matchFiles(
      [{ filename: 'd1b1.wav' }, { filename: 'grabacion.wav' }, { filename: 'd9b9.wav' }],
      BLOCKS,
    )
    expect(matches).toHaveLength(3)
    expect(needsAttention(matches).map((m) => m.filename)).toEqual(['grabacion.wav', 'd9b9.wav'])
  })
})
