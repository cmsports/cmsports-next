'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { diaDesdeFecha, hhmm, iniciosDeInscripcion } from '@/lib/domain/horario'
import { fechaChile } from '@/lib/domain/fechaChile'
import { cierreVigencia } from '@/lib/domain/vigencia'

// El horario semanal lo maneja el staff (admin o profesor). requireAdminClub
// solo deja pasar al admin, así que acá va una comprobación propia.
async function requireStaff() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil?.club_id || !['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')) {
    return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  }
  // Los tipos generados de Supabase no traen las columnas de vigencia ni
  // grupo_id, así que el cliente sale casteado para todo este archivo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { error: null, supabase: supabase as any, clubId: perfil.club_id }
}

/** Hoy en Chile. Las vigencias son fechas, no instantes. */
function hoyISO(): string {
  return fechaChile()
}

/**
 * Con qué fecha se cierra lo que deja de valer ahora mismo: ayer.
 *
 * Cerrar con hoy no saca a nadie —`vigente_hasta` es inclusive— y dejaba al
 * jugador en la lista de asistencia del día en que lo sacaban del grupo, o en
 * los dos grupos a la vez el día que lo cambiaban de horario.
 */
function cierreISO(): string {
  return cierreVigencia(hoyISO())
}

/** Fechas de lun-vie de la semana actual en Chile (clave = dia_semana del bloque). */
function fechasDeSemanaChile(): Record<string, string> {
  const hoy = new Date()
  const diaStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short' }).format(hoy)
  const diaJS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(diaStr)
  const offsetLunes = diaJS === 0 ? 6 : diaJS - 1 // cuántos días desde el lunes
  const result: Record<string, string> = {}
  for (const [dia, idx] of Object.entries({ lun: 0, mar: 1, mie: 2, jue: 3, vie: 4 })) {
    result[dia] = fechaChile(new Date(hoy.getTime() + (idx - offsetLunes) * 86400000))
  }
  return result
}

async function guardarProfesores(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bloqueId: string,
  profesorIds: string[],
) {
  const quiero = [...new Set(profesorIds)].filter(Boolean)

  const { data: abiertas } = await supabase.from('bloque_profesores')
    .select('id,profesor_id').eq('bloque_id', bloqueId).is('vigente_hasta', null)
  const actuales: string[] = (abiertas ?? []).map((r: { profesor_id: string }) => r.profesor_id)

  // Al que sale se le cierra el período: quién dictaba en marzo tiene que
  // seguir siendo consultable.
  const salen = (abiertas ?? []).filter((r: { profesor_id: string }) => !quiero.includes(r.profesor_id))
  if (salen.length > 0) {
    await supabase.from('bloque_profesores')
      .update({ vigente_hasta: cierreISO() })
      .in('id', salen.map((r: { id: string }) => r.id))
  }

  const entran = quiero.filter(id => !actuales.includes(id))
  if (entran.length > 0) {
    // vigente_desde explícito: el DEFAULT current_date de la base corre en UTC
    // y de noche asignaba al profe desde "mañana", perdiendo el día en el
    // reporte de horas.
    await supabase.from('bloque_profesores')
      .insert(entran.map(profesor_id => ({ bloque_id: bloqueId, profesor_id, vigente_desde: hoyISO() })))
  }
}

/**
 * Marca —o desmarca— que en una fecha no hubo clases.
 *
 * Feriados, suspensiones, el día que no se abrió. Afecta a todos los grupos que
 * funcionaban ese día de la semana, que es como lo piensa el profe: no dice
 * "el martes 17:00 no hay", dice "el 18 de septiembre no hay".
 *
 * Sin esto, un feriado aparece como entrenamiento pendiente de registrar para
 * todos los inscritos y ensucia los porcentajes de ese mes.
 */
/**
 * Cómo está hoy una fecha: cuántos grupos se dictan y cuántos están suspendidos.
 *
 * Existe porque el modal pedía apretar a ciegas. "Marcar" y "Deshacer" son
 * botones que hacen lo contrario y no había forma de saber cuál correspondía,
 * así que la única manera de averiguarlo era apretar uno.
 */
export async function estadoDiaSinClase(params: { fecha: string }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const dia = diaDesdeFecha(params.fecha)
  if (!dia) return { error: 'El club no abre los fines de semana' }

  const { data: bloques, error: errBloques } = await supabase.from('bloques_horario')
    .select('id').eq('club_id', clubId).eq('dia_semana', dia)
    .lte('vigente_desde', params.fecha)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${params.fecha}`)
  if (errBloques) return { error: 'No se pudo leer el horario: ' + errBloques.message }

  const ids = (bloques ?? []).map((b: { id: string }) => b.id)
  if (ids.length === 0) return { dia, grupos: 0, suspendidos: 0, motivo: null }

  const { data: exc, error: errExc } = await supabase.from('bloque_excepciones')
    .select('motivo').in('bloque_id', ids).eq('fecha', params.fecha)
  if (errExc) return { error: 'No se pudieron leer las suspensiones: ' + errExc.message }

  const motivos = (exc ?? []).map((e: { motivo: string | null }) => e.motivo).filter(Boolean)
  return {
    dia,
    grupos: ids.length,
    suspendidos: (exc ?? []).length,
    motivo: (motivos[0] as string | undefined) ?? null,
  }
}

export async function marcarDiaSinClase(params: { fecha: string; motivo?: string; deshacer?: boolean }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const dia = diaDesdeFecha(params.fecha)
  if (!dia) return { error: 'El club no abre los fines de semana' }

  // Deshacer va primero y por su cuenta: borra las suspensiones de esa fecha
  // sin fijarse en qué grupos funcionan hoy ese día de la semana.
  //
  // Antes compartía la consulta de abajo, así que si el horario había cambiado
  // —el grupo se cerró, se movió de día, se le puso fecha de fin— el día
  // quedaba suspendido para siempre: no había ningún bloque vigente que
  // encontrar y la función se iba con "No hay grupos que funcionen los mar".
  if (params.deshacer) {
    const { data: todos, error: errTodos } = await supabase.from('bloques_horario')
      .select('id').eq('club_id', clubId)
    if (errTodos) return { error: 'No se pudo leer el horario: ' + errTodos.message }
    const idsClub = (todos ?? []).map((b: { id: string }) => b.id)
    if (idsClub.length === 0) return { success: true, grupos: 0, deshecho: true }

    const { error } = await supabase.from('bloque_excepciones')
      .delete().in('bloque_id', idsClub).eq('fecha', params.fecha)
    if (error) return { error: 'No se pudo deshacer: ' + error.message }
    return { success: true, grupos: idsClub.length, deshecho: true }
  }

  const { data: bloques, error: errBloques } = await supabase.from('bloques_horario')
    .select('id').eq('club_id', clubId).eq('dia_semana', dia)
    .lte('vigente_desde', params.fecha)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${params.fecha}`)
  if (errBloques) return { error: 'No se pudo leer el horario: ' + errBloques.message }
  if (!bloques?.length) return { error: `No hay grupos que funcionen los ${dia}` }

  const ids = bloques.map((b: { id: string }) => b.id)

  const { error } = await supabase.from('bloque_excepciones')
    .upsert(
      ids.map((bloque_id: string) => ({ bloque_id, fecha: params.fecha, motivo: params.motivo?.trim() || null })),
      { onConflict: 'bloque_id,fecha' },
    )
  if (error) return { error: 'No se pudo marcar el día: ' + error.message }

  return { success: true, grupos: ids.length }
}

/**
 * Los días que el club tiene marcados sin clase, del más nuevo al más viejo.
 *
 * Existe para arreglar un error de tipeo. Marcar el día equivocado se arregla
 * solo si te acordás de cuál marcaste: había que escribir la fecha exacta en el
 * campo para recién ahí ver que estaba suspendida. Si te equivocaste de día, no
 * tenías cómo encontrarlo.
 */
export async function diasSinClase() {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const { data: bloques, error: errBloques } = await supabase.from('bloques_horario')
    .select('id').eq('club_id', clubId)
  if (errBloques) return { error: 'No se pudo leer el horario: ' + errBloques.message }

  const ids = (bloques ?? []).map((b: { id: string }) => b.id)
  if (ids.length === 0) return { dias: [] }

  const { data: exc, error: errExc } = await supabase.from('bloque_excepciones')
    .select('fecha,motivo').in('bloque_id', ids).order('fecha', { ascending: false })
  if (errExc) return { error: 'No se pudieron leer las suspensiones: ' + errExc.message }

  // Una fecha suspendida son varias filas, una por grupo. El profe piensa en
  // días, no en grupos: se agrupan por fecha y se cuenta cuántos cayeron.
  const porFecha = new Map<string, { fecha: string; motivo: string | null; grupos: number }>()
  for (const e of (exc ?? []) as { fecha: string; motivo: string | null }[]) {
    const ya = porFecha.get(e.fecha)
    if (ya) { ya.grupos += 1; ya.motivo = ya.motivo ?? e.motivo }
    else porFecha.set(e.fecha, { fecha: e.fecha, motivo: e.motivo, grupos: 1 })
  }

  return {
    dias: [...porFecha.values()].map(d => ({ ...d, dia: diaDesdeFecha(d.fecha) ?? '' })),
  }
}

export type DiaDeGrupo = { dia_semana: string; hora_inicio: string; hora_fin: string }

/**
 * Crea o actualiza un grupo completo con los días que se marcaron.
 *
 * Antes había que llenar el formulario una vez por día: "Menores Avanzado" son
 * tres días y había que crearlo tres veces. Acá se marca el grupo una sola vez
 * y se tildan sus días, cada uno con su horario —en Buin el lunes parte 16:30 y
 * el martes 17:00, así que la hora no puede ser una sola para todo el grupo—.
 *
 * Los días que se destildan no se borran: se les cierra la vigencia, con sus
 * inscripciones. La historia de ese día tiene que seguir siendo consultable.
 */
export async function guardarGrupo(params: {
  grupoId?: string
  nombre: string
  sede: string
  cupoMaximo: number
  cupoLibres: number
  profesorIds: string[]
  dias: DiaDeGrupo[]
}) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const nombre = params.nombre.trim()
  if (!nombre) return { error: 'El nombre del grupo es obligatorio' }
  if (!['buin', 'paine'].includes(params.sede)) return { error: 'Sede inválida' }
  if (params.dias.length === 0) return { error: 'Marcá al menos un día' }
  if (params.cupoMaximo < 0 || params.cupoLibres < 0) return { error: 'Los cupos no pueden ser negativos' }

  for (const d of params.dias) {
    if (!['lun', 'mar', 'mie', 'jue', 'vie'].includes(d.dia_semana)) return { error: 'Día inválido' }
    if (!d.hora_inicio || !d.hora_fin) return { error: `Falta el horario del ${d.dia_semana}` }
    if (hhmm(d.hora_fin) <= hhmm(d.hora_inicio)) {
      return { error: `En ${d.dia_semana}, la hora de fin debe ser posterior a la de inicio` }
    }
  }

  // ── El grupo ──
  let grupoId = params.grupoId
  if (grupoId) {
    const { error } = await supabase.from('grupos_entrenamiento')
      .update({ nombre, sede: params.sede }).eq('id', grupoId).eq('club_id', clubId)
    if (error) {
      return { error: error.code === '23505'
        ? 'Ya existe un grupo con ese nombre en esa sede'
        : 'No se pudo guardar el grupo: ' + error.message }
    }
  } else {
    const { data, error } = await supabase.from('grupos_entrenamiento')
      .insert({ club_id: clubId, nombre, sede: params.sede }).select('id').single()
    if (error) {
      return { error: error.code === '23505'
        ? 'Ya existe un grupo con ese nombre en esa sede'
        : 'No se pudo crear el grupo: ' + error.message }
    }
    grupoId = data.id
  }

  // ── Sus días ──
  const { data: existentes } = await supabase.from('bloques_horario')
    .select('id,dia_semana,vigente_hasta').eq('grupo_id', grupoId)

  type BloqueExistente = { id: string; dia_semana: string; vigente_hasta: string | null }
  const previos: BloqueExistente[] = existentes ?? []
  const quiero = new Map(params.dias.map(d => [d.dia_semana, d]))

  for (const b of previos) {
    const pedido = quiero.get(b.dia_semana)
    if (pedido) {
      // Sigue estando: se actualiza el horario y se reabre si estaba cerrado.
      const { error } = await supabase.from('bloques_horario').update({
        hora_inicio: pedido.hora_inicio,
        hora_fin: pedido.hora_fin,
        cupo_maximo: params.cupoMaximo,
        cupo_libres: params.cupoLibres,
        vigente_hasta: null,
      }).eq('id', b.id)
      // Si esto falla en silencio, la pantalla dice "guardado" y el horario
      // quedó como estaba. Es preferible el error a la mentira.
      if (error) {
        return { error: error.code === '23505'
          ? `Ya hay otro grupo en ${params.sede} el ${b.dia_semana} a las ${hhmm(pedido.hora_inicio)}`
          : `No se pudo guardar el ${b.dia_semana}: ${error.message}` }
      }
      await guardarProfesores(supabase, b.id, params.profesorIds)
      quiero.delete(b.dia_semana)
    } else if (b.vigente_hasta === null) {
      // Se destildó: se cierra, junto con sus inscripciones.
      const { error } = await supabase.from('bloques_horario')
        .update({ vigente_hasta: cierreISO() }).eq('id', b.id)
      if (error) return { error: `No se pudo dar de baja el ${b.dia_semana}: ${error.message}` }

      const { error: errIns } = await supabase.from('bloque_jugadores')
        .update({ vigente_hasta: cierreISO() }).eq('bloque_id', b.id).is('vigente_hasta', null)
      if (errIns) return { error: `El día se cerró pero las inscripciones no: ${errIns.message}` }
    }
  }

  // Los días nuevos.
  for (const d of quiero.values()) {
    const { data, error } = await supabase.from('bloques_horario').insert({
      club_id: clubId,
      grupo_id: grupoId,
      nombre,
      sede: params.sede,
      dia_semana: d.dia_semana,
      hora_inicio: d.hora_inicio,
      hora_fin: d.hora_fin,
      cupo_maximo: params.cupoMaximo,
      cupo_libres: params.cupoLibres,
    }).select('id').single()
    if (error) {
      return { error: error.code === '23505'
        ? `Ya hay otro grupo en ${params.sede} el ${d.dia_semana} a las ${hhmm(d.hora_inicio)}`
        : 'No se pudo crear el día: ' + error.message }
    }
    await guardarProfesores(supabase, data.id, params.profesorIds)
  }

  return { success: true, grupoId }
}

// crearBloque y editarBloque se fueron: el formulario ahora guarda el grupo
// entero con sus días de una vez, y eso lo hace guardarGrupo.

export async function eliminarBloque(params: { id: string }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  // El bloque no se borra: se le cierra la vigencia. Su historia —quién
  // estaba inscrito, quién lo dictaba, quién asistió— tiene que seguir siendo
  // consultable aunque el grupo deje de funcionar.
  const { error } = await supabase.from('bloques_horario')
    .update({ vigente_hasta: cierreISO() })
    .eq('id', params.id).eq('club_id', clubId)
  if (error) return { error: 'No se pudo dar de baja el bloque: ' + error.message }

  // Y con él, las inscripciones que tenía abiertas.
  await supabase.from('bloque_jugadores')
    .update({ vigente_hasta: cierreISO() })
    .eq('bloque_id', params.id).is('vigente_hasta', null)
  return { success: true }
}

// `generarSemana` se eliminó junto con el módulo Clases (2026-07-29): la tabla
// `clases` ya no existe. El horario semanal vive en bloques_horario y la
// asistencia se pasa directo sobre los bloques.

export async function agregarJugadorABloque(params: { bloqueId: string; jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  // El bloque y el jugador tienen que ser del club de quien lo hace.
  const [{ data: bloque }, { data: jugador }] = await Promise.all([
    supabase.from('bloques_horario').select('id,cupo_maximo,vigente_hasta').eq('id', params.bloqueId).eq('club_id', clubId).maybeSingle(),
    supabase.from('jugadores').select('id').eq('id', params.jugadorId).eq('club_id', clubId).maybeSingle(),
  ])
  if (!bloque) return { error: 'Bloque no encontrado' }
  if (!jugador) return { error: 'Jugador no encontrado' }
  // Un bloque cerrado (vigente_hasta pasada) no acepta inscripciones nuevas:
  // sin esto se podia sumar gente a un grupo que ya no se dicta.
  if (bloque.vigente_hasta && bloque.vigente_hasta < hoyISO()) {
    return { error: 'Este bloque ya no está vigente, no se pueden agregar jugadores' }
  }

  const { error } = await supabase.from('bloque_jugadores')
    .insert({ bloque_id: params.bloqueId, jugador_id: params.jugadorId, vigente_desde: hoyISO() })

  // 23505 = ya tiene una inscripción abierta en este bloque. No es un error
  // para quien lo está usando: el resultado es el que quería.
  if (error && error.code !== '23505') {
    return { error: 'No se pudo agregar al bloque: ' + error.message }
  }

  // El cupo no bloquea: el club a veces pasa de doce y prefiere verlo avisado
  // antes que no poder registrarlo. Solo cuentan las inscripciones abiertas.
  const { count } = await supabase.from('bloque_jugadores')
    .select('id', { count: 'exact', head: true })
    .eq('bloque_id', params.bloqueId).is('vigente_hasta', null)

  return { success: true, inscritos: count ?? 0, sobreCupo: (count ?? 0) > bloque.cupo_maximo }
}

/**
 * Define de una vez a qué bloques pertenece un jugador, desde su ficha.
 *
 * Hace las dos cosas juntas —la inscripción a los bloques y los campos de días
 * y sede de la ficha— porque tenerlas separadas fue el problema: se editaba una
 * y la otra quedaba contradiciéndola. Acá salen siempre del mismo dato.
 */
export async function asignarBloquesJugador(params: { jugadorId: string; bloqueIds: string[] }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const { data: jugador } = await supabase.from('jugadores')
    .select('id,club_id,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie')
    .eq('id', params.jugadorId).eq('club_id', clubId).maybeSingle()
  if (!jugador) return { error: 'Jugador no encontrado' }

  // Solo bloques del club: los ids llegan del navegador y no son de fiar.
  const ids = [...new Set(params.bloqueIds)].filter(Boolean)
  let bloques: { id: string; nombre: string; sede: string; dia_semana: string; hora_inicio: string; hora_fin: string; cupo_maximo: number | null; vigente_hasta: string | null }[] = []
  if (ids.length > 0) {
    const { data, error } = await supabase.from('bloques_horario')
      .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,vigente_hasta')
      .eq('club_id', clubId).in('id', ids)
    if (error) return { error: 'No se pudieron leer los bloques: ' + error.message }
    bloques = data ?? []
  }
  if (bloques.length !== ids.length) return { error: 'Alguno de los bloques no es de este club' }
  const vencidos = bloques.filter(b => b.vigente_hasta && b.vigente_hasta < hoyISO())
  if (vencidos.length > 0) {
    return { error: `Hay ${vencidos.length} bloque(s) fuera de vigencia entre los elegidos. No se pueden asignar.` }
  }

  // Se calcula la diferencia contra lo que ya tenía abierto, en vez de borrar
  // y volver a insertar. Borrar perdería desde cuándo está en los grupos que
  // no cambió, que es justo lo que el calendario necesita saber.
  const { data: abiertas, error: leerErr } = await supabase.from('bloque_jugadores')
    .select('id,bloque_id').eq('jugador_id', params.jugadorId).is('vigente_hasta', null)
  if (leerErr) return { error: 'No se pudo leer su asignación actual: ' + leerErr.message }

  type Abierta = { id: string; bloque_id: string }
  const yaEstaba = (abiertas ?? []).map((r: Abierta) => r.bloque_id)
  const salen = (abiertas ?? []).filter((r: Abierta) => !ids.includes(r.bloque_id))
  const entran = ids.filter(id => !yaEstaba.includes(id))

  if (salen.length > 0) {
    const { error } = await supabase.from('bloque_jugadores')
      .update({ vigente_hasta: cierreISO() })
      .in('id', salen.map((r: Abierta) => r.id))
    if (error) return { error: 'No se pudo cerrar la asignación anterior: ' + error.message }
  }

  const semana = fechasDeSemanaChile()

  // Los grupos que deja, para cruzarlos con los que toma. Se leen antes de
  // insertar porque de ese cruce sale desde cuándo vale cada inscripción nueva.
  const { data: bloquesSalen } = salen.length > 0
    ? await supabase.from('bloques_horario')
        .select('id,dia_semana,hora_inicio')
        .in('id', salen.map((r: Abierta) => r.bloque_id))
    : { data: [] as { id: string; dia_semana: string; hora_inicio: string }[] }

  // Desde cuándo vale cada inscripción nueva. La regla vive en el dominio, con
  // sus propias pruebas: acá adentro no se puede probar el fin de semana, que es
  // justo donde estaba el agujero.
  const inicioDe = iniciosDeInscripcion({
    hoy: hoyISO(),
    semana,
    salen: ((bloquesSalen ?? []) as { id: string; dia_semana: string; hora_inicio: string }[])
      .map(b => ({ id: b.id, dia_semana: b.dia_semana, hora_inicio: b.hora_inicio })),
    entran: bloques.filter(b => entran.includes(b.id))
      .map(b => ({ id: b.id, dia_semana: b.dia_semana, hora_inicio: b.hora_inicio })),
  })

  if (entran.length > 0) {
    const { error } = await supabase.from('bloque_jugadores')
      .insert(entran.map(bloque_id => ({
        bloque_id,
        jugador_id: params.jugadorId,
        vigente_desde: inicioDe.get(bloque_id) ?? hoyISO(),
      })))
    if (error) return { error: 'No se pudo asignar a los bloques: ' + error.message }
  }

  // Transferir asistencias de esta semana cuando un día cambia por otro del mismo horario.
  // Ej: sale miércoles 17:00, entra martes 17:00 → mueve la asistencia del mie al mar.
  //
  // Solo en día hábil, por lo mismo que la inscripción no retrocede el fin de
  // semana: el sábado y el domingo `semana` apunta a una semana ya cerrada, y
  // mover una asistencia de ahí es reescribir algo que ya pasó y se contó.
  if (salen.length > 0 && entran.length > 0 && diaDesdeFecha(hoyISO()) !== null) {
    for (const bSale of (bloquesSalen ?? [])) {
      const bEntra = bloques.find(b => entran.includes(b.id) && b.hora_inicio === bSale.hora_inicio)
      if (!bEntra || bEntra.dia_semana === bSale.dia_semana) continue

      const fechaVieja = semana[bSale.dia_semana]
      const fechaNueva = semana[bEntra.dia_semana]
      if (!fechaVieja || !fechaNueva) continue

      const { data: asistVieja } = await supabase.from('asistencia')
        .select('id').eq('jugador_id', params.jugadorId).eq('fecha', fechaVieja).maybeSingle()
      if (!asistVieja) continue

      const { data: asistNueva } = await supabase.from('asistencia')
        .select('id').eq('jugador_id', params.jugadorId).eq('fecha', fechaNueva).maybeSingle()
      if (asistNueva) continue // ya hay asistencia ese día, no sobreescribir

      await supabase.from('asistencia').update({ fecha: fechaNueva }).eq('id', asistVieja.id)
    }
  }

  // La inscripción arranca a las 00:00 de hoy, así que alcanza para atrás las
  // clases que ya ocurrieron hoy. Si a esta persona le anotaron una "visita" a
  // uno de los grupos al que recién entra, esa visita deja de tener sentido —no
  // se visita el grupo propio— y el día queda diciendo dos cosas opuestas: en la
  // ficha es del grupo, en el registro es de afuera.
  //
  // Es exactamente lo que pasa con el alumno nuevo: viene, entrena, el profe lo
  // anota como extra porque todavía no está en la nómina, y recién después lo
  // inscriben. Convertirla acá cierra el caso sin que nadie tenga que acordarse.
  const convertidas: string[] = []
  const trabadas: string[] = []
  if (entran.length > 0) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any
    const { data: visitas } = await db.from('clases_extraordinarias')
      .select('id,fecha,pagada_en,cobrada_en')
      .eq('jugador_id', params.jugadorId)
      .in('bloque_id', entran)
      .gte('fecha', hoyISO())

    for (const v of (visitas ?? []) as { id: string; fecha: string; pagada_en: string | null; cobrada_en: string | null }[]) {
      // Si ya se cobró, hay plata de por medio: eso se revierte desde Finanzas,
      // a mano y a la vista, no como efecto secundario de guardar un horario.
      if (v.pagada_en || v.cobrada_en) { trabadas.push(v.fecha); continue }

      const { error: errMarca } = await db.rpc('registrar_asistencia_manual', {
        p_jugador_id: params.jugadorId,
        p_fecha:      v.fecha,
        p_estado:     'presente',
        p_motivo:     'Entró al grupo: la clase extra de ese día pasó a ser asistencia normal',
      })
      if (errMarca) { trabadas.push(v.fecha); continue }

      const { error: errBorra } = await db.rpc('eliminar_clase_extraordinaria', { p_id: v.id })
      if (errBorra) { trabadas.push(v.fecha); continue }

      convertidas.push(v.fecha)
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  // Los días, la sede y el horario de la ficha ya no se escriben desde acá:
  // los recalcula la base (migración 111) cada vez que cambia una inscripción,
  // y cualquier escritura manual la corrige en silencio. Acá solo se leen de
  // vuelta, para cortar el tramo del historial si algo cambió.
  const { data: actualizado } = await supabase.from('jugadores')
    .select('horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie,sede')
    .eq('id', params.jugadorId).single()
  const campos = {
    horario:     actualizado?.horario ?? null,
    entrena_lun: actualizado?.entrena_lun ?? false,
    entrena_mar: actualizado?.entrena_mar ?? false,
    entrena_mie: actualizado?.entrena_mie ?? false,
    entrena_jue: actualizado?.entrena_jue ?? false,
    entrena_vie: actualizado?.entrena_vie ?? false,
    sede:        actualizado?.sede ?? null,
  }

  // El historial es lo que usa Inasistencias para saber qué días entrenaba
  // alguien en una fecha pasada. Solo se corta el tramo si algo cambió.
  const cambio = campos.horario !== (jugador.horario ?? null) ||
    campos.entrena_lun !== (jugador.entrena_lun ?? false) ||
    campos.entrena_mar !== (jugador.entrena_mar ?? false) ||
    campos.entrena_mie !== (jugador.entrena_mie ?? false) ||
    campos.entrena_jue !== (jugador.entrena_jue ?? false) ||
    campos.entrena_vie !== (jugador.entrena_vie ?? false)

  if (cambio) {
    // En Chile, no en UTC: desde las 20:00 el toISOString ya iba un día
    // adelante y el tramo del historial nacía mañana mientras la inscripción
    // (hoyISO) nacía hoy — Inasistencias leía dos verdades distintas.
    const hoy  = hoyISO()
    await supabase.from('jugador_horario_historial')
      .update({ vigente_hasta: cierreISO() })
      .eq('jugador_id', params.jugadorId).is('vigente_hasta', null).lt('vigente_desde', hoy)
    await supabase.from('jugador_horario_historial').insert({
      jugador_id: params.jugadorId, club_id: clubId,
      horario: campos.horario,
      entrena_lun: campos.entrena_lun, entrena_mar: campos.entrena_mar,
      entrena_mie: campos.entrena_mie, entrena_jue: campos.entrena_jue,
      entrena_vie: campos.entrena_vie,
      vigente_desde: hoy,
    })
  }

  // Qué grupos quedaron sobre su cupo. El cupo no bloquea —el club a veces pasa
  // de doce y prefiere verlo avisado antes que no poder inscribir—, pero avisar
  // solo sirve si alguien lo dice: `agregarJugadorABloque` ya devolvía este dato
  // y ninguna pantalla lo leía, y esta vía ni siquiera lo miraba. Resultado: dos
  // grupos de Menores llegaron a 31 y 32 sobre 30 sin que nada lo mencionara.
  const sobreCupo: { nombre: string; inscritos: number; cupo: number }[] = []
  for (const b of bloques.filter(x => entran.includes(x.id))) {
    if (!b.cupo_maximo) continue
    const { count } = await supabase.from('bloque_jugadores')
      .select('id', { count: 'exact', head: true })
      .eq('bloque_id', b.id).is('vigente_hasta', null)
    if ((count ?? 0) > b.cupo_maximo) {
      sobreCupo.push({ nombre: b.nombre, inscritos: count ?? 0, cupo: b.cupo_maximo })
    }
  }

  return { success: true, campos, extrasConvertidas: convertidas, extrasTrabadas: trabadas, sobreCupo }
}

export async function quitarJugadorDeBloque(params: { bloqueId: string; jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const { data: bloque } = await supabase.from('bloques_horario')
    .select('id').eq('id', params.bloqueId).eq('club_id', clubId).maybeSingle()
  if (!bloque) return { error: 'Bloque no encontrado' }

  // No se borra: se cierra el período. Que alguien haya dejado el grupo no
  // borra que estuvo, ni las asistencias que tuvo mientras estaba.
  const { error } = await supabase.from('bloque_jugadores')
    .update({ vigente_hasta: cierreISO() })
    .eq('bloque_id', params.bloqueId).eq('jugador_id', params.jugadorId)
    .is('vigente_hasta', null)
  if (error) return { error: 'No se pudo quitar del bloque: ' + error.message }

  return { success: true }
}

// `editarClase` se fue con el módulo Clases: no queda tabla que editar.
