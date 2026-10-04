'use server'

import { requireStaffClub } from '@/lib/auth/require'
import { esUuid } from '@/lib/domain/uuid'
import { fechaChile } from '@/lib/domain/fechaChile'
import { modalidadDe } from '@/lib/domain/modalidadTorneo'
import { moduloExportacionPartidos } from '@/lib/supabase/exportacionPartidosModulo'
import { fechaConOffset, serializarPartidos, type ExportacionPartidos, type FormatoExportacionPartidos, type PartidoExportable, type TipoCompetenciaExportable } from '@/lib/domain/exportacionPartidos'

type Nombre = { nombre: string } | null
type TorneoFila = {
  id: string; fase: string | null; orden: number | null; grupo_id: string | null
  jugador_a: string | null; jugador_a2: string | null; jugador_b: string | null; jugador_b2: string | null; ganador: string | null
  ja: Nombre; ja2: Nombre; jb: Nombre; jb2: Nombre; jg: Nombre
  sets_a: number | null; sets_b: number | null; puntos_a: number | null; puntos_b: number | null
  parciales: [number, number][] | null; es_walkover: boolean; encuentro_id: string | null; numero_en_encuentro: number | null
  grupo: Nombre
  encuentro: {
    equipo_a_id: string | null; equipo_b_id: string | null; ganador_equipo_id: string | null
    ea: Nombre; eb: Nombre
  } | null
}
type LigaFila = {
  id: string; orden_fixture: number; division_id: string; division: Nombre
  jugador_a_id: string; jugador_b_id: string; ganador_id: string | null
  ja: Nombre; jb: Nombre; jg: Nombre
  sets_a: number | null; sets_b: number | null; puntos_a: number | null; puntos_b: number | null
  parciales: [number, number][] | null; es_walkover: boolean; estado: string
  dia_offset: number; bloque_horario: string | null; jornada: { numero: number; fecha: string | null } | null
}

const SELECT_TORNEO = 'id,fase,orden,grupo_id,jugador_a,jugador_a2,jugador_b,jugador_b2,ganador,sets_a,sets_b,puntos_a,puntos_b,parciales,es_walkover,encuentro_id,numero_en_encuentro,ja:jugador_a(nombre),ja2:jugador_a2(nombre),jb:jugador_b(nombre),jb2:jugador_b2(nombre),jg:ganador(nombre),grupo:grupo_id(nombre),encuentro:encuentro_id(equipo_a_id,equipo_b_id,ganador_equipo_id,ea:equipo_a_id(nombre),eb:equipo_b_id(nombre))'
const SELECT_LIGA = 'id,orden_fixture,division_id,jugador_a_id,jugador_b_id,ganador_id,sets_a,sets_b,puntos_a,puntos_b,parciales,es_walkover,estado,dia_offset,bloque_horario,ja:jugador_a_id(nombre),jb:jugador_b_id(nombre),jg:ganador_id(nombre),division:division_id(nombre),jornada:fecha_id(numero,fecha)'

// Supabase limita la respuesta a 1.000 filas. Pedimos páginas pequeñas y con
// desempate por id: un torneo grande jamás se entrega truncado en silencio.
async function todasLasFilas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await pagina(desde, desde + 499)
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('La consulta no devolvió una lista de partidos')
    filas.push(...data as T[])
    if (data.length < 500) return filas
  }
}

function partidoTorneo(p: TorneoFila, modalidad: string, numParticipantes: number): PartidoExportable {
  const encuentro = p.encuentro
  const porFecha = Math.floor(numParticipantes / 2)
  return {
    id: p.id, fase: p.fase, ronda: modalidad === 'liguilla' && porFecha > 0 && p.orden != null ? Math.floor(p.orden / porFecha) + 1 : null,
    orden: p.orden, grupo_id: p.grupo_id, grupo_nombre: p.grupo?.nombre ?? null, division_id: null, division_nombre: null,
    // El torneo guarda un intervalo, pero no agenda una fecha por partido.
    fecha: null, hora: null,
    encuentro_id: p.encuentro_id, numero_en_encuentro: p.numero_en_encuentro,
    equipo_a_id: encuentro?.equipo_a_id ?? null, equipo_a_nombre: encuentro?.ea?.nombre ?? null,
    equipo_b_id: encuentro?.equipo_b_id ?? null, equipo_b_nombre: encuentro?.eb?.nombre ?? null,
    ganador_equipo_id: encuentro?.ganador_equipo_id ?? null,
    jugador_a_id: p.jugador_a, jugador_a_nombre: p.ja?.nombre ?? null, jugador_a2_id: p.jugador_a2, jugador_a2_nombre: p.ja2?.nombre ?? null,
    jugador_b_id: p.jugador_b, jugador_b_nombre: p.jb?.nombre ?? null, jugador_b2_id: p.jugador_b2, jugador_b2_nombre: p.jb2?.nombre ?? null,
    ganador_id: p.ganador, ganador_nombre: p.jg?.nombre ?? null,
    sets_a: p.sets_a, sets_b: p.sets_b, puntos_a: p.puntos_a, puntos_b: p.puntos_b,
    parciales: p.parciales ?? null, es_walkover: !!p.es_walkover,
    estado: p.es_walkover ? 'walkover' : p.ganador ? (!p.jugador_a || !p.jugador_b ? 'bye' : 'finalizado') : encuentro?.ganador_equipo_id ? 'no_jugado' : 'pendiente',
  }
}

function partidoLiga(p: LigaFila): PartidoExportable {
  return {
    id: p.id, fase: 'liga', ronda: p.jornada?.numero ?? null, orden: p.orden_fixture,
    grupo_id: null, grupo_nombre: null, division_id: p.division_id, division_nombre: p.division?.nombre ?? null,
    fecha: fechaConOffset(p.jornada?.fecha, p.dia_offset), hora: p.bloque_horario,
    encuentro_id: null, numero_en_encuentro: null, equipo_a_id: null, equipo_a_nombre: null, equipo_b_id: null, equipo_b_nombre: null, ganador_equipo_id: null,
    jugador_a_id: p.jugador_a_id, jugador_a_nombre: p.ja?.nombre ?? null, jugador_a2_id: null, jugador_a2_nombre: null,
    jugador_b_id: p.jugador_b_id, jugador_b_nombre: p.jb?.nombre ?? null, jugador_b2_id: null, jugador_b2_nombre: null,
    ganador_id: p.ganador_id, ganador_nombre: p.jg?.nombre ?? null,
    sets_a: p.sets_a, sets_b: p.sets_b, puntos_a: p.puntos_a, puntos_b: p.puntos_b,
    parciales: p.parciales ?? null, es_walkover: !!p.es_walkover, estado: p.estado,
  }
}

/** Disponibilidad confirmada por servidor: no utiliza el fallback ALL_MODULOS de la UI. */
export async function puedeExportarPartidos(): Promise<boolean> {
  const { error, supabase, clubId } = await requireStaffClub()
  if (error || !clubId || !supabase) return false
  const modulo = await moduloExportacionPartidos(supabase, clubId)
  return modulo.habilitado
}

export async function exportarPartidos(params: { tipo: TipoCompetenciaExportable; competenciaId: string; formato: FormatoExportacionPartidos }): Promise<
  { error: string } | { contenido: string; nombreArchivo: string; mime: string; total: number }
> {
  const { error: authErr, supabase, clubId } = await requireStaffClub()
  if (authErr || !clubId || !supabase) return { error: authErr ?? 'Sin club asignado' }
  if (!params || !['torneo', 'liga'].includes(params.tipo) || !['csv', 'json'].includes(params.formato) || !esUuid(params.competenciaId)) return { error: 'Solicitud de exportación inválida' }
  const modulo = await moduloExportacionPartidos(supabase, clubId)
  if (!modulo.habilitado) return { error: 'La exportación de partidos no está habilitada para tu club' }

  try {
    let datos: ExportacionPartidos
    if (params.tipo === 'torneo') {
      const { data: torneo, error } = await supabase.from('torneos').select('id,nombre,formato,fecha_inicio,fecha_fin')
        .eq('id', params.competenciaId).eq('club_id', clubId).maybeSingle()
      if (error) throw new Error(error.message)
      if (!torneo) return { error: 'Torneo no encontrado en tu club' }
      const partidos = await todasLasFilas<TorneoFila>((desde, hasta) => supabase.from('torneo_partidos').select(SELECT_TORNEO)
        .eq('torneo_id', torneo.id).order('fase').order('orden').order('id').range(desde, hasta))
      const modalidad = modalidadDe(torneo.formato)
      const numParticipantes = new Set(partidos.flatMap(p => [p.jugador_a, p.jugador_b]).filter(Boolean)).size
      datos = {
        version: 1, fecha_exportacion: fechaChile(),
        competencia: { tipo: 'torneo', id: torneo.id, nombre: torneo.nombre, modalidad, fecha_inicio: torneo.fecha_inicio, fecha_fin: torneo.fecha_fin },
        partidos: partidos.map(p => partidoTorneo(p, modalidad, numParticipantes)),
      }
    } else {
      const { data: liga, error } = await supabase.from('ligas').select('id,nombre').eq('id', params.competenciaId).eq('club_id', clubId).maybeSingle()
      if (error) throw new Error(error.message)
      if (!liga) return { error: 'Liga no encontrada en tu club' }
      const partidos = await todasLasFilas<LigaFila>((desde, hasta) => supabase.from('liga_partidos').select(SELECT_LIGA)
        .eq('liga_id', liga.id).is('deleted_at', null).order('orden_fixture').order('id').range(desde, hasta))
      datos = {
        version: 1, fecha_exportacion: fechaChile(),
        competencia: { tipo: 'liga', id: liga.id, nombre: liga.nombre, modalidad: null, fecha_inicio: null, fecha_fin: null },
        partidos: partidos.map(partidoLiga),
      }
    }
    const nombre = datos.competencia.nombre.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64) || 'competencia'
    return {
      contenido: serializarPartidos(datos, params.formato), nombreArchivo: `partidos-${nombre}-${datos.fecha_exportacion}.${params.formato}`,
      mime: params.formato === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8', total: datos.partidos.length,
    }
  } catch (e) {
    console.error('[exportacion_partidos]', e)
    return { error: 'No se pudo leer la lista completa de partidos. Vuelve a intentar la exportación.' }
  }
}
