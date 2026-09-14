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

function supabaseWithSessions(ids: readonly string[]) {
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
                  then: (resolve: (v: unknown) => void) =>
                    resolve({
                      data: (rows as { session_id: string }[]).map((_, i) => ({ id: `media-${i}` })),
                      error: null,
                    }),
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
