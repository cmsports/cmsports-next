import { describe, expect, it } from 'vitest'
import { crearLectorConfig, CONFIG_POR_DEFECTO } from './clubConfig'
import {
  conAlgoQueHacer,
  cuotasImpagas,
  debeAlertarPorFaltas,
  debeMarcarseInactivo,
  diasDeMora,
  diasSinMovimiento,
  estadoDeMorosidad,
  faltasSeguidas,
  mensajeFaltasApoderado,
  simular,
  vencimientoDe,
  type Cuota,
} from './retencion'

/** Spinhouse: avisa a los 15, bloquea a los 30, alerta con 3 faltas. */
const spinhouse = crearLectorConfig([
  { clave: 'morosidad.dia_vencimiento', valor: 5 },
  { clave: 'morosidad.dias_aviso', valor: 15 },
  { clave: 'morosidad.dias_bloqueo', valor: 30 },
  { clave: 'retencion.faltas_alerta', valor: 3 },
  { clave: 'retencion.dias_inactivo', valor: 60 },
])

const cuota = (over: Partial<Cuota> = {}): Cuota => ({
  mes: 8, anio: 2026, estado: 'pendiente', monto: 45000, ...over,
})

/**
 * LA prueba de este archivo.
 *
 * Los umbrales en cero significan "nunca", y ese cero es lo único que impide
 * que un club en producción empiece a bloquear alumnos de un día para otro.
 */
describe('con la configuración por defecto NO pasa nada', () => {
  it('nunca bloquea, por muchos días de mora que haya', () => {
    expect(estadoDeMorosidad(CONFIG_POR_DEFECTO, 9999)).toBe('con_deuda')
  })

  it('nunca avisa', () => {
    expect(estadoDeMorosidad(CONFIG_POR_DEFECTO, 500)).not.toBe('para_avisar')
  })

  it('nunca alerta por faltas', () => {
    expect(debeAlertarPorFaltas(CONFIG_POR_DEFECTO, 50)).toBe(false)
  })

  it('nunca marca inactivo', () => {
    expect(debeMarcarseInactivo(CONFIG_POR_DEFECTO, 3650)).toBe(false)
  })

  it('la simulación no propone hacer nada con nadie', () => {
    const veredictos = simular({
      config: CONFIG_POR_DEFECTO,
      hoyISO: '2026-12-31',
      jugadores: [{
        id: 'j1', nombre: 'Deudor Histórico',
        cuotas: [cuota({ mes: 1, anio: 2026 }), cuota({ mes: 2, anio: 2026 })],
        marcas: [
          { fecha: '2026-12-01', estado: 'ausente' },
          { fecha: '2026-12-08', estado: 'ausente' },
          { fecha: '2026-12-15', estado: 'ausente' },
        ],
        ultimaAsistenciaISO: '2026-01-01',
      }],
    })
    expect(conAlgoQueHacer(veredictos)).toHaveLength(0)
  })
})

describe('cuotasImpagas', () => {
  it('descarta las pagadas', () => {
    expect(cuotasImpagas([cuota({ estado: 'pagado' }), cuota({ mes: 9 })])).toHaveLength(1)
  })

  it('descarta las que no tienen monto: no son deuda, son cuota sin asignar', () => {
    // Cobrarle a alguien por una cuota que nadie llegó a fijar es el error que
    // la migración 097 vino a evitar.
    expect(cuotasImpagas([cuota({ monto: null }), cuota({ monto: 0 })])).toHaveLength(0)
  })

  it('las ordena de la más vieja a la más nueva, cruzando el año', () => {
    const orden = cuotasImpagas([
      cuota({ mes: 2, anio: 2026 }),
      cuota({ mes: 12, anio: 2025 }),
      cuota({ mes: 1, anio: 2026 }),
    ])
    expect(orden.map(c => `${c.anio}-${c.mes}`)).toEqual(['2025-12', '2026-1', '2026-2'])
  })
})

describe('diasDeMora', () => {
  it('sin cuotas impagas, cero', () => {
    expect(diasDeMora({ cuotas: [cuota({ estado: 'pagado' })], hoyISO: '2026-09-30', diaVencimiento: 5 })).toBe(0)
  })

  it('cuenta desde el vencimiento de la más vieja', () => {
    // Vence el 2026-08-05; al 2026-09-02 son 28 días.
    expect(diasDeMora({ cuotas: [cuota({ mes: 8, anio: 2026 })], hoyISO: '2026-09-02', diaVencimiento: 5 })).toBe(28)
  })

  it('una cuota que todavía no vence NO está en mora', () => {
    // Emitida el 1, vence el 5: el día 3 no debe nada todavía.
    expect(diasDeMora({ cuotas: [cuota({ mes: 9, anio: 2026 })], hoyISO: '2026-09-03', diaVencimiento: 5 })).toBe(0)
  })

  it('el mismo día del vencimiento es cero, no uno', () => {
    expect(diasDeMora({ cuotas: [cuota({ mes: 9, anio: 2026 })], hoyISO: '2026-09-05', diaVencimiento: 5 })).toBe(0)
  })

  it('el día siguiente ya es uno', () => {
    expect(diasDeMora({ cuotas: [cuota({ mes: 9, anio: 2026 })], hoyISO: '2026-09-06', diaVencimiento: 5 })).toBe(1)
  })

  it('el vencimiento se recorta a 28 para que exista en febrero', () => {
    expect(vencimientoDe(cuota({ mes: 2, anio: 2026 }), 31)).toBe('2026-02-28')
  })
})

describe('estadoDeMorosidad', () => {
  it('sin mora, al día', () => {
    expect(estadoDeMorosidad(spinhouse, 0)).toBe('al_dia')
  })

  it('con mora pero bajo el umbral de aviso, solo con deuda', () => {
    expect(estadoDeMorosidad(spinhouse, 10)).toBe('con_deuda')
  })

  it('en el umbral exacto de aviso, avisa', () => {
    expect(estadoDeMorosidad(spinhouse, 15)).toBe('para_avisar')
  })

  it('un día antes del bloqueo NO bloquea', () => {
    expect(estadoDeMorosidad(spinhouse, 29)).toBe('para_avisar')
  })

  it('en el umbral exacto de bloqueo, bloquea', () => {
    expect(estadoDeMorosidad(spinhouse, 30)).toBe('para_bloquear')
  })
})

describe('faltasSeguidas', () => {
  it('cuenta desde la última hacia atrás', () => {
    expect(faltasSeguidas([
      { fecha: '2026-09-01', estado: 'ausente' },
      { fecha: '2026-09-03', estado: 'ausente' },
      { fecha: '2026-09-05', estado: 'ausente' },
    ])).toBe(3)
  })

  it('una presencia corta la racha', () => {
    // 2 faltas, 1 presente, 1 falta → NO son 3 seguidas.
    expect(faltasSeguidas([
      { fecha: '2026-09-01', estado: 'ausente' },
      { fecha: '2026-09-03', estado: 'ausente' },
      { fecha: '2026-09-05', estado: 'presente' },
      { fecha: '2026-09-08', estado: 'ausente' },
    ])).toBe(1)
  })

  it('los días sin registro NO cuentan como falta', () => {
    // La tabla guarda faltas, así que un hueco es "nadie pasó lista", no una
    // ausencia. Contarlo alertaría por un profe olvidadizo, no por un alumno
    // que dejó de venir. Un feriado tampoco deja registro.
    expect(faltasSeguidas([{ fecha: '2026-09-01', estado: 'ausente' }])).toBe(1)
  })

  it('un justificado no suma ni corta', () => {
    expect(faltasSeguidas([
      { fecha: '2026-09-01', estado: 'ausente' },
      { fecha: '2026-09-03', estado: 'justificado' },
      { fecha: '2026-09-05', estado: 'ausente' },
    ])).toBe(2)
  })

  it('sin marcas, cero', () => {
    expect(faltasSeguidas([])).toBe(0)
  })
})

describe('mensajeFaltasApoderado', () => {
  it('trata al alumno por su primer nombre y nombra al club', () => {
    const m = mensajeFaltasApoderado({ nombreAlumno: 'Matías Rojas Pérez', nombreClub: 'Spinhouse' })
    expect(m).toContain('Matías')
    expect(m).not.toContain('Rojas')
    expect(m).toContain('Spinhouse')
  })

  it('sin club no dice "undefined": cae en un genérico que se puede mandar igual', () => {
    const m = mensajeFaltasApoderado({ nombreAlumno: 'Ana', nombreClub: null })
    expect(m).not.toMatch(/undefined|null/)
    expect(m).toContain('la escuela')
  })

  it('no menciona ni el número de faltas ni plata', () => {
    // El número suena a lista de colegio, y la plata no es asunto del profe:
    // la matriz de permisos le prohíbe ver montos.
    const m = mensajeFaltasApoderado({ nombreAlumno: 'Ana', nombreClub: 'Spinhouse' })
    expect(m).not.toMatch(/\d/)
    expect(m.toLowerCase()).not.toMatch(/deuda|pago|pagar|cuota|mensualidad/)
  })

  it('pregunta, no reclama', () => {
    const m = mensajeFaltasApoderado({ nombreAlumno: 'Ana', nombreClub: 'Spinhouse' })
    expect(m).toContain('?')
    expect(m.toLowerCase()).not.toMatch(/falta|ausencia|inasistencia/)
  })

  it('un nombre con espacios de más no rompe el saludo', () => {
    expect(mensajeFaltasApoderado({ nombreAlumno: '  Pedro   Soto ' })).toContain('Pedro')
  })
})

describe('inactividad', () => {
  it('cuenta desde el movimiento más reciente de los dos', () => {
    expect(diasSinMovimiento({
      ultimaAsistenciaISO: '2026-07-01', ultimoPagoISO: '2026-08-01', hoyISO: '2026-09-01',
    })).toBe(31)
  })

  it('sin ningún dato devuelve null, que NO es "muchos días"', () => {
    // Puede ser alguien recién inscrito que todavía no vino. Marcarlo inactivo
    // sería sacarlo del padrón el día que entra.
    expect(diasSinMovimiento({ hoyISO: '2026-09-01' })).toBeNull()
    expect(debeMarcarseInactivo(spinhouse, null)).toBe(false)
  })

  it('con el umbral cumplido, marca inactivo', () => {
    expect(debeMarcarseInactivo(spinhouse, 60)).toBe(true)
    expect(debeMarcarseInactivo(spinhouse, 59)).toBe(false)
  })
})

describe('simular', () => {
  const hoy = '2026-09-30'

  it('explica en castellano por qué cae cada uno', () => {
    const [v] = simular({
      config: spinhouse, hoyISO: hoy,
      jugadores: [{ id: 'j1', nombre: 'Ana', cuotas: [cuota({ mes: 8, anio: 2026 })] }],
    })
    // Vence 2026-08-05; al 2026-09-30 son 56 días.
    expect(v.diasMora).toBe(56)
    expect(v.estado).toBe('para_bloquear')
    expect(v.motivo).toBe('56 días de mora y 1 cuota impaga')
  })

  it('junta varios motivos en uno solo', () => {
    const [v] = simular({
      config: spinhouse, hoyISO: hoy,
      jugadores: [{
        id: 'j1', nombre: 'Ana',
        cuotas: [cuota({ mes: 8, anio: 2026 })],
        marcas: [
          { fecha: '2026-09-01', estado: 'ausente' },
          { fecha: '2026-09-08', estado: 'ausente' },
          { fecha: '2026-09-15', estado: 'ausente' },
        ],
        ultimaAsistenciaISO: '2026-06-01',
      }],
    })
    expect(v.motivo).toContain('días de mora')
    expect(v.motivo).toContain('3 clases seguidas sin venir')
    expect(v.motivo).toContain('días sin asistir ni pagar')
  })

  it('suma la deuda de todas sus cuotas impagas', () => {
    const [v] = simular({
      config: spinhouse, hoyISO: hoy,
      jugadores: [{
        id: 'j1', nombre: 'Ana',
        cuotas: [cuota({ mes: 7, monto: 45000 }), cuota({ mes: 8, monto: 45000 })],
      }],
    })
    expect(v.deuda).toBe(90000)
  })

  it('al día no aparece en la lista de la marcha en seco', () => {
    const veredictos = simular({
      config: spinhouse, hoyISO: hoy,
      jugadores: [{ id: 'j1', nombre: 'Ana', cuotas: [cuota({ estado: 'pagado' })] }],
    })
    expect(conAlgoQueHacer(veredictos)).toHaveLength(0)
  })

  it('ordena por días de mora, el peor primero', () => {
    const veredictos = simular({
      config: spinhouse, hoyISO: hoy,
      jugadores: [
        { id: 'j1', nombre: 'Nueva',  cuotas: [cuota({ mes: 9, anio: 2026 })] },
        { id: 'j2', nombre: 'Vieja',  cuotas: [cuota({ mes: 6, anio: 2026 })] },
      ],
    })
    expect(conAlgoQueHacer(veredictos).map(v => v.nombre)).toEqual(['Vieja', 'Nueva'])
  })
})
