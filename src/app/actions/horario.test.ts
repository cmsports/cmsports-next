import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type FakeSupabase } from '@/lib/test/fakeSupabase'

const mocks = vi.hoisted(() => ({ crear: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.crear }))

import { asignarBloquesJugador, generarSemana, guardarGrupo, marcarDiaSinClase } from './horario'

const BLOQUES = [
  { id: 'b-lun', grupo_id: 'g1', nombre: 'Todo Público 1', sede: 'buin', dia_semana: 'lun', hora_inicio: '16:30', hora_fin: '18:30', vigente_hasta: null },
  { id: 'b-mar', grupo_id: 'g1', nombre: 'Menores Avanzado', sede: 'buin', dia_semana: 'mar', hora_inicio: '17:00', hora_fin: '19:00', vigente_hasta: null },
]

let fake: FakeSupabase

function conBase(respuestas = {}, usuario = { id: 'u1', club_id: 'club-1', rol: 'admin' } as { id?: string; club_id: string | null; rol: string | null } | null) {
  fake = fakeSupabase(respuestas, usuario)
  mocks.crear.mockResolvedValue(fake.cliente)
  return fake
}

beforeEach(() => { vi.clearAllMocks(); conBase() })

describe('generarSemana', () => {
  // El bug: la tabla de clases exige el nombre largo del día ('lunes') y el
  // horario semanal trabaja con el corto ('lun'). Mandaba el corto y la base
  // rechazaba las 20 filas. Nadie lo notó porque nunca se había usado.
  it('escribe el día en el formato que acepta la tabla de clases', async () => {
    conBase({ bloques_horario: BLOQUES, bloque_profesores: [], clases: [{ id: 'c1' }, { id: 'c2' }] })

    await generarSemana({ fechas: ['2026-08-03', '2026-08-04'], publicar: false })

    const dias = fake.escrituras('clases').map(f => f.dia_semana)
    expect(dias).toEqual(['lunes', 'martes'])
    expect(dias).not.toContain('lun')
  })

  it('apunta el upsert al índice de bloque y fecha, para poder repetirlo', async () => {
    conBase({ bloques_horario: BLOQUES, bloque_profesores: [], clases: [] })

    await generarSemana({ fechas: ['2026-08-03'], publicar: false })

    const upsert = fake.llamadas.find(l => l.tabla === 'clases' && l.op === 'upsert')
    expect(upsert?.opciones).toMatchObject({ onConflict: 'bloque_id,fecha', ignoreDuplicates: true })
  })

  it('deja fuera los fines de semana', async () => {
    conBase({ bloques_horario: BLOQUES, bloque_profesores: [], clases: [] })

    await generarSemana({ fechas: ['2026-08-08', '2026-08-09'], publicar: false })   // sábado y domingo

    expect(await generarSemana({ fechas: ['2026-08-08'], publicar: false }))
      .toEqual({ error: 'No hay bloques para los días elegidos' })
  })

  it('no acepta una tanda desmedida', async () => {
    // Tienen que ser distintas: la acción deduplica antes de contar.
    const muchas = Array.from({ length: 61 }, (_, i) => {
      const d = new Date(2026, 7, 1)
      d.setDate(d.getDate() + i)
      return d.toISOString().slice(0, 10)
    })
    expect(new Set(muchas).size).toBe(61)
    expect(await generarSemana({ fechas: muchas, publicar: false }))
      .toEqual({ error: 'Demasiados días de una vez (máximo 60)' })
  })

  it('rechaza al que no es del staff sin tocar la base', async () => {
    conBase({}, { club_id: 'club-1', rol: 'jugador' })
    expect(await generarSemana({ fechas: ['2026-08-03'], publicar: false })).toEqual({ error: 'Acceso denegado' })
    expect(fake.escrituras('clases')).toEqual([])
  })
})

describe('guardarGrupo', () => {
  const base = {
    nombre: 'Menores Avanzado', sede: 'buin',
    cupoMaximo: 12, cupoLibres: 5, profesorIds: [],
    dias: [{ dia_semana: 'mar', hora_inicio: '17:00', hora_fin: '19:00' }],
  }

  it('crea el grupo y sus días de una vez', async () => {
    conBase({ grupos_entrenamiento: { id: 'g-nuevo' }, bloques_horario: [], bloque_profesores: [] })

    const res = await guardarGrupo(base)

    expect(res).toMatchObject({ success: true })
    const dias = fake.escrituras('bloques_horario')
    expect(dias).toHaveLength(1)
    expect(dias[0]).toMatchObject({ dia_semana: 'mar', hora_inicio: '17:00', cupo_maximo: 12 })
  })

  it('cada día lleva su propio horario', async () => {
    conBase({ grupos_entrenamiento: { id: 'g-nuevo' }, bloques_horario: [], bloque_profesores: [] })

    // En Buin el lunes parte 16:30 y el martes 17:00: por eso la hora no puede
    // vivir en el grupo.
    await guardarGrupo({ ...base, dias: [
      { dia_semana: 'lun', hora_inicio: '16:30', hora_fin: '18:30' },
      { dia_semana: 'mar', hora_inicio: '17:00', hora_fin: '19:00' },
    ] })

    const horas = fake.escrituras('bloques_horario').map(d => `${d.dia_semana} ${d.hora_inicio}`)
    expect(horas).toEqual(['lun 16:30', 'mar 17:00'])
  })

  it('el día que se destilda se cierra, no se borra', async () => {
    conBase({
      grupos_entrenamiento: { id: 'g1' },
      bloques_horario: [{ id: 'b-vie', dia_semana: 'vie', vigente_hasta: null }],
      bloque_profesores: [],
    })

    await guardarGrupo({ ...base, grupoId: 'g1' })   // solo pide el martes

    const cierres = fake.llamadas.filter(l => l.tabla === 'bloques_horario' && l.op === 'update')
    expect(cierres.some(c => (c.datos as Record<string, unknown>).vigente_hasta)).toBe(true)
    expect(fake.llamadas.some(l => l.tabla === 'bloques_horario' && l.op === 'delete')).toBe(false)
  })

  it('al cerrar un día cierra también sus inscripciones', async () => {
    conBase({
      grupos_entrenamiento: { id: 'g1' },
      bloques_horario: [{ id: 'b-vie', dia_semana: 'vie', vigente_hasta: null }],
      bloque_profesores: [],
    })

    await guardarGrupo({ ...base, grupoId: 'g1' })

    expect(fake.llamadas.some(l => l.tabla === 'bloque_jugadores' && l.op === 'update')).toBe(true)
  })

  it('no deja un grupo sin días', async () => {
    expect(await guardarGrupo({ ...base, dias: [] })).toEqual({ error: 'Marcá al menos un día' })
  })

  it('no deja una hora de fin anterior a la de inicio', async () => {
    const res = await guardarGrupo({ ...base, dias: [{ dia_semana: 'mar', hora_inicio: '19:00', hora_fin: '17:00' }] })
    expect(res.error).toContain('posterior')
  })

  it('no deja un nombre en blanco', async () => {
    expect(await guardarGrupo({ ...base, nombre: '   ' })).toEqual({ error: 'El nombre del grupo es obligatorio' })
  })
})

describe('asignarBloquesJugador', () => {
  it('no borra y reinserta: calcula la diferencia', async () => {
    // Ya está en lun y mar; se pide lun y vie. Solo debería cerrar el martes y
    // abrir el viernes, dejando el lunes intacto con su fecha de inicio.
    conBase({
      jugadores: { id: 'j1', club_id: 'club-1', horario: null },
      bloques_horario: [
        { id: 'b-lun', sede: 'buin', dia_semana: 'lun', hora_inicio: '16:30', hora_fin: '18:30' },
        { id: 'b-vie', sede: 'buin', dia_semana: 'vie', hora_inicio: '16:30', hora_fin: '18:30' },
      ],
      bloque_jugadores: [
        { id: 'i-lun', bloque_id: 'b-lun' },
        { id: 'i-mar', bloque_id: 'b-mar' },
      ],
    })

    await asignarBloquesJugador({ jugadorId: 'j1', bloqueIds: ['b-lun', 'b-vie'] })

    // Solo se abre el viernes…
    const nuevas = fake.escrituras('bloque_jugadores').filter(e => e.bloque_id)
    expect(nuevas.map(n => n.bloque_id)).toEqual(['b-vie'])

    // …y se cierra el martes. Sin esto, el test pasaba aunque el cierre no
    // ocurriera y el jugador quedara en un grupo del que ya salió.
    const cierres = fake.llamadas.filter(l => l.tabla === 'bloque_jugadores' && l.op === 'update')
    expect(cierres).toHaveLength(1)
    expect(cierres[0].datos).toMatchObject({ vigente_hasta: expect.any(String) })

    // Y nada se borra: el lunes conserva desde cuándo está.
    expect(fake.llamadas.some(l => l.tabla === 'bloque_jugadores' && l.op === 'delete')).toBe(false)
  })

  it('los días y la sede de la ficha salen de los bloques', async () => {
    conBase({
      jugadores: { id: 'j1', club_id: 'club-1' },
      bloques_horario: [
        { id: 'b-lun', sede: 'buin',  dia_semana: 'lun', hora_inicio: '16:30', hora_fin: '18:30' },
        { id: 'b-vie', sede: 'paine', dia_semana: 'vie', hora_inicio: '18:30', hora_fin: '20:30' },
      ],
      bloque_jugadores: [],
    })

    await asignarBloquesJugador({ jugadorId: 'j1', bloqueIds: ['b-lun', 'b-vie'] })

    const ficha = fake.escrituras('jugadores')[0]
    expect(ficha).toMatchObject({
      entrena_lun: true, entrena_vie: true,
      entrena_mar: false, entrena_mie: false, entrena_jue: false,
      sede: 'ambos',   // está en las dos
    })
  })

  it('rechaza un bloque que no es del club', async () => {
    conBase({
      jugadores: { id: 'j1', club_id: 'club-1' },
      bloques_horario: [{ id: 'b-lun', sede: 'buin', dia_semana: 'lun', hora_inicio: '16:30', hora_fin: '18:30' }],
      bloque_jugadores: [],
    })

    const res = await asignarBloquesJugador({ jugadorId: 'j1', bloqueIds: ['b-lun', 'b-ajeno'] })
    expect(res).toEqual({ error: 'Alguno de los bloques no es de este club' })
  })

  it('dejarlo sin ningún grupo es válido y le apaga todos los días', async () => {
    conBase({
      jugadores: { id: 'j1', club_id: 'club-1' },
      bloque_jugadores: [{ id: 'i-lun', bloque_id: 'b-lun' }],
    })

    await asignarBloquesJugador({ jugadorId: 'j1', bloqueIds: [] })

    const ficha = fake.escrituras('jugadores')[0]
    expect(ficha).toMatchObject({ entrena_lun: false, entrena_vie: false, horario: null })
    // Sin bloques no se toca la sede: no se sabe dónde entrenaba.
    expect(ficha).not.toHaveProperty('sede')
  })
})

describe('marcarDiaSinClase', () => {
  it('marca todos los grupos que funcionan ese día', async () => {
    conBase({ bloques_horario: [{ id: 'b1' }, { id: 'b2' }], bloque_excepciones: [] })

    const res = await marcarDiaSinClase({ fecha: '2026-09-18', motivo: 'feriado' })

    expect(res).toMatchObject({ success: true, grupos: 2 })
    expect(fake.escrituras('bloque_excepciones').map(e => e.bloque_id)).toEqual(['b1', 'b2'])
  })

  it('el fin de semana no tiene clases que suspender', async () => {
    const res = await marcarDiaSinClase({ fecha: '2026-08-09' })   // domingo
    expect(res).toEqual({ error: 'El club no abre los fines de semana' })
  })

  it('deshacer borra la excepción', async () => {
    conBase({ bloques_horario: [{ id: 'b1' }] })

    const res = await marcarDiaSinClase({ fecha: '2026-09-18', deshacer: true })

    expect(res).toMatchObject({ deshecho: true })
    expect(fake.llamadas.some(l => l.tabla === 'bloque_excepciones' && l.op === 'delete')).toBe(true)
  })
})
