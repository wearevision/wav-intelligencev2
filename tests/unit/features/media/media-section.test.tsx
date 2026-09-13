import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaSection, type SessionRef } from '@/features/media/components/media-section'
import type { MediaFile } from '@/features/media'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
// jsdom no implementa HTMLMediaElement.load, así que leer la duración de
// verdad colgaría hasta el timeout. Se fija por archivo desde cada prueba.
const durations = new Map<string, number>()
vi.mock('@/features/media/duration', () => ({
  readDuration: async (file: File) => durations.get(file.name) ?? null,
  readDurations: async (files: File[]) => files.map((f) => durations.get(f.name) ?? null),
}))

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

/** `lastModified` fijo para que el emparejado por horario sea determinístico. */
async function drop(names: string[], lastModified = Date.parse('2026-11-10T15:00:00.000Z')) {
  const input = screen.getByLabelText('Soltar archivos aquí') as HTMLInputElement
  const files = names.map(
    (n) => new File(['x'], n, { type: 'audio/wav', lastModified }),
  )
  await act(async () => {
    fireEvent.change(input, { target: { files } })
  })
}

beforeEach(() => {
  durations.clear()
})

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
        recordingKey: null,
        partNumber: null,
        recordedAt: null,
        createdAt: '2026-11-10T15:00:00.000Z',
      },
    ]
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={files} />)

    expect(screen.getAllByText('Sin audio')).toHaveLength(1)
    expect(screen.getByText('d1b1-sala.wav')).toBeInTheDocument()
  })

  it('empareja por código lo que se suelta y lo deja listo para subir', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    await drop(['d1b2-sala.wav'])

    expect(screen.getByText('Por subir')).toBeInTheDocument()
    expect(screen.getByText('Por código')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeEnabled()

    const block = screen.getByLabelText('Elegir bloque') as HTMLSelectElement
    expect(block.value).toBe('s-d1b2')
  })

  it('lo que no calza va a la bandeja y no se puede subir hasta asignarlo', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    // Fuera de todo horario agendado: no debe calzar ni por código ni por hora.
    await drop(['grabacion-suelta.wav'], Date.parse('2020-01-01T00:00:00.000Z'))

    expect(screen.getByText('Sin bloque asignado')).toBeInTheDocument()
    expect(screen.getByText('No calza con ningún bloque')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Elegir bloque'), { target: { value: 's-d1b1' } })

    expect(screen.getByText('Por subir')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeEnabled()
  })

  it('el número de micrófono sale del nombre', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    await drop(['d1b1-mic07.wav'])

    expect(screen.getByText('Mic 7')).toBeInTheDocument()
  })

  it('un archivo se puede descartar de la cola antes de subir', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    await drop(['d1b1-sala.wav'])

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
        recordingKey: null,
        partNumber: null,
        recordedAt: null,
        createdAt: '2026-11-10T15:00:00.000Z',
      },
    ]
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={files} />)

    const row = screen.getByText('d1b1-360.insv').closest('li') as HTMLElement
    expect(within(row).getByText(/Disco WAV-01/)).toBeInTheDocument()
    expect(within(row).getByText(/VID_0001\.insv/)).toBeInTheDocument()
  })
})

describe('MediaSection · grabaciones en partes', () => {
  it('junta las partes en una sola fila con un solo selector de bloque', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    durations.set('DR0000_0001.wav', 600)
    durations.set('DR0000_0002.wav', 600)
    await drop(['DR0000_0001.wav', 'DR0000_0002.wav'])

    expect(screen.getByText('DR0000')).toBeInTheDocument()
    // Un solo desplegable de bloque para las dos partes, no uno por archivo.
    expect(screen.getAllByLabelText('Elegir bloque')).toHaveLength(1)
    expect(screen.getByText('DR0000_0001.wav')).toBeInTheDocument()
    expect(screen.getByText('DR0000_0002.wav')).toBeInTheDocument()
  })

  it('dice cuántas partes son y que van seguidas', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    // La 1 termina a las 15:00 y dura 600 s; la 2 arranca justo ahí.
    durations.set('DR0000_0001.wav', 600)
    durations.set('DR0000_0002.wav', 600)
    await drop(['DR0000_0001.wav'], Date.parse('2026-11-10T15:00:00.000Z'))
    await drop(['DR0000_0002.wav'], Date.parse('2026-11-10T15:10:00.000Z'))

    expect(screen.getByText(/2 partes · continuas/)).toBeInTheDocument()
  })

  it('avisa cuando entre dos partes hay minutos sin grabar', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    durations.set('DR0000_0001.wav', 600)
    durations.set('DR0000_0002.wav', 600)
    await drop(['DR0000_0001.wav'], Date.parse('2026-11-10T15:00:00.000Z'))
    await drop(['DR0000_0002.wav'], Date.parse('2026-11-10T15:14:00.000Z'))

    expect(screen.getByText(/4 min sin grabar/)).toBeInTheDocument()
  })

  it('descartar una grabación se lleva todas sus partes', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    durations.set('DR0000_0001.wav', 600)
    durations.set('DR0000_0002.wav', 600)
    await drop(['DR0000_0001.wav', 'DR0000_0002.wav'])

    fireEvent.click(screen.getByRole('button', { name: 'Descartar de la lista' }))

    expect(screen.queryByText('DR0000_0001.wav')).not.toBeInTheDocument()
    expect(screen.queryByText('DR0000_0002.wav')).not.toBeInTheDocument()
  })

  it('los archivos con la convención del estudio siguen sueltos', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    await drop(['d1b1-mic1.wav', 'd1b1-mic3.wav'])

    // Dos desplegables: son dos micrófonos distintos, no dos partes de uno.
    expect(screen.getAllByLabelText('Elegir bloque')).toHaveLength(2)
  })
})

describe('MediaSection · micrófono y duplicados', () => {
  const YA_SUBIDO: MediaFile = {
    id: 'm9',
    sessionId: 's-d1b1',
    kind: 'audio_mic',
    storageKey: 'k',
    originalFilename: '2026-06-02-21-18-09.wav',
    bytes: 1,
    durationSeconds: 1800,
    micNumber: 4,
    sourcePath: null,
    sourceHost: null,
    recordingKey: null,
    partNumber: null,
    recordedAt: null,
    createdAt: '2026-06-02T21:18:09.000Z',
  }

  it('ofrece elegir el micrófono cuando la pista es de micrófono', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    await drop(['d1b1-mic3.wav'])

    const mic = screen.getByLabelText('Mic') as HTMLSelectElement
    expect(mic.value).toBe('3')
  })

  it('el selector de micrófono no aparece para el audio de sala', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[]} />)
    await drop(['d1b1-sala.wav'])

    expect(screen.queryByLabelText('Mic')).not.toBeInTheDocument()
  })

  it('un archivo ya subido se marca y no se puede subir', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[YA_SUBIDO]} />)

    const input = screen.getByLabelText('Soltar archivos aquí') as HTMLInputElement
    const file = new File(['x'], '2026-06-02-21-18-09.wav', { type: 'audio/wav' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    expect(screen.getByText('Ya subido')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
  })

  it('el mismo nombre con otro tamaño no es el mismo archivo', async () => {
    render(<MediaSection studyId="e1" sessions={SESSIONS} files={[YA_SUBIDO]} />)

    const input = screen.getByLabelText('Soltar archivos aquí') as HTMLInputElement
    const file = new File(['otro contenido'], '2026-06-02-21-18-09.wav', { type: 'audio/wav' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    expect(screen.queryByText('Ya subido')).not.toBeInTheDocument()
  })
})
