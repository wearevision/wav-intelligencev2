import type { RunStatus, StepStatus } from './model'

export const pipelineCopy = {
  title: 'Procesamiento',
  idle: 'Sin procesar',
  start: 'Procesar bloque',
  running: 'Procesando…',
  retry: 'Reintentar',
  // Vuelve a recorrer la cadena: con todo hecho no cuesta nada, y sirve
  // después de descartar un resultado para rehacerlo.
  again: 'Volver a procesar',
  artifacts: 'Resultados',
  discard: 'Rehacer',
  noMedia: 'Sube el material antes de procesar.',
  attempt: (n: number) => (n <= 1 ? '' : `intento ${n}`),
} as const

export const runStatusLabels: Record<RunStatus, string> = {
  pending: 'Pendiente',
  running: 'En curso',
  done: 'Lista',
  failed: 'Con error',
}

export const stepStatusLabels: Record<StepStatus, string> = {
  pending: 'Pendiente',
  running: 'En curso',
  done: 'Hecho',
  failed: 'Falló',
  // No es lo mismo que "hecho": el resultado ya estaba, lo hizo otro.
  skipped: 'Ya estaba',
}

export const artifactLabels: Record<string, string> = {
  session_inventory: 'Inventario',
  transcription_plan: 'Plan de transcripción',
  hls_manifest: 'Video para reproducir',
  transcript_json: 'Transcripción',
  waveform: 'Onda de audio',
}

export function artifactLabel(kind: string): string {
  return artifactLabels[kind] ?? kind
}

export const producerLabels: Record<string, string> = {
  local: 'hecho en el escritorio',
  cloud: 'hecho en la nube',
}
