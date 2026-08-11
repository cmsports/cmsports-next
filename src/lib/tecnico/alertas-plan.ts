import { fechaChile } from '@/lib/domain/fechaChile'

export type AlertaPlan = {
  planId: string
  planNombre: string
  jugadorId: string
  jugadorNombre: string
  motivo: string
  severidad: 'media' | 'alta'
  diasSinSesion: number | null
  pct: number
}

type Asignacion = {
  plan_id: string
  jugador_id: string
  estado: string
  fecha_inicio: string
}

type Plan = { id: string; nombre: string }
type Jugador = { id: string; nombre: string }
type Ejercicio = { id: string; plan_id: string }
type Sesion = {
  plan_id: string | null
  jugador_id: string | null
  ejercicio_id: string | null
  fecha: string
}

function diasEntre(desde: string, hasta: string) {
  const a = new Date(`${desde}T12:00:00`)
  const b = new Date(`${hasta}T12:00:00`)
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}

/** Detecta asignaciones atrasadas: sin sesión reciente o bajo cumplimiento tras varias semanas. */
export function alertasCumplimientoPlan(args: {
  asignaciones: Asignacion[]
  planes: Plan[]
  jugadores: Jugador[]
  ejercicios: Ejercicio[]
  sesiones: Sesion[]
  hoy?: string
}): AlertaPlan[] {
  const hoy = args.hoy ?? fechaChile()
  const planNombre = new Map(args.planes.map(p => [p.id, p.nombre]))
  const jugadorNombre = new Map(args.jugadores.map(j => [j.id, j.nombre]))
  const ejerciciosPorPlan = new Map<string, string[]>()
  for (const ej of args.ejercicios) {
    const lista = ejerciciosPorPlan.get(ej.plan_id) ?? []
    lista.push(ej.id)
    ejerciciosPorPlan.set(ej.plan_id, lista)
  }

  const alertas: AlertaPlan[] = []

  for (const asig of args.asignaciones) {
    if (!['asignado', 'en_curso'].includes(asig.estado)) continue
    const diasAsignado = diasEntre(asig.fecha_inicio, hoy)
    const sesionesJugador = args.sesiones.filter(
      s => s.plan_id === asig.plan_id && s.jugador_id === asig.jugador_id,
    )
    const ultima = sesionesJugador.map(s => s.fecha).sort().at(-1) ?? null
    const diasSinSesion = ultima ? diasEntre(ultima, hoy) : diasAsignado

    const ejercicios = ejerciciosPorPlan.get(asig.plan_id) ?? []
    const hechos = new Set(
      sesionesJugador.map(s => s.ejercicio_id).filter((id): id is string => Boolean(id)),
    )
    const hechosValidos = [...hechos].filter(id => ejercicios.includes(id)).length
    const pct = ejercicios.length ? Math.round((hechosValidos / ejercicios.length) * 100) : 0

    let motivo: string | null = null
    let severidad: 'media' | 'alta' = 'media'

    if (diasSinSesion >= 14 && sesionesJugador.length === 0 && diasAsignado >= 14) {
      motivo = `Sin ninguna sesión del plan en ${diasSinSesion} días`
      severidad = 'alta'
    } else if (diasSinSesion >= 14) {
      motivo = `Sin sesión del plan hace ${diasSinSesion} días`
      severidad = diasSinSesion >= 21 ? 'alta' : 'media'
    } else if (diasAsignado >= 21 && ejercicios.length > 0 && pct < 30) {
      motivo = `Cumplimiento bajo (${pct}%) tras ${diasAsignado} días asignado`
      severidad = 'media'
    }

    if (!motivo) continue
    alertas.push({
      planId: asig.plan_id,
      planNombre: planNombre.get(asig.plan_id) ?? 'Plan',
      jugadorId: asig.jugador_id,
      jugadorNombre: jugadorNombre.get(asig.jugador_id) ?? 'Jugador',
      motivo,
      severidad,
      diasSinSesion,
      pct,
    })
  }

  return alertas.sort((a, b) => {
    if (a.severidad !== b.severidad) return a.severidad === 'alta' ? -1 : 1
    return (b.diasSinSesion ?? 0) - (a.diasSinSesion ?? 0)
  })
}
