import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '@/lib/test/fakeSupabase'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))

import {
  asignarJugadoresDivision,
  crearLiga,
  generarFixtureDivisionAction,
  registrarWalkover,
  retirarJugadorDeLiga,
  guardarRestriccionesLiga,
  reprogramarFechasPendientes,
  asignarPartidoManual,
  moverPartidoLiga,
} from './liga'

describe('acciones críticas de liga', () => {
  beforeEach(() => vi.clearAllMocks())

  it('corta todas las operaciones representativas sin autorización', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })

    await expect(asignarJugadoresDivision({ divisionId: 'div-1', jugadorIds: ['a', 'b'] }))
      .resolves.toEqual({ error: 'Acceso denegado' })
    await expect(generarFixtureDivisionAction({ divisionId: 'div-1' }))
      .resolves.toEqual({ error: 'Acceso denegado' })
    await expect(crearLiga({ nombre: 'Liga', totalFechas: 5, montoInscripcionDefault: 1000 }))
      .resolves.toEqual({ error: 'Acceso denegado' })
    await expect(registrarWalkover({ partidoId: 'partido-1', ganadorId: 'jugador-a' }))
      .resolves.toEqual({ error: 'Acceso denegado' })
  })

  it('rechaza un ganador ajeno al partido', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'partido-1', jugador_a_id: 'a', jugador_b_id: 'b', estado: 'programado' },
    })
    const selectChain = { eq: vi.fn().mockReturnThis(), single }
    const update = vi.fn()
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => selectChain), update })) }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-1' })

    const resultado = await registrarWalkover({ partidoId: 'partido-1', ganadorId: 'externo' })

    expect(resultado).toEqual({ error: 'El ganador del walkover debe ser uno de los dos jugadores del partido' })
    expect(update).not.toHaveBeenCalled()
  })

  it('evita confirmar dos veces el mismo walkover', async () => {
    const selectSingle = vi.fn().mockResolvedValue({
      data: { id: 'partido-1', jugador_a_id: 'a', jugador_b_id: 'b', estado: 'programado' },
    })
    const selectChain = { eq: vi.fn().mockReturnThis(), single: selectSingle }
    const updateSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const updateChain = {
      eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), select: updateSelect,
    }
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
      })),
    }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-1' })

    const resultado = await registrarWalkover({ partidoId: 'partido-1', ganadorId: 'a' })

    expect(resultado).toEqual({ error: 'Este partido ya fue resuelto' })
    expect(updateChain.not).toHaveBeenCalledWith('estado', 'in', '("finalizado","walkover")')
  })
})

// El retiro toca partidos de verdad y no se deshace solo, así que lo que
// importa verificar es a quién le da los puntos y qué NO toca.
describe('retirarJugadorDeLiga', () => {
  beforeEach(() => vi.clearAllMocks())

  function conPendientes(pendientes: Array<{ id: string; jugador_a_id: string; jugador_b_id: string }>) {
    const fake = fakeSupabase({ liga_partidos: pendientes })
    mocks.requireAdminClub.mockResolvedValue({
      error: null, supabase: fake.cliente, clubId: 'club-1', userId: 'u1',
    })
    return fake
  }

  it('en walkover el partido se lo lleva el rival, nunca el que se retira', async () => {
    const fake = conPendientes([
      { id: 'p1', jugador_a_id: 'j1', jugador_b_id: 'rival-A' },
      { id: 'p2', jugador_a_id: 'rival-B', jugador_b_id: 'j1' },
    ])

    const res = await retirarJugadorDeLiga({ ligaId: 'liga-1', jugadorId: 'j1', modo: 'walkover' })

    expect(res).toMatchObject({ success: true, partidosAfectados: 2 })
    const wo = fake.escrituras('liga_partidos').filter(e => e.estado === 'walkover')
    expect(wo.map(e => e.ganador_id)).toEqual(['rival-A', 'rival-B'])
    expect(wo.map(e => e.ganador_id)).not.toContain('j1')
  })

  it('en modo eliminar borra los pendientes en vez de darlos por ganados', async () => {
    const fake = conPendientes([{ id: 'p1', jugador_a_id: 'j1', jugador_b_id: 'rival-A' }])

    const res = await retirarJugadorDeLiga({ ligaId: 'liga-1', jugadorId: 'j1', modo: 'eliminar' })

    expect(res).toMatchObject({ success: true, partidosAfectados: 1 })
    const escrito = fake.escrituras('liga_partidos')
    expect(escrito.some(e => e.estado === 'walkover')).toBe(false)
    expect(escrito.some(e => e.deleted_at)).toBe(true)
  })

  it('deja marcado el retiro para que no vuelva a entrar en el horario', async () => {
    const fake = conPendientes([])

    await retirarJugadorDeLiga({ ligaId: 'liga-1', jugadorId: 'j1', modo: 'walkover' })

    // Restricción total: ninguna fecha, ninguna hora.
    expect(fake.escrituras('liga_restricciones')[0]).toMatchObject({
      liga_id: 'liga-1', jugador_id: 'j1',
      fecha_numero: null, hora_desde: null, hora_hasta: null, motivo: 'retiro',
    })
  })

  it('no escribe nada sobre los partidos si no quedaban pendientes', async () => {
    const fake = conPendientes([])

    const res = await retirarJugadorDeLiga({ ligaId: 'liga-1', jugadorId: 'j1', modo: 'eliminar' })

    expect(res).toMatchObject({ partidosAfectados: 0 })
    expect(fake.escrituras('liga_partidos')).toHaveLength(0)
  })

  it('corta sin autorización', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })
    await expect(retirarJugadorDeLiga({ ligaId: 'l', jugadorId: 'j', modo: 'walkover' }))
      .resolves.toEqual({ error: 'Acceso denegado' })
  })
})

describe('guardarRestriccionesLiga', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no borra los retiros al reemplazar el resto de las restricciones', async () => {
    // Hace falta ver el filtro del borrado, así que acá sí se arma la cadena.
    const bajaChain: any = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ error: null }),
    }
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => bajaChain),
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-1', userId: 'u1' })

    await guardarRestriccionesLiga({ ligaId: 'liga-1', restricciones: [] })

    expect(bajaChain.or).toHaveBeenCalledWith('motivo.is.null,motivo.neq.retiro')
  })

  it('guarda lo que le mandan, con quién lo cargó', async () => {
    const fake = fakeSupabase()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: fake.cliente, clubId: 'club-1', userId: 'u1' })

    await guardarRestriccionesLiga({
      ligaId: 'liga-1',
      restricciones: [{ jugadorId: 'j1', fechaNumero: 3, horaDesde: null, horaHasta: null }],
    })

    expect(fake.escrituras('liga_restricciones')).toContainEqual(
      expect.objectContaining({ jugador_id: 'j1', fecha_numero: 3, creado_por: 'u1' }),
    )
  })

  it('rechaza un horario al revés en vez de guardar algo injugable', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: {}, clubId: 'club-1', userId: 'u1' })

    const res = await guardarRestriccionesLiga({
      ligaId: 'liga-1',
      restricciones: [{ jugadorId: 'j1', fechaNumero: null, horaDesde: '15:00', horaHasta: '10:00' }],
    })

    expect(res.error).toMatch(/al rev/i)
  })

  it('rechaza una hora con formato inválido en vez de guardarla y romper el motor', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: {}, clubId: 'club-1', userId: 'u1' })

    const res = await guardarRestriccionesLiga({
      ligaId: 'liga-1',
      restricciones: [{ jugadorId: 'j1', fechaNumero: null, horaDesde: '25:90', horaHasta: null }],
    })

    expect(res.error).toMatch(/hora inválida/i)
  })

  it('rechaza un número de fecha que no es un entero positivo', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: {}, clubId: 'club-1', userId: 'u1' })

    const res = await guardarRestriccionesLiga({
      ligaId: 'liga-1',
      restricciones: [{ jugadorId: 'j1', fechaNumero: -3, horaDesde: null, horaHasta: null }],
    })

    expect(res.error).toMatch(/número de fecha/i)
  })

  it('corta sin autorización', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })
    await expect(guardarRestriccionesLiga({ ligaId: 'l', restricciones: [] }))
      .resolves.toEqual({ error: 'Acceso denegado' })
  })
})

describe('reprogramarFechasPendientes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('avisa en vez de romper cuando no queda ninguna fecha por jugar', async () => {
    const fake = fakeSupabase({ liga_fechas: [] })
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: fake.cliente, clubId: 'club-1', userId: 'u1' })

    const res = await reprogramarFechasPendientes({ ligaId: 'liga-1' })

    expect(res.error).toMatch(/no quedan fechas/i)
    // Y sobre todo: no soltó ningún partido.
    expect(fake.escrituras('liga_partidos')).toHaveLength(0)
  })

  it('sólo suelta partidos de fechas que todavía no arrancaron, y no toca lo resuelto', async () => {
    // El update corta con error para poder mirar los filtros sin entrar en la
    // programación entera, que no es lo que se está probando acá.
    const liberarChain: any = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'corte del test' } }),
    }
    const fechasChain: any = {
      eq: vi.fn(() => fechasChain),
      then: (res: any) => Promise.resolve({ data: [{ id: 'f4', numero: 4 }], error: null }).then(res),
    }
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => fechasChain),
        update: vi.fn(() => liberarChain),
      })),
    }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-1', userId: 'u1' })

    await reprogramarFechasPendientes({ ligaId: 'liga-1' })

    // Pide sólo las fechas que no arrancaron: ni en juego ni terminadas.
    expect(fechasChain.eq).toHaveBeenCalledWith('estado', 'programada')
    // Y de esas, deja quieto lo ya resuelto.
    expect(liberarChain.not).toHaveBeenCalledWith('estado', 'in', '("finalizado","walkover")')
    expect(liberarChain.is).toHaveBeenCalledWith('deleted_at', null)
    // Sólo las fechas libres, no todas.
    expect(liberarChain.in).toHaveBeenCalledWith('fecha_id', ['f4'])
  })

  it('lo que suelta es la fecha, la mesa, el bloque y el árbitro', async () => {
    const fake = fakeSupabase({ liga_fechas: [{ id: 'f4', numero: 4 }] })
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: fake.cliente, clubId: 'club-1', userId: 'u1' })

    await reprogramarFechasPendientes({ ligaId: 'liga-1' })

    expect(fake.escrituras('liga_partidos')).toContainEqual(
      expect.objectContaining({ fecha_id: null, mesa_id: null, bloque_horario: null, arbitro_id: null }),
    )
  })

  it('corta sin autorización', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })
    const res = await reprogramarFechasPendientes({ ligaId: 'l' })
    expect(res.error).toBe('Acceso denegado')
  })
})

// El drag & drop manual era el único hueco: HC-01/03/04 se validaban, pero
// nada impedía dejar a un jugador esperando 2+ partidos al arrastrar.
describe('moverPartidoLiga — respeta el hueco máximo', () => {
  beforeEach(() => vi.clearAllMocks())

  function armar() {
    return fakeSupabase({
      liga_partidos: [
        // El partido que se mueve. `single()` toma el primer elemento.
        { id: 'p1', liga_id: 'liga-1', jugador_a_id: 'A', jugador_b_id: 'B', arbitro_id: null,
          fecha_id: 'f1', mesa_id: 'm1', bloque_horario: '09:00' },
        // Otro partido de la misma fecha: A ya jugó a las 09:00.
        { id: 'p2', fecha_id: 'f1', mesa_id: 'm1', bloque_horario: '09:00', jugador_a_id: 'A', jugador_b_id: 'X', arbitro_id: null },
      ],
      liga_mesas: { id: 'm1', liga_id: 'liga-1' },
      liga_fechas: { id: 'f1', liga_id: 'liga-1', estado: 'programada' },
      ligas: { bloque_minutos: 30 },
    })
  }

  it('rechaza moverlo a un bloque que deja a A esperando más de un partido', async () => {
    const fake = armar()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: fake.cliente, clubId: 'club-1' })

    // 09:00 -> 11:00 son 4 bloques de 30 min: quedan 3 vacíos en el medio.
    const res = await moverPartidoLiga({ partidoId: 'p1', fechaId: 'f1', mesaId: 'm1', bloqueHorario: '11:00' })

    expect(res.error).toMatch(/esperando/i)
  })

  it('permite moverlo a un bloque con hueco de a lo sumo un partido', async () => {
    const fake = armar()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: fake.cliente, clubId: 'club-1' })

    // 09:00 -> 10:00: un solo bloque vacío (09:30) en el medio.
    const res = await moverPartidoLiga({ partidoId: 'p1', fechaId: 'f1', mesaId: 'm1', bloqueHorario: '10:00' })

    expect(res).toEqual({ success: true })
  })
})

describe('asignarPartidoManual', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no reasigna un partido que fue borrado (soft delete)', async () => {
    // El select del partido debe filtrar deleted_at IS NULL: sin ese filtro,
    // un partido eliminado podía "resucitar" al asignarlo a mano.
    const selectChain: any = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => selectChain) })) }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-1' })

    const res = await asignarPartidoManual({ partidoId: 'p1', fechaId: 'f1', bloqueHorario: '09:00' })

    expect(selectChain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(res).toEqual({ error: 'Partido no encontrado' })
  })

  it('corta sin autorización', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })
    await expect(asignarPartidoManual({ partidoId: 'p', fechaId: 'f', bloqueHorario: '09:00' }))
      .resolves.toEqual({ error: 'Acceso denegado' })
  })
})
