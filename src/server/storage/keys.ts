/**
 * Construcción de claves de almacenamiento. Puro y testeable: la elección de
 * proveedor no debe desparramarse por los features (D15).
 */

/** Deja el nombre utilizable como parte de una ruta, sin perder legibilidad. */
export function safeFilename(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)

  // Un nombre que queda en puros puntos —`.` o `..`— no nombra un archivo: es
  // una referencia a un directorio. En R2 la clave es una cadena opaca y no
  // haría daño, pero cualquier consumidor que la mapee a un sistema de
  // archivos la interpretaría como "el directorio de arriba".
  if (clean === '' || /^\.+$/.test(clean)) return 'archivo'
  return clean
}

function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, dot), ext: name.slice(dot) }
}

/**
 * `studies/{estudio}/{código}/{nombre}-{sufijo}.{ext}`
 *
 * Se usa el código del bloque y no su id para que el bucket sea legible: cuando
 * alguien mire R2 dentro de dos años, "d2b2" le dice algo y un uuid no. El
 * sufijo evita choques entre archivos que se llaman igual.
 */
export function mediaKey(
  studyId: string,
  code: string | null,
  filename: string,
  suffix: string,
): string {
  const { stem, ext } = splitExtension(safeFilename(filename))
  const block = code ?? 'sin-bloque'
  return `studies/${studyId}/${block}/${stem}-${suffix}${ext}`
}

/** Sufijo corto y aleatorio para desempatar nombres repetidos. */
export function randomSuffix(): string {
  return crypto.randomUUID().slice(0, 8)
}

/**
 * `studies/{estudio}/{código}/artifacts/{tipo}.json`
 *
 * Vive junto al material que describe y no en un árbol aparte: al mirar la
 * carpeta de un bloque se ve la grabación y lo que se derivó de ella.
 */
export function artifactKey(studyId: string, code: string | null, kind: string): string {
  const block = code ?? 'sin-bloque'
  return `studies/${studyId}/${block}/artifacts/${safeFilename(kind)}.json`
}

/**
 * Un paquete HLS: el manifiesto y sus segmentos, bajo un mismo prefijo.
 *
 * `studies/{estudio}/{código}/hls/{nombre}-{sufijo}/index.m3u8`
 *
 * Los segmentos van al lado del manifiesto porque este los referencia por
 * nombre relativo: repartidos en otro prefijo, el reproductor no los
 * encontraría.
 */
export function hlsKeys(
  studyId: string,
  code: string | null,
  filename: string,
  suffix: string,
  segmentFilenames: readonly string[],
): { manifestKey: string; segments: { filename: string; key: string }[] } {
  const { stem } = splitExtension(safeFilename(filename))
  const block = code ?? 'sin-bloque'
  const prefix = `studies/${studyId}/${block}/hls/${stem}-${suffix}`

  return {
    manifestKey: `${prefix}/index.m3u8`,
    segments: segmentFilenames.map((name) => ({
      filename: name,
      // El nombre ya viene validado por el esquema de la ruta; se sanea igual
      // porque una clave la construye el servidor y no el cliente.
      key: `${prefix}/${safeFilename(name)}`,
    })),
  }
}
