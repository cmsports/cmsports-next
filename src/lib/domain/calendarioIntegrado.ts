import { diaSemanaDeFecha } from '@/lib/domain/horario'

export const TIPOS_ACTIVIDAD = ['externo', 'clinica', 'campamento', 'reunion', 'suspension', 'feriado', 'otro'] as const
export type ActividadCalendario = {
  id: string; titulo: string; tipo: string; fecha: string; hora_inicio: string | null;
  hora_fin: string | null; lugar: string; descripcion: string; publico: boolean
}
export type ItemCalendario = Omit<ActividadCalendario, 'publico'> & { origen: 'actividad' | 'liga' | 'clase' | 'evento' | 'torneo'; enlace?: string }
export type InscripcionCalendario = {
  vigente_desde: string; vigente_hasta: string | null;
  bloques_horario: { id: string; nombre: string; dia_semana: string; hora_inicio: string; hora_fin: string; sede: string; vigente_desde: string; vigente_hasta: string | null; club_id: string; activo: boolean } | null
}
export function rangoMesCalendario(mesISO: string): { desde: string; hasta: string } {
  const [anio, mes] = mesISO.split('-').map(Number)
  return { desde: `${mesISO}-01`, hasta: `${mesISO}-${new Date(anio, mes, 0).getDate()}` }
}
export function sumarDiasCalendario(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
export function clasesDelMes(mes: string, clubId: string, inscripciones: InscripcionCalendario[], actividades: ActividadCalendario[]): ItemCalendario[] {
  const { desde, hasta } = rangoMesCalendario(mes)
  const suspendidos = new Set(actividades.filter(a => ['feriado', 'suspension'].includes(a.tipo)).map(a => a.fecha))
  const clases = new Map<string, ItemCalendario>()
  for (let fecha = desde; fecha <= hasta; fecha = sumarDiasCalendario(fecha, 1)) {
    if (suspendidos.has(fecha)) continue
    for (const inscripcion of inscripciones) {
      const b = inscripcion.bloques_horario
      if (!b || b.club_id !== clubId || !b.activo || b.dia_semana !== diaSemanaDeFecha(fecha) ||
        inscripcion.vigente_desde > fecha || (inscripcion.vigente_hasta && inscripcion.vigente_hasta < fecha) ||
        b.vigente_desde > fecha || (b.vigente_hasta && b.vigente_hasta < fecha)) continue
      const id = `clase-${b.id}-${fecha}`
      clases.set(id, { id, titulo: b.nombre, tipo: 'clase', fecha, hora_inicio: b.hora_inicio, hora_fin: b.hora_fin, lugar: b.sede, descripcion: 'Tu clase habitual', origen: 'clase' })
    }
  }
  return [...clases.values()]
}

export type PartidoCalendario = {
  id: string; jugador_a_id: string; jugador_b_id: string; arbitro_id: string | null;
  dia_offset: number; bloque_horario: string | null;
  ligas: { nombre: string; club_id: string };
  liga_fechas: { fecha: string | null; numero: number };
  liga_divisiones: { nombre: string } | null;
  liga_mesas: { numero: number } | null;
}
/** Proyección propia: nunca agrega partidos de compañeros ni sus nombres. */
export function partidosPropiosDelMes(mes: string, clubId: string, jugadorId: string, partidos: PartidoCalendario[]): ItemCalendario[] {
  const { desde, hasta } = rangoMesCalendario(mes)
  return partidos.flatMap(p => {
    if (p.ligas.club_id !== clubId || !p.liga_fechas?.fecha || ![p.jugador_a_id,p.jugador_b_id,p.arbitro_id].includes(jugadorId)) return []
    const fecha = sumarDiasCalendario(p.liga_fechas.fecha,p.dia_offset ?? 0)
    if (fecha < desde || fecha > hasta) return []
    const juega = p.jugador_a_id === jugadorId || p.jugador_b_id === jugadorId
    return [{ id:`partido-${p.id}`,tipo:'liga_tdm',origen:'liga' as const,fecha,
      titulo:`${p.ligas.nombre} · ${juega ? 'Tu partido' : 'Tu arbitraje'} · Jornada ${p.liga_fechas.numero}${p.liga_divisiones?.nombre ? ` · ${p.liga_divisiones.nombre}` : ''}`,
      hora_inicio:p.bloque_horario?.slice(0,5) ?? null,hora_fin:null,
      lugar:p.liga_mesas ? `Mesa ${p.liga_mesas.numero}` : '',
      descripcion:p.bloque_horario ? (juega ? 'Presentarse a la hora programada.' : 'Estás asignado como árbitro de este partido.') : 'Horario pendiente de confirmación.' }]
  })
}
