'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { diaDesdeFecha, hhmm } from '@/lib/domain/horario'
import { fechaChile } from '@/lib/domain/fechaChile'

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

type DatosBloque = {
  nombre: string
  sede: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
  cupo_maximo: number
  cupo_libres: number
  profesorIds: string[]
}

function validar(datos: DatosBloque): string | null {
  if (!datos.nombre.trim()) return 'El nombre del bloque es obligatorio'
  if (!['buin', 'paine'].includes(datos.sede)) return 'Sede inválida'
  if (!['lun', 'mar', 'mie', 'jue', 'vie'].includes(datos.dia_semana)) return 'Día inválido'
  if (!datos.hora_inicio || !datos.hora_fin) return 'Falta la hora de inicio o de fin'
  if (hhmm(datos.hora_fin) <= hhmm(datos.hora_inicio)) return 'La hora de fin debe ser posterior a la de inicio'
  if (datos.cupo_maximo < 0 || datos.cupo_libres < 0) return 'Los cupos no pueden ser negativos'
  return null
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
      .update({ vigente_hasta: hoyISO() })
      .in('id', salen.map((r: { id: string }) => r.id))
  }

  const entran = quiero.filter(id => !actuales.includes(id))
  if (entran.length > 0) {
    await supabase.from('bloque_profesores')
      .insert(entran.map(profesor_id => ({ bloque_id: bloqueId, profesor_id })))
  }
}

export async function crearBloque(datos: DatosBloque) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const invalido = validar(datos)
  if (invalido) return { error: invalido }

  const { data, error } = await supabase.from('bloques_horario').insert({
    club_id: clubId,
    nombre: datos.nombre.trim(),
    sede: datos.sede,
    dia_semana: datos.dia_semana,
    hora_inicio: datos.hora_inicio,
    hora_fin: datos.hora_fin,
    cupo_maximo: datos.cupo_maximo,
    cupo_libres: datos.cupo_libres,
  }).select('id').single()

  if (error) {
    return { error: error.code === '23505'
      ? 'Ya existe un bloque en esa sede, ese día y a esa hora'
      : 'No se pudo crear el bloque: ' + error.message }
  }

  await guardarProfesores(supabase, data.id, datos.profesorIds)
  return { success: true, id: data.id }
}

export async function editarBloque(params: { id: string } & DatosBloque) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const { id, profesorIds, ...datos } = params
  const invalido = validar(params)
  if (invalido) return { error: invalido }

  const { error } = await supabase.from('bloques_horario').update({
    nombre: datos.nombre.trim(),
    sede: datos.sede,
    dia_semana: datos.dia_semana,
    hora_inicio: datos.hora_inicio,
    hora_fin: datos.hora_fin,
    cupo_maximo: datos.cupo_maximo,
    cupo_libres: datos.cupo_libres,
  }).eq('id', id).eq('club_id', clubId)

  if (error) {
    return { error: error.code === '23505'
      ? 'Ya existe un bloque en esa sede, ese día y a esa hora'
      : 'No se pudo guardar el bloque: ' + error.message }
  }

  await guardarProfesores(supabase, id, profesorIds)
  return { success: true }
}

export async function eliminarBloque(params: { id: string }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  // El bloque no se borra: se le cierra la vigencia. Su historia —quién
  // estaba inscrito, quién lo dictaba, quién asistió— tiene que seguir siendo
  // consultable aunque el grupo deje de funcionar.
  const { error } = await supabase.from('bloques_horario')
    .update({ vigente_hasta: hoyISO() })
    .eq('id', params.id).eq('club_id', clubId)
  if (error) return { error: 'No se pudo dar de baja el bloque: ' + error.message }

  // Y con él, las inscripciones que tenía abiertas.
  await supabase.from('bloque_jugadores')
    .update({ vigente_hasta: hoyISO() })
    .eq('bloque_id', params.id).is('vigente_hasta', null)
  return { success: true }
}

/**
 * Crea las clases de una semana a partir del horario. Se puede repetir sin
 * duplicar: las clases que ya existen para ese bloque y fecha se omiten.
 */
export async function generarSemana(params: {
  /** Fecha (YYYY-MM-DD) de cada día a generar. Los feriados se dejan fuera. */
  fechas: string[]
  sedes?: string[]
  publicar: boolean
}) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  const fechas = [...new Set(params.fechas)].filter(Boolean)
  if (fechas.length === 0) return { error: 'Elegí al menos un día' }
  if (fechas.length > 60) return { error: 'Demasiados días de una vez (máximo 60)' }

  let query = supabase.from('bloques_horario')
    .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin')
    .eq('club_id', clubId).eq('activo', true)
  if (params.sedes?.length) query = query.in('sede', params.sedes)

  const { data: bloques, error: bloquesErr } = await query
  if (bloquesErr) return { error: 'No se pudo leer el horario: ' + bloquesErr.message }
  if (!bloques?.length) return { error: 'No hay bloques en el horario semanal' }

  // Solo el profesor titular queda en la clase: `clases.profesor_id` admite uno
  // y los bloques de Fátima tienen dos. El bloque conserva la lista completa.
  const { data: titulares } = await supabase
    .from('bloque_profesores')
    .select('bloque_id,profesor_id')
    .is('vigente_hasta', null)
    .in('bloque_id', bloques.map((b: { id: string }) => b.id))

  const profesorDe = new Map<string, string>()
  for (const t of titulares ?? []) {
    if (!profesorDe.has(t.bloque_id)) profesorDe.set(t.bloque_id, t.profesor_id)
  }

  const filas = []
  for (const fecha of fechas) {
    const dia = diaDesdeFecha(fecha)
    if (!dia) continue   // fin de semana: el club no abre
    for (const b of bloques.filter((x: { dia_semana: string }) => x.dia_semana === dia)) {
      filas.push({
        club_id: clubId,
        bloque_id: b.id,
        sede: b.sede,
        fecha,
        dia_semana: dia,
        hora_inicio: b.hora_inicio,
        hora_fin: b.hora_fin,
        contenido: b.nombre,
        profesor_id: profesorDe.get(b.id) ?? null,
        publicada: params.publicar,
      })
    }
  }

  if (filas.length === 0) return { error: 'No hay bloques para los días elegidos' }

  const { data: creadas, error } = await supabase
    .from('clases')
    .upsert(filas, { onConflict: 'bloque_id,fecha', ignoreDuplicates: true })
    .select('id')

  if (error) return { error: 'No se pudieron generar las clases: ' + error.message }

  const creadasN = creadas?.length ?? 0
  return { success: true, creadas: creadasN, omitidas: filas.length - creadasN }
}

export async function agregarJugadorABloque(params: { bloqueId: string; jugadorId: string }) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  // El bloque y el jugador tienen que ser del club de quien lo hace.
  const [{ data: bloque }, { data: jugador }] = await Promise.all([
    supabase.from('bloques_horario').select('id,cupo_maximo').eq('id', params.bloqueId).eq('club_id', clubId).maybeSingle(),
    supabase.from('jugadores').select('id').eq('id', params.jugadorId).eq('club_id', clubId).maybeSingle(),
  ])
  if (!bloque) return { error: 'Bloque no encontrado' }
  if (!jugador) return { error: 'Jugador no encontrado' }

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
  let bloques: { id: string; sede: string; dia_semana: string; hora_inicio: string; hora_fin: string }[] = []
  if (ids.length > 0) {
    const { data, error } = await supabase.from('bloques_horario')
      .select('id,sede,dia_semana,hora_inicio,hora_fin')
      .eq('club_id', clubId).in('id', ids)
    if (error) return { error: 'No se pudieron leer los bloques: ' + error.message }
    bloques = data ?? []
  }
  if (bloques.length !== ids.length) return { error: 'Alguno de los bloques no es de este club' }

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
      .update({ vigente_hasta: hoyISO() })
      .in('id', salen.map((r: Abierta) => r.id))
    if (error) return { error: 'No se pudo cerrar la asignación anterior: ' + error.message }
  }

  if (entran.length > 0) {
    const { error } = await supabase.from('bloque_jugadores')
      .insert(entran.map(bloque_id => ({ bloque_id, jugador_id: params.jugadorId, vigente_desde: hoyISO() })))
    if (error) return { error: 'No se pudo asignar a los bloques: ' + error.message }
  }

  // Los campos de la ficha se derivan de los bloques recién elegidos.
  const dia = (d: string) => bloques.some(b => b.dia_semana === d)
  const enBuin  = bloques.some(b => b.sede === 'buin')
  const enPaine = bloques.some(b => b.sede === 'paine')

  // `horario` es un texto suelto que todavía usan algunos filtros. Se le pone
  // el rango que más se repite entre sus bloques; con horarios distintos por
  // día ningún texto los representa a todos.
  const conteo = new Map<string, number>()
  for (const b of bloques) {
    const rango = `${hhmm(b.hora_inicio)}-${hhmm(b.hora_fin)}`
    conteo.set(rango, (conteo.get(rango) ?? 0) + 1)
  }
  const horario = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const campos = {
    horario,
    entrena_lun: dia('lun'), entrena_mar: dia('mar'), entrena_mie: dia('mie'),
    entrena_jue: dia('jue'), entrena_vie: dia('vie'),
    ...(bloques.length > 0
      ? { sede: enBuin && enPaine ? 'ambos' : enBuin ? 'buin' : 'paine' }
      : {}),
  }

  const { error: updErr } = await supabase.from('jugadores')
    .update(campos).eq('id', params.jugadorId).eq('club_id', clubId)
  if (updErr) return { error: 'No se pudieron guardar los días: ' + updErr.message }

  // El historial es lo que usa Inasistencias para saber qué días entrenaba
  // alguien en una fecha pasada. Solo se corta el tramo si algo cambió.
  const cambio = campos.horario !== (jugador.horario ?? null) ||
    campos.entrena_lun !== (jugador.entrena_lun ?? false) ||
    campos.entrena_mar !== (jugador.entrena_mar ?? false) ||
    campos.entrena_mie !== (jugador.entrena_mie ?? false) ||
    campos.entrena_jue !== (jugador.entrena_jue ?? false) ||
    campos.entrena_vie !== (jugador.entrena_vie ?? false)

  if (cambio) {
    const hoy  = new Date().toISOString().slice(0, 10)
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    await supabase.from('jugador_horario_historial')
      .update({ vigente_hasta: ayer })
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

  return { success: true, campos }
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
    .update({ vigente_hasta: hoyISO() })
    .eq('bloque_id', params.bloqueId).eq('jugador_id', params.jugadorId)
    .is('vigente_hasta', null)
  if (error) return { error: 'No se pudo quitar del bloque: ' + error.message }

  return { success: true }
}

export async function editarClase(params: {
  id: string
  contenido: string
  hora_inicio: string
  hora_fin: string
  profesorId: string | null
  sede: string | null
  grupo: string | null
  publicada: boolean
}) {
  const { error: authErr, supabase, clubId } = await requireStaff()
  if (authErr || !supabase || !clubId) return { error: authErr ?? 'Acceso denegado' }

  if (!params.contenido.trim()) return { error: 'El nombre de la clase es obligatorio' }
  if (!params.hora_inicio) return { error: 'Falta la hora de inicio' }
  if (params.hora_fin && hhmm(params.hora_fin) <= hhmm(params.hora_inicio)) {
    return { error: 'La hora de fin debe ser posterior a la de inicio' }
  }

  const { error } = await supabase.from('clases').update({
    contenido: params.contenido.trim(),
    hora_inicio: params.hora_inicio,
    hora_fin: params.hora_fin || null,
    profesor_id: params.profesorId || null,
    sede: params.sede || null,
    grupo: params.grupo?.trim() || null,
    publicada: params.publicada,
  }).eq('id', params.id).eq('club_id', clubId)

  if (error) return { error: 'No se pudo guardar la clase: ' + error.message }
  return { success: true }
}
