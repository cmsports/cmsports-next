'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { diaDesdeFecha, hhmm } from '@/lib/domain/horario'

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
  return { error: null, supabase, clubId: perfil.club_id }
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
  await supabase.from('bloque_profesores').delete().eq('bloque_id', bloqueId)
  const filas = [...new Set(profesorIds)].filter(Boolean).map(profesor_id => ({ bloque_id: bloqueId, profesor_id }))
  if (filas.length > 0) await supabase.from('bloque_profesores').insert(filas)
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

  // Las clases ya generadas se conservan: son historia y pueden tener
  // asistencia registrada. Solo quedan sin bloque asociado.
  const { error } = await supabase.from('bloques_horario').delete().eq('id', params.id).eq('club_id', clubId)
  if (error) return { error: 'No se pudo eliminar el bloque: ' + error.message }
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
    .in('bloque_id', bloques.map(b => b.id))

  const profesorDe = new Map<string, string>()
  for (const t of titulares ?? []) {
    if (!profesorDe.has(t.bloque_id)) profesorDe.set(t.bloque_id, t.profesor_id)
  }

  const filas = []
  for (const fecha of fechas) {
    const dia = diaDesdeFecha(fecha)
    if (!dia) continue   // fin de semana: el club no abre
    for (const b of bloques.filter(x => x.dia_semana === dia)) {
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
