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
    expect((plan.micTracks as { participantId: string | null }[])[1]!.participantId).toBeNull()
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
