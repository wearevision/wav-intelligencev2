/** Todo el texto visible del feature vive acá, nunca dentro de un componente (D12). */
export const studiesCopy = {
  listTitle: 'Estudios',
  listEmpty: 'Aún no hay estudios.',
  listEmptyAction: 'Crear el primero',
  newStudy: 'Nuevo estudio',
  create: 'Crear estudio',
  creating: 'Creando…',
  fieldName: 'Nombre del estudio',
  fieldClient: 'Cliente',
  fieldFieldwork: 'Fecha de terreno',
  fieldworkHint: 'Las diez etapas se calculan a partir de esta fecha.',
  noFieldwork: 'Sin fecha de terreno',
  stages: 'Etapas',
  currentStage: 'Etapa actual',
  progress: 'Avance',
  blockersTitle: 'Falta para cerrar',
  noBlockers: 'Todo listo para cerrar esta etapa.',
  advance: 'Cerrar etapa y avanzar',
  advancing: 'Cerrando…',
  overdue: 'Atrasada',
  dueToday: 'Vence hoy',
  finished: 'Estudio completo',
  taskPending: 'Pendiente',
  taskDone: 'Hecha',
  fileMissing: 'Sin adjuntar',
  fileAttached: 'Adjunto',
  blocking: 'Bloqueante',
  required: 'Requerido',
  backToList: 'Volver a estudios',
  signOut: 'Cerrar sesión',
  statusLabel: {
    pending: 'Pendiente',
    in_progress: 'En curso',
    done: 'Cerrada',
    skipped: 'Omitida',
  },
} as const

export function dueLabel(days: number): string {
  if (days === 0) return studiesCopy.dueToday
  if (days < 0) return `${studiesCopy.overdue} · ${Math.abs(days)} d`
  return `en ${days} d`
}
