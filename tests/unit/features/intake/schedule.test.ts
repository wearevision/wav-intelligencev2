import { describe, expect, it } from 'vitest'

import { blockTime, chileLocalToUtcIso, sheetDate } from '@/features/intake/schedule'

describe('sheetDate', () => {
  it('lee «Junio 2» con el año del terreno', () => {
    expect(sheetDate('Junio 2', 2026)).toEqual({ year: 2026, month: 6, day: 2 })
  })

  it('acepta el día antes del mes, con «de» y con día de la semana', () => {
    expect(sheetDate('2 de junio', 2026)).toEqual({ year: 2026, month: 6, day: 2 })
    expect(sheetDate('Martes 3 Junio', 2026)).toEqual({ year: 2026, month: 6, day: 3 })
    expect(sheetDate('SETIEMBRE 10', 2026)).toEqual({ year: 2026, month: 9, day: 10 })
  })

  it('devuelve null cuando la hoja no nombra una fecha válida', () => {
    expect(sheetDate('Hoja1', 2026)).toBeNull()
    expect(sheetDate('Junio 31', 2026)).toBeNull()
  })

  it('toma el día pegado al mes, no cualquier otro número del título', () => {
    expect(sheetDate('Día 1 - Junio 2', 2026)).toEqual({ year: 2026, month: 6, day: 2 })
    expect(sheetDate('Sala 2 Junio 3', 2026)).toEqual({ year: 2026, month: 6, day: 3 })
    expect(sheetDate('Junio 2026', 2026)).toBeNull()
  })
})

describe('blockTime', () => {
  it('lee la hora que Excel entrega como texto «09:00»', () => {
    expect(blockTime('09:00')).toEqual({ hour: 9, minute: 0 })
  })

  it('suma doce horas a una hora PM con o sin espacio', () => {
    expect(blockTime('13:00PM')).toEqual({ hour: 13, minute: 0 })
    expect(blockTime('1:30 PM')).toEqual({ hour: 13, minute: 30 })
    expect(blockTime('12:00 am')).toEqual({ hour: 0, minute: 0 })
  })

  it('devuelve null cuando no hay hora', () => {
    expect(blockTime('Mañana')).toBeNull()
    expect(blockTime('25:00')).toBeNull()
  })

  it('ignora un am/pm que no está pegado a la hora, y reconoce «p.m.»', () => {
    expect(blockTime('12:00 Sala Amarilla')).toEqual({ hour: 12, minute: 0 })
    expect(blockTime('9:00 Shopmart')).toEqual({ hour: 9, minute: 0 })
    expect(blockTime('09:00 p.m.')).toEqual({ hour: 21, minute: 0 })
    expect(blockTime('9:00 hrs')).toEqual({ hour: 9, minute: 0 })
  })
})

describe('chileLocalToUtcIso', () => {
  it('convierte una hora de invierno (UTC-4)', () => {
    expect(chileLocalToUtcIso({ year: 2026, month: 6, day: 2 }, { hour: 9, minute: 0 })).toBe(
      '2026-06-02T13:00:00.000Z',
    )
  })

  it('convierte una hora de verano (UTC-3)', () => {
    expect(chileLocalToUtcIso({ year: 2026, month: 1, day: 15 }, { hour: 9, minute: 0 })).toBe(
      '2026-01-15T12:00:00.000Z',
    )
  })

  it('usa el desfase del propio instante en el día del cambio de hora', () => {
    expect(chileLocalToUtcIso({ year: 2026, month: 4, day: 5 }, { hour: 0, minute: 0 })).toBe(
      '2026-04-05T04:00:00.000Z',
    )
  })
})
