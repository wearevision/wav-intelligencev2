export const transcriptsCopy = {
  title: 'Transcripción',
  hint: 'Lo que se dijo en cada bloque, con quién lo dijo.',
  empty: 'Este bloque todavía no tiene transcripción.',
  read: 'Leer',
  back: 'Volver al estudio',
  segments: (n: number) => (n === 1 ? '1 intervención' : `${n} intervenciones`),
  unattributed: (n: number) =>
    n === 1 ? '1 sin nombre' : `${n} sin nombre`,
  unknownSpeaker: 'Sin identificar',
} as const
