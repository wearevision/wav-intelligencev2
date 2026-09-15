import { beforeEach, describe, expect, it, vi } from 'vitest'

const exists = vi.fn()
vi.mock('@/server/storage/r2', () => ({ storage: { exists } }))

const requireUser = vi.fn()
vi.mock('@/server/supabase/request', () => ({ requireUser }))

const { POST } = await import('@/app/api/ingest/complete/route')

const STUDY = '0f1e2d3c-4b5a-6978-8765-4321fedcba98'
const SESSION_A = '11111111-1111-4111-8111-111111111111'
const SESSION_B = '22222222-2222-4222-8222-222222222222'
const OTHER_STUDY_SESSION = '33333333-3333-4333-8333-333333333333'
const KEY = `studies/${STUDY}/d1b1/mic01.wav`

function post(body: unknown) {
  return {
    json: async () => body,
    headers: new Headers({ origin: 'tauri://localhost' }),
  } as unknown as Parameters<typeof POST>[0]
}

function supabaseWithSessions(
  ids: readonly string[],
  options: { reverseInsertedOrder?: boolean } = {},
) {
  const insertedMedia: unknown[] = []
  const insertedBridge: unknown[] = []
  return {
    insertedMedia,
    insertedBridge,
    supabase: {
      from(table: string) {
        if (table === 'sessions') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: ids.map((id) => ({ id })), error: null }),
              }),
            }),
          }
        }
        if (table === 'media_files') {
          return {
            insert: (rows: unknown[]) => {
              insertedMedia.push(...rows)
              return {
                select: () => ({
                  then: (resolve: (v: unknown) => void) => {
                    const typedRows = rows as { session_id: string; storage_key: string }[]
                    const returned = typedRows.map((row, i) => ({
                      id: `media-${i}`,
                      storage_key: row.storage_key,
                    }))
                    if (options.reverseInsertedOrder) returned.reverse()
                    resolve({ data: returned, error: null })
                  },
                }),
              }
            },
          }
        }
        if (table === 'media_file_sessions') {
          return {
            insert: (rows: unknown[]) => {
              insertedBridge.push(...rows)
              return { then: (resolve: (v: unknown) => void) => resolve({ error: null }) }
            },
          }
        }
        throw new Error(`tabla no mockeada: ${table}`)
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  exists.mockResolvedValue(true)
})

describe('extraSessionIds', () => {
  it('acepta extraSessionIds null (lo que manda wav-ingest para un archivo sin sesión extra)', async () => {
    // Bug real: LocalFile.extraSessionIds es `readonly string[] | null`, no
    // opcional — wav-ingest siempre manda la clave, con `null` cuando no hay
    // sesión extra. z.array(...).optional() solo acepta ausente/undefined,
    // no null explícito, y esto rechazaba con 400 cualquier subida normal.
    const { supabase, insertedMedia } = supabaseWithSessions([SESSION_A])
    requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase })

    const res = await POST(
      post({
        studyId: STUDY,
        media: [
          {
            sessionId: SESSION_A,
            storageKey: KEY,
            filename: 'mic01.wav',
            kind: 'audio_mic',
            bytes: 100,
            extraSessionIds: null,
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    expect(insertedMedia).toHaveLength(1)
  })

  it('inserta el vínculo extra cuando la sesión pertenece al estudio', async () => {
    const { supabase, insertedBridge } = supabaseWithSessions([SESSION_A, SESSION_B])
    requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase })

    const res = await POST(
      post({
        studyId: STUDY,
        media: [
          {
            sessionId: SESSION_A,
            storageKey: KEY,
            filename: 'mic01.wav',
            kind: 'audio_mic',
            bytes: 100,
            extraSessionIds: [SESSION_B],
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    expect(insertedBridge).toEqual([{ media_file_id: 'media-0', session_id: SESSION_B }])
  })

  it('vincula la sesión extra al media file correcto aunque el insert devuelva las filas en otro orden', async () => {
    const KEY_2 = `studies/${STUDY}/d1b1/mic02.wav`
    const { supabase, insertedBridge } = supabaseWithSessions([SESSION_A, SESSION_B], {
      reverseInsertedOrder: true,
    })
    requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase })

    const res = await POST(
      post({
        studyId: STUDY,
        media: [
          {
            sessionId: SESSION_A,
            storageKey: KEY,
            filename: 'mic01.wav',
            kind: 'audio_mic',
            bytes: 100,
          },
          {
            sessionId: SESSION_A,
            storageKey: KEY_2,
            filename: 'mic02.wav',
            kind: 'audio_mic',
            bytes: 100,
            extraSessionIds: [SESSION_B],
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    // El mock devuelve las filas insertadas en orden inverso al de mediaRows;
    // el vínculo debe seguir aterrizando en el media file de KEY_2 (media-1),
    // no en el de la posición 0.
    expect(insertedBridge).toEqual([{ media_file_id: 'media-1', session_id: SESSION_B }])
  })

  it('rechaza una sesión extra que no es del estudio', async () => {
    const { supabase } = supabaseWithSessions([SESSION_A])
    requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase })

    const res = await POST(
      post({
        studyId: STUDY,
        media: [
          {
            sessionId: SESSION_A,
            storageKey: KEY,
            filename: 'mic01.wav',
            kind: 'audio_mic',
            bytes: 100,
            extraSessionIds: [OTHER_STUDY_SESSION],
          },
        ],
      }),
    )

    expect(res.status).toBe(403)
  })
})
