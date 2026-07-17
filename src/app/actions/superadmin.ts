'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyISO, sumarMesesISO } from '@/lib/domain/suscripciones'

const MODULOS_VALIDOS = ['torneos', 'liga', 'clases', 'calendario', 'asistencia', 'mensualidades', 'finanzas', 'redes', 'tienda'] as const

const crearClubSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre del club'),
  ciudad: z.string().trim(),
  deporte: z.string().trim(),
  planMensual: z.number().min(0, 'El plan mensual no puede ser negativo'),
  modulos: z.array(z.enum(MODULOS_VALIDOS)).optional(),
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
  const modulos = data.modulos ?? [...MODULOS_VALIDOS]
  const modulosFinales = modulos.includes('mensualidades') && !modulos.includes('finanzas')
    ? [...modulos, 'finanzas']
    : modulos

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

  if (user?.id) {
    const { error } = await admin.from('perfiles').update({ club_id: null }).eq('id', user.id).eq('rol', 'superadmin')
    if (error) return { error: 'No se pudo liberar el acceso del superadmin' }
  }

  for (const bucket of ['flyer-referencias', 'galeria-fotos']) {
    const error = await eliminarCarpetaClub(admin, bucket, club.id)
    if (error) return { error: `No se pudieron eliminar los archivos del club: ${error.message}` }
  }

  // Esta relación histórica no tiene ON DELETE CASCADE en producción.
  const { error: invitacionesError } = await admin.from('invitaciones').delete().eq('club_id', club.id)
  if (invitacionesError) return { error: `No se pudieron eliminar las invitaciones del club: ${invitacionesError.message}` }

  const { error: deleteError } = await admin.from('clubes').delete().eq('id', club.id)
  if (deleteError) return { error: `No se pudo eliminar el club: ${deleteError.message}` }

  let cuentasFallidas = 0
  for (const cuentaId of cuentas) {
    const { error } = await admin.auth.admin.deleteUser(cuentaId)
    if (error) cuentasFallidas++
  }
  if (cuentasFallidas) return { error: `El club fue eliminado, pero ${cuentasFallidas} cuenta(s) asociada(s) no pudieron borrarse` }

  revalidatePath('/superadmin')
  return { success: true }
}

export async function actualizarModulosClub(input: { clubId: string; modulos: string[] }) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  const modulos = input.modulos.filter((modulo): modulo is typeof MODULOS_VALIDOS[number] => MODULOS_VALIDOS.includes(modulo as typeof MODULOS_VALIDOS[number]))
  const modulosFinales = modulos.includes('mensualidades') && !modulos.includes('finanzas') ? [...modulos, 'finanzas'] : modulos
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
  }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data

  const { data: club, error: clubError } = await supabase.from('clubes')
    .select('estado_plan,proximo_vencimiento')
    .eq('id', data.clubId)
    .single()
  if (clubError || !club) return { error: 'No se encontró el club' }

  const { error } = await supabase.from('pagos_clubes').insert({
    club_id: data.clubId,
    monto: data.monto,
    periodo_mes: data.periodoMes,
    periodo_anio: data.periodoAnio,
    metodo: data.metodo,
    notas: data.notas || null,
  })
  if (error) return { error: 'Error al registrar el pago' }

  const baseVencimiento = club.proximo_vencimiento || hoyISO()
  const { error: estadoError } = await supabase.from('clubes')
    .update({
      estado_pago: 'pagado',
      proximo_vencimiento: club.estado_plan === 'activo' ? sumarMesesISO(baseVencimiento) : club.proximo_vencimiento,
    })
    .eq('id', data.clubId)
  if (estadoError) return { error: 'Pago registrado pero fallo actualizar el estado' }

  revalidatePath('/superadmin/finanzas')
  return { success: true }
}

