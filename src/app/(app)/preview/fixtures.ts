import type { MediaFile } from '@/features/media'
import type { Participant } from '@/features/participants'
import type { SessionPipeline } from '@/features/pipeline'
import type { StudySession } from '@/features/sessions'
import type { Study, StudyStage } from '@/features/studies'

// Datos de prueba para iterar la interfaz sin base de datos. Solo desarrollo.

const TEMPLATE: ReadonlyArray<{ name: string; offset: number; tasks: [string, boolean][] }> = [
  {
    name: 'Brief',
    offset: -45,
    tasks: [
      ['Recibir brief del cliente', true],
      ['Acordar fecha de terreno', true],
    ],
  },
  {
    name: 'Diseño',
    offset: -30,
    tasks: [
      ['Definir segmentos y número de grupos', true],
      ['Escribir guía del moderador', true],
      ['Definir estructura de días y bloques', true],
    ],
  },
  {
    name: 'Convocatoria',
    offset: -14,
    tasks: [
      ['Cargar listado de invitados', true],
      ['Asignar invitados a bloques', true],
      ['Confirmar cupos de todos los bloques', true],
      ['Asignar micrófono a cada invitado', false],
    ],
  },
  { name: 'Logística', offset: -7, tasks: [['Reservar sala', true]] },
  { name: 'Ejecución', offset: 0, tasks: [['Realizar todos los bloques', true]] },
  { name: 'Procesamiento', offset: 3, tasks: [['Transcribir', true]] },
  { name: 'Análisis', offset: 7, tasks: [['Extraer hallazgos', true]] },
  { name: 'Revisión', offset: 10, tasks: [['Validar citas contra el audio', true]] },
  { name: 'Entrega', offset: 14, tasks: [['Enviar reporte al cliente', true]] },
  { name: 'Cierre', offset: 21, tasks: [['Archivar material del estudio', false]] },
]

const FILES: Record<string, string> = {
  Brief: 'Brief del cliente',
  Diseño: 'Guía del focus',
  Convocatoria: 'Listado de invitados',
}

function isoPlus(from: Date, days: number): string {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function buildFixture(
  id: string,
  name: string,
  clientName: string | null,
  fieldworkInDays: number | null,
  closedThrough: number,
  today: Date,
): Study {
  const fieldwork = fieldworkInDays === null ? null : isoPlus(today, fieldworkInDays)

  const stages: StudyStage[] = TEMPLATE.map((t, index) => {
    const position = index + 1
    const closed = position <= closedThrough
    const due =
      fieldworkInDays === null ? null : isoPlus(today, fieldworkInDays + t.offset)

    return {
      id: `${id}-s${position}`,
      position,
      name: t.name,
      status: closed ? 'done' : position === closedThrough + 1 ? 'in_progress' : 'pending',
      dueOn: due,
      completedAt: closed ? new Date().toISOString() : null,
      tasks: t.tasks.map(([taskName, isBlocking], i) => ({
        id: `${id}-s${position}-t${i}`,
        name: taskName,
        isBlocking,
        dueOn: due,
        doneAt: closed ? new Date().toISOString() : null,
      })),
      files:
        FILES[t.name] === undefined
          ? []
          : [
              {
                id: `${id}-s${position}-f`,
                label: FILES[t.name],
                isRequired: true,
                storageKey: closed ? 'studies/demo/archivo.pdf' : null,
                filename: closed ? 'brief-mg-2027.pdf' : null,
              },
            ],
    }
  })

  return { id, name, clientName, fieldworkStart: fieldwork, status: 'active', stages }
}

export function previewStudies(today: Date): Study[] {
  return [
    buildFixture('a', 'MG Motor · Eléctricos 2027', 'MG Motor', 21, 1, today),
    buildFixture('b', 'MG Motor · Post-venta', 'MG Motor', 48, 0, today),
    buildFixture('c', 'Piloto interno', null, null, 0, today),
  ]
}

/** 3 días × 2 bloques, con la logística a medio llenar para ver ambos estados. */
export function previewSessions(today: Date): StudySession[] {
  const sessions: StudySession[] = []
  for (let day = 1; day <= 3; day++) {
    for (let block = 1; block <= 2; block++) {
      const complete = day === 1
      const at = new Date(today)
      at.setUTCDate(at.getUTCDate() + 20 + day)
      at.setUTCHours(block === 1 ? 13 : 20, 0, 0, 0)

      sessions.push({
        id: `s-d${day}b${block}`,
        dayNumber: day,
        blockNumber: block,
        code: `d${day}b${block}`,
        name: `Día ${day} · Bloque ${block}`,
        scheduledAt: complete ? at.toISOString() : null,
        venue: complete ? 'Sala Providencia' : null,
        moderatorName: complete ? 'Carolina Reyes' : null,
        participantCount: complete ? 8 : 0,
      })
    }
  }
  return sessions
}

/** Material a medio subir: un bloque completo, otro con video pero sin audio. */
export function previewMedia(): MediaFile[] {
  const at = '2026-11-10T15:00:00.000Z'
  return [
    {
      id: 'm-1',
      sessionId: 's-d1b1',
      kind: 'audio_room',
      storageKey: 'studies/a/d1b1/sala-0001.wav',
      originalFilename: 'd1b1-sala.wav',
      bytes: 812_000_000,
      durationSeconds: 7200,
      micNumber: null,
      sourcePath: null,
      sourceHost: null,
      recordingKey: null,
      partNumber: null,
      recordedAt: null,
      createdAt: at,
    },
    {
      id: 'm-2',
      sessionId: 's-d1b1',
      kind: 'audio_mic',
      storageKey: 'studies/a/d1b1/mic3-0002.wav',
      originalFilename: 'd1b1-mic3.wav',
      bytes: 690_000_000,
      durationSeconds: 7200,
      micNumber: 3,
      sourcePath: null,
      sourceHost: null,
      recordingKey: null,
      partNumber: null,
      recordedAt: null,
      createdAt: at,
    },
    {
      id: 'm-3',
      sessionId: 's-d1b2',
      kind: 'video_360',
      storageKey: 'studies/a/d1b2/360-0003.m3u8',
      originalFilename: 'd1b2-360.insv',
      bytes: 1_400_000_000,
      durationSeconds: 7200,
      micNumber: null,
      sourcePath: '/Volumes/WAV-01/mg-postventa/d1b2/VID_0012.insv',
      sourceHost: 'Disco WAV-01',
      recordingKey: null,
      partNumber: null,
      recordedAt: null,
      createdAt: at,
    },
    {
      id: 'm-4',
      sessionId: 's-d1b1',
      kind: 'audio_mic',
      storageKey: 'studies/a/d1b1/DR0000_0001-0004.wav',
      originalFilename: 'DR0000_0001.wav',
      bytes: 402_000_000,
      durationSeconds: 3600,
      micNumber: 5,
      sourcePath: null,
      sourceHost: null,
      recordingKey: 'DR0000',
      partNumber: 1,
      recordedAt: '2026-11-10T14:00:00.000Z',
      createdAt: at,
    },
    {
      id: 'm-5',
      sessionId: 's-d1b1',
      kind: 'audio_mic',
      storageKey: 'studies/a/d1b1/DR0000_0002-0005.wav',
      originalFilename: 'DR0000_0002.wav',
      bytes: 398_000_000,
      durationSeconds: 3540,
      micNumber: 5,
      sourcePath: null,
      sourceHost: null,
      recordingKey: 'DR0000',
      partNumber: 2,
      recordedAt: '2026-11-10T15:04:00.000Z',
      createdAt: at,
    },
  ]
}

/** Los cuatro estados de una corrida, uno por bloque, para verlos juntos. */
export function previewPipelines(): SessionPipeline[] {
  const at = '2026-11-10T18:00:00.000Z'
  return [
    {
      // Lista, con el inventario saltado porque WAV Ingest ya lo había hecho.
      sessionId: 's-d1b1',
      run: {
        id: 'run-1',
        sessionId: 's-d1b1',
        status: 'done',
        startedAt: at,
        finishedAt: at,
        error: null,
        createdAt: at,
        steps: [
          { id: 'st-1', name: 'inventario', position: 1, status: 'skipped', attempt: 0, error: null },
          {
            id: 'st-2',
            name: 'plan_transcripcion',
            position: 2,
            status: 'done',
            attempt: 1,
            error: null,
          },
        ],
      },
      artifacts: [
        {
          id: 'a-1',
          sessionId: 's-d1b1',
          kind: 'session_inventory',
          storageKey: 'studies/a/d1b1/artifacts/session_inventory.json',
          producer: 'local',
          bytes: 1840,
          createdAt: at,
        },
        {
          id: 'a-2',
          sessionId: 's-d1b1',
          kind: 'transcription_plan',
          storageKey: 'studies/a/d1b1/artifacts/transcription_plan.json',
          producer: 'cloud',
          bytes: 920,
          createdAt: at,
        },
      ],
    },
    {
      // Caída en el primer paso: el bloque tiene video pero no audio.
      sessionId: 's-d1b2',
      run: {
        id: 'run-2',
        sessionId: 's-d1b2',
        status: 'failed',
        startedAt: at,
        finishedAt: at,
        error: 'El bloque no tiene audio: no hay nada que transcribir.',
        createdAt: at,
        steps: [
          { id: 'st-3', name: 'inventario', position: 1, status: 'done', attempt: 1, error: null },
          {
            id: 'st-4',
            name: 'plan_transcripcion',
            position: 2,
            status: 'failed',
            attempt: 2,
            error: 'El bloque no tiene audio: no hay nada que transcribir.',
          },
        ],
      },
      artifacts: [
        {
          id: 'a-3',
          sessionId: 's-d1b2',
          kind: 'session_inventory',
          storageKey: 'studies/a/d1b2/artifacts/session_inventory.json',
          producer: 'cloud',
          bytes: 610,
          createdAt: at,
        },
      ],
    },
  ]
}

/** Una sala con sus roles, y dos desajustes de micrófono a la vista. */
export function previewParticipants(): Participant[] {
  const en = (sessionId: string, rows: [string, number | null, Participant['role']][]) =>
    rows.map(([name, micNumber, role], i) => ({
      id: `p-${sessionId}-${i}`,
      sessionId,
      name,
      micNumber,
      seatNumber: null,
      role,
    }))

  return [
    ...en('s-d1b1', [
      ['Carolina Reyes', 1, 'moderator'],
      ['Paula Contreras', 3, 'participant'],
      // Lleva el 5, que sí se grabó: la fila que calza.
      ['Ignacio Soto', 5, 'participant'],
      // Lleva el 9, del que no llegó grabación.
      ['Marcela Díaz', 9, 'participant'],
      ['Rodrigo Ávila', null, 'brand_staff'],
    ]),
    ...en('s-d1b2', [['Carolina Reyes', 1, 'moderator']]),
  ]
}
