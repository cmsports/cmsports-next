'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyISO, sumarMesesISO, vencimientoTrasPago } from '@/lib/domain/suscripciones'
import { MODULOS_KEYS, conDependencias } from '@/lib/domain/modulos'
import { BUCKET_PRIVADO, CARPETA_FACTURAS, rutaFacturaCmsports } from '@/lib/supabase/privado'

const crearClubSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre del club'),
  ciudad: z.string().trim(),
  deporte: z.string().trim(),
  planMensual: z.number().min(0, 'El plan mensual no puede ser negativo'),
  // Las claves desconocidas las descarta `conDependencias`, que es la misma
  // validación que usa `actualizarModulosClub`. Un solo criterio para los dos
  // caminos que escriben `modulos_habilitados`.
  modulos: z.array(z.string()).optional(),
  adminNombre: z.string().trim().min(2, 'Ingresa el nombre del administrador'),
  adminEmail: z.string().trim().email('Ingresa un correo válido'),
  passwordProvisoria: z.string().min(8, 'La contraseña provisoria debe tener al menos 8 caracteres'),
})

export async function crearClub(input: {
  nombre: string
  ciudad: string
  deporte: string
  planMensual: number
  modulos?: string[]
  adminNombre: string
  adminEmail: string
  passwordProvisoria: string
}) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }

  const parsed = crearClubSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data
  const modulosFinales = conDependencias(data.modulos ?? MODULOS_KEYS)

  const { data: club, error: clubError } = await supabase.from('clubes').insert({
    nombre: data.nombre,
    ciudad: data.ciudad || null,
    deporte: data.deporte || null,
    plan_mensual: data.planMensual,
    estado_pago: 'pendiente',
    modulos_habilitados: modulosFinales,
  }).select('id,nombre').single()
  if (clubError || !club) return { error: 'Error al crear el club' }

  const admin = createAdminClient()
  const { data: usuario, error: usuarioError } = await admin.auth.admin.createUser({
    email: data.adminEmail.toLowerCase(),
    password: data.passwordProvisoria,
    email_confirm: true,
    user_metadata: { nombre: data.adminNombre },
  })
  if (usuarioError || !usuario.user) {
    await admin.from('clubes').delete().eq('id', club.id)
    return { error: usuarioError?.message?.includes('already') ? 'Ese correo ya tiene una cuenta' : 'Error al crear la cuenta administradora' }
  }

  const { error: perfilError } = await admin.from('perfiles').upsert({
    id: usuario.user.id,
    club_id: club.id,
    nombre: data.adminNombre,
    email: data.adminEmail.toLowerCase(),
    rol: 'admin',
    jugador_id: null,
  }, { onConflict: 'id' })
  if (perfilError) {
    await admin.auth.admin.deleteUser(usuario.user.id)
    await admin.from('clubes').delete().eq('id', club.id)
    return { error: 'Error al vincular el administrador con el club' }
  }

  revalidatePath('/superadmin')
  return { success: true }
}

async function eliminarCarpetaClub(admin: ReturnType<typeof createAdminClient>, bucket: string, clubId: string) {
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(clubId, { limit: 100 })
    if (error) return error
    const archivos = (data || []).filter(item => item.id).map(item => `${clubId}/${item.name}`)
    if (!archivos.length) return null
    const { error: removeError } = await admin.storage.from(bucket).remove(archivos)
    if (removeError) return removeError
  }
}

// Todas las tablas con `club_id`, sacadas del esquema real y no de memoria.
// Ir agregándolas de a una a medida que reventaba la llave foránea dejó
// "Eliminar club" roto tres veces seguidas: torneos, después ligas, después
// audit_log. Están todas para que no haya una cuarta.
//
// `movimientos` va acá, se borra. La regla de "la plata de un mes cerrado no
// cambia" es para cuando se da de baja a un JUGADOR: el club sigue existiendo
// y sus totales no pueden moverse porque alguien se fue, por eso
// eliminar_jugador_atomico solo le suelta el `jugador_id`. Borrar el club
// entero es otra cosa: no queda ningún balance al que pertenezcan esas filas,
// y dejarlas con `club_id = NULL` es plata sin dueño que se suma sola en
// cualquier consulta que no filtre por club —el mismo enredo que ya causaron
// las consultas de diagnóstico sin filtro—. El diálogo de confirmación además
// avisa que se borran los pagos.
//
// Fuera de esta lista quedan a propósito las cuatro que tienen su propio
// camino más abajo: `jugadores` (eliminar_jugador_atomico, que arrastra sus
// hijos), `torneos` y `ligas` (borran su árbol completo) y `perfiles` (se va
// con la cuenta de auth).
const TABLAS_BORRAR_POR_CLUB = [
  '_respaldo_asistencia_089', '_respaldo_mensualidades_089', '_respaldo_movimientos_089',
  'actividad', 'asistencia', 'audit_log', 'auditoria_asistencia', 'auditoria_mensualidades',
  'bloques_horario', 'clases_extraordinarias', 'credencial_visible', 'cuotas',
  'evaluaciones_trimestrales', 'eventos', 'feedback_jugadores', 'finanzas_operaciones',
  'flyer_referencias', 'fotos_galeria', 'grupos_entrenamiento', 'invitaciones',
  'jugador_documentos', 'jugador_horario_historial', 'kioscos_asistencia',
  'mensualidades', 'movimientos', 'pagos_clubes', 'partidos', 'presupuestos', 'profesores',
  // 'ranking_general' se fue con la migración 140. Acá importaba especialmente:
  // el barrido da varias vueltas y se corta cuando una pasada no borra nada,
  // así que una tabla inexistente en la lista solo suma un error por vuelta.
  'solicitudes_jugador', 'tienda_asociacion_productos',
  'tienda_buin_productos', 'torneos_externos', 'usuarios', 'vouchers',
] as const

// Barre las tablas de arriba dando varias vueltas. Si una no se puede borrar
// todavía porque otra la referencia, la vuelta siguiente ya la encuentra
// libre; se corta cuando una pasada entera no logra borrar nada nuevo. Así no
// hay que codificar a mano el orden de dependencias entre 34 tablas, que es
// justo lo que se venía equivocando.
async function barrerTablasDelClub(admin: ReturnType<typeof createAdminClient>, clubId: string) {
  let pendientes: string[] = [...TABLAS_BORRAR_POR_CLUB]
  const errores = new Map<string, string>()

  while (pendientes.length) {
    const fallaron: string[] = []
    for (const tabla of pendientes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any).from(tabla).delete().eq('club_id', clubId)
      if (error) { fallaron.push(tabla); errores.set(tabla, error.message) }
      else errores.delete(tabla)
    }
    if (fallaron.length === pendientes.length) {
      // Una vuelta entera sin avanzar: lo que queda no se destraba solo.
      return `No se pudieron vaciar estas tablas: ${fallaron
        .map(t => `${t} (${errores.get(t)})`).join('; ')}`
    }
    pendientes = fallaron
  }
  return null
}

// torneos.club_id no tenía ningún borrado asociado: un club con torneos
// organizados (no solo jugadores inscritos, ya cubiertos por
// eliminar_jugador_atomico) rompía "Eliminar club" con
// "torneos_club_id_fkey" apenas llegaba a borrar la fila de `clubes`.
// Se borra el árbol completo del torneo en orden de dependencia: los hijos
// que apuntan a torneo_grupos primero, después los que apuntan a torneos,
// y al final el torneo. movimientos.torneo_id se suelta solo (ON DELETE SET
// NULL, migración 024): la plata generada por el torneo no se borra.
async function eliminarTorneosDelClub(admin: ReturnType<typeof createAdminClient>, clubId: string) {
  const { data: torneos, error: torneosError } = await admin.from('torneos').select('id').eq('club_id', clubId)
  if (torneosError) return torneosError
  const torneoIds = (torneos || []).map(t => t.id)
  if (!torneoIds.length) return null

  const { data: grupos, error: gruposError } = await admin.from('torneo_grupos').select('id').in('torneo_id', torneoIds)
  if (gruposError) return gruposError
  const grupoIds = (grupos || []).map(g => g.id)

  // torneo_partidos se borra ANTES que grupo_jugadores a propósito: el
  // trigger que impide borrar de grupo_jugadores a alguien con partidos
  // jugados mira si ese partido sigue existiendo — si ya no está, no hay
  // nada que orfanar y borrar el club completo no queda bloqueado.
  const { error: partidosError } = await admin.from('torneo_partidos').delete().in('torneo_id', torneoIds)
  if (partidosError) return partidosError

  if (grupoIds.length) {
    const { error } = await admin.from('grupo_jugadores').delete().in('grupo_id', grupoIds)
    if (error) return error
  }

  for (const tabla of ['torneo_jugadores', 'torneo_pagos', 'torneo_felicitaciones', 'torneo_cabezas_serie'] as const) {
    const { error } = await admin.from(tabla).delete().in('torneo_id', torneoIds)
    if (error) return error
  }

  const { error: gruposDeleteError } = await admin.from('torneo_grupos').delete().in('torneo_id', torneoIds)
  if (gruposDeleteError) return gruposDeleteError

  const { error: solicitudesError } = await admin.from('solicitudes_jugador').delete().in('torneo_id', torneoIds)
  if (solicitudesError) return solicitudesError

  const { error: torneosDeleteError } = await admin.from('torneos').delete().in('id', torneoIds)
  if (torneosDeleteError) return torneosDeleteError

  return null
}

// Mismo problema que con torneos, pero para ligas: liga_id no tenía ningún
// borrado asociado. liga_abonos se va solo al borrar liga_jugador_pagos
// (ON DELETE CASCADE, migración 016).
async function eliminarLigasDelClub(admin: ReturnType<typeof createAdminClient>, clubId: string) {
  const { data: ligas, error: ligasError } = await admin.from('ligas').select('id').eq('club_id', clubId)
  if (ligasError) return ligasError
  const ligaIds = (ligas || []).map(l => l.id)
  if (!ligaIds.length) return null

  const { data: divisiones, error: divisionesError } = await admin.from('liga_divisiones').select('id').in('liga_id', ligaIds)
  if (divisionesError) return divisionesError
  const divisionIds = (divisiones || []).map(d => d.id)

  const { error: partidosError } = await admin.from('liga_partidos').delete().in('liga_id', ligaIds)
  if (partidosError) return partidosError

  if (divisionIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: pagosError } = await (admin as any).from('liga_jugador_pagos').delete().in('division_id', divisionIds)
    if (pagosError) return pagosError
    const { error: divJugadoresError } = await admin.from('liga_division_jugadores').delete().in('division_id', divisionIds)
    if (divJugadoresError) return divJugadoresError
  }

  for (const tabla of ['liga_fechas', 'liga_mesas', 'liga_divisiones'] as const) {
    const { error } = await admin.from(tabla).delete().in('liga_id', ligaIds)
    if (error) return error
  }

  const { error: ligasDeleteError } = await admin.from('ligas').delete().in('id', ligaIds)
  if (ligasDeleteError) return ligasDeleteError

  return null
}

export async function eliminarClub(input: { clubId: string; confirmacion: string }) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  if (!z.string().uuid().safeParse(input.clubId).success) return { error: 'Club inválido' }

  const { data: club, error: clubError } = await supabase.from('clubes')
    .select('id,nombre').eq('id', input.clubId).single()
  if (clubError || !club) return { error: 'Club no encontrado' }
  if (input.confirmacion.trim() !== club.nombre) return { error: 'El nombre de confirmación no coincide' }

  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: perfiles, error: perfilesError } = await admin.from('perfiles')
    .select('id').eq('club_id', club.id)
  if (perfilesError) return { error: 'No se pudieron identificar las cuentas del club' }
  const cuentas = (perfiles || []).map(perfil => perfil.id).filter(id => id !== user?.id)

  // jugadores.club_id no tiene ON DELETE CASCADE hacia clubes, así que un club
  // con jugadores reales bloqueaba el borrado con una violación de llave
  // foránea. Se borran uno por uno con la misma función que ya usa "Eliminar
  // jugador" (migración 127): arrastra asistencia, mensualidades, torneos y
  // todo lo que depende de cada jugador, y conserva sus movimientos
  // financieros (solo se les suelta la referencia) en vez de borrarlos.
  const { data: jugadoresClub, error: jugadoresError } = await admin.from('jugadores')
    .select('id').eq('club_id', club.id)
  if (jugadoresError) return { error: 'No se pudieron identificar los jugadores del club' }
  for (const jugador of jugadoresClub || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).rpc('eliminar_jugador_atomico', { p_jugador_id: jugador.id })
    if (error) return { error: `No se pudo eliminar un jugador del club (id ${jugador.id}): ${error.message}. El club no se borró.` }
  }

  for (const bucket of ['flyer-referencias', 'galeria-fotos']) {
    const error = await eliminarCarpetaClub(admin, bucket, club.id)
    if (error) return { error: `No se pudieron eliminar los archivos del club: ${error.message}` }
  }

  // torneos.club_id y ligas.club_id tampoco tienen ON DELETE CASCADE: un club
  // con torneos o ligas propias (no solo jugadores inscritos) bloqueaba el
  // borrado con "torneos_club_id_fkey" apenas se intentaba borrar `clubes`.
  const torneosError = await eliminarTorneosDelClub(admin, club.id)
  if (torneosError) return { error: `No se pudieron eliminar los torneos del club: ${torneosError.message}. El club no se borró.` }
  const ligasError = await eliminarLigasDelClub(admin, club.id)
  if (ligasError) return { error: `No se pudieron eliminar las ligas del club: ${ligasError.message}. El club no se borró.` }

  // Todas las tablas con club_id, de una sola vez.
  const errorBarrido = await barrerTablasDelClub(admin, club.id)
  if (errorBarrido) return { error: `${errorBarrido}. El club no se borró.` }

  // Las cuentas de staff se borran ANTES del club: perfiles.club_id es lo
  // último que podía bloquear el borrado de `clubes`. Antes esto se hacía
  // después, dejando el intento encadenado a que la fila de `clubes` ya no
  // existiera para "liberar" nada.
  //
  // El perfil se borra a mano primero, en vez de confiar en que se vaya solo
  // al borrar la cuenta: la migración 126 le puso ON DELETE CASCADE a
  // `perfiles.id -> auth.users(id)`, pero se ejecuta a mano y puede no estar
  // aplicada. Sin el cascade, deleteUser rebota con "Database error deleting
  // user" —que en realidad es la FK perfiles_id_fkey— y el club no se borra
  // nunca. Borrando el perfil antes, el resultado es el mismo con o sin la
  // migración puesta.
  let cuentasFallidas = 0
  for (const cuentaId of cuentas) {
    const { error: perfilError } = await admin.from('perfiles').delete().eq('id', cuentaId)
    if (perfilError) { cuentasFallidas++; continue }
    const { error } = await admin.auth.admin.deleteUser(cuentaId)
    if (error) cuentasFallidas++
  }
  if (cuentasFallidas) return { error: `No se pudieron eliminar ${cuentasFallidas} cuenta(s) del club. El club no se borró.` }

  const { error: deleteError } = await admin.from('clubes').delete().eq('id', club.id)
  if (deleteError) return { error: `No se pudo eliminar el club: ${deleteError.message}` }

  // Recién acá, con el club ya borrado de verdad: si el superadmin lo tenía
  // "gestionando" en ese momento, su perfil quedaría apuntando a un club
  // inexistente. Antes esto se hacía ANTES de intentar borrar, sin condición
  // de que fuera este club: un intento fallido (como el de la llave foránea de
  // jugadores) dejaba al superadmin sin club igual, aunque el club siguiera
  // existiendo — por eso "Gestionar" después aterrizaba en un dashboard vacío.
  if (user?.id) {
    const { error } = await admin.from('perfiles').update({ club_id: null })
      .eq('id', user.id).eq('rol', 'superadmin').eq('club_id', club.id)
    if (error) return { error: 'El club se eliminó, pero no se pudo liberar el acceso del superadmin' }
  }

  revalidatePath('/superadmin')
  return { success: true }
}

export async function actualizarModulosClub(input: { clubId: string; modulos: string[] }) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  const modulosFinales = conDependencias(input.modulos)
  const { error } = await supabase.from('clubes')
    .update({ modulos_habilitados: modulosFinales })
    .eq('id', input.clubId)
  if (error) return { error: 'Error al actualizar modulos' }
  revalidatePath('/superadmin')
  return { success: true }
}

const actualizarPlanSchema = z.object({
  clubId: z.string().uuid('Club inválido'),
  planMensual: z.number().finite().min(0, 'El plan mensual no puede ser negativo'),
  estadoPlan: z.enum(['prueba', 'activo', 'suspendido', 'cancelado']),
  fechaInicioPlan: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de inicio inválida').nullable(),
})

export async function actualizarPlanClub(input: {
  clubId: string
  planMensual: number
  estadoPlan: 'prueba' | 'activo' | 'suspendido' | 'cancelado'
  fechaInicioPlan: string | null
}) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }

  const parsed = actualizarPlanSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data
  if (data.estadoPlan === 'activo' && data.planMensual <= 0) return { error: 'Define un monto antes de activar el plan' }
  if (data.estadoPlan === 'activo' && !data.fechaInicioPlan) return { error: 'Define la fecha de inicio del plan activo' }

  const { data: actual, error: actualError } = await supabase.from('clubes')
    .select('fecha_inicio_plan,proximo_vencimiento')
    .eq('id', data.clubId)
    .single()
  if (actualError || !actual) return { error: 'No se encontró el club' }

  let fechaInicio = data.fechaInicioPlan
  let proximoVencimiento: string | null = null
  if (data.estadoPlan === 'activo' && fechaInicio) {
    proximoVencimiento = actual.fecha_inicio_plan === fechaInicio && actual.proximo_vencimiento
      ? actual.proximo_vencimiento
      : sumarMesesISO(fechaInicio)
  } else if (data.estadoPlan === 'suspendido') {
    fechaInicio = actual.fecha_inicio_plan
    proximoVencimiento = actual.proximo_vencimiento
  } else {
    fechaInicio = null
  }

  const pagoVencido = data.estadoPlan === 'activo' && !!proximoVencimiento && proximoVencimiento <= hoyISO()
  const { error } = await supabase.from('clubes')
    .update({
      plan_mensual: data.planMensual,
      estado_plan: data.estadoPlan,
      fecha_inicio_plan: fechaInicio,
      proximo_vencimiento: proximoVencimiento,
      estado_pago: pagoVencido ? 'pendiente' : 'pagado',
    })
    .eq('id', data.clubId)
  if (error) return { error: 'Error al actualizar el plan' }
  revalidatePath('/superadmin/finanzas')
  return { success: true }
}

export async function registrarPagoClub(input: {
  clubId: string
  monto: number
  periodoMes: number
  periodoAnio: number
  metodo: string
  notas: string
  fechaPago?: string
  concepto?: string
  montoNeto?: number
}) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }

  const parsed = z.object({
    clubId: z.string().uuid('Club inválido'),
    monto: z.number().finite().positive('El monto debe ser mayor a cero'),
    periodoMes: z.number().int().min(1).max(12),
    periodoAnio: z.number().int().min(2020).max(2100),
    metodo: z.enum(['transferencia', 'efectivo', 'otro']),
    notas: z.string().trim().max(500, 'Las notas son demasiado largas'),
    // La fecha se pide para poder registrar lo de atrás: los pagos viejos
    // entran con el día en que la plata llegó de verdad, no con el de hoy.
    fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de pago inválida').optional(),
    concepto: z.enum(['mensualidad', 'implementacion', 'soporte', 'otro']).optional(),
    // El neto sin IVA, cuando el pago viene desglosado. El IVA no se pide
    // aparte: es `monto - montoNeto`, y guardarlo por separado sería el mismo
    // dato dos veces.
    montoNeto: z.number().finite().positive('El neto debe ser mayor a cero').optional(),
  }).refine(d => d.montoNeto === undefined || d.montoNeto <= d.monto, {
    message: 'El neto no puede ser mayor que el monto total', path: ['montoNeto'],
  }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data
  const concepto = data.concepto ?? 'mensualidad'

  const { data: club, error: clubError } = await supabase.from('clubes')
    .select('estado_plan,proximo_vencimiento,fecha_inicio_plan')
    .eq('id', data.clubId)
    .single()
  if (clubError || !club) return { error: 'No se encontró el club' }

  const { data: creado, error } = await supabase.from('pagos_clubes').insert({
    club_id: data.clubId,
    monto: data.monto,
    periodo_mes: data.periodoMes,
    periodo_anio: data.periodoAnio,
    fecha_pago: data.fechaPago ?? hoyISO(),
    metodo: data.metodo,
    notas: data.notas || null,
    concepto,
    monto_neto: data.montoNeto ?? null,
  }).select('id').single()
  if (error || !creado) return { error: 'Error al registrar el pago' }

  // Solo la mensualidad corre el vencimiento. La implementación y el soporte
  // se cobran una vez y no compran un mes de plan: contarlos como tal regalaba
  // un mes cada vez que se registraba uno.
  if (concepto === 'mensualidad') {
    const { error: estadoError } = await supabase.from('clubes')
      .update({
        estado_pago: 'pagado',
        proximo_vencimiento: club.estado_plan === 'activo'
          ? vencimientoTrasPago({
              fechaInicioPlan: club.fecha_inicio_plan,
              proximoVencimiento: club.proximo_vencimiento,
              periodoMes: data.periodoMes,
              periodoAnio: data.periodoAnio,
            })
          : club.proximo_vencimiento,
      })
      .eq('id', data.clubId)
    if (estadoError) return { error: 'Pago registrado pero fallo actualizar el estado' }
  }

  revalidatePath('/superadmin/finanzas')
  return { success: true, pagoId: creado.id }
}

const pagoClubSchema = z.object({
  monto: z.number().finite().positive('El monto debe ser mayor a cero'),
  periodoMes: z.number().int().min(1).max(12),
  periodoAnio: z.number().int().min(2020).max(2100),
  metodo: z.enum(['transferencia', 'efectivo', 'otro']),
  notas: z.string().trim().max(500, 'Las notas son demasiado largas'),
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de pago inválida'),
  concepto: z.enum(['mensualidad', 'implementacion', 'soporte', 'otro']),
  montoNeto: z.number().finite().positive('El neto debe ser mayor a cero').optional(),
}).refine(d => d.montoNeto === undefined || d.montoNeto <= d.monto, {
  message: 'El neto no puede ser mayor que el monto total', path: ['montoNeto'],
})

/**
 * Corrige un pago ya registrado — monto, fecha, concepto o desglose mal
 * ingresados.
 *
 * No toca `proximo_vencimiento` del club. Ese campo lo mueve
 * `registrarPagoClub` al CREAR un pago de mensualidad, y deshacer ese cálculo
 * al editar exige saber si hubo otros pagos entre medio — más riesgo de
 * corromper la fecha que el error de tipeo que se está arreglando. Si
 * corregir el monto también corrió el vencimiento, se ajusta a mano desde
 * "editar plan".
 */
export async function editarPagoClub(input: {
  pagoId: string
  monto: number
  periodoMes: number
  periodoAnio: number
  metodo: string
  notas: string
  fechaPago: string
  concepto: string
  montoNeto?: number
}) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  if (!z.string().uuid().safeParse(input.pagoId).success) return { error: 'Pago inválido' }

  const parsed = pagoClubSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data

  const { error } = await supabase.from('pagos_clubes').update({
    monto: data.monto,
    periodo_mes: data.periodoMes,
    periodo_anio: data.periodoAnio,
    fecha_pago: data.fechaPago,
    metodo: data.metodo,
    notas: data.notas || null,
    concepto: data.concepto,
    monto_neto: data.montoNeto ?? null,
  }).eq('id', input.pagoId)
  if (error) return { error: 'Error al editar el pago' }

  revalidatePath('/superadmin/finanzas')
  return { success: true }
}

export async function eliminarPagoClub(input: { pagoId: string }) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  if (!z.string().uuid().safeParse(input.pagoId).success) return { error: 'Pago inválido' }

  const { data: pago, error: leerError } = await supabase.from('pagos_clubes')
    .select('factura_path').eq('id', input.pagoId).maybeSingle()
  if (leerError) return { error: 'No se pudo leer el pago' }

  const { error } = await supabase.from('pagos_clubes').delete().eq('id', input.pagoId)
  if (error) return { error: 'Error al eliminar el pago' }

  // Mismo orden que `eliminarGastoCmsports`: el archivo después de la fila.
  if (pago?.factura_path) {
    await createAdminClient().storage.from(BUCKET_PRIVADO).remove([pago.factura_path])
  }

  revalidatePath('/superadmin/finanzas')
  return { success: true }
}

// ── Gastos de CmSports ──────────────────────────────────────────────────
// La otra mitad del resultado. Hasta la migración 255 la pantalla se llamaba
// "Finanzas" y solo sabía sumar ingresos.

export async function registrarGastoCmsports(input: {
  fecha: string
  monto: number
  categoria: string
  descripcion: string
  proveedor: string
}) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }

  const parsed = z.object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    monto: z.number().finite().positive('El monto debe ser mayor a cero'),
    categoria: z.string().trim().min(2, 'Escribe una categoría').max(60),
    descripcion: z.string().trim().min(2, 'Escribe en qué se gastó').max(300),
    proveedor: z.string().trim().max(120),
  }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data

  const { data: creado, error } = await supabase.from('gastos_cmsports').insert({
    fecha: data.fecha,
    monto: data.monto,
    categoria: data.categoria,
    descripcion: data.descripcion,
    proveedor: data.proveedor || null,
  }).select('id').single()
  if (error || !creado) return { error: 'Error al registrar el gasto' }

  revalidatePath('/superadmin/finanzas')
  return { success: true, gastoId: creado.id }
}

export async function editarGastoCmsports(input: {
  gastoId: string
  fecha: string
  monto: number
  categoria: string
  descripcion: string
  proveedor: string
}) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  if (!z.string().uuid().safeParse(input.gastoId).success) return { error: 'Gasto inválido' }

  const parsed = z.object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    monto: z.number().finite().positive('El monto debe ser mayor a cero'),
    categoria: z.string().trim().min(2, 'Escribe una categoría').max(60),
    descripcion: z.string().trim().min(2, 'Escribe en qué se gastó').max(300),
    proveedor: z.string().trim().max(120),
  }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data

  const { error } = await supabase.from('gastos_cmsports').update({
    fecha: data.fecha,
    monto: data.monto,
    categoria: data.categoria,
    descripcion: data.descripcion,
    proveedor: data.proveedor || null,
  }).eq('id', input.gastoId)
  if (error) return { error: 'Error al editar el gasto' }

  revalidatePath('/superadmin/finanzas')
  return { success: true }
}

export async function eliminarGastoCmsports(input: { gastoId: string }) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  if (!z.string().uuid().safeParse(input.gastoId).success) return { error: 'Gasto inválido' }

  const { data: gasto, error: leerError } = await supabase.from('gastos_cmsports')
    .select('factura_path').eq('id', input.gastoId).maybeSingle()
  if (leerError) return { error: 'No se pudo leer el gasto' }

  const { error } = await supabase.from('gastos_cmsports').delete().eq('id', input.gastoId)
  if (error) return { error: 'Error al eliminar el gasto' }

  // El archivo después de la fila: si esto falla queda un PDF huérfano en el
  // bucket, que es molesto y nada más. Al revés —borrar el archivo y que falle
  // la fila— dejaría un gasto apuntando a una factura que ya no existe.
  if (gasto?.factura_path) {
    await createAdminClient().storage.from(BUCKET_PRIVADO).remove([gasto.factura_path])
  }

  revalidatePath('/superadmin/finanzas')
  return { success: true }
}

// ── Facturas ────────────────────────────────────────────────────────────

const EXT_FACTURA: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Sube (o reemplaza) la factura de un pago o de un gasto.
 *
 * Se acepta imagen además de PDF a propósito: la boleta de una compra chica
 * llega como foto del celular, y obligar a convertirla a PDF es la clase de
 * fricción que termina con la factura guardada en ninguna parte.
 */
export async function subirFacturaCmsports(input: {
  tipo: 'pagos' | 'gastos'
  id: string
  base64: string
  nombreArchivo: string
}) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  if (input.tipo !== 'pagos' && input.tipo !== 'gastos') return { error: 'Tipo inválido' }
  if (!z.string().uuid().safeParse(input.id).success) return { error: 'Registro inválido' }

  const mime = input.base64.match(/^data:([^;]+);base64,/)?.[1] || ''
  const ext = EXT_FACTURA[mime]
  if (!ext) return { error: 'Formato inválido. Se acepta PDF, JPG, PNG o WEBP.' }

  const buffer = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ''), 'base64')
  if (buffer.byteLength > 10 * 1024 * 1024) return { error: 'El archivo supera los 10 MB' }

  const tabla = input.tipo === 'pagos' ? 'pagos_clubes' : 'gastos_cmsports'
  const { data: fila, error: leerError } = await supabase.from(tabla)
    .select('factura_path').eq('id', input.id).maybeSingle()
  if (leerError) return { error: 'No se pudo leer el registro' }
  if (!fila) return { error: 'No se encontró el registro' }

  const admin = createAdminClient()
  const path = rutaFacturaCmsports(input.tipo, input.id, ext)

  // La anterior puede tener otra extensión (PDF reemplazado por foto): sin
  // esto quedaría huérfana en el bucket y nadie volvería a mirarla.
  if (fila.factura_path && fila.factura_path !== path) {
    await admin.storage.from(BUCKET_PRIVADO).remove([fila.factura_path])
  }

  const { error: upErr } = await admin.storage.from(BUCKET_PRIVADO)
    .upload(path, buffer, { contentType: mime, upsert: true })
  if (upErr) return { error: 'Error al subir la factura: ' + upErr.message }

  const { error: dbErr } = await supabase.from(tabla).update({
    factura_path: path,
    factura_nombre: input.nombreArchivo.slice(0, 200),
  }).eq('id', input.id)
  if (dbErr) return { error: 'La factura se subió pero no quedó registrada: ' + dbErr.message }

  revalidatePath('/superadmin/finanzas')
  return { success: true, path, nombreArchivo: input.nombreArchivo.slice(0, 200) }
}

/**
 * Enlace de descarga, firmado y con vencimiento.
 *
 * Se firma de a una y al hacer clic, no todas al cargar la pantalla: la lista
 * de ingresos y gastos crece para siempre y firmar cien archivos que nadie va
 * a abrir es una petición grande cada vez que alguien entra a mirar el total.
 */
export async function urlFacturaCmsports(input: { path: string }) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }

  // Solo rutas de facturas de CmSports. La ruta viene del navegador, y sin
  // este cerco esta acción firmaría cualquier archivo del bucket privado
  // —incluidos los documentos personales de los jugadores de cualquier club—.
  if (!input.path.startsWith(`${CARPETA_FACTURAS}/`) || input.path.includes('..')) {
    return { error: 'Ruta inválida' }
  }

  const { data, error } = await createAdminClient().storage
    .from(BUCKET_PRIVADO).createSignedUrl(input.path, 3600)
  if (error || !data?.signedUrl) return { error: 'No se pudo generar el enlace' }
  return { success: true, url: data.signedUrl }
}


