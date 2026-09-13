import { describe, expect, it } from 'vitest'

import { buildSources, type InventoryEntry } from '@/features/pipeline/steps'

function entry(over: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: 'f1',
    kind: 'audio_mic',
    storageKey: 'k1',
    originalFilename: '2026-06-02-21-18-09.wav',
    bytes: 1,
    micNumber: 3,
    recordingKey: null,
    partNumber: null,
    recordedAt: null,
    durationSeconds: 1800,
    ...over,
  }
}

describe('buildSources', () => {
  it('un archivo entero es una fuente de una parte que empieza en cero', () => {
    const [source] = buildSources([entry()])

    expect(source!.recordingKey).toBeNull()
    expect(source!.parts).toEqual([
      { storageKey: 'k1', partNumber: 1, offsetSeconds: 0, durationSeconds: 1800 },
    ])
  })

  it('los desfases salen del reloj de cada parte', () => {
    const sources = buildSources([
      entry({ id: 'a', storageKey: 'k1', recordingKey: 'r', partNumber: 1, recordedAt: '2026-06-02T21:18:09.000Z' }),
      entry({ id: 'b', storageKey: 'k2', recordingKey: 'r', partNumber: 2, recordedAt: '2026-06-02T21:48:09.000Z' }),
    ])

    expect(sources[0]!.parts.map((p) => p.offsetSeconds)).toEqual([0, 1800])
    expect(sources[0]!.assumedContiguous).toBe(false)
  })

  it('la última parte más corta no corre el desfase de las anteriores', () => {
    // `recorded_at` es cuándo empezó la parte. Leerlo como marca de escritura
    // le resta la duración, y con partes de distinto largo —la última siempre
    // lo es— el desfase queda corrido por esa diferencia.
    const sources = buildSources([
      entry({ id: 'a', storageKey: 'k1', recordingKey: 'r', partNumber: 1, recordedAt: '2026-06-02T21:00:00.000Z', durationSeconds: 1800 }),
      entry({ id: 'b', storageKey: 'k2', recordingKey: 'r', partNumber: 2, recordedAt: '2026-06-02T21:30:00.000Z', durationSeconds: 1800 }),
      entry({ id: 'c', storageKey: 'k3', recordingKey: 'r', partNumber: 3, recordedAt: '2026-06-02T22:00:00.000Z', durationSeconds: 600 }),
    ])

    expect(sources[0]!.parts.map((p) => p.offsetSeconds)).toEqual([0, 1800, 3600])
  })

  it('la pausa entre partes viaja con la fuente', () => {
    const sources = buildSources([
      entry({ id: 'a', storageKey: 'k1', recordingKey: 'r', partNumber: 1, recordedAt: '2026-06-02T21:00:00.000Z', durationSeconds: 1800 }),
      entry({ id: 'b', storageKey: 'k2', recordingKey: 'r', partNumber: 2, recordedAt: '2026-06-02T21:35:00.000Z', durationSeconds: 1800 }),
    ])

    // Cinco minutos que nadie grabó: sin esto el silencio se lee como parte de
    // la conversación.
    expect(sources[0]!.gaps).toEqual([{ afterPart: 1, seconds: 300 }])
  })

  it('sin reloj se encadenan duraciones, y se dice que se asumió continuidad', () => {
    const sources = buildSources([
      entry({ id: 'a', storageKey: 'k1', recordingKey: 'r', partNumber: 1, durationSeconds: 1800 }),
      entry({ id: 'b', storageKey: 'k2', recordingKey: 'r', partNumber: 2, durationSeconds: 900 }),
    ])

    expect(sources[0]!.parts.map((p) => p.offsetSeconds)).toEqual([0, 1800])
    expect(sources[0]!.assumedContiguous).toBe(true)
  })

  it('las partes se ordenan por número aunque lleguen al revés', () => {
    const sources = buildSources([
      entry({ id: 'b', storageKey: 'k2', recordingKey: 'r', partNumber: 2, durationSeconds: 1800 }),
      entry({ id: 'a', storageKey: 'k1', recordingKey: 'r', partNumber: 1, durationSeconds: 1800 }),
    ])

    expect(sources[0]!.parts.map((p) => p.storageKey)).toEqual(['k1', 'k2'])
  })
})
