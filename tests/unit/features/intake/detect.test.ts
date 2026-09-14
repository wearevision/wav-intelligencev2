import { describe, expect, it } from 'vitest'

import { detectStudyFile, hasSurveySignature } from '@/features/intake/detect'
import type { SheetInput } from '@/features/participants'

const convocatoria: SheetInput = {
  title: 'Junio 2',
  rows: [[], [null, 'RUT', 'Nombre', 'N° Micrófono', '09:00', '13:00PM', 'ROL']],
}

const formulario: SheetInput = {
  title: 'Respuestas de formulario 1',
  rows: [['Marca temporal', '¿Qué fue lo primero que te llamó la atención?']],
}

// Google Forms a veces exporta «Marca temporal» con un espacio duro (NBSP)
// en vez de un espacio normal.
const formularioConEspacioDuro: SheetInput = {
  title: 'Respuestas de formulario 2',
  rows: [['Marca temporal', '¿Qué fue lo primero que te llamó la atención?']],
}

describe('detectStudyFile', () => {
  it('reconoce la convocatoria por «Nombre» y las columnas de horario', () => {
    expect(detectStudyFile({ kind: 'xlsx', sheets: [convocatoria] })).toBe('roster')
  })

  it('reconoce las respuestas por «Marca temporal» en la primera celda', () => {
    expect(detectStudyFile({ kind: 'xlsx', sheets: [formulario] })).toBe('survey')
    expect(detectStudyFile({ kind: 'xlsx', sheets: [formularioConEspacioDuro] })).toBe('survey')
  })

  it('reconoce la pauta como documento de Word', () => {
    expect(detectStudyFile({ kind: 'docx' })).toBe('guide')
  })

  it('da desconocido para una planilla sin ninguna de las dos formas', () => {
    expect(
      detectStudyFile({ kind: 'xlsx', sheets: [{ title: 'Hoja1', rows: [['a', 'b']] }] }),
    ).toBe('unknown')
    expect(detectStudyFile({ kind: 'unknown' })).toBe('unknown')
    expect(detectStudyFile({ kind: 'xlsx', sheets: [] })).toBe('unknown')
  })

  it('prefiere la convocatoria si una planilla trae las dos formas', () => {
    expect(detectStudyFile({ kind: 'xlsx', sheets: [formulario, convocatoria] })).toBe('roster')
  })

  it('expone la firma del formulario para avisar cuando una convocatoria también la trae', () => {
    expect(hasSurveySignature([formulario, convocatoria])).toBe(true)
    expect(hasSurveySignature([convocatoria])).toBe(false)
  })
})
