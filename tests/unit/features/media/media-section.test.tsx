import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MediaSection, type SessionRef } from '@/features/media/components/media-section'
import type { MediaFile } from '@/features/media'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/features/media/actions', () => ({
  presignMediaUpload: vi.fn(),
  registerMediaFile: vi.fn(),
  deleteMediaFile: vi.fn(),
  mediaFileUrl: vi.fn(),
}))

const SESSIONS: SessionRef[] = [
  { id: 's-d1b1', code: 'd1b1', name: 'Día 1 · Bloque 1', scheduledAt: '2026-11-10T13:00:00.000Z' },
  { id: 's-d1b2', code: 'd1b2', name: 'Día 1 · Bloque 2', scheduledAt: '2026-11-10T20:00:00.000Z' },
]

function drop(names: string[]) {
  const input = screen.getByLabelText('Soltar archivos aquí') as HTMLInputElement
  const files = names.map((n) => new File(['x'], n, { type: 'audio/wav' }))
  fireEvent.change(input, { target: { files } })
}

describe('MediaSection', () => {
  it('marca los bloques sin audio y no los que sí lo tienen', () => {
    const files: MediaFile[] = [
      {
        id: 'm1',
        sessionId: 's-d1b1',
        kind: 'audio_room',
        storageKey: 'k',
        originalFilename: 'd1b1-sala.wav',
        bytes: 1000,
        durationSeconds: null,
        micNumber: null,
        sourcePath: null,
        sourceHost: null,
        createdAt: '2026-11-10T15:00:00.000Z',
      },
    ]
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={files} />)

    expect(screen.getAllByText('Sin audio')).toHaveLength(1)
    expect(screen.getByText('d1b1-sala.wav')).toBeInTheDocument()
  })

  it('empareja por código lo que se suelta y lo deja listo para subir', () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    drop(['d1b2-sala.wav'])

    expect(screen.getByText('Por subir')).toBeInTheDocument()
    expect(screen.getByText('Por código')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeEnabled()

    const block = screen.getByLabelText('Elegir bloque') as HTMLSelectElement
    expect(block.value).toBe('s-d1b2')
  })

  it('lo que no calza va a la bandeja y no se puede subir hasta asignarlo', () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    drop(['grabacion-suelta.wav'])

    expect(screen.getByText('Sin bloque asignado')).toBeInTheDocument()
    expect(screen.getByText('No calza con ningún bloque')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Elegir bloque'), { target: { value: 's-d1b1' } })

    expect(screen.getByText('Por subir')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeEnabled()
  })

  it('el número de micrófono sale del nombre', () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    drop(['d1b1-mic07.wav'])

    expect(screen.getByText('Mic 7')).toBeInTheDocument()
  })

  it('un archivo se puede descartar de la cola antes de subir', () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    drop(['d1b1-sala.wav'])

    fireEvent.click(screen.getByRole('button', { name: 'Descartar de la lista' }))

    expect(screen.queryByText('d1b1-sala.wav')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Subir' })).not.toBeInTheDocument()
  })

  it('muestra dónde quedó el master del video que nunca subió', () => {
    const files: MediaFile[] = [
      {
        id: 'm2',
        sessionId: 's-d1b1',
        kind: 'video_360',
        storageKey: 'k',
        originalFilename: 'd1b1-360.insv',
        bytes: null,
        durationSeconds: null,
        micNumber: null,
        sourcePath: '/Volumes/WAV-01/d1b1/VID_0001.insv',
        sourceHost: 'Disco WAV-01',
        createdAt: '2026-11-10T15:00:00.000Z',
      },
    ]
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={files} />)

    const row = screen.getByText('d1b1-360.insv').closest('li') as HTMLElement
    expect(within(row).getByText(/Disco WAV-01/)).toBeInTheDocument()
    expect(within(row).getByText(/VID_0001\.insv/)).toBeInTheDocument()
  })
})
