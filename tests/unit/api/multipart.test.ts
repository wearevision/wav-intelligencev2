import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMultipart = vi.fn()
const presignPart = vi.fn()
const completeMultipart = vi.fn()
const abortMultipart = vi.fn()

vi.mock('@/server/storage/r2', () => ({
  storage: { createMultipart, presignPart, completeMultipart, abortMultipart },
}))

const requireUser = vi.fn()
vi.mock('@/server/supabase/request', () => ({ requireUser }))

const { POST } = await import('@/app/api/ingest/multipart/route')

const STUDY = '0f1e2d3c-4b5a-6978-8765-4321fedcba98'
const KEY = `studies/${STUDY}/d1b1/audio-abc12345.wav`

function post(body: unknown): Parameters<typeof POST>[0] {
  return {
    json: async () => body,
    headers: new Headers({ origin: 'tauri://localhost' }),
  } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase: {} })
  createMultipart.mockResolvedValue('upload-1')
  presignPart.mockResolvedValue('https://r2.example/part')
  completeMultipart.mockResolvedValue(undefined)
  abortMultipart.mockResolvedValue(undefined)
})

describe('autenticación', () => {
  it('sin sesión no se firma nada', async () => {
    requireUser.mockResolvedValue({ user: null, supabase: {} })
    const res = await POST(post({ op: 'initiate', studyId: STUDY, key: KEY }))

    expect(res.status).toBe(401)
    expect(createMultipart).not.toHaveBeenCalled()
  })
})

describe('la clave se valida antes de firmar', () => {
  it('una clave de otro estudio no se firma', async () => {
    // Sin esto, cualquier sesión válida podría escribir en cualquier parte del
    // bucket: la regla es que la app no elige dónde se escribe.
    const otro = '11111111-2222-3333-4444-555555555555'
    const res = await POST(
      post({ op: 'initiate', studyId: STUDY, key: `studies/${otro}/d1b1/audio.wav` }),
    )

    expect(res.status).toBe(403)
    expect(createMultipart).not.toHaveBeenCalled()
  })

  it('un salto de directorio no se firma', async () => {
    const res = await POST(
      post({
        op: 'presign-part',
        studyId: STUDY,
        key: `studies/${STUDY}/../otro/audio.wav`,
        uploadId: 'upload-1',
        partNumber: 1,
      }),
    )

    expect(res.status).toBe(403)
    expect(presignPart).not.toHaveBeenCalled()
  })

  it('tampoco se aborta una clave ajena', async () => {
    const res = await POST(
      post({ op: 'abort', studyId: STUDY, key: 'otro-prefijo/x.wav', uploadId: 'upload-1' }),
    )

    expect(res.status).toBe(403)
    expect(abortMultipart).not.toHaveBeenCalled()
  })
})

describe('iniciar', () => {
  it('devuelve el uploadId con el nombre que espera el escritorio', async () => {
    const res = await POST(post({ op: 'initiate', studyId: STUDY, key: KEY, contentType: 'audio/wav' }))

    expect(res.status).toBe(200)
    // El cliente de Rust deserializa `upload_id`; se manda también en camelCase
    // para no obligar a nadie a recordar de qué lado está el guión bajo.
    expect(await res.json()).toEqual({ upload_id: 'upload-1', uploadId: 'upload-1' })
    expect(createMultipart).toHaveBeenCalledWith(KEY, 'audio/wav')
  })

  it('sin tipo declarado no se inventa uno', async () => {
    await POST(post({ op: 'initiate', studyId: STUDY, key: KEY }))
    expect(createMultipart).toHaveBeenCalledWith(KEY, undefined)
  })
})

describe('firmar una parte', () => {
  it('devuelve la URL de esa parte', async () => {
    const res = await POST(
      post({ op: 'presign-part', studyId: STUDY, key: KEY, uploadId: 'upload-1', partNumber: 7 }),
    )

    expect(await res.json()).toEqual({ url: 'https://r2.example/part' })
    expect(presignPart).toHaveBeenCalledWith(KEY, 'upload-1', 7)
  })

  it('una parte cero o negativa no existe', async () => {
    const res = await POST(
      post({ op: 'presign-part', studyId: STUDY, key: KEY, uploadId: 'upload-1', partNumber: 0 }),
    )

    expect(res.status).toBe(400)
    expect(presignPart).not.toHaveBeenCalled()
  })
})

describe('completar', () => {
  it('traduce las partes del formato de S3 al del puerto', async () => {
    const res = await POST(
      post({
        op: 'complete',
        studyId: STUDY,
        key: KEY,
        uploadId: 'upload-1',
        parts: [
          { PartNumber: 2, ETag: '"b"' },
          { PartNumber: 1, ETag: '"a"' },
        ],
      }),
    )

    expect(res.status).toBe(200)
    expect(completeMultipart).toHaveBeenCalledWith(KEY, 'upload-1', [
      { partNumber: 2, etag: '"b"' },
      { partNumber: 1, etag: '"a"' },
    ])
  })

  it('sin partes no hay nada que ensamblar', async () => {
    const res = await POST(
      post({ op: 'complete', studyId: STUDY, key: KEY, uploadId: 'upload-1', parts: [] }),
    )

    expect(res.status).toBe(400)
    expect(completeMultipart).not.toHaveBeenCalled()
  })
})

describe('errores', () => {
  it('un cuerpo que no es JSON se rechaza sin tocar R2', async () => {
    const res = await POST({
      json: async () => {
        throw new Error('no es json')
      },
      headers: new Headers(),
    } as unknown as Parameters<typeof POST>[0])

    expect(res.status).toBe(400)
  })

  it('una operación desconocida se rechaza', async () => {
    const res = await POST(post({ op: 'borrar-todo', studyId: STUDY, key: KEY }))
    expect(res.status).toBe(400)
  })

  it('cuando R2 falla, el mensaje lo dice y no queda en 500 pelado', async () => {
    createMultipart.mockRejectedValue(new Error('NoSuchBucket'))
    const res = await POST(post({ op: 'initiate', studyId: STUDY, key: KEY }))

    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('NoSuchBucket')
  })
})
