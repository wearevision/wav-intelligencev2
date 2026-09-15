import { describe, expect, it } from 'vitest'

import { hlsKeys, isStudyScopedKey, mediaKey, randomSuffix } from '@/server/storage/keys'

const STUDY = '0f1e2d3c-4b5a-6978-8765-4321fedcba98'

describe('isStudyScopedKey', () => {
  it('acepta lo que construye el propio servidor', () => {
    expect(isStudyScopedKey(mediaKey(STUDY, 'd1b1', 'audio.wav', 'abc12345'), STUDY)).toBe(true)
    expect(isStudyScopedKey(mediaKey(STUDY, null, 'audio.wav', 'abc12345'), STUDY)).toBe(true)

    const { manifestKey, segments } = hlsKeys(STUDY, 'd1b1', 'VID.insv', randomSuffix(), ['0.ts'])
    expect(isStudyScopedKey(manifestKey, STUDY)).toBe(true)
    expect(isStudyScopedKey(segments[0]!.key, STUDY)).toBe(true)
  })

  it('rechaza la clave de otro estudio', () => {
    const otro = '11111111-2222-3333-4444-555555555555'
    expect(isStudyScopedKey(mediaKey(otro, 'd1b1', 'audio.wav', 'abc12345'), STUDY)).toBe(false)
  })

  it('rechaza los saltos de directorio', () => {
    expect(isStudyScopedKey(`studies/${STUDY}/../otro/audio.wav`, STUDY)).toBe(false)
    expect(isStudyScopedKey(`studies/${STUDY}/d1b1/../../audio.wav`, STUDY)).toBe(false)
    expect(isStudyScopedKey(`studies/${STUDY}/./audio.wav`, STUDY)).toBe(false)
  })

  it('rechaza un segmento vacío', () => {
    expect(isStudyScopedKey(`studies/${STUDY}//audio.wav`, STUDY)).toBe(false)
    expect(isStudyScopedKey(`studies/${STUDY}/d1b1/`, STUDY)).toBe(false)
  })

  it('rechaza lo que está fuera del prefijo de estudios', () => {
    expect(isStudyScopedKey('otro-prefijo/archivo.wav', STUDY)).toBe(false)
    expect(isStudyScopedKey(`/studies/${STUDY}/d1b1/audio.wav`, STUDY)).toBe(false)
    expect(isStudyScopedKey('', STUDY)).toBe(false)
  })

  it('rechaza una clave sin nombre de archivo', () => {
    expect(isStudyScopedKey(`studies/${STUDY}/d1b1`, STUDY)).toBe(false)
  })

  it('rechaza una profundidad que el servidor nunca emite', () => {
    expect(isStudyScopedKey(`studies/${STUDY}/d1b1/hls/x/y/z.ts`, STUDY)).toBe(false)
  })

  it('un estudio que no es uuid no habilita nada', () => {
    expect(isStudyScopedKey('studies/no-uuid/d1b1/audio.wav', 'no-uuid')).toBe(false)
  })
})
