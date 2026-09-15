import type { StudyFileKind } from './detect'

export const intakeCopy = {
  title: 'Archivos del estudio',
  hint: 'Convocatoria, pauta y respuestas del formulario. Se reconoce cada archivo, se muestra qué cambiaría y nada se guarda hasta confirmar.',
  choose: 'Elegir archivos',
  reading: 'Leyendo…',
  apply: 'Aplicar',
  applying: 'Aplicando…',
  cancel: 'Cancelar',
  done: 'Listo: el estudio quedó actualizado.',
  kind: {
    roster: 'Convocatoria',
    survey: 'Respuestas del formulario',
    guide: 'Pauta',
    unknown: 'No reconocido',
  } satisfies Record<StudyFileKind, string>,
  kindNote: {
    roster: null,
    survey: 'Se reconoce; su interpretación llega en la próxima etapa.',
    guide: 'Se adjunta como «Guía del focus»; su interpretación llega en la próxima etapa.',
    unknown:
      'Se espera la convocatoria (.xlsx), la pauta (.docx) o las respuestas del formulario (.xlsx).',
  } satisfies Record<StudyFileKind, string | null>,
  newBlock: 'bloque nuevo',
  movedBlock: 'hora corregida',
  add: (n: number) => `${n} a agregar`,
  update: (n: number) => `${n} a actualizar`,
  remove: (n: number) => `${n} a borrar`,
  keep: (n: number) => `${n} sin cambios`,
  orphanVerbatims: (n: number) =>
    n === 1 ? '1 verbatim queda sin autor' : `${n} verbatims quedan sin autor`,
  untouched: (codes: string) =>
    `Bloques del estudio que la planilla no menciona (no se tocan): ${codes}`,
  change: (from: string, to: string) => `${from} → ${to}`,
  mic: (n: number | null) => (n === null ? 'sin mic' : `mic ${n}`),
} as const
