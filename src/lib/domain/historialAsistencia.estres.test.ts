// Estrés del motor de asistencia, con el tamaño real del club.
//
// El panorama llama a calendarioJugador una vez por jugador sobre los mismos
// datos: son ciento tres pasadas. Este archivo comprueba dos cosas que un test
// de lógica no ve —que termine rápido y que no se desvíe con volumen— y una que
// sí importa: que el índice compartido dé exactamente lo mismo que sin él.

import { describe, expect, it } from 'vitest'
import {
  calendarioJugador, indexar, indicadores, diasHabiles,
  type DatosHistorial, type BloqueVigente, type InscripcionVigente,
  type RegistroAsistencia, type ClaseExtra,
} from './historialAsistencia'

const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie'] as const
const JUGADORES = 103
const DESDE = '2026-01-01'
const HASTA = '2026-12-31'

/** Un club como el de verdad: 15 bloques, 103 jugadores, un año de registros. */
function clubCompleto(): { datos: DatosHistorial; ids: string[] } {
  const bloques: BloqueVigente[] = []
  for (let i = 0; i < 15; i++) {
    bloques.push({
      id: `b${i}`,
      nombre: `Grupo ${i}`,
      sede: i % 2 === 0 ? 'buin' : 'paine',
      dia_semana: DIAS[i % 5],
      hora_inicio: '17:00', hora_fin: '19:00',
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
    })
  }

  const ids: string[] = []
  const inscripciones: InscripcionVigente[] = []
  const asistencias: RegistroAsistencia[] = []
  const extraordinarias: ClaseExtra[] = []

  const fechas = diasHabiles(DESDE, HASTA).map(d => d.fecha)

  for (let j = 0; j < JUGADORES; j++) {
    const id = `j${j}`
    ids.push(id)

    // Tres bloques cada uno. Uno de cada cinco cambió de grupo a mitad de año:
    // eso es lo que ejercita la vigencia con volumen.
    for (let k = 0; k < 3; k++) {
      const bloque = `b${(j * 3 + k) % 15}`
      if (j % 5 === 0) {
        inscripciones.push({ bloque_id: bloque, jugador_id: id, vigente_desde: '2026-01-01', vigente_hasta: '2026-06-30' })
        inscripciones.push({ bloque_id: `b${(j * 3 + k + 1) % 15}`, jugador_id: id, vigente_desde: '2026-07-01', vigente_hasta: null })
      } else {
        inscripciones.push({ bloque_id: bloque, jugador_id: id, vigente_desde: '2026-01-01', vigente_hasta: null })
      }
    }

    // Asistencia en dos de cada tres días hábiles, y una extra cada cincuenta.
    fechas.forEach((f, i) => {
      if ((i + j) % 3 !== 0) {
        asistencias.push({ jugador_id: id, fecha: f, estado: (i + j) % 7 === 0 ? 'ausente' : 'presente' })
      }
      if ((i + j) % 50 === 0) extraordinarias.push({ jugador_id: id, fecha: f })
    })
  }

  const excepciones = [
    { bloque_id: 'b0', fecha: '2026-09-18' },
    { bloque_id: 'b1', fecha: '2026-09-18' },
  ]

  // `hoy` a mitad del rango a propósito: deja medio año vencido —donde un día
  // sin registro pesa como ausencia— y medio por venir —donde sigue pendiente—,
  // así el volumen ejercita los dos caminos. Fijo, además, para que la prueba
  // no cambie de significado según el día en que se corra.
  return { datos: { bloques, inscripciones, asistencias, excepciones, extraordinarias, hoy: '2026-07-01' }, ids }
}

describe('estrés del motor', () => {
  const { datos, ids } = clubCompleto()

  it('el club entero, un año, en un tiempo razonable', () => {
    const t0 = performance.now()
    const indice = indexar(datos)
    let total = 0
    for (const id of ids) {
      total += indicadores(calendarioJugador(id, DESDE, HASTA, datos, indice)).programados
    }
    const ms = performance.now() - t0

    expect(total).toBeGreaterThan(0)
    // Holgado a propósito: la máquina que corre CI no es la de nadie. Lo que
    // atrapa es una regresión de orden de magnitud, como volver a recorrer
    // todas las inscripciones del club dentro de cada jugador.
    expect(ms).toBeLessThan(3000)
  })

  // El índice existe para no repetir el mismo trabajo ciento tres veces. Si
  // alguna vez deja de dar lo mismo que sin él, el panorama del club y el
  // calendario individual mostrarían números distintos para lo mismo.
  it('con índice compartido da exactamente lo mismo que sin él', () => {
    const indice = indexar(datos)
    for (const id of ids.slice(0, 25)) {
      const conIndice = calendarioJugador(id, DESDE, HASTA, datos, indice)
      const sinIndice = calendarioJugador(id, DESDE, HASTA, datos)
      expect(conIndice).toEqual(sinIndice)
    }
  })

  it('ningún jugador termina con más días programados que días hábiles', () => {
    const habiles = diasHabiles(DESDE, HASTA).length
    const indice = indexar(datos)
    for (const id of ids) {
      const ind = indicadores(calendarioJugador(id, DESDE, HASTA, datos, indice))
      expect(ind.programados).toBeLessThanOrEqual(habiles)
    }
  })

  // Las cuentas tienen que cerrar para todos: lo resuelto más lo pendiente es
  // lo programado, ni uno más ni uno menos.
  it('presentes + ausentes + pendientes = programados, para los 103', () => {
    const indice = indexar(datos)
    for (const id of ids) {
      const i = indicadores(calendarioJugador(id, DESDE, HASTA, datos, indice))
      expect(i.presentes + i.ausentes + i.pendientes).toBe(i.programados)
    }
  })

  it('el porcentaje nunca se sale de 0 a 100', () => {
    const indice = indexar(datos)
    for (const id of ids) {
      const p = indicadores(calendarioJugador(id, DESDE, HASTA, datos, indice)).porcentaje
      if (p !== null) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(100)
      }
    }
  })

  // Las extras no entran en el porcentaje. Con volumen esto es más fuerte que
  // el caso suelto: si se colaran, los 103 porcentajes se moverían.
  it('quitar las extras no mueve un solo porcentaje', () => {
    const sinExtras: DatosHistorial = { ...datos, extraordinarias: [] }
    const iA = indexar(datos)
    const iB = indexar(sinExtras)
    for (const id of ids) {
      const con = indicadores(calendarioJugador(id, DESDE, HASTA, datos, iA))
      const sin = indicadores(calendarioJugador(id, DESDE, HASTA, sinExtras, iB))
      expect(con.porcentaje).toBe(sin.porcentaje)
      expect(con.programados).toBe(sin.programados)
      expect(con.presentes).toBe(sin.presentes)
      expect(con.ausentes).toBe(sin.ausentes)
    }
  })

  // El día suspendido no le cuenta a nadie: ni como falta ni como pendiente.
  it('el feriado no aparece para ningún inscrito de los bloques suspendidos', () => {
    const indice = indexar(datos)
    for (const id of ids) {
      const dia = calendarioJugador(id, '2026-09-18', '2026-09-18', datos, indice)[0]
      if (!dia) continue
      // Si aparece, es porque le tocaba otro bloque ese día o vino de extra.
      expect(dia.bloques).not.toContain('Grupo 0')
      expect(dia.bloques).not.toContain('Grupo 1')
    }
  })
})
