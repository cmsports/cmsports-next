import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireStaffClub: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireStaffClub: mocks.requireStaffClub }))
import { exportarPartidos, puedeExportarPartidos } from './exportacionPartidos'

const ID = '11111111-1111-4111-8111-111111111111'
type Fila = Record<string, unknown>
function db(datos: Record<string, Fila[]>, fallaTabla?: string) {
  const consultas: { tabla: string; filtros: [string, unknown][]; rango?: [number, number]; seleccion?: string }[] = []
  const from = vi.fn((tabla: string) => {
    const consulta: typeof consultas[number] = { tabla, filtros: [] }
    consultas.push(consulta)
    const resultado = () => {
      if (tabla === fallaTabla) return { data: null, error: { message: 'Error de lectura' } }
      let lista = (datos[tabla] ?? []).filter(f => consulta.filtros.every(([k, v]) => f[k] === v))
      if (consulta.rango) lista = lista.slice(consulta.rango[0], consulta.rango[1] + 1)
      return { data: lista, error: null }
    }
    const cadena = {
      select: (seleccion: string) => { consulta.seleccion = seleccion; return cadena },
      eq: (k: string, v: unknown) => { consulta.filtros.push([k, v]); return cadena },
      is: (k: string, v: unknown) => { consulta.filtros.push([k, v]); return cadena },
      order: () => cadena,
      range: (desde: number, hasta: number) => { consulta.rango = [desde, hasta]; return cadena },
      maybeSingle: async () => { const r = resultado(); return { ...r, data: r.data?.[0] ?? null } },
      then: (resolve: (r: ReturnType<typeof resultado>) => unknown) => Promise.resolve(resultado()).then(resolve),
    }
    return cadena
  })
  return { cliente: { from }, consultas }
}

function autorizado(datos: Record<string, Fila[]> = {}, modulos: string[] | null = ['exportacion_partidos'], fallaTabla?: string) {
  const fake = db({ clubes: [{ id: 'spinhouse', modulos_habilitados: modulos }], ...datos }, fallaTabla)
  mocks.requireStaffClub.mockResolvedValue({ error: null, clubId: 'spinhouse', supabase: fake.cliente })
  return fake
}

describe('exportación autenticada y limitada al club', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rechaza a jugadores o sesiones no autorizadas antes de consultar datos', async () => {
    mocks.requireStaffClub.mockResolvedValue({ error: 'Acceso denegado', clubId: null, supabase: null })
    expect(await puedeExportarPartidos()).toBe(false)
    expect(await exportarPartidos({ tipo: 'torneo', competenciaId: ID, formato: 'json' })).toEqual({ error: 'Acceso denegado' })
  })

  it('no se habilita para clubes con lista null ni sin el módulo', async () => {
    for (const lista of [null, [], ['torneos']]) {
      const fake = autorizado({}, lista)
      expect(await puedeExportarPartidos()).toBe(false)
      expect(await exportarPartidos({ tipo: 'torneo', competenciaId: ID, formato: 'json' })).toHaveProperty('error')
      expect(fake.consultas.every(c => c.tabla === 'clubes')).toBe(true)
    }
  })

  it('rechaza ids/formato manipulados sin leer partidos', async () => {
    const fake = autorizado()
    expect(await exportarPartidos({ tipo: 'liga', competenciaId: 'x,club_id.neq.spinhouse', formato: 'csv' })).toHaveProperty('error')
    expect(fake.consultas).toHaveLength(0)
  })

  it('impide pedir una competencia de otro club aunque se conozca su UUID', async () => {
    const fake = autorizado({ torneos: [{ id: ID, club_id: 'otro-club', nombre: 'Privado' }] })
    expect(await exportarPartidos({ tipo: 'torneo', competenciaId: ID, formato: 'json' })).toEqual({ error: 'Torneo no encontrado en tu club' })
    expect(fake.consultas.some(c => c.tabla === 'torneo_partidos')).toBe(false)
    expect(fake.consultas.find(c => c.tabla === 'torneos')?.filtros).toContainEqual(['club_id', 'spinhouse'])
  })

  it('incluye ambos integrantes del dobles y los equipos sin datos de contacto', async () => {
    const fake = autorizado({
      torneos: [{ id: ID, club_id: 'spinhouse', nombre: 'Copa Ñuñoa', formato: 'equipos', fecha_inicio: '2026-10-03', fecha_fin: null }],
      torneo_partidos: [{ id: 'p1', torneo_id: ID, fase: 'grupos', orden: 1010, grupo_id: null,
        jugador_a: 'a', jugador_a2: 'a2', jugador_b: 'b', jugador_b2: 'b2', ganador: 'a',
        ja: { nombre: 'José' }, ja2: { nombre: 'Muñoz' }, jb: { nombre: 'Ana' }, jb2: { nombre: 'Pérez' }, jg: { nombre: 'José' },
        sets_a: 3, sets_b: 0, puntos_a: 33, puntos_b: 0, parciales: [[11, 0], [11, 0], [11, 0]], es_walkover: true,
        encuentro_id: 'e1', numero_en_encuentro: 3, encuentro: { equipo_a_id: 'ea', equipo_b_id: 'eb', ganador_equipo_id: 'ea', ea: { nombre: 'Equipo A' }, eb: { nombre: 'Equipo B' } },
      }],
    })
    const res = await exportarPartidos({ tipo: 'torneo', competenciaId: ID, formato: 'json' })
    if ('error' in res) throw new Error(res.error)
    const archivo = JSON.parse(res.contenido)
    expect(archivo.partidos[0]).toMatchObject({ jugador_a2_id: 'a2', jugador_b2_nombre: 'Pérez', equipo_a_nombre: 'Equipo A', es_walkover: true, estado: 'walkover' })
    expect(archivo.partidos[0].parciales).toEqual([[11, 0], [11, 0], [11, 0]])
    expect(fake.consultas.find(c => c.tabla === 'torneo_partidos')?.seleccion).not.toMatch(/rut|telefono|email|direccion/)
  })

  it('lee más de una página y omite partidos eliminados de la liga', async () => {
    const fila = { liga_id: ID, deleted_at: null, division_id: 'd1', division: { nombre: 'Honor' }, jugador_a_id: 'a', jugador_b_id: 'b', ganador_id: null,
      ja: { nombre: 'José' }, jb: { nombre: 'Ana' }, jg: null, sets_a: null, sets_b: null, puntos_a: null, puntos_b: null, parciales: null,
      es_walkover: false, estado: 'programado', dia_offset: 1, bloque_horario: '15:00:00', jornada: { numero: 1, fecha: '2026-09-12' } }
    const fake = autorizado({ ligas: [{ id: ID, club_id: 'spinhouse', nombre: 'Liga' }], liga_partidos: [
      ...Array.from({ length: 501 }, (_, i) => ({ ...fila, id: `p${i}`, orden_fixture: i })),
      { ...fila, id: 'borrado', deleted_at: '2026-10-01' },
    ] })
    const res = await exportarPartidos({ tipo: 'liga', competenciaId: ID, formato: 'json' })
    if ('error' in res) throw new Error(res.error)
    expect(res.total).toBe(501)
    const archivo = JSON.parse(res.contenido)
    expect(archivo.partidos[0]).toMatchObject({ fecha: '2026-09-13', ronda: 1, parciales: null })
    expect(archivo.partidos.at(-1).id).toBe('p500')
    expect(fake.consultas.filter(c => c.tabla === 'liga_partidos').map(c => c.rango)).toEqual([[0, 499], [500, 999]])
  })

  it('no devuelve un archivo parcial cuando falla una consulta', async () => {
    autorizado({ ligas: [{ id: ID, club_id: 'spinhouse', nombre: 'Liga' }] }, ['exportacion_partidos'], 'liga_partidos')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await exportarPartidos({ tipo: 'liga', competenciaId: ID, formato: 'csv' })).toHaveProperty('error')
    log.mockRestore()
  })
})
