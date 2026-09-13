import { describe, expect, it } from 'vitest'

import { parseTranscriptArtifact } from '@/features/transcripts/contract'

const VALIDO = {
  version: 1,
  sessionId: '00000000-0000-4000-8000-000000000001',
  generatedAt: '2026-06-03T10:00:00.000Z',
  producer: 'wav-ingest 3.0.0 · whisper.cpp large-v3',
  language: 'es',
  sources: [
    {
      recordingKey: '2026-06-02-21-17-10.wav',
      micNumber: 3,
      startedAt: '2026-06-02T21:17:10.000Z',
      segments: [{ start: 0, end: 4.2, text: 'Buenas tardes a todos.' }],
    },
  ],
}

describe('parseTranscriptArtifact', () => {
  it('acepta el artifact bien formado', () => {
    const artifact = parseTranscriptArtifact(JSON.stringify(VALIDO))
    expect(artifact.sources[0]!.segments[0]!.text).toBe('Buenas tardes a todos.')
  })

  it('lo que no es JSON se dice como tal', () => {
    expect(() => parseTranscriptArtifact('{ roto')).toThrow(/no es JSON válido/)
  })

  it('una versión distinta no se interpreta a la fuerza', () => {
    expect(() => parseTranscriptArtifact(JSON.stringify({ ...VALIDO, version: 2 }))).toThrow(
      /forma esperada/,
    )
  })

  it('el error nombra dónde está el problema', () => {
    const roto = {
      ...VALIDO,
      sources: [{ ...VALIDO.sources[0], segments: [{ start: -1, end: 4, text: 'x' }] }],
    }
    expect(() => parseTranscriptArtifact(JSON.stringify(roto))).toThrow(
      /sources\.0\.segments\.0\.start/,
    )
  })

  it('un artifact sin fuentes no pasa: no hay nada que ingestar', () => {
    expect(() => parseTranscriptArtifact(JSON.stringify({ ...VALIDO, sources: [] }))).toThrow(
      /forma esperada/,
    )
  })

  it('un segmento vacío no se acepta como texto', () => {
    const roto = {
      ...VALIDO,
      sources: [{ ...VALIDO.sources[0], segments: [{ start: 0, end: 1, text: '   ' }] }],
    }
    expect(() => parseTranscriptArtifact(JSON.stringify(roto))).toThrow(/forma esperada/)
  })

  it('la hora de inicio tiene que ser una fecha real', () => {
    const roto = { ...VALIDO, sources: [{ ...VALIDO.sources[0], startedAt: 'ayer' }] }
    expect(() => parseTranscriptArtifact(JSON.stringify(roto))).toThrow(/startedAt/)
  })

  it('el micrófono y la grabación pueden faltar: hay audio sin ninguno de los dos', () => {
    const mezcla = {
      ...VALIDO,
      sources: [
        {
          startedAt: '2026-06-02T21:17:10.000Z',
          segments: [{ start: 0, end: 1, text: 'hola', speakerLabel: 'SPEAKER_00' }],
        },
      ],
    }
    expect(() => parseTranscriptArtifact(JSON.stringify(mezcla))).not.toThrow()
  })
})
