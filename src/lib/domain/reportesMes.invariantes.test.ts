// Pruebas duras del reporte mensual: en vez de casos elegidos a mano, se
// recorren todos los meses y se comprueban propiedades que tienen que valer
// siempre. Un caso puntual demuestra que un ejemplo funciona; una invariante
// demuestra que no hay ninguno que no.

import { describe, expect, it } from 'vitest'
import {
  calcularReporteMes, diaDe, diasHabilesDelMes, duracionMin,
  type AsignacionProfesor, type BloqueMes, type DiaSuspendido,
} from './reportesMes'
import { diaDesdeFecha } from './horario'
import { vigenteEn } from './vigencia'

const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie']

/** Todos los meses de un año, para no depender del mes que se eligió a dedo. */
function todosLosMeses(anio: number) {
  return Array.from({ length: 12 }, (_, i) => i + 1)
}

function bloque(i: number, over: Partial<BloqueMes> = {}): BloqueMes {
  return {
    id: `b${i}`, nombre: `Grupo ${i}`, sede: i % 2 ? 'buin' : 'paine',
    dia_semana: DIAS[i % 5],
    hora_inicio: `${String(16 + (i % 4)).padStart(2, '0')}:00`,
    hora_fin: `${String(18 + (i % 4)).padStart(2, '0')}:30`,
    cupo_maximo: 12, vigente_desde: '2026-01-01', vigente_hasta: null, ...over,
  }
}

const BLOQUES = Array.from({ length: 12 }, (_, i) => bloque(i))

describe('el calendario no pierde ni inventa días', () => {
  // Si `diaDe` y `diaDesdeFecha` discrepan un solo día, el reporte dice que se
  // dictó una clase que la generación de clases nunca creó. Son dos
  // implementaciones del mismo concepto y nadie las había cruzado.
  it('las dos formas de sacar el día de la semana coinciden, todo el año', () => {
    const desacuerdos: string[] = []
    for (const mes of todosLosMeses(2026)) {
      for (const fecha of diasHabilesDelMes(2026, mes)) {
        if (diaDe(fecha) !== diaDesdeFecha(fecha)) desacuerdos.push(fecha)
      }
    }
    expect(desacuerdos).toEqual([])
  })

  it('los días hábiles de todos los meses suman el año entero sin repetir', () => {
    for (const anio of [2025, 2026, 2027, 2028]) {
      const todos = todosLosMeses(anio).flatMap(m => diasHabilesDelMes(anio, m))
      expect(new Set(todos).size).toBe(todos.length)            // sin repetidos
      expect([...todos].sort()).toEqual(todos)                  // en orden
      expect(todos.every(f => f.startsWith(String(anio)))).toBe(true)
      expect(todos.every(f => !['sab', 'dom'].includes(diaDe(f)))).toBe(true)
    }
  })

  it('febrero bisiesto y el salto de año no se corren un día', () => {
    expect(diasHabilesDelMes(2028, 2).at(-1)).toBe('2028-02-29')
    expect(diasHabilesDelMes(2026, 12).at(-1)).toBe('2026-12-31')
    expect(diasHabilesDelMes(2027, 1)[0]).toBe('2027-01-01')
  })
})

describe('invariantes del reporte, mes por mes', () => {
  const suspensiones: DiaSuspendido[] = [
    { bloque_id: 'b0', fecha: '2026-03-02', motivo: 'feriado' },
    { bloque_id: 'b1', fecha: '2026-09-15', motivo: null },
    { bloque_id: 'b7', fecha: '2026-05-01', motivo: 'día del trabajador' },
  ]
  const asignaciones: AsignacionProfesor[] = BLOQUES.flatMap((b, i) => [
    { bloque_id: b.id, profesor_id: `p${i % 3}`, vigente_desde: '2026-01-01', vigente_hasta: null },
    // Algunos bloques con dos profesores, que es el caso que descuadra totales.
    ...(i % 4 === 0
      ? [{ bloque_id: b.id, profesor_id: 'p9', vigente_desde: '2026-06-01', vigente_hasta: null }]
      : []),
  ])

  const bloques = [
    ...BLOQUES,
    bloque(20, { id: 'b20', vigente_hasta: '2026-04-15' }),   // cierra a mitad de año
    bloque(21, { id: 'b21', vigente_desde: '2026-08-10' }),   // arranca a mitad de año
    bloque(22, { id: 'b22', hora_inicio: '19:00', hora_fin: '19:00' }), // duración cero
  ]

  const corridas = todosLosMeses(2026).map(mes => ({
    mes,
    r: calcularReporteMes({
      anio: 2026, mes, hoy: '2026-07-28',
      bloques, asignaciones, inscripciones: [], suspensiones,
    }),
  }))

  it('ninguna fecha se pierde ni se cuenta dos veces', () => {
    for (const { mes, r } of corridas) {
      const delMes = diasHabilesDelMes(2026, mes)
      for (const g of r.grupos) {
        const clasificadas = [
          ...g.dictadas.map(d => d.fecha),
          ...g.suspendidas.map(o => o.fecha),
          ...g.fueraDeVigencia.map(o => o.fecha),
        ]
        const esperadas = delMes.filter(f => diaDe(f) === g.bloque.dia_semana)
        expect(new Set(clasificadas).size, `${g.bloque.id} en ${mes}`).toBe(clasificadas.length)
        expect([...clasificadas].sort()).toEqual(esperadas)
      }
    }
  })

  it('toda clase dictada estaba vigente, era su día y no estaba suspendida', () => {
    const suspendido = new Set(suspensiones.map(s => `${s.bloque_id}|${s.fecha}`))
    for (const { r } of corridas) {
      for (const g of r.grupos) {
        for (const d of g.dictadas) {
          expect(vigenteEn(g.bloque, d.fecha)).toBe(true)
          expect(diaDe(d.fecha)).toBe(g.bloque.dia_semana)
          expect(suspendido.has(`${g.bloque.id}|${d.fecha}`)).toBe(false)
          expect(d.minutos).toBe(duracionMin(g.bloque))
        }
      }
    }
  })

  it('los totales del club son exactamente la suma de sus grupos', () => {
    for (const { r } of corridas) {
      expect(r.minutosTotales).toBe(r.grupos.reduce((s, g) => s + g.minutos, 0))
      expect(r.clasesDictadas).toBe(r.grupos.reduce((s, g) => s + g.dictadas.length, 0))
      expect(r.clasesSuspendidas).toBe(r.grupos.reduce((s, g) => s + g.suspendidas.length, 0))
      expect(r.minutosTotales).toBeGreaterThanOrEqual(0)
    }
  })

  // Un bloque con dos profesores le suma horas a los dos: el total por profesor
  // puede pasar el del club. Lo que no puede es que un profesor tenga una clase
  // que su grupo no dictó.
  it('ningún profesor cobra una clase que su grupo no dictó', () => {
    for (const { r } of corridas) {
      const dictadasDe = new Map(r.grupos.map(g => [g.bloque.id, new Set(g.dictadas.map(d => d.fecha))]))
      for (const p of r.profesores) {
        for (const g of p.porGrupo) {
          for (const c of g.dictadas) {
            expect(dictadasDe.get(g.bloque.id)?.has(c.fecha)).toBe(true)
          }
        }
        expect(p.minutos).toBe(p.porGrupo.reduce((s, g) => s + g.minutos, 0))
        expect(p.diasTrabajados.length).toBeLessThanOrEqual(diasHabilesDelMes(2026, 1).length + 3)
      }
    }
  })

  it('un profesor asignado desde junio no tiene horas en mayo', () => {
    const mayo = corridas.find(c => c.mes === 5)!.r.profesores.find(p => p.profesorId === 'p9')
    const julio = corridas.find(c => c.mes === 7)!.r.profesores.find(p => p.profesorId === 'p9')
    expect(mayo).toBeUndefined()
    expect(julio?.minutos).toBeGreaterThan(0)
  })

  it('un bloque de duración cero no aporta horas pero sí cuenta como clase', () => {
    const { r } = corridas.find(c => c.mes === 3)!
    const g = r.grupos.find(x => x.bloque.id === 'b22')!
    expect(g.dictadas.length).toBeGreaterThan(0)
    expect(g.minutos).toBe(0)
  })
})

describe('el resultado no depende del orden ni de cuántas veces se pida', () => {
  const base = {
    anio: 2026, mes: 9, hoy: '2026-09-30',
    bloques: BLOQUES,
    asignaciones: BLOQUES.map(b => ({
      bloque_id: b.id, profesor_id: 'p1', vigente_desde: '2026-01-01', vigente_hasta: null,
    })),
    inscripciones: [],
    suspensiones: [{ bloque_id: 'b3', fecha: '2026-09-17', motivo: null }],
  }

  it('pedirlo dos veces da lo mismo', () => {
    expect(calcularReporteMes(base)).toEqual(calcularReporteMes(base))
  })

  it('barajar la entrada no cambia los totales', () => {
    const alReves = calcularReporteMes({
      ...base,
      bloques: [...base.bloques].reverse(),
      asignaciones: [...base.asignaciones].reverse(),
    })
    const normal = calcularReporteMes(base)
    expect(alReves.minutosTotales).toBe(normal.minutosTotales)
    expect(alReves.clasesDictadas).toBe(normal.clasesDictadas)
    expect(alReves.profesores[0].minutos).toBe(normal.profesores[0].minutos)
  })
})

// La prueba más fuerte que se le puede hacer a un cálculo: escribirlo otra vez
// de la forma más tonta posible y exigir que den lo mismo. Si las dos
// coinciden en 120 escenarios sorteados, el error tendría que estar en las dos
// a la vez y de la misma manera.
describe('contra una segunda implementación, a lo bruto', () => {
  /** Horas de un profesor recorriendo todo sin optimizar nada. */
  function aLoBruto(params: {
    anio: number; mes: number; profesorId: string
    bloques: BloqueMes[]; asignaciones: AsignacionProfesor[]; suspensiones: DiaSuspendido[]
  }) {
    let minutos = 0
    for (const fecha of diasHabilesDelMes(params.anio, params.mes)) {
      for (const b of params.bloques) {
        if (b.dia_semana !== diaDe(fecha)) continue
        if (!vigenteEn(b, fecha)) continue
        if (params.suspensiones.some(s => s.bloque_id === b.id && s.fecha === fecha)) continue
        const suyo = params.asignaciones.some(a =>
          a.bloque_id === b.id && a.profesor_id === params.profesorId && vigenteEn(a, fecha))
        if (suyo) minutos += duracionMin(b)
      }
    }
    return minutos
  }

  /** Sorteo reproducible: la misma semilla da siempre el mismo escenario. */
  function sorteo(semilla: number) {
    let x = semilla
    const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648 }
    const elegir = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    const fecha = () => `2026-${String(Math.floor(rnd() * 12) + 1).padStart(2, '0')}-${String(Math.floor(rnd() * 28) + 1).padStart(2, '0')}`

    const bloques: BloqueMes[] = Array.from({ length: Math.floor(rnd() * 8) + 1 }, (_, i) =>
      bloque(i, {
        id: `s${i}`,
        dia_semana: elegir(DIAS),
        vigente_desde: rnd() < 0.5 ? '2026-01-01' : fecha(),
        vigente_hasta: rnd() < 0.4 ? fecha() : null,
      }))
    const asignaciones: AsignacionProfesor[] = bloques.flatMap(b =>
      rnd() < 0.85
        ? [{
            bloque_id: b.id,
            profesor_id: elegir(['p1', 'p2', 'p3']),
            vigente_desde: rnd() < 0.6 ? '2026-01-01' : fecha(),
            vigente_hasta: rnd() < 0.3 ? fecha() : null,
          }]
        : [])
    const suspensiones: DiaSuspendido[] = bloques.flatMap(b =>
      rnd() < 0.4 ? [{ bloque_id: b.id, fecha: fecha(), motivo: null }] : [])

    return { bloques, asignaciones, suspensiones, mes: Math.floor(rnd() * 12) + 1 }
  }

  it('las dos formas dan las mismas horas en 120 escenarios sorteados', () => {
    const distintos: string[] = []
    // Sin esto la prueba podría pasar comparando cero contra cero 360 veces y
    // no demostrar nada.
    let conHoras = 0
    for (let semilla = 1; semilla <= 120; semilla++) {
      const { bloques, asignaciones, suspensiones, mes } = sorteo(semilla)
      const r = calcularReporteMes({
        anio: 2026, mes, hoy: '2026-07-28', bloques, asignaciones, inscripciones: [], suspensiones,
      })
      for (const profesorId of ['p1', 'p2', 'p3']) {
        const delReporte = r.profesores.find(p => p.profesorId === profesorId)?.minutos ?? 0
        const bruto = aLoBruto({ anio: 2026, mes, profesorId, bloques, asignaciones, suspensiones })
        if (delReporte > 0) conHoras++
        if (delReporte !== bruto) {
          distintos.push(`semilla ${semilla}, mes ${mes}, ${profesorId}: ${delReporte} vs ${bruto}`)
        }
      }
    }
    expect(distintos).toEqual([])
    expect(conHoras).toBeGreaterThan(100)
  })
})

describe('entradas hostiles', () => {
  const vacio = {
    anio: 2026, mes: 7, hoy: '2026-07-28',
    bloques: [], asignaciones: [], inscripciones: [], suspensiones: [],
  }

  it('un club sin nada no revienta ni inventa', () => {
    const r = calcularReporteMes(vacio)
    expect(r.grupos).toEqual([])
    expect(r.profesores).toEqual([])
    expect(r.minutosTotales).toBe(0)
    expect(r.fechas.length).toBe(23)
  })

  it('una asignación a un bloque que no existe no crea un profesor fantasma', () => {
    const r = calcularReporteMes({
      ...vacio,
      asignaciones: [{ bloque_id: 'no-existe', profesor_id: 'p1', vigente_desde: '2026-01-01', vigente_hasta: null }],
    })
    expect(r.profesores).toEqual([])
  })

  it('una suspensión de un día que no es del grupo no descuenta nada', () => {
    const b = bloque(1, { id: 'bx', dia_semana: 'lun' })
    const r = calcularReporteMes({
      ...vacio, bloques: [b],
      suspensiones: [{ bloque_id: 'bx', fecha: '2026-07-07', motivo: 'martes' }],   // es martes
    })
    expect(r.grupos[0].suspendidas).toEqual([])
    expect(r.grupos[0].dictadas.length).toBe(4)   // los 4 lunes de julio
  })

  it('un bloque que cerró antes de abrir no dicta nada', () => {
    const r = calcularReporteMes({
      ...vacio,
      bloques: [bloque(1, { vigente_desde: '2026-07-20', vigente_hasta: '2026-07-10' })],
    })
    expect(r.grupos[0].dictadas).toEqual([])
    expect(r.minutosTotales).toBe(0)
  })

  it('suspensiones repetidas del mismo día no descuentan dos veces', () => {
    const b = bloque(1, { id: 'bx', dia_semana: 'mar' })
    const r = calcularReporteMes({
      ...vacio, bloques: [b],
      suspensiones: [
        { bloque_id: 'bx', fecha: '2026-07-14', motivo: 'feriado' },
        { bloque_id: 'bx', fecha: '2026-07-14', motivo: 'repetida' },
      ],
    })
    expect(r.grupos[0].suspendidas).toHaveLength(1)
    expect(r.grupos[0].dictadas).toHaveLength(3)
  })
})
