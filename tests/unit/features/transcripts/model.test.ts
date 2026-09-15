import { describe, expect, it } from 'vitest'

import type { TranscriptArtifact, TranscriptSource } from '@/features/transcripts/contract'
import {
  blockStartMs,
  formatTimestamp,
  resolvePart,
  sourceOffset,
  statsFor,
  toVerbatims,
  type PartRef,
} from '@/features/transcripts/model'

function source(over: Partial<TranscriptSource> = {}): TranscriptSource {
  return {
    recordingKey: 'grabacion-a',
    micNumber: 3,
    startedAt: '2026-06-02T21:00:00.000Z',
    segments: [{ start: 0, end: 5, text: 'hola' }],
    ...over,
  }
}

function artifact(sources: TranscriptSource[]): TranscriptArtifact {
  return {
    version: 1,
    sessionId: '00000000-0000-4000-8000-000000000001',
    generatedAt: '2026-06-03T10:00:00.000Z',
    producer: 'wav-ingest 3.0.0 · whisper.cpp large-v3',
    language: 'es',
    sources,
  }
}

const CONTEXT = {
  participantByMic: new Map([
    [3, 'p-paula'],
    [5, 'p-ignacio'],
  ]),
  partsByRecording: new Map<string, PartRef[]>(),
}

describe('blockStartMs', () => {
  it('el cero del bloque es la primera fuente que empezó', () => {
    const at = blockStartMs([
      source({ startedAt: '2026-06-02T22:10:57.000Z' }),
      source({ startedAt: '2026-06-02T21:26:46.000Z' }),
    ])
    expect(at).toBe(Date.parse('2026-06-02T21:26:46.000Z'))
  })

  it('sin fuentes no hay cero', () => {
    expect(blockStartMs([])).toBeNull()
  })
})

describe('sourceOffset', () => {
  it('mide cuánto después del cero arrancó la fuente', () => {
    const inicio = Date.parse('2026-06-02T21:26:46.000Z')
    const tarde = source({ startedAt: '2026-06-02T22:10:57.000Z' })
    // 44 minutos y 11 segundos.
    expect(sourceOffset(tarde, inicio)).toBe(2651)
  })

  it('la primera fuente arranca en cero', () => {
    const inicio = Date.parse('2026-06-02T21:26:46.000Z')
    expect(sourceOffset(source({ startedAt: '2026-06-02T21:26:46.000Z' }), inicio)).toBe(0)
  })

  it('una fuente anterior al cero no da desfase negativo', () => {
    const inicio = Date.parse('2026-06-02T21:26:46.000Z')
    expect(sourceOffset(source({ startedAt: '2026-06-02T20:00:00.000Z' }), inicio)).toBe(0)
  })
})

describe('resolvePart', () => {
  const PARTS: PartRef[] = [
    { mediaFileId: 'f1', offsetSeconds: 0, durationSeconds: 1800 },
    { mediaFileId: 'f2', offsetSeconds: 1800, durationSeconds: 1800 },
    { mediaFileId: 'f3', offsetSeconds: 3600, durationSeconds: 900 },
  ]

  it('encuentra el archivo que contiene el instante', () => {
    expect(resolvePart(10, PARTS)).toBe('f1')
    expect(resolvePart(1800, PARTS)).toBe('f2')
    expect(resolvePart(3700, PARTS)).toBe('f3')
  })

  it('el último instante de una parte todavía es de esa parte', () => {
    expect(resolvePart(1799.9, PARTS)).toBe('f1')
  })

  it('más allá del final devuelve la última, que es la mejor aproximación', () => {
    expect(resolvePart(99_999, PARTS)).toBe('f3')
  })

  it('sin partes no inventa un archivo', () => {
    expect(resolvePart(10, [])).toBeNull()
  })

  it('sin duración cae en la última que empezó antes', () => {
    const sinDuracion: PartRef[] = [
      { mediaFileId: 'f1', offsetSeconds: 0, durationSeconds: null },
      { mediaFileId: 'f2', offsetSeconds: 1800, durationSeconds: null },
    ]
    expect(resolvePart(2000, sinDuracion)).toBe('f2')
    expect(resolvePart(10, sinDuracion)).toBe('f1')
  })
})

describe('toVerbatims', () => {
  it('le pone nombre a quien habla por el número de micrófono', () => {
    const [verbatim] = toVerbatims(artifact([source({ micNumber: 3 })]), CONTEXT)
    expect(verbatim!.participantId).toBe('p-paula')
  })

  it('un micrófono sin dueño deja el verbatim sin persona, no lo descarta', () => {
    const [verbatim] = toVerbatims(artifact([source({ micNumber: 9 })]), CONTEXT)
    expect(verbatim!.participantId).toBeNull()
    expect(verbatim!.text).toBe('hola')
  })

  it('conserva la etiqueta del diarizador aunque no haya micrófono', () => {
    const [verbatim] = toVerbatims(
      artifact([
        source({
          micNumber: null,
          segments: [{ start: 0, end: 2, text: 'hola', speakerLabel: 'SPEAKER_02' }],
        }),
      ]),
      CONTEXT,
    )
    expect(verbatim!.participantId).toBeNull()
    expect(verbatim!.speakerLabel).toBe('SPEAKER_02')
  })

  it('alinea dos grabadoras que arrancaron a horas distintas', () => {
    const temprano = source({
      micNumber: 3,
      startedAt: '2026-06-02T21:00:00.000Z',
      segments: [{ start: 10, end: 12, text: 'primero' }],
    })
    const tarde = source({
      micNumber: 5,
      startedAt: '2026-06-02T21:10:00.000Z',
      segments: [{ start: 5, end: 7, text: 'segundo' }],
    })

    const verbatims = toVerbatims(artifact([tarde, temprano]), CONTEXT)

    // El de la fuente tardía queda 600 s después aunque su tiempo propio sea menor.
    expect(verbatims.map((v) => v.text)).toEqual(['primero', 'segundo'])
    expect(verbatims[0]!.startTs).toBe(10)
    expect(verbatims[1]!.startTs).toBe(605)
  })

  it('ordena por tiempo de bloque y no por fuente', () => {
    const a = source({
      micNumber: 3,
      startedAt: '2026-06-02T21:00:00.000Z',
      segments: [
        { start: 0, end: 1, text: 'a1' },
        { start: 100, end: 101, text: 'a2' },
      ],
    })
    const b = source({
      micNumber: 5,
      startedAt: '2026-06-02T21:00:00.000Z',
      segments: [{ start: 50, end: 51, text: 'b1' }],
    })

    expect(toVerbatims(artifact([a, b]), CONTEXT).map((v) => v.text)).toEqual(['a1', 'b1', 'a2'])
  })

  it('descarta un segmento que termina antes de empezar', () => {
    const roto = source({ segments: [{ start: 10, end: 5, text: 'imposible' }] })
    expect(toVerbatims(artifact([roto]), CONTEXT)).toEqual([])
  })

  it('anota de qué archivo salió cada tramo', () => {
    const contexto = {
      ...CONTEXT,
      partsByRecording: new Map<string, PartRef[]>([
        [
          'grabacion-a',
          [
            { mediaFileId: 'f1', offsetSeconds: 0, durationSeconds: 1800 },
            { mediaFileId: 'f2', offsetSeconds: 1800, durationSeconds: 1800 },
          ],
        ],
      ]),
    }
    const largo = source({
      segments: [
        { start: 10, end: 12, text: 'temprano' },
        { start: 2000, end: 2002, text: 'tarde' },
      ],
    })

    const verbatims = toVerbatims(artifact([largo]), contexto)
    expect(verbatims.map((v) => v.mediaFileId)).toEqual(['f1', 'f2'])
  })

  it('redondea a los tres decimales que guarda la columna', () => {
    const preciso = source({
      startedAt: '2026-06-02T21:00:00.000Z',
      segments: [{ start: 1.23456, end: 2.98765, text: 'x' }],
    })
    const [verbatim] = toVerbatims(artifact([preciso]), CONTEXT)
    expect(verbatim!.startTs).toBe(1.235)
    expect(verbatim!.endTs).toBe(2.988)
  })
})

describe('statsFor', () => {
  it('cuenta lo que quedó sin atribuir', () => {
    const verbatims = toVerbatims(
      artifact([source({ micNumber: 3 }), source({ micNumber: 9, recordingKey: 'b' })]),
      CONTEXT,
    )
    expect(statsFor(verbatims)).toMatchObject({ segments: 2, unattributed: 1 })
  })

  it('sin verbatims no falla ni inventa un tramo', () => {
    expect(statsFor([])).toEqual({ segments: 0, unattributed: 0, spanSeconds: 0 })
  })
})

describe('formatTimestamp', () => {
  it('omite la hora cuando no hace falta', () => {
    expect(formatTimestamp(0)).toBe('0:00')
    expect(formatTimestamp(247)).toBe('4:07')
  })

  it('la agrega cuando pasa de una hora, con los minutos a dos dígitos', () => {
    expect(formatTimestamp(5025)).toBe('1:23:45')
  })

  it('un negativo no produce un tiempo con signo', () => {
    expect(formatTimestamp(-5)).toBe('0:00')
  })
})

describe('toVerbatims · la fuente declara qué parte es', () => {
  const PARTS: PartRef[] = [
    { mediaFileId: 'f1', partNumber: 1, offsetSeconds: 0, durationSeconds: 1800 },
    { mediaFileId: 'f2', partNumber: 2, offsetSeconds: 1800, durationSeconds: 1800 },
  ]
  const contexto = {
    participantByMic: new Map<number, string>(),
    partsByRecording: new Map<string, PartRef[]>([['grabacion-a', PARTS]]),
  }

  it('resuelve el archivo por número de parte y no por desfase', () => {
    // La parte 2 empieza en su propio cero: por desfase caería en f1.
    const fuente = source({
      partNumber: 2,
      segments: [{ start: 10, end: 12, text: 'de la segunda parte' }],
    })
    const [verbatim] = toVerbatims(artifact([fuente]), contexto)

    expect(verbatim!.mediaFileId).toBe('f2')
  })

  it('sin número de parte sigue resolviendo por desfase', () => {
    const fuente = source({ segments: [{ start: 2000, end: 2002, text: 'tarde' }] })
    const [verbatim] = toVerbatims(artifact([fuente]), contexto)

    expect(verbatim!.mediaFileId).toBe('f2')
  })

  it('un número de parte que no existe no inventa un archivo', () => {
    const fuente = source({ partNumber: 9, segments: [{ start: 1, end: 2, text: 'x' }] })
    const [verbatim] = toVerbatims(artifact([fuente]), contexto)

    // Cae al desfase, que para el segundo 1 da la primera parte.
    expect(verbatim!.mediaFileId).toBe('f1')
  })
})

describe('toVerbatims · el archivo entero', () => {
  it('una pista sin partes resuelve su archivo por micrófono', () => {
    // Es el caso normal en una sesión corta: nada se cortó, así que no hay
    // partes que recorrer. Sin esto el verbatim queda sin archivo y el
    // reproductor no tiene a dónde saltar.
    const drafts = toVerbatims(artifact([source({ recordingKey: null, micNumber: 3 })]), {
      ...CONTEXT,
      wholeFileByMic: new Map([[3, 'archivo-mic-3']]),
    })

    expect(drafts[0]!.mediaFileId).toBe('archivo-mic-3')
    expect(drafts[0]!.participantId).toBe('p-paula')
  })

  it('una mezcla de sala no lleva micrófono y queda sin archivo', () => {
    // Correcto: con dos mezclas de sala, elegir una sería una adivinanza que
    // manda al reproductor al archivo equivocado sin que nada lo delate.
    const drafts = toVerbatims(
      artifact([source({ recordingKey: null, micNumber: null })]),
      { ...CONTEXT, wholeFileByMic: new Map([[3, 'archivo-mic-3']]) },
    )

    expect(drafts[0]!.mediaFileId).toBeNull()
  })

  it('la parte declarada manda sobre el archivo entero', () => {
    const drafts = toVerbatims(artifact([source({ recordingKey: 'grabacion-a', partNumber: 2 })]), {
      ...CONTEXT,
      partsByRecording: new Map<string, PartRef[]>([
        ['grabacion-a', [
          { mediaFileId: 'parte-1', partNumber: 1, offsetSeconds: 0, durationSeconds: 1800 },
          { mediaFileId: 'parte-2', partNumber: 2, offsetSeconds: 1800, durationSeconds: 900 },
        ]],
      ]),
      wholeFileByMic: new Map([[3, 'archivo-mic-3']]),
    })

    expect(drafts[0]!.mediaFileId).toBe('parte-2')
  })

  it('sin el mapa se comporta como antes: no se inventa un archivo', () => {
    const drafts = toVerbatims(artifact([source({ recordingKey: null, micNumber: 3 })]), CONTEXT)
    expect(drafts[0]!.mediaFileId).toBeNull()
  })
})
