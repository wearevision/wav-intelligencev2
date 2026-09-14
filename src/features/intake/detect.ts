import { parseRosterWorkbook, type SheetInput } from '@/features/participants'

/**
 * Qué es un archivo del estudio, por lo que trae adentro.
 *
 * El nombre no sirve: «Agenda Horarios.xlsx» es la convocatoria y el próximo
 * estudio le va a poner otro. Leer el archivo es trabajo del servidor; esto
 * recibe lo ya leído y se prueba sin abrir ninguno.
 */

export type StudyFileKind = 'roster' | 'survey' | 'guide' | 'unknown'

export type StudyFileContent =
  { kind: 'xlsx'; sheets: readonly SheetInput[] } | { kind: 'docx' } | { kind: 'unknown' }

function firstCell(sheet: SheetInput): string {
  const row = sheet.rows.find((r) =>
    r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''),
  )
  const cell = row?.find((c) => c !== null && c !== undefined && String(c).trim() !== '')
  return cell === undefined ? '' : String(cell).trim().toLowerCase()
}

export function detectStudyFile(content: StudyFileContent): StudyFileKind {
  if (content.kind === 'docx') return 'guide'
  if (content.kind === 'unknown') return 'unknown'

  // El parser ya sabe encontrar «Nombre» y los horarios; un día con bloques
  // es la firma de la convocatoria.
  if (parseRosterWorkbook(content.sheets).some((day) => day.blockLabels.length > 0)) return 'roster'
  if (content.sheets.some((sheet) => firstCell(sheet) === 'marca temporal')) return 'survey'
  return 'unknown'
}
