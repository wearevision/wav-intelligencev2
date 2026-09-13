import { describe, expect, it } from 'vitest'

import { hlsKeys, mediaKey, randomSuffix, safeFilename } from '@/server/storage/keys'

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

  it('un nombre de puros puntos no nombra un archivo, nombra un directorio', () => {
    // `prefijo/..` en R2 es una clave opaca y no hace daño, pero cualquier
    // consumidor que la mapee a un sistema de archivos leería "el de arriba".
    expect(safeFilename('.')).toBe('archivo')
    expect(safeFilename('..')).toBe('archivo')
    expect(safeFilename('....')).toBe('archivo')
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

describe('hlsKeys', () => {
  it('el manifiesto y sus segmentos comparten prefijo', () => {
    const { manifestKey, segments } = hlsKeys('e1', 'd1b1', 'VID_0012.insv', 'abc123', [
      'seg000.ts',
      'seg001.ts',
    ])

    expect(manifestKey).toBe('studies/e1/d1b1/hls/VID_0012-abc123/index.m3u8')
    expect(segments.map((s) => s.key)).toEqual([
      'studies/e1/d1b1/hls/VID_0012-abc123/seg000.ts',
      'studies/e1/d1b1/hls/VID_0012-abc123/seg001.ts',
    ])
  })

  it('el segmento va junto al manifiesto, que lo referencia por nombre relativo', () => {
    const { manifestKey, segments } = hlsKeys('e1', 'd1b1', 'v.mp4', 'zz', ['a.ts'])
    const prefix = manifestKey.slice(0, manifestKey.lastIndexOf('/'))

    expect(segments[0]!.key.startsWith(`${prefix}/`)).toBe(true)
  })

  it('un nombre de segmento con ruta no escapa del prefijo del estudio', () => {
    // La ruta ya lo rechaza por esquema; la clave se sanea igual porque la
    // construye el servidor. Las barras se colapsan, así que lo que queda es
    // un nombre raro dentro del prefijo, no un salto hacia afuera.
    const { segments } = hlsKeys('e1', 'd1b1', 'v.mp4', 'zz', ['../../fuera.ts'])

    expect(segments[0]!.key).toBe('studies/e1/d1b1/hls/v-zz/..-..-fuera.ts')
    expect(segments[0]!.key.split('/').includes('..')).toBe(false)
  })

  it('sin código el paquete queda separado, no mezclado con un bloque', () => {
    const { manifestKey } = hlsKeys('e1', null, 'v.mp4', 'zz', ['a.ts'])
    expect(manifestKey).toBe('studies/e1/sin-bloque/hls/v-zz/index.m3u8')
  })

  it('el sufijo evita que dos videos del mismo nombre compartan carpeta', () => {
    const a = hlsKeys('e1', 'd1b1', 'v.mp4', randomSuffix(), ['a.ts']).manifestKey
    const b = hlsKeys('e1', 'd1b1', 'v.mp4', randomSuffix(), ['a.ts']).manifestKey
    expect(a).not.toBe(b)
  })
})
