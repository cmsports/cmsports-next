// El historial de asistencia con bloque, horario y sede — lo que pidió el
// profesor de Buin desde Reportes: no solo "vino", sino "a qué bloque, a qué
// hora, en qué sede".
//
// Desde la migración 242, `asistencia.bloque_id` guarda el dato de verdad,
// puesto por la propia pantalla al pasar lista. Lo que hace este módulo es
// completar las filas de ANTES de esa migración, que llegan con
// `bloque_id: null`, usando la misma inferencia que ya usa el calendario del
// jugador (`historialAsistencia.ts`): qué bloque le tocaba ese día de la
// semana. Cuando hay más de un candidato —dos bloques el mismo día— no se
// adivina cuál: la fila queda marcada `inferido` sin bloque, en vez de
// mostrar un dato que nadie puede asegurar.

import type { DiaCalendario } from './historialAsistencia'

export type BloqueInfo = {
  id: string
  nombre: string
  sede: string
  hora_inicio: string
  hora_fin: string
  /** Opcional: lo piden pantallas que necesitan saber qué día de la semana
   *  se dicta (por ejemplo, para saltar al día anterior/siguiente de ESE
   *  bloque). El cálculo de esta base no lo usa. */
  dia_semana?: string
}

export type RegistroAsistenciaConBloque = {
  jugador_id: string
  fecha: string
  bloque_id: string | null
}

export type FilaHistorialDetallado = {
  jugadorId: string
  jugadorNombre: string
  fecha: string
  bloqueId: string | null
  bloqueNombre: string
  sede: string
  horario: string
  /** true cuando el bloque no vino guardado en la fila y se completó
   *  adivinando por el día de la semana — para poder distinguirlo en pantalla. */
  inferido: boolean
}

const SIN_DATO = '—'

function horarioDe(b: BloqueInfo): string {
  return `${b.hora_inicio.slice(0, 5)}–${b.hora_fin.slice(0, 5)}`
}

/**
 * Arma las filas del reporte. `calendariosPorJugador` trae, para cada
 * jugador que aparece en `asistencias`, su calendario ya calculado
 * (`calendarioJugador` de `historialAsistencia.ts`) — se recibe hecho para no
 * volver a depender acá de cómo se arma (bloques, inscripciones, vigencias),
 * que es justo lo que ese módulo ya resuelve.
 */
export function armarHistorialDetallado(
  asistencias: RegistroAsistenciaConBloque[],
  nombreDe: (jugadorId: string) => string,
  bloquePorId: Map<string, BloqueInfo>,
  calendariosPorJugador: Map<string, DiaCalendario[]>,
): FilaHistorialDetallado[] {
  return asistencias.map(a => {
    const base = { jugadorId: a.jugador_id, jugadorNombre: nombreDe(a.jugador_id), fecha: a.fecha }

    if (a.bloque_id) {
      const b = bloquePorId.get(a.bloque_id)
      return {
        ...base,
        bloqueId: a.bloque_id,
        bloqueNombre: b?.nombre ?? SIN_DATO,
        sede: b?.sede ?? SIN_DATO,
        horario: b ? horarioDe(b) : SIN_DATO,
        inferido: false,
      }
    }

    // Sin bloque guardado: se completa por el calendario de ese jugador ese
    // día, igual que hace el resto del sistema.
    const dia = calendariosPorJugador.get(a.jugador_id)?.find(d => d.fecha === a.fecha)
    const candidatos = dia?.bloqueIds ?? []
    if (candidatos.length === 1) {
      const b = bloquePorId.get(candidatos[0])
      return {
        ...base,
        bloqueId: candidatos[0],
        bloqueNombre: b?.nombre ?? SIN_DATO,
        sede: b?.sede ?? SIN_DATO,
        horario: b ? horarioDe(b) : SIN_DATO,
        inferido: true,
      }
    }

    // Cero candidatos (día suelto, sin bloque programado) o más de uno (dos
    // bloques el mismo día): no se adivina, queda sin dato.
    return { ...base, bloqueId: null, bloqueNombre: SIN_DATO, sede: SIN_DATO, horario: SIN_DATO, inferido: candidatos.length > 1 }
  })
}
