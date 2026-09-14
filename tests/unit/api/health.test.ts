import { describe, expect, it } from 'vitest'

const { GET, OPTIONS } = await import('@/app/api/health/route')

function request(origin: string): Parameters<typeof GET>[0] {
  return { headers: new Headers({ origin }) } as unknown as Parameters<typeof GET>[0]
}

describe('health', () => {
  it('responds ok without a session so the desktop app can tell the server is up', async () => {
    const res = await GET(request('tauri://localhost'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('allows the desktop origin to read the response', async () => {
    const res = await GET(request('tauri://localhost'))

    expect(res.headers.get('access-control-allow-origin')).toBe('tauri://localhost')
  })

  it('answers the preflight', async () => {
    const res = await OPTIONS(request('tauri://localhost'))

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('tauri://localhost')
  })
})
