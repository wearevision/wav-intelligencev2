import { describe, expect, it } from 'vitest'

import { mediaKey, randomSuffix, safeFilename } from '@/server/storage/keys'

describe('safeFilename', () => {
  it('quita tildes y deja el nombre legible', () => {
    expect(safeFilename('Sesión día 1.wav')).toBe('Sesion-dia-1.wav')
  })

  it('colapsa lo que no sirve en una ruta', () => {
    expect(safeFilename('a  b//c?d.wav')).toBe('a-b-c-d.wav')
  })

  it('no deja guiones colgando en las puntas', () => {
    expect(safeFilename('  ¿hola?  ')).toBe('hola')
  })

  it('un nombre que se queda sin nada utilizable no devuelve vacío', () => {
    expect(safeFilename('???')).toBe('archivo')
  })

  it('recorta los nombres larguísimos', () => {
    expect(safeFilename('x'.repeat(300))).toHaveLength(120)
  })
})

describe('mediaKey', () => {
  it('usa el código del bloque para que el bucket se pueda leer', () => {
    expect(mediaKey('estudio-1', 'd2b2', 'sala.wav', 'abc123')).toBe(
      'studies/estudio-1/d2b2/sala-abc123.wav',
    )
  })

  it('sin código el archivo queda separado, no mezclado con un bloque', () => {
    expect(mediaKey('estudio-1', null, 'sala.wav', 'abc123')).toBe(
      'studies/estudio-1/sin-bloque/sala-abc123.wav',
    )
  })

  it('conserva la extensión y le pone el sufijo al nombre', () => {
    expect(mediaKey('e', 'd1b1', 'grabacion.final.mp3', 'zz')).toBe(
      'studies/e/d1b1/grabacion.final-zz.mp3',
    )
  })

  it('un archivo sin extensión no inventa una', () => {
    expect(mediaKey('e', 'd1b1', 'grabacion', 'zz')).toBe('studies/e/d1b1/grabacion-zz')
  })

  it('el sufijo evita que dos archivos iguales se pisen', () => {
    const a = mediaKey('e', 'd1b1', 'sala.wav', randomSuffix())
    const b = mediaKey('e', 'd1b1', 'sala.wav', randomSuffix())
    expect(a).not.toBe(b)
  })
})

describe('randomSuffix', () => {
  it('es corto y estable en forma', () => {
    expect(randomSuffix()).toMatch(/^[0-9a-f]{8}$/)
  })
})
