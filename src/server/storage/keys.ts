/**
 * Construcción de claves de almacenamiento. Puro y testeable: la elección de
 * proveedor no debe desparramarse por los features (D15).
 */

/** Deja el nombre utilizable como parte de una ruta, sin perder legibilidad. */
export function safeFilename(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'archivo'
  )
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
