import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.auth, requireGestorTorneos: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/supabase/exportacionPartidosModulo', () => ({ moduloExportacionPartidos: async () => ({ habilitado: false }) }))
import { cerrarInscripcionYGenerarGrupos, sincronizarLlaves, marcarGanadorPartido, finalizarTorneo, retirarJugadorDeTorneo } from './torneos'

/**
 * Retirar a un jugador de un torneo en curso sin dejar partidos contra nadie.
 *
 * Es lo que faltaba cuando "Eliminar jugador" dejó partidos "vs —" en sub19
 * (2026-08-16), TCB (2026-09-06) y TC A / TC B (2026-10-25). Acá se corren las
 * acciones reales sobre tablas en memoria: no reproduce RLS, triggers ni
 * transacciones (el freno de la base lo prueba aparte la migración 306).
 */

type Fila = Record<string, any>
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TORNEO = UUID(900)
const OTRO_TORNEO = UUID(901)

function base(tablas: Record<string, Fila[]>, log: string[]) {
  let secuencia = 1000
  const from = (tabla: string) => {
    let op = 'select'
    let payload: Fila | Fila[] = {}
    let unico = false
    let limite = Infinity
    const filtros: Array<(f: Fila) => boolean> = []
    const ordenes: Array<[string, boolean]> = []
    const completar = (f: Fila): Fila => ({ ...f,
      ...(tabla === 'grupo_jugadores' ? {
        jugadores: tablas.jugadores?.find(j => j.id === f.jugador_id),
        torneo_grupos: tablas.torneo_grupos?.find(g => g.id === f.grupo_id),
      } : {}),
      ...(tabla === 'torneo_partidos' ? { torneos: tablas.torneos?.find(t => t.id === f.torneo_id) } : {}),
    })
    const valor = (f: Fila, col: string) => col.split('.').reduce((v, k) => v?.[k], completar(f))
    const ejecutar = () => {
      const filas = tablas[tabla] ||= []
      let data = filas.filter(f => filtros.every(p => p(f)))
      if (op !== 'select') log.push(`${op} ${tabla} ${Object.keys(Array.isArray(payload) ? payload[0] ?? {} : payload).sort().join(',')}`)
      if (op === 'insert') {
        const nuevas = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: UUID(++secuencia), ...p }))
        filas.push(...nuevas)
        data = nuevas
      }
      if (op === 'update') data.forEach(f => Object.assign(f, payload))
      if (op === 'delete') tablas[tabla] = filas.filter(f => !data.includes(f))
      data = [...data].sort((a, b) => {
        for (const [col, asc] of ordenes) {
          if (a[col] === b[col]) continue
          return ((a[col] ?? 0) > (b[col] ?? 0) ? 1 : -1) * (asc ? 1 : -1)
        }
        return 0
      }).slice(0, limite).map(completar)
      return { data: unico ? data[0] ?? null : data, error: null }
    }
    const q: any = {
      select: () => q,
      insert: (p: Fila | Fila[]) => (op = 'insert', payload = p, q),
      update: (p: Fila) => (op = 'update', payload = p, q),
      delete: () => (op = 'delete', q),
      eq: (c: string, v: unknown) => (filtros.push(f => valor(f, c) === v), q),
      neq: (c: string, v: unknown) => (filtros.push(f => valor(f, c) !== v), q),
      in: (c: string, vs: unknown[]) => (filtros.push(f => vs.includes(valor(f, c))), q),
      is: (c: string, v: unknown) => (filtros.push(f => (valor(f, c) ?? null) === v), q),
      not: (c: string, _op: string, v: unknown) => (filtros.push(f => (valor(f, c) ?? null) !== v), q),
      like: (c: string, v: string) => (filtros.push(f => String(valor(f, c) ?? '').startsWith(v.replace('%', ''))), q),
      order: (c: string, opts?: { ascending?: boolean }) => (ordenes.push([c, opts?.ascending !== false]), q),
      limit: (n: number) => (limite = n, q),
      single: () => (unico = true, q),
      maybeSingle: () => (unico = true, q),
      then: (resolve: any) => resolve(ejecutar()),
    }
    return q
  }
  // El RPC de borrado, con el mismo efecto que eliminar_jugador_atomico sobre
  // las tablas que importan acá.
  const rpc = vi.fn(async (nombre: string, args: { p_jugador_id: string }) => {
    if (nombre !== 'eliminar_jugador_atomico') return { data: null, error: { message: 'rpc desconocido' } }
    const id = args.p_jugador_id
    for (const p of tablas.torneo_partidos) {
      if (p.jugador_a === id) p.jugador_a = null
      if (p.jugador_b === id) p.jugador_b = null
      if (p.ganador === id) p.ganador = null
    }
    tablas.grupo_jugadores = tablas.grupo_jugadores.filter(m => m.jugador_id !== id)
    tablas.jugadores = tablas.jugadores.filter(j => j.id !== id)
    return { data: null, error: null }
  })
  return {
    from, rpc,
    auth: { admin: { deleteUser: vi.fn(async () => ({})) } },
    storage: { from: () => ({ remove: vi.fn(async () => ({})) }) },
  }
}

function escenario(n: number): Record<string, Fila[]> {
  const jugadores = Array.from({ length: n }, (_, i) => ({ id: UUID(i + 1), nombre: `J${i + 1}`, club_id: 'club', es_externo: false }))
  return {
    torneos: [{ id: TORNEO, club_id: 'club', nombre: 'TC prueba', tipo: 'interno', formato: 'grupos', estado: 'en_curso', fase: 'inscripcion', formato_grupos: 'bo5', formato_llave: 'bo5' }],
    jugadores,
    torneo_grupos: [{ id: UUID(500), torneo_id: TORNEO, nombre: 'MESA' }],
    grupo_jugadores: jugadores.map((j, i) => ({ id: UUID(600 + i), grupo_id: UUID(500), jugador_id: j.id })),
    torneo_cabezas_serie: [],
    torneo_partidos: [],
  }
}

let log: string[] = []
function montar(tablas: Record<string, Fila[]>) {
  log = []
  const db = base(tablas, log)
  mocks.auth.mockResolvedValue({ supabase: db, perfil: { club_id: 'club' }, error: null })
  mocks.admin.mockReturnValue(db)
  return db
}

// Lo que buscaría docs/pegar-diagnostico-grupos-torneo.sql: ninguna huella.
function huellas(t: Record<string, Fila[]>) {
  const grupos = t.torneo_grupos.filter(g => g.torneo_id === TORNEO && g.nombre !== 'MESA')
  const out: string[] = []
  for (const g of grupos) {
    const miembros = t.grupo_jugadores.filter(m => m.grupo_id === g.id).map(m => m.jugador_id)
    const ps = t.torneo_partidos.filter(p => p.grupo_id === g.id && p.fase === 'grupos')
    for (const p of ps) {
      if (!p.jugador_a || !p.jugador_b) out.push(`rival vacío en ${g.nombre}`)
      for (const j of [p.jugador_a, p.jugador_b]) if (j && !miembros.includes(j)) out.push(`partido con alguien fuera de ${g.nombre}`)
    }
    for (const m of miembros) {
      const n = ps.filter(p => p.jugador_a === m || p.jugador_b === m).length
      if (n !== miembros.length - 1) out.push(`${m} con ${n} partidos en ${g.nombre}`)
    }
  }
  return out
}

const gana = (p: Fila, ganadorId: string) => marcarGanadorPartido({
  partidoId: p.id, setsA: p.jugador_a === ganadorId ? 3 : 0, setsB: p.jugador_a === ganadorId ? 0 : 3,
})
const numero = (id: string) => Number(id.slice(-12))

async function armarGrupos(t: Record<string, Fila[]>) {
  expect((await cerrarInscripcionYGenerarGrupos({ torneoId: TORNEO })).error).toBeUndefined()
  const grupos = t.torneo_grupos.filter(g => g.torneo_id === TORNEO && g.nombre !== 'MESA')
  const deTres = grupos.find(g => t.grupo_jugadores.filter(m => m.grupo_id === g.id).length === 3)
  expect(deTres, 'el escenario necesita un grupo de 3').toBeTruthy()
  return { grupo: deTres!, miembros: t.grupo_jugadores.filter(m => m.grupo_id === deTres!.id).map(m => m.jugador_id as string) }
}

beforeEach(() => vi.clearAllMocks())

describe('retirarJugadorDeTorneo', () => {
  it('no había jugado: sale del grupo, el grupo se rehace y no queda ninguna huella', async () => {
    const t = escenario(9)
    montar(t)
    const { grupo, miembros } = await armarGrupos(t)
    const r = await retirarJugadorDeTorneo({ torneoId: TORNEO, jugadorId: miembros[0] })
    expect(r).toEqual({ success: true, modo: 'quitado', avisos: [] })
    expect(t.grupo_jugadores.filter(m => m.grupo_id === grupo.id).map(m => m.jugador_id)).toEqual(miembros.slice(1))
    expect(t.torneo_partidos.some(p => p.jugador_a === miembros[0] || p.jugador_b === miembros[0])).toBe(false)
    expect(huellas(t)).toEqual([])
  })

  it('ya había jugado (y ganado): W.O. en lo pendiente, no clasifica, y su ficha se borra al finalizar', async () => {
    const t = escenario(9)
    const db = montar(t)
    const { grupo, miembros: [x, y, z] } = await armarGrupos(t)
    const partidosDe = (a: string, b: string) => t.torneo_partidos.find(p => p.grupo_id === grupo.id
      && ((p.jugador_a === a && p.jugador_b === b) || (p.jugador_a === b && p.jugador_b === a)))!

    // X le gana a Y y se retira. Si contara, X, Y y Z empatarían a 2 pts y el
    // grupo esperaría un desempate a mano.
    expect('error' in await gana(partidosDe(x, y), x)).toBe(false)
    log.length = 0
    const r = await retirarJugadorDeTorneo({ torneoId: TORNEO, jugadorId: x })
    expect(r).toEqual({ success: true, modo: 'retirado', avisos: [] })

    // Primero la marca, después los W.O.
    const marca = log.findIndex(l => l.startsWith('update grupo_jugadores') && l.includes('retirado_en'))
    const primerWO = log.findIndex(l => l.startsWith('update torneo_partidos') && l.includes('es_walkover'))
    expect(marca).toBeGreaterThanOrEqual(0)
    expect(primerWO).toBeGreaterThan(marca)

    const xz = partidosDe(x, z)
    expect(xz.ganador).toBe(z)
    expect(xz.es_walkover).toBe(true)
    expect(partidosDe(x, y).ganador).toBe(x) // lo jugado no se toca
    expect(huellas(t)).toEqual([])

    // Se juega todo lo demás: Y le gana a Z; en los otros grupos gana el número menor.
    expect('error' in await gana(partidosDe(y, z), y)).toBe(false)
    for (const p of t.torneo_partidos.filter(p => p.fase === 'grupos' && !p.ganador)) {
      await gana(p, numero(p.jugador_a) < numero(p.jugador_b) ? p.jugador_a : p.jugador_b)
    }
    expect('error' in await sincronizarLlaves({ torneoId: TORNEO })).toBe(false)
    const llave = t.torneo_partidos.filter(p => p.fase !== 'grupos')
    expect(llave.length).toBeGreaterThan(0)
    expect(llave.some(p => p.jugador_a === x || p.jugador_b === x)).toBe(false)
    const enLlave = new Set(llave.flatMap(p => [p.jugador_a, p.jugador_b]))
    expect(enLlave.has(y) && enLlave.has(z)).toBe(true)

    // "Eliminar jugador" lo dejó programado; al finalizar se borra.
    t.jugadores.find(j => j.id === x)!.borrar_al_finalizar_torneo = true
    for (let paso = 0; paso < 20; paso++) {
      const p = t.torneo_partidos.find(p => p.fase !== 'grupos' && !p.ganador && p.jugador_a && p.jugador_b)
      if (!p) break
      await gana(p, numero(p.jugador_a) < numero(p.jugador_b) ? p.jugador_a : p.jugador_b)
    }
    const fin = await finalizarTorneo({ torneoId: TORNEO })
    expect('error' in fin ? fin.error : undefined).toBeUndefined()
    expect(db.rpc).toHaveBeenCalledWith('eliminar_jugador_atomico', { p_jugador_id: x })
    expect(t.jugadores.some(j => j.id === x)).toBe(false)
  })

  it('su grupo quedaría con un solo jugador activo: se bloquea y no cambia nada', async () => {
    const t = escenario(9)
    montar(t)
    const { grupo, miembros: [x, y, z] } = await armarGrupos(t)
    const xy = t.torneo_partidos.find(p => p.grupo_id === grupo.id && [p.jugador_a, p.jugador_b].includes(x) && [p.jugador_a, p.jugador_b].includes(y))!
    await gana(xy, x)
    expect(await retirarJugadorDeTorneo({ torneoId: TORNEO, jugadorId: x })).toMatchObject({ modo: 'retirado' })
    const antes = JSON.stringify(t)
    const r = await retirarJugadorDeTorneo({ torneoId: TORNEO, jugadorId: y })
    expect('error' in r && r.error).toContain('un solo jugador')
    expect(JSON.stringify(t)).toBe(antes)
    expect(z).toBeTruthy()
  })

  it('al finalizar, no borra la ficha de un retirado que sigue en otro torneo en curso', async () => {
    const t = escenario(4)
    const [a, b] = [t.jugadores[0].id, t.jugadores[1].id]
    t.torneo_partidos.push({ id: UUID(800), torneo_id: TORNEO, fase: 'final', orden: 0, jugador_a: a, jugador_b: b, ganador: a })
    t.jugadores[2].borrar_al_finalizar_torneo = true
    t.torneos.push({ id: OTRO_TORNEO, club_id: 'club', nombre: 'Otro', estado: 'en_curso' })
    t.torneo_grupos.push({ id: UUID(501), torneo_id: OTRO_TORNEO, nombre: 'A' })
    t.grupo_jugadores.push({ id: UUID(700), grupo_id: UUID(501), jugador_id: t.jugadores[2].id })
    const db = montar(t)
    expect(await finalizarTorneo({ torneoId: TORNEO })).toEqual({ success: true })
    expect(db.rpc).not.toHaveBeenCalled()
    expect(t.jugadores).toHaveLength(4)
  })
})
