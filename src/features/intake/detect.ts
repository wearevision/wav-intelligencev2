import { parseRosterWorkbook, type Cell, type SheetInput } from '@/features/participants'

/**
 * Qué es un archivo del estudio, por lo que trae adentro.
 *
 * Si es xlsx o docx ya lo decidió el servidor al leerlo; acá solo se mira
 * el contenido para saber cuál de las formas del estudio es. La convocatoria
 * se evalúa antes que las respuestas porque esa es la precedencia del
 * diseño: una planilla que trae las dos formas es, ante todo, convocatoria.
 */

export type StudyFileKind = 'roster' | 'survey' | 'guide' | 'unknown'

export type StudyFileContent =
  { kind: 'xlsx'; sheets: readonly SheetInput[] } | { kind: 'docx' } | { kind: 'unknown' }

/** La columna con la que Google Forms encabeza sus respuestas exportadas (es-419). */
const SURVEY_HEADER = 'marca temporal'

const isFilled = (c: Cell) => c !== null && c !== undefined && String(c).trim() !== ''

function firstCell(sheet: SheetInput): string {
  const row = sheet.rows.find((r) => r.some(isFilled))
  const cell = row?.find(isFilled)
  return cell === undefined ? '' : String(cell).trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Si alguna hoja trae la firma del formulario de respuestas. Se expone aparte
 * de `detectStudyFile` porque una convocatoria puede traerla también — ahí
 * gana la convocatoria, pero quien la reciba necesita poder avisar igual.
 */
export function hasSurveySignature(sheets: readonly SheetInput[]): boolean {
  return sheets.some((sheet) => firstCell(sheet) === SURVEY_HEADER)
}

export function detectStudyFile(content: StudyFileContent): StudyFileKind {
  if (content.kind === 'docx') return 'guide'
  if (content.kind === 'unknown') return 'unknown'

  // El parser ya sabe encontrar «Nombre» y los horarios; un día con bloques
  // es la firma de la convocatoria.
  if (parseRosterWorkbook(content.sheets).some((day) => day.blockLabels.length > 0)) return 'roster'
  if (hasSurveySignature(content.sheets)) return 'survey'
  return 'unknown'
}
