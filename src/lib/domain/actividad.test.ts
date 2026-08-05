import { describe, expect, it } from 'vitest'
import {
  formatearDuracion,
  haceCuanto,
  promedioDiarioPorUsuario,
  rankingModulos,
  rutaRegistrable,
  rutaSinParametros,
  sesionesEnLinea,
  type FilaActividad,
} from './actividad'

const AHORA = new Date('2026-08-05T18:00:00Z') // 14:00 en Chile
const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60_000).toISOString()
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString()

function fila(p: Partial<FilaActividad>): FilaActividad {
  return {
    usuarioId: 'u1', nombre: 'Ana', rol: 'admin', club: 'Club Paine',
    ruta: '/finanzas', modulo: 'finanzas', segundos: 0, ocurridoEn: haceMin(1),
    ...p,
  }
}

describe('rutaSinParametros', () => {
  it('corta la query string —ahí viaja el contenido de la pantalla', () => {
    expect(rutaSinParametros('/jugadores?id=8f3c-uuid&tab=pagos')).toBe('/jugadores')
  })

  it('corta también el hash', () => {
    expect(rutaSinParametros('/finanzas#movimiento-1234')).toBe('/finanzas')
  })

  it('deja intacta una ruta limpia', () => {
    expect(rutaSinParametros('/torneos/abc')).toBe('/torneos/abc')
  })
})

describe('rutaRegistrable', () => {
  it('acepta pantallas normales', () => {
    expect(rutaRegistrable('/dashboard')).toBe(true)
    expect(rutaRegistrable('/torneos/abc')).toBe(true)
  })

  it('descarta las de API', () => {
    expect(rutaRegistrable('/api')).toBe(false)
    expect(rutaRegistrable('/api/pagos')).toBe(false)
  })

  it('descarta el login y el resto de auth', () => {
    expect(rutaRegistrable('/login')).toBe(false)
    expect(rutaRegistrable('/auth/callback')).toBe(false)
  })

  it('descarta assets', () => {
    expect(rutaRegistrable('/logo.png')).toBe(false)
    expect(rutaRegistrable('/_next/static/chunk.js')).toBe(false)
  })

  // Un prefijo ignorado no debe arrastrar rutas que solo empiezan igual.
  it('no confunde /loginzz con /login', () => {
    expect(rutaRegistrable('/loginzz')).toBe(true)
  })
})

describe('sesionesEnLinea', () => {
  it('deja una sola fila por persona: la más reciente', () => {
    const sesiones = sesionesEnLinea([
      fila({ usuarioId: 'u1', ruta: '/dashboard', ocurridoEn: haceMin(4) }),
      fila({ usuarioId: 'u1', ruta: '/finanzas', ocurridoEn: haceMin(1) }),
    ], AHORA)

    expect(sesiones).toHaveLength(1)
    expect(sesiones[0].ruta).toBe('/finanzas')
  })

  it('deja fuera lo que pasó de la ventana de 5 minutos', () => {
    const sesiones = sesionesEnLinea([
      fila({ usuarioId: 'u1', ocurridoEn: haceMin(2) }),
      fila({ usuarioId: 'u2', ocurridoEn: haceMin(9) }),
    ], AHORA)

    expect(sesiones.map(s => s.usuarioId)).toEqual(['u1'])
  })

  it('ordena del más reciente al más antiguo', () => {
    const sesiones = sesionesEnLinea([
      fila({ usuarioId: 'u1', ocurridoEn: haceMin(4) }),
      fila({ usuarioId: 'u2', ocurridoEn: haceMin(1) }),
      fila({ usuarioId: 'u3', ocurridoEn: haceMin(3) }),
    ], AHORA)

    expect(sesiones.map(s => s.usuarioId)).toEqual(['u2', 'u3', 'u1'])
  })

  it('ignora las filas de cuentas ya borradas', () => {
    expect(sesionesEnLinea([fila({ usuarioId: null })], AHORA)).toEqual([])
  })
})

describe('promedioDiarioPorUsuario', () => {
  it('promedia sobre los pares persona-día con actividad', () => {
    // Ana: 600 s hoy. Beto: 200 s hoy. Dos pares → 400 s de promedio.
    const r = promedioDiarioPorUsuario([
      fila({ usuarioId: 'u1', segundos: 400, ocurridoEn: haceMin(10) }),
      fila({ usuarioId: 'u1', segundos: 200, ocurridoEn: haceMin(5) }),
      fila({ usuarioId: 'u2', segundos: 200, ocurridoEn: haceMin(5) }),
    ], AHORA)

    expect(r).toEqual({ segundos: 400, usuarios: 2, dias: 1 })
  })

  it('un mismo usuario en dos días son dos pares, no uno', () => {
    const r = promedioDiarioPorUsuario([
      fila({ usuarioId: 'u1', segundos: 600, ocurridoEn: haceMin(5) }),
      fila({ usuarioId: 'u1', segundos: 200, ocurridoEn: haceDias(3) }),
    ], AHORA)

    expect(r).toEqual({ segundos: 400, usuarios: 1, dias: 2 })
  })

  it('deja fuera lo anterior a la ventana de 30 días', () => {
    const r = promedioDiarioPorUsuario([
      fila({ usuarioId: 'u1', segundos: 100, ocurridoEn: haceMin(5) }),
      fila({ usuarioId: 'u1', segundos: 99_999, ocurridoEn: haceDias(45) }),
    ], AHORA)

    expect(r.segundos).toBe(100)
    expect(r.dias).toBe(1)
  })

  it('sin datos devuelve ceros y no divide por cero', () => {
    expect(promedioDiarioPorUsuario([], AHORA)).toEqual({ segundos: 0, usuarios: 0, dias: 0 })
  })
})

describe('rankingModulos', () => {
  it('suma tiempo y cuenta como visita solo los pings de llegada', () => {
    const r = rankingModulos([
      fila({ modulo: 'finanzas', segundos: 0 }),
      fila({ modulo: 'finanzas', segundos: 60 }),
      fila({ modulo: 'finanzas', segundos: 60 }),
      fila({ modulo: 'torneos', segundos: 0 }),
      fila({ modulo: 'torneos', segundos: 0 }),
      fila({ modulo: 'torneos', segundos: 30 }),
    ])

    expect(r).toEqual([
      { modulo: 'finanzas', segundos: 120, visitas: 1 },
      { modulo: 'torneos', segundos: 30, visitas: 2 },
    ])
  })

  it('agrupa aparte las pantallas sin módulo', () => {
    const r = rankingModulos([
      fila({ modulo: null, ruta: '/dashboard', segundos: 90 }),
      fila({ modulo: 'liga', segundos: 10 }),
    ])

    expect(r[0]).toEqual({ modulo: null, segundos: 90, visitas: 0 })
  })

  it('empatados en segundos, el orden es estable por nombre', () => {
    const r = rankingModulos([
      fila({ modulo: 'tienda', segundos: 50 }),
      fila({ modulo: 'liga', segundos: 50 }),
    ])

    expect(r.map(m => m.modulo)).toEqual(['liga', 'tienda'])
  })
})

describe('formatearDuracion', () => {
  it('bajo el minuto muestra segundos', () => {
    expect(formatearDuracion(40)).toBe('40 s')
  })

  it('bajo la hora muestra minutos', () => {
    expect(formatearDuracion(12 * 60 + 30)).toBe('12 min')
  })

  it('sobre la hora muestra horas y minutos con dos dígitos', () => {
    expect(formatearDuracion(2 * 3600 + 5 * 60)).toBe('2 h 05 min')
  })

  it('no muestra duraciones negativas', () => {
    expect(formatearDuracion(-10)).toBe('0 s')
  })
})

describe('haceCuanto', () => {
  it('escala de instantes a días', () => {
    expect(haceCuanto(haceMin(0.2), AHORA)).toBe('hace instantes')
    expect(haceCuanto(haceMin(7), AHORA)).toBe('hace 7 min')
    expect(haceCuanto(haceMin(200), AHORA)).toBe('hace 3 h')
    expect(haceCuanto(haceDias(4), AHORA)).toBe('hace 4 d')
  })
})
