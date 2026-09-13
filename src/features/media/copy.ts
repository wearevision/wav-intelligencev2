import type { MatchReason, MediaKind } from './model'

export const mediaCopy = {
  title: 'Material',
  hint: 'Suelta el audio y el video de cada bloque. Las partes de una misma grabación se agrupan solas.',
  drop: 'Soltar archivos aquí',
  reading: 'Leyendo los archivos…',
  parts: 'Grabación en partes',
  partsSuffix: 'partes',
  micLabel: 'Mic',
  noMic: 'Sin asignar',
  duplicate: 'Ya subido',
  duplicateAll: 'Esta grabación ya está subida entera. No se vuelve a subir.',
  browse: 'o elegir del disco',
  pending: 'Por subir',
  tray: 'Sin bloque asignado',
  trayHint: 'Elige el bloque antes de subir. Nada se descarta.',
  chooseBlock: 'Elegir bloque',
  upload: 'Subir',
  uploading: 'Subiendo…',
  remove: 'Quitar',
  discard: 'Descartar de la lista',
  noAudio: 'Sin audio',
  noVideo: 'Sin video',
  master: 'Master en',
  empty: 'Todavía no hay material subido.',
  unsupported: 'Formato no reconocido',
  tooLarge: 'Supera el tamaño máximo',
} as const

export const kindLabels: Record<MediaKind, string> = {
  video_360: 'Video 360°',
  video_dslr: 'Video cámara',
  audio_room: 'Audio de sala',
  audio_mic: 'Micrófono',
  audio_ambient: 'Audio ambiente',
}

export const reasonLabels: Record<MatchReason, string> = {
  code: 'Por código',
  schedule: 'Por horario',
  ambiguous: 'Calza con más de un bloque',
  unmatched: 'No calza con ningún bloque',
}
