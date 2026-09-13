import type { ParticipantRole, Segment } from './types'

export const participantsCopy = {
  title: 'Participantes y micrófonos',
  hint: 'Quién habla en cada bloque y con qué micrófono. El rol decide qué entra al análisis.',
  empty: 'Este bloque todavía no tiene participantes.',
  add: 'Agregar',
  importFile: 'Importar planilla',
  importHint:
    'La planilla de convocatoria: una hoja por día y una columna por bloque. Se lee y se muestra qué entraría antes de escribir nada.',
  importChoose: 'Elegir archivo',
  importReading: 'Leyendo…',
  importConfirm: 'Importar',
  importNothing: 'La planilla no trajo a nadie para los bloques de este estudio.',
  importNoBlock: 'sin bloque en el estudio',
  importAlready: (n: number) => `${n} ya están cargados`,
  absent: (n: number) => (n === 1 ? '1 no asistió' : `${n} no asistieron`),
  segment: 'Segmento',
  paste: 'Pegar listado',
  pasteHint: 'Una persona por línea. «Carolina Reyes, 3» o «3 Carolina Reyes».',
  pastePreview: 'Se van a agregar',
  pasteConfirm: 'Agregar todos',
  cancel: 'Cancelar',
  save: 'Guardar',
  saving: 'Guardando…',
  remove: 'Quitar',
  name: 'Nombre',
  mic: 'Mic',
  noMic: 'Sin micrófono',
  role: 'Rol',
  summary: (total: number, analyzed: number) =>
    total === analyzed
      ? `${total} en el análisis`
      : `${total} en la sala · ${analyzed} en el análisis`,
  duplicateMic: (mics: number[]) =>
    `Dos personas comparten el micrófono ${mics.join(', ')}. La atribución quedaría ambigua.`,
  unassignedMics: (mics: number[]) =>
    `Se grabó el micrófono ${mics.join(', ')} y no hay nadie asignado.`,
  withoutTrack: (names: string[]) => `Sin grabación del micrófono de ${names.join(', ')}.`,
} as const

export const segmentLabels: Record<Segment, string> = {
  client: 'Cliente',
  non_client: 'No cliente',
}

export const roleLabels: Record<ParticipantRole, string> = {
  participant: 'Invitado',
  moderator: 'Moderador',
  brand_staff: 'Marca',
  observer: 'Observador',
}

/** Por qué un rol queda fuera del análisis, dicho en una línea. */
export const roleNotes: Record<ParticipantRole, string> = {
  participant: 'Sus palabras son el dato.',
  moderator: 'Conduce; no cuenta como opinión.',
  brand_staff: 'Es la marca; no cuenta como opinión.',
  observer: 'Está presente; no cuenta como opinión.',
}
