import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const plans: unknown[] = []
const surveySignature = vi.fn(() => false)
const detectKind = vi.fn(() => 'roster')
const attachStageFile = vi.fn(async () => ({ ok: true }))
let queryRows: unknown[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/xlsx/read', () => ({ readWorkbook: vi.fn(async () => []) }))
vi.mock('@/features/studies/server', () => ({
  attachStageFile: (...args: unknown[]) => attachStageFile(...(args as [])),
}))
vi.mock('@/features/intake/roster-sync', async (original) => {
  const actual = await original<typeof import('@/features/intake/roster-sync')>()
  return { ...actual, planRosterSync: vi.fn(() => plans.shift()) }
})
vi.mock('@/features/intake/detect', () => ({
  detectStudyFile: vi.fn(() => detectKind()),
  hasSurveySignature: vi.fn(() => surveySignature()),
}))
vi.mock('@/server/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    rpc,
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'limit']) chain[m] = () => chain
      chain.single = async () => ({ data: { fieldwork_start: '2026-06-02' }, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: queryRows, error: null })
      return chain
    },
  })),
}))

const { applyStudyFiles, previewStudyFiles } = await import('@/features/intake/actions')

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function planWith(mic: number) {
  return {
    ok: true,
    untouchedSessions: [],
    warnings: [],
    blocks: [
      {
        dayNumber: 1,
        blockNumber: 1,
        code: 'd1b1',
        sheetTitle: 'Junio 2',
        label: '09:00',
        scheduledAt: '2026-06-02T13:00:00.000Z',
        sessionId: null,
        isNew: true,
        scheduleChanged: false,
        add: [{ name: 'A', micNumber: mic, role: 'participant', segment: 'client' }],
        update: [],
        remove: [],
        keep: 0,
      },
    ],
  }
}

function form() {
  const f = new FormData()
  f.append('files', new File([new Uint8Array([80, 75, 3, 4])], 'Agenda Horarios.xlsx'))
  return f
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null })
  surveySignature.mockReset().mockReturnValue(false)
  plans.length = 0
  detectKind.mockReset().mockReturnValue('roster')
  attachStageFile.mockClear()
  queryRows = []
})

describe('applyStudyFiles', () => {
  it('aplica cuando el plan recalculado tiene la misma huella que la vista previa', async () => {
    plans.push(planWith(1), planWith(1))
    const preview = await previewStudyFiles(STUDY_ID, form())
    expect(preview.roster).not.toBeNull()
    const result = await applyStudyFiles(STUDY_ID, form(), preview.roster!.fingerprint)
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'apply_roster_sync',
      expect.objectContaining({ p_study_id: STUDY_ID }),
    )
  })

  it('no escribe nada y devuelve la vista previa nueva si el plan cambió desde la vista previa', async () => {
    plans.push(planWith(1), planWith(3))
    const preview = await previewStudyFiles(STUDY_ID, form())
    const result = await applyStudyFiles(STUDY_ID, form(), preview.roster!.fingerprint)
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    if (!result.ok)
      expect(result.preview?.roster?.fingerprint).not.toBe(preview.roster!.fingerprint)
  })

  it('rechaza una huella inválida sin llamar a la base', async () => {
    plans.push(planWith(1))
    const result = await applyStudyFiles(STUDY_ID, form(), 'xyz')
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('applyStudyFiles sin convocatoria', () => {
  it('aplica una subida de solo guía sin huella y adjunta el original', async () => {
    detectKind.mockReturnValue('guide')
    queryRows = [{ id: 'file-1', study_stage_id: 'stage-1' }]
    const f = new FormData()
    f.append('files', new File([new Uint8Array([80, 75, 3, 4])], 'Guía.docx'))
    const result = await applyStudyFiles(STUDY_ID, f, '')
    expect(result.ok).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
    expect(attachStageFile).toHaveBeenCalledTimes(1)
  })
})

describe('previewStudyFiles', () => {
  it('rechaza un id de estudio que no es uuid', async () => {
    const preview = await previewStudyFiles('study-1', form())
    expect(preview.ok).toBe(false)
  })

  it('avisa cuando la convocatoria también trae la forma de las respuestas del formulario', async () => {
    surveySignature.mockReturnValue(true)
    plans.push(planWith(1))
    const preview = await previewStudyFiles(STUDY_ID, form())
    expect(preview.roster?.plan.warnings).toContain(
      'Agenda Horarios.xlsx: también trae la forma de las respuestas del formulario; se interpreta como convocatoria.',
    )
  })
})
