import { describe, expect, it } from 'vitest'
import { armarHistorialDetallado, type BloqueInfo, type RegistroAsistenciaConBloque } from './historialDetalladoAsistencia'
import type { DiaCalendario } from './historialAsistencia'

const bloqueMartesCentro: BloqueInfo = { id: 'b1', nombre: 'Adulto Master', sede: 'Centro', hora_inicio: '18:00:00', hora_fin: '19:30:00' }
const bloqueMartesNorte: BloqueInfo = { id: 'b2', nombre: 'Menores', sede: 'Norte', hora_inicio: '18:00:00', hora_fin: '19:00:00' }
const bloques = new Map([[bloqueMartesCentro.id, bloqueMartesCentro], [bloqueMartesNorte.id, bloqueMartesNorte]])
const nombreDe = (id: string) => (id === 'j1' ? 'Ana Pérez' : id)

function dia(fecha: string, bloqueIds: string[]): DiaCalendario {
  return { fecha, dia: 'mar', estado: 'presente', bloques: [], bloqueIds, extra: false }
}

describe('armarHistorialDetallado', () => {
  it('usa el bloque guardado en la fila cuando existe, sin tocar la inferencia', () => {
    const filas = armarHistorialDetallado(
      [{ jugador_id: 'j1', fecha: '2026-08-04', bloque_id: 'b1' }],
      nombreDe, bloques, new Map(),
    )
    expect(filas[0]).toMatchObject({ bloqueId: 'b1', bloqueNombre: 'Adulto Master', sede: 'Centro', horario: '18:00–19:30', inferido: false })
  })

  it('completa por inferencia cuando no hay bloque guardado y solo hay un candidato', () => {
    const calendarios = new Map([['j1', [dia('2026-08-04', ['b1'])]]])
    const filas = armarHistorialDetallado(
      [{ jugador_id: 'j1', fecha: '2026-08-04', bloque_id: null }],
      nombreDe, bloques, calendarios,
    )
    expect(filas[0]).toMatchObject({ bloqueId: 'b1', sede: 'Centro', inferido: true })
  })

  it('no adivina cuando hay dos bloques candidatos el mismo día', () => {
    const calendarios = new Map([['j1', [dia('2026-08-04', ['b1', 'b2'])]]])
    const filas = armarHistorialDetallado(
      [{ jugador_id: 'j1', fecha: '2026-08-04', bloque_id: null }],
      nombreDe, bloques, calendarios,
    )
    expect(filas[0]).toMatchObject({ bloqueId: null, sede: '—', inferido: true })
  })

  it('sin bloque guardado y sin candidato alguno, queda sin dato y no marcado como inferido', () => {
    const filas = armarHistorialDetallado(
      [{ jugador_id: 'j1', fecha: '2026-08-04', bloque_id: null }],
      nombreDe, bloques, new Map(),
    )
    expect(filas[0]).toMatchObject({ bloqueId: null, sede: '—', inferido: false })
  })

  it('trae el nombre del jugador desde nombreDe', () => {
    const filas = armarHistorialDetallado(
      [{ jugador_id: 'j1', fecha: '2026-08-04', bloque_id: 'b1' }],
      nombreDe, bloques, new Map(),
    )
    expect(filas[0].jugadorNombre).toBe('Ana Pérez')
  })
})
