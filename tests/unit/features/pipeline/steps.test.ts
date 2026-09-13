import { beforeEach, describe, expect, it, vi } from 'vitest'

const put = vi.fn()
const getText = vi.fn()
const exists = vi.fn()

vi.mock('@/server/storage/r2', () => ({ storage: { put, getText, exists } }))

const { RUNNERS } = await import('@/features/pipeline/steps')
type StepContext = Parameters<(typeof RUNNERS)['inventario']>[0]

/**
 * Cliente de Supabase de mentira: devuelve lo que se le pide por tabla y
 * acepta la cadena `.select().eq().order()` en cualquier punto.
 */
function fakeSupabase(tables: Record<string, { data?: unknown[]; error?: { message: string } }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [] }
      const chain: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve),
      }
      for (const method of ['select', 'eq', 'order', 'in']) {
        chain[method] = () => chain
      }
      return chain
    },
  } as unknown as StepContext['supabase']
}

function context(tables: Parameters<typeof fakeSupabase>[0]): StepContext {
  return {
    supabase: fakeSupabase(tables),
    studyId: 'estudio-1',
    sessionId: 'sesion-1',
    code: 'd1b1',
  }
}

function mediaRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm1',
    kind: 'audio_room',
    storage_key: 'studies/estudio-1/d1b1/sala-aaa.wav',
    original_filename: 'd1b1-sala.wav',
    bytes: 1000,
    mic_number: null,
    ...over,
  }
}

/** Lo que quedó escrito en R2 en la última llamada a put. */
function written(): Record<string, unknown> {
  const last = put.mock.calls.at(-1)
  return JSON.parse(String(last?.[1])) as Record<string, unknown>
}

beforeEach(() => {
  put.mockReset().mockResolvedValue(undefined)
  getText.mockReset()
  exists.mockReset().mockResolvedValue(true)
})

describe('paso · inventario', () => {
  it('escribe el artifact junto al material del bloque', async () => {
    const output = await RUNNERS.inventario!(context({ media_files: { data: [mediaRow()] } }))

    expect(output.kind).toBe('session_inventory')
    expect(output.storageKey).toBe('studies/estudio-1/d1b1/artifacts/session_inventory.json')
    expect(output.bytes).toBeGreaterThan(0)
    expect(put).toHaveBeenCalledWith(output.storageKey, expect.any(String), 'application/json')
  })

  it('registra cada archivo con su tipo y su clave', async () => {
    await RUNNERS.inventario!(
      context({
        media_files: {
          data: [mediaRow(), mediaRow({ id: 'm2', kind: 'audio_mic', mic_number: 3 })],
        },
      }),
    )

    const inventory = written()
    expect(inventory.version).toBe(1)
    expect(inventory.files).toHaveLength(2)
    expect((inventory.files as { micNumber: number | null }[])[1]!.micNumber).toBe(3)
  })

  it('falla si un archivo registrado no está en el bucket', async () => {
    exists.mockResolvedValue(false)

    await expect(
      RUNNERS.inventario!(context({ media_files: { data: [mediaRow()] } })),
    ).rejects.toThrow(/no están en R2/)
    expect(put).not.toHaveBeenCalled()
  })

  it('nombra el archivo que falta, no solo la cantidad', async () => {
    exists.mockImplementation(async (key: string) => !key.includes('mic'))

    await expect(
      RUNNERS.inventario!(
        context({
          media_files: {
            data: [
              mediaRow(),
              mediaRow({ id: 'm2', storage_key: 'k/mic3.wav', original_filename: 'd1b1-mic3.wav' }),
            ],
          },
        }),
      ),
    ).rejects.toThrow(/d1b1-mic3\.wav/)
  })

  it('un bloque sin material no produce un inventario vacío', async () => {
    await expect(RUNNERS.inventario!(context({ media_files: { data: [] } }))).rejects.toThrow(
      /no tiene material/,
    )
  })

  it('un error de la base se propaga con su mensaje', async () => {
    await expect(
      RUNNERS.inventario!(context({ media_files: { error: { message: 'sin permiso' } } })),
    ).rejects.toThrow(/sin permiso/)
  })
})

describe('paso · plan de transcripción', () => {
  function inventory(files: Record<string, unknown>[]) {
    return JSON.stringify({ version: 1, sessionId: 'sesion-1', generatedAt: 'x', files })
  }

  const MIC = { kind: 'audio_mic', storageKey: 'k/mic1.wav', micNumber: 1 }
  const ROOM = { kind: 'audio_room', storageKey: 'k/sala.wav', micNumber: null }

  it('lee el inventario del casillero y no la base', async () => {
    getText.mockResolvedValue(inventory([ROOM]))
    await RUNNERS.plan_transcripcion!(context({ participants: { data: [] } }))

    expect(getText).toHaveBeenCalledWith('studies/estudio-1/d1b1/artifacts/session_inventory.json')
  })

  it('con solo mezcla de sala, diariza', async () => {
    getText.mockResolvedValue(inventory([ROOM]))
    await RUNNERS.plan_transcripcion!(context({ participants: { data: [] } }))

    expect(written().branch).toBe('diarization')
  })

  it('con pistas por micrófono, atribución directa', async () => {
    getText.mockResolvedValue(inventory([MIC]))
    await RUNNERS.plan_transcripcion!(context({ participants: { data: [] } }))

    expect(written().branch).toBe('mic_tracks')
  })

  it('con las dos, híbrido', async () => {
    getText.mockResolvedValue(inventory([MIC, ROOM]))
    await RUNNERS.plan_transcripcion!(context({ participants: { data: [] } }))

    expect(written().branch).toBe('hybrid')
  })

  it('cruza el número de micrófono con el participante', async () => {
    getText.mockResolvedValue(inventory([MIC]))
    await RUNNERS.plan_transcripcion!(
      context({ participants: { data: [{ id: 'p1', name: 'Carolina', mic_number: 1 }] } }),
    )

    const [track] = written().micTracks as { participantId: string; participantName: string }[]
    expect(track).toMatchObject({ participantId: 'p1', participantName: 'Carolina' })
  })

  it('un micrófono sin participante no frena el plan, queda anotado', async () => {
    getText.mockResolvedValue(inventory([MIC, { ...MIC, micNumber: 9, storageKey: 'k/mic9.wav' }]))
    await RUNNERS.plan_transcripcion!(
      context({ participants: { data: [{ id: 'p1', name: 'Carolina', mic_number: 1 }] } }),
    )

    const plan = written()
    expect(plan.unassignedMics).toEqual([9])
    const sinDuenio = (plan.micTracks as { micNumber: number; participantId: string | null }[]).find(
      (t) => t.micNumber === 9,
    )
    expect(sinDuenio!.participantId).toBeNull()
  })

  it('un archivo entero es una fuente de una parte, con desfase cero', async () => {
    getText.mockResolvedValue(inventory([MIC]))
    await RUNNERS.plan_transcripcion!(context({ participants: { data: [] } }))

    const [source] = written().micTracks as {
      recordingKey: string | null
      parts: { partNumber: number; offsetSeconds: number }[]
    }[]
    expect(source!.recordingKey).toBeNull()
    expect(source!.parts).toEqual([
      { storageKey: 'k/mic1.wav', partNumber: 1, offsetSeconds: 0, durationSeconds: null },
    ])
  })

  it('las partes de una grabación van en orden y con su desfase', async () => {
    const parte = (n: number, endsAt: string, duration: number) => ({
      kind: 'audio_mic',
      storageKey: `k/DR0000_000${n}.wav`,
      originalFilename: `DR0000_000${n}.wav`,
      micNumber: 5,
      recordingKey: 'DR0000',
      partNumber: n,
      recordedAt: endsAt,
      durationSeconds: duration,
    })
    // Dos partes pegadas de 600 s: la primera termina a las 15:10, la otra a las 15:20.
    getText.mockResolvedValue(
      inventory([
        parte(2, '2026-11-10T15:20:00.000Z', 600),
        parte(1, '2026-11-10T15:10:00.000Z', 600),
      ]),
    )
    await RUNNERS.plan_transcripcion!(context({ participants: { data: [] } }))

    const [source] = written().micTracks as {
      recordingKey: string
      parts: { partNumber: number; offsetSeconds: number }[]
      gaps: unknown[]
      assumedContiguous: boolean
    }[]
    expect(source!.recordingKey).toBe('DR0000')
    expect(source!.parts.map((p) => p.partNumber)).toEqual([1, 2])
    expect(source!.parts.map((p) => p.offsetSeconds)).toEqual([0, 600])
    expect(source!.gaps).toEqual([])
    expect(source!.assumedContiguous).toBe(false)
  })

  it('una pausa entre partes viaja con el plan', async () => {
    const parte = (n: number, endsAt: string) => ({
      kind: 'audio_mic',
      storageKey: `k/DR0000_000${n}.wav`,
      originalFilename: `DR0000_000${n}.wav`,
      micNumber: 5,
      recordingKey: 'DR0000',
      partNumber: n,
      recordedAt: endsAt,
      durationSeconds: 600,
    })
    // La parte 2 arranca cuatro minutos después de que terminó la 1.
    getText.mockResolvedValue(
      inventory([parte(1, '2026-11-10T15:10:00.000Z'), parte(2, '2026-11-10T15:24:00.000Z')]),
    )
    await RUNNERS.plan_transcripcion!(context({ participants: { data: [] } }))

    const [source] = written().micTracks as { gaps: { afterPart: number; seconds: number }[] }[]
    expect(source!.gaps).toEqual([{ afterPart: 1, seconds: 240 }])
  })

  it('sin audio no hay nada que transcribir', async () => {
    getText.mockResolvedValue(inventory([{ kind: 'video_360', storageKey: 'k/v.mp4' }]))

    await expect(
      RUNNERS.plan_transcripcion!(context({ participants: { data: [] } })),
    ).rejects.toThrow(/no tiene audio/)
  })

  it('un inventario corrupto se dice, no se ignora', async () => {
    getText.mockResolvedValue('{ esto no es json')

    await expect(
      RUNNERS.plan_transcripcion!(context({ participants: { data: [] } })),
    ).rejects.toThrow(/no es JSON válido/)
  })

  it('un inventario de otra versión tampoco se interpreta', async () => {
    getText.mockResolvedValue(JSON.stringify({ version: 2, files: [] }))

    await expect(
      RUNNERS.plan_transcripcion!(context({ participants: { data: [] } })),
    ).rejects.toThrow(/forma esperada/)
  })
})
