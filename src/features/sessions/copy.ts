export const sessionsCopy = {
  title: 'Sesiones',
  empty: 'Este estudio todavía no tiene sesiones.',
  generateTitle: 'Definir la estructura',
  generateHint:
    'Cuántos días de terreno y cuántos bloques por día. Se crean todas las sesiones de una vez.',
  days: 'Días',
  blocksPerDay: 'Bloques por día',
  preview: 'Se van a crear',
  generate: 'Crear sesiones',
  generating: 'Creando…',
  edit: 'Editar',
  save: 'Guardar',
  cancel: 'Cancelar',
  saving: 'Guardando…',
  fieldSchedule: 'Fecha y hora',
  fieldVenue: 'Sala',
  fieldModerator: 'Moderador',
  participants: (n: number) => (n === 1 ? '1 participante' : `${n} participantes`),
  outsideGrid: 'Sesiones sin día ni bloque asignado',
  complete: 'Logística completa',
  missing: {
    schedule: 'Sin fecha',
    venue: 'Sin sala',
    moderator: 'Sin moderador',
  },
} as const

/**
 * "Mañana" y "Tarde" solo cuando hay exactamente dos bloques.
 *
 * Es copy derivado, no semántica de la base: un estudio de tres bloques no
 * debería romperse porque alguien asumió que b2 es siempre la tarde.
 */
export function blockLabel(block: number, blocksPerDay: number): string {
  if (blocksPerDay === 2) return block === 1 ? 'Mañana' : 'Tarde'
  return `Bloque ${block}`
}

export function dayLabel(day: number): string {
  return `Día ${day}`
}
