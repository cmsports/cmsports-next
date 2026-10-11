import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.auth, requireGestorTorneos: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/supabase/exportacionPartidosModulo', () => ({ moduloExportacionPartidos: async () => ({ habilitado: false }) }))
import { cerrarInscripcionYGenerarGrupos, sincronizarLlaves, marcarGanadorPartido, finalizarTorneo, inscribirEnMesa, quitarJugadorDeMesa, actualizarEstadoPago } from './torneos'

// Ejecuta las acciones reales; solo sustituye el transporte y almacenamiento.
// No reproduce RLS, triggers ni transacciones de PostgreSQL.
type Fila = Record<string, any>
function base(tablas: Record<string, Fila[]>, fallaLectura = 0, falloEscritura?: { tabla: string; op: string; saltar?: number }) {
  let secuencia = Math.max(0, ...Object.values(tablas).flat().map(f => Number(String(f.id).replace('gen-', '')) || 0))
  let lecturas = 0
  const borrados: string[] = []
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
      if (falloEscritura && tabla === falloEscritura.tabla && op === falloEscritura.op) {
        if ((falloEscritura.saltar ?? 0) > 0) falloEscritura.saltar = (falloEscritura.saltar ?? 0) - 1
        else { falloEscritura = undefined; return { data: null, error: { message: 'Escritura interrumpida' } } }
      }
      if (op === 'select' && ++lecturas === fallaLectura) return { data: null, error: { message: 'Lectura interrumpida' } }
      const filas = tablas[tabla] ||= []
      let data = filas.filter(f => filtros.every(p => p(f)))
      if (op === 'insert') {
        const nuevas = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: `gen-${++secuencia}`, ...(tabla === 'torneo_pagos' ? { subido_a_finanzas: false } : {}), ...p }))
        if (tabla === 'torneo_partidos' && nuevas.some(n => filas.some(f => f.torneo_id === n.torneo_id && f.fase === n.fase && f.orden === n.orden))) {
          return { data: null, error: { code: '23505' } }
        }
        if (tabla === 'torneo_pagos' && nuevas.some(n => filas.some(f => f.torneo_id === n.torneo_id && f.jugador_id === n.jugador_id))) {
          return { data: null, error: { code: '23505', message: 'Pago duplicado' } }
        }
        filas.push(...nuevas)
        data = nuevas
      }
      if (op === 'update') data.forEach(f => Object.assign(f, payload))
      if (op === 'delete') {
        borrados.push(tabla)
        tablas[tabla] = filas.filter(f => !data.includes(f))
      }
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
  return { from, borrados }
}

function escenario(n: number, cabezas = 0, tipo = 'externo'): Record<string, Fila[]> {
  const jugadores = Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, nombre: `Participante ${i + 1}`, club_id: 'club', es_externo: i % 3 !== 0 }))
  return {
    torneos: [{ id: 't', club_id: 'club', tipo, formato: 'grupos', estado: 'en_curso', fase: 'inscripcion', formato_grupos: 'bo5', formato_llave: 'bo5' }],
    jugadores,
    torneo_grupos: [{ id: 'mesa', torneo_id: 't', nombre: 'MESA' }],
    grupo_jugadores: jugadores.map((j, i) => ({ id: `m${i}`, grupo_id: 'mesa', jugador_id: j.id, club_procedencia: j.es_externo ? `Club ${i % 4}` : null })),
    torneo_cabezas_serie: jugadores.slice(0, cabezas).map((j, i) => ({ torneo_id: 't', jugador_id: j.id, numero: i + 1 })),
    torneo_partidos: [],
  }
}
function montar(tablas: Record<string, Fila[]>) {
  const db = base(tablas)
  mocks.auth.mockResolvedValue({ supabase: db, perfil: { club_id: 'club' }, error: null })
  mocks.admin.mockReturnValue(db)
  return db
}
beforeEach(() => vi.clearAllMocks())

// Tamaños y cantidades de cabezas observados el 11 de octubre, sin datos personales.
describe('simulaciones de grupos → llaves → campeón → cierre', () => {
  it.each(['externo', 'interno'].flatMap(tipo =>
    [[29, 0], [11, 0], [12, 0], [14, 5], [7, 3], [20, 2], [25, 2], [30, 2], [64, 4], [128, 8]]
      .map(([n, cabezas]) => ({ tipo, n, cabezas })),
  ))('$tipo: $n inscritos y $cabezas cabezas', async ({ tipo, n, cabezas }) => {
    const tablas = escenario(n, cabezas, tipo)
    montar(tablas)
    const clubes = new Map(tablas.grupo_jugadores.map(m => [m.jugador_id, m.club_procedencia]))
    expect((await cerrarInscripcionYGenerarGrupos({ torneoId: 't' })).error).toBeUndefined()
    expect(tablas.grupo_jugadores).toHaveLength(n)
    expect(new Set(tablas.grupo_jugadores.map(m => m.jugador_id)).size).toBe(n)
    for (const m of tablas.grupo_jugadores) expect(m.club_procedencia).toBe(clubes.get(m.jugador_id))
    const jugar = async (p: Fila) => {
      const ganaA = Number(p.jugador_a.slice(1)) < Number(p.jugador_b.slice(1))
      const res = await marcarGanadorPartido({ partidoId: p.id, setsA: ganaA ? 3 : 0, setsB: ganaA ? 0 : 3 })
      expect('error' in res ? res.error : undefined).toBeUndefined()
    }
    for (const p of tablas.torneo_partidos.filter(p => p.fase === 'grupos')) await jugar(p)
    expect((await sincronizarLlaves({ torneoId: 't' })).error).toBeUndefined()
    for (let paso = 0; paso < n * 2; paso++) {
      const siguiente = tablas.torneo_partidos.find(p => p.fase !== 'grupos' && !p.ganador && p.jugador_a && p.jugador_b)
      if (!siguiente) break
      await jugar(siguiente)
    }
    const finales = tablas.torneo_partidos.filter(p => p.fase === 'final')
    expect(finales).toHaveLength(1)
    expect(finales[0].ganador).toBe('j1')
    expect(tablas.torneo_partidos.every(p => p.ganador)).toBe(true)
    expect(await finalizarTorneo({ torneoId: 't' })).toEqual({ success: true })
    expect(tablas.torneos[0].campeon_id).toBe('j1')
    expect(tablas.torneos[0].estado).toBe('finalizado')
    expect(tablas.grupo_jugadores).toHaveLength(n)
    expect(tablas.jugadores).toHaveLength(n)
  })
})

function paraCerrar() {
  const t = escenario(4)
  t.torneo_partidos.push({ id: 'final', torneo_id: 't', fase: 'final', orden: 0, jugador_a: 'j1', jugador_b: 'j2', ganador: 'j1' })
  return t
}
describe('limpieza de externos al finalizar', () => {
  it.each([1, 2, 3, 4])('si falla la lectura %i no borra fichas ni inscripciones', async falla => {
    const t = paraCerrar()
    montar(t)
    const admin = base(t, falla)
    mocks.admin.mockReturnValue(admin)
    const res = await finalizarTorneo({ torneoId: 't' })
    expect(res).toMatchObject({ success: true, aviso: expect.stringContaining('Lectura interrumpida') })
    expect(admin.borrados).toEqual([])
    expect(t.jugadores).toHaveLength(4)
    expect(t.grupo_jugadores).toHaveLength(4)
  })
  it('protege a la visita que todavía participa en otro torneo', async () => {
    const t = paraCerrar()
    t.torneo_grupos.push({ id: 'otra-mesa', torneo_id: 'otro', nombre: 'MESA' })
    t.grupo_jugadores.push({ id: 'otra-inscripcion', grupo_id: 'otra-mesa', jugador_id: 'j3' })
    montar(t)
    expect(await finalizarTorneo({ torneoId: 't' })).toEqual({ success: true })
    expect(t.jugadores.some(j => j.id === 'j3')).toBe(true)
    expect(t.grupo_jugadores.filter(m => m.jugador_id === 'j3')).toHaveLength(2)
  })
})


describe('inscripción y pagos conservados tras un retiro', () => {
  const inscribir = (metodoPago: 'efectivo' | 'transferencia' | 'pendiente' = 'pendiente') => inscribirEnMesa({
    torneoId: 't', jugadorId: 'j1', busqueda: 'Participante 1', rut: '', metodoPago, clubProcedencia: 'Club visitante',
  })
  it.each(['pendiente', 'pagado', 'exento'])('reinscribe conservando un pago %s, sin duplicarlo', async estado => {
    const t = escenario(4)
    t.torneos[0].cuota_inscripcion = 3000
    t.torneo_pagos = [{ id: 'pago', torneo_id: 't', jugador_id: 'j1', estado, metodo_pago: estado === 'pagado' ? 'efectivo' : null, subido_a_finanzas: estado === 'pagado' }]
    const previo = structuredClone(t.torneo_pagos)
    montar(t)
    expect(await quitarJugadorDeMesa({ torneoId: 't', jugadorId: 'j1' })).toEqual({ success: true })
    expect(await inscribir()).toMatchObject({ success: true, aviso: expect.stringContaining(estado) })
    expect(t.grupo_jugadores.filter(m => m.jugador_id === 'j1')).toHaveLength(1)
    expect(t.torneo_pagos).toEqual(previo)
    expect(t.grupo_jugadores.find(m => m.jugador_id === 'j1')?.club_procedencia).toBe('Club visitante')
  })
  it('cobra por transferencia al reinscribir una deuda pendiente', async () => {
    const t = escenario(4)
    t.torneos[0].cuota_inscripcion = 3000
    t.torneo_pagos = [{ id: 'pago', torneo_id: 't', jugador_id: 'j1', estado: 'pendiente', subido_a_finanzas: false }]
    montar(t)
    await quitarJugadorDeMesa({ torneoId: 't', jugadorId: 'j1' })
    expect(await inscribir('transferencia')).toMatchObject({ success: true })
    expect(t.torneo_pagos).toHaveLength(1)
    expect(t.torneo_pagos[0]).toMatchObject({ estado: 'pagado', metodo_pago: 'transferencia', subido_a_finanzas: false })
  })
  it('crea exactamente un pago al inscribir a alguien sin historial', async () => {
    const t = escenario(4)
    t.torneos[0].cuota_inscripcion = 3000
    montar(t)
    await quitarJugadorDeMesa({ torneoId: 't', jugadorId: 'j1' })
    expect(await inscribir('efectivo')).toMatchObject({ success: true })
    expect(t.torneo_pagos).toHaveLength(1)
    expect(t.torneo_pagos[0]).toMatchObject({ estado: 'pagado', metodo_pago: 'efectivo' })
    expect(await inscribir('efectivo')).toMatchObject({ error: expect.stringContaining('ya está inscrito') })
    expect(t.torneo_pagos).toHaveLength(1)
  })
  it('no modifica un pago que ya fue traspasado a Finanzas', async () => {
    const t = escenario(4)
    t.torneo_pagos = [{ id: 'pago', torneo_id: 't', jugador_id: 'j1', estado: 'pagado', metodo_pago: 'efectivo', subido_a_finanzas: true }]
    montar(t)
    const previo = structuredClone(t.torneo_pagos)
    expect(await actualizarEstadoPago({ torneoId: 't', jugadorId: 'j1', estado: 'pendiente' }))
      .toMatchObject({ error: expect.stringContaining('ya está en Finanzas') })
    expect(t.torneo_pagos).toEqual(previo)
  })
  it('una lectura fallida de pagos no crea otro pago ni borra el anterior', async () => {
    const t = escenario(4)
    const db = base(t, 1)
    mocks.auth.mockResolvedValue({ supabase: db, perfil: { club_id: 'club' }, error: null })
    expect(await actualizarEstadoPago({ torneoId: 't', jugadorId: 'j1', estado: 'pagado' }))
      .toMatchObject({ error: expect.stringContaining('Lectura interrumpida') })
    expect(t.torneo_pagos).toBeUndefined()
    expect(db.borrados).toEqual([])
  })
})


describe('generación recuperable tras una interrupción', () => {
  it.each(['torneo_grupos', 'grupo_jugadores', 'torneo_partidos'])('no pierde inscritos si falla el INSERT de %s', async tabla => {
    const t = escenario(14, 5)
    const db = base(t, 0, { tabla, op: 'insert' })
    mocks.auth.mockResolvedValue({ supabase: db, perfil: { club_id: 'club' }, error: null })
    const clubes = new Map(t.grupo_jugadores.map(m => [m.jugador_id, m.club_procedencia]))
    expect(await cerrarInscripcionYGenerarGrupos({ torneoId: 't' })).toHaveProperty('error')
    expect(new Set(t.grupo_jugadores.map(m => m.jugador_id)).size).toBe(14)
    expect(t.grupo_jugadores.filter(m => m.grupo_id === 'mesa')).toHaveLength(14)
    expect((await cerrarInscripcionYGenerarGrupos({ torneoId: 't' })).error).toBeUndefined()
    expect(t.grupo_jugadores).toHaveLength(14)
    for (const m of t.grupo_jugadores) expect(m.club_procedencia).toBe(clubes.get(m.jugador_id))
  })
  it('también conserva inscritos al fallar una regeneración de grupos', async () => {
    const t = escenario(12)
    montar(t)
    expect((await cerrarInscripcionYGenerarGrupos({ torneoId: 't' })).error).toBeUndefined()
    const db = base(t, 0, { tabla: 'torneo_grupos', op: 'insert', saltar: 1 }) // crea MESA, falla el reparto
    mocks.auth.mockResolvedValue({ supabase: db, perfil: { club_id: 'club' }, error: null })
    expect(await cerrarInscripcionYGenerarGrupos({ torneoId: 't' })).toHaveProperty('error')
    expect(new Set(t.grupo_jugadores.map(m => m.jugador_id)).size).toBe(12)
    expect((await cerrarInscripcionYGenerarGrupos({ torneoId: 't' })).error).toBeUndefined()
    expect(t.grupo_jugadores).toHaveLength(12)
  })
})


it('dos torneos simultáneos conservan sus cuadros y a las visitas compartidas', async () => {
  const uno = escenario(11, 2)
  const dos = escenario(14, 3)
  for (const t of dos.torneos) t.id = 'otro'
  for (const g of dos.torneo_grupos) { g.id = 'otra-mesa'; g.torneo_id = 'otro' }
  for (const m of dos.grupo_jugadores) { m.id = `otro-${m.id}`; m.grupo_id = 'otra-mesa' }
  for (const c of dos.torneo_cabezas_serie) c.torneo_id = 'otro'
  const tablas: Record<string, Fila[]> = {}
  for (const key of Object.keys(uno)) tablas[key] = key === 'jugadores' ? dos.jugadores : [...uno[key], ...dos[key]]
  montar(tablas)
  const jugarTorneo = async (torneoId: string) => {
    expect((await cerrarInscripcionYGenerarGrupos({ torneoId })).error).toBeUndefined()
    const jugar = async (p: Fila) => {
      const a = Number(p.jugador_a.slice(1)) < Number(p.jugador_b.slice(1))
      expect(await marcarGanadorPartido({ partidoId: p.id, setsA: a ? 3 : 0, setsB: a ? 0 : 3 })).toMatchObject({ success: true })
    }
    for (const p of tablas.torneo_partidos.filter(p => p.torneo_id === torneoId && p.fase === 'grupos')) await jugar(p)
    expect((await sincronizarLlaves({ torneoId })).error).toBeUndefined()
    for (let i = 0; i < 32; i++) {
      const p = tablas.torneo_partidos.find(p => p.torneo_id === torneoId && p.fase !== 'grupos' && !p.ganador && p.jugador_a && p.jugador_b)
      if (!p) break
      await jugar(p)
    }
    expect(await finalizarTorneo({ torneoId })).toEqual({ success: true })
  }
  await Promise.all([jugarTorneo('t'), jugarTorneo('otro')])
  expect(tablas.torneos.every(t => t.estado === 'finalizado' && t.campeon_id === 'j1')).toBe(true)
  expect(tablas.torneo_partidos.filter(p => p.fase === 'final')).toHaveLength(2)
  expect(tablas.grupo_jugadores).toHaveLength(25)
  expect(tablas.jugadores).toHaveLength(14)
})
