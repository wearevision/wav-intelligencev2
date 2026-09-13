/**
 * Cuánto dura un archivo, leído en el navegador antes de subirlo.
 *
 * Hace falta para los desfases entre partes: la marca de tiempo de un archivo
 * es cuándo terminó de escribirse, así que sin la duración no se sabe cuándo
 * empezó, y sin eso no se distingue un corte del equipo de una pausa real.
 *
 * Lo resuelve el propio navegador cargando solo los metadatos, sin decodificar
 * el audio: para un WAV de 400 MB son unos milisegundos.
 */

/** Un formato que el navegador no sepa leer no debe colgar la interfaz. */
const TIMEOUT_MS = 5000

export function readDuration(file: File): Promise<number | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  const isVideo = file.type.startsWith('video/')
  const isAudio = file.type.startsWith('audio/')
  // Un .insv no lo lee ningún navegador; se devuelve null en vez de esperar.
  if (!isVideo && !isAudio) return Promise.resolve(null)

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const element = document.createElement(isVideo ? 'video' : 'audio')
    let settled = false

    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      element.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), TIMEOUT_MS)

    element.preload = 'metadata'
    element.onloadedmetadata = () => {
      const seconds = element.duration
      finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null)
    }
    element.onerror = () => finish(null)
    element.src = url
  })
}

/** Las duraciones de una tanda, en el mismo orden. */
export function readDurations(files: readonly File[]): Promise<(number | null)[]> {
  return Promise.all(files.map(readDuration))
}
