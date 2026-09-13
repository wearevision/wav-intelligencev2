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
