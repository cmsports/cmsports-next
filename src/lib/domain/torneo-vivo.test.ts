import { describe, expect, it } from 'vitest'
import { firmaSnapshotTorneoVivo, normalizarSnapshotTorneoVivo } from './torneo-vivo'

const base = {
  torneo: { id: 't1', nombre: 'Torneo', fase: 'semis', estado: 'en_curso' },
  grupos: [{ id: 'g1', nombre: 'A' }],
  jugadores: [
    { id: 'a', nombre: 'Ana', grupo_id: 'g1' },
    { id: 'b', nombre: 'Beto', grupo_id: 'g1' },
  ],
  partidos: [],
}

describe('normalizarSnapshotTorneoVivo', () => {
  it('acepta el instante entre marcar un ganador y propagarlo', () => {
    const snapshot = normalizarSnapshotTorneoVivo({
      ...base,
      partidos: [
        { id: 's1', fase: 'semis', orden: 0, jugador_a: 'a', jugador_b: 'b', ganador: 'a', nombre_a: 'Ana', nombre_b: 'Beto' },
        { id: 'f1', fase: 'final', orden: 0, jugador_a: null, jugador_b: null, ganador: null },
      ],
    })

    expect(snapshot?.partidos).toHaveLength(2)
    expect(snapshot?.partidos.find(partido => partido.id === 'f1')).toMatchObject({
      jugador_a: null,
      jugador_b: null,
      ganador: null,
    })
  })

  it('acepta una llave siguiente con un solo jugador', () => {
    const snapshot = normalizarSnapshotTorneoVivo({
      ...base,
      partidos: [{ id: 'f1', fase: 'final', orden: 0, jugador_a: 'a', jugador_b: null, ganador: null }],
    })

    expect(snapshot?.partidos[0]).toMatchObject({ nombre_a: 'Ana', nombre_b: null })
  })

  it('descarta filas inválidas sin derribar la página', () => {
    const snapshot = normalizarSnapshotTorneoVivo({
      ...base,
      grupos: [null, { id: 'g1', nombre: null }],
      jugadores: [null, { id: 'a', nombre: null, grupo_id: 'g1' }],
      partidos: [null, { id: 'f1', fase: 'final', orden: 'incorrecto' }],
    })

    expect(snapshot?.grupos).toEqual([{ id: 'g1', nombre: 'Grupo' }])
    expect(snapshot?.jugadores).toEqual([{ id: 'a', nombre: 'Jugador', grupo_id: 'g1' }])
    expect(snapshot?.partidos[0].orden).toBeNull()
  })

  it('elimina la duplicación MESA y conserva el grupo visible', () => {
    const snapshot = normalizarSnapshotTorneoVivo({
      ...base,
      jugadores: [
        { id: 'a', nombre: 'Ana', grupo_id: 'mesa' },
        { id: 'a', nombre: 'Ana', grupo_id: 'g1' },
      ],
    })

    expect(snapshot?.jugadores).toEqual([{ id: 'a', nombre: 'Ana', grupo_id: 'g1' }])
  })

  it('produce la misma firma aunque Supabase cambie el orden', () => {
    const primero = normalizarSnapshotTorneoVivo(base)!
    const segundo = normalizarSnapshotTorneoVivo({
      ...base,
      jugadores: [...base.jugadores].reverse(),
    })!

    expect(firmaSnapshotTorneoVivo(primero)).toBe(firmaSnapshotTorneoVivo(segundo))
  })

  it('rechaza respuestas sin torneo válido', () => {
    expect(normalizarSnapshotTorneoVivo(null)).toBeNull()
    expect(normalizarSnapshotTorneoVivo({ torneo: {}, grupos: [], jugadores: [], partidos: [] })).toBeNull()
  })
})
