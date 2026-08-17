import { describe, expect, it } from 'vitest'
import { traducirErrorMarcadorTecnico } from './marcador-tecnico'

describe('traducirErrorMarcadorTecnico', () => {
  it('vacío → mensaje genérico', () => {
    expect(traducirErrorMarcadorTecnico('')).toBe('No se pudo abrir el marcador técnico')
    expect(traducirErrorMarcadorTecnico(null)).toBe('No se pudo abrir el marcador técnico')
  })

  it('columna marcador_id ausente', () => {
    expect(traducirErrorMarcadorTecnico(
      "Could not find the 'marcador_id' column of 'oficial_partidos' in the schema cache",
    )).toMatch(/migración 156/)
  })

  it('tabla tecnico_partidos ausente', () => {
    expect(traducirErrorMarcadorTecnico(
      "Could not find the table 'public.tecnico_partidos' in the schema cache",
    )).toMatch(/migración 175/)
  })

  it('RLS', () => {
    expect(traducirErrorMarcadorTecnico(
      'new row violates row-level security policy for table "tecnico_partidos"',
    )).toMatch(/permiso/)
  })

  it('deja pasar mensajes ya claros', () => {
    expect(traducirErrorMarcadorTecnico('Partido no encontrado')).toBe('Partido no encontrado')
  })
})
