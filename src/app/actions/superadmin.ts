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

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]!)
}

async function enviarBienvenidaClub(input: { club: string; nombre: string; email: string; password: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) return { error: 'Falta configurar el correo de bienvenida' }

  const host = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  const loginUrl = `${host || 'http://localhost:3000'}/login`
  const club = escapeHtml(input.club)
  const nombre = escapeHtml(input.nombre)
  const email = escapeHtml(input.email)
  const password = escapeHtml(input.password)

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `Bienvenido a CmSports — ${input.club}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#0f172a">
          <h1 style="color:#4f46e5">Bienvenido a CmSports</h1>
          <p>Hola ${nombre},</p>
          <p>Tu club <strong>${club}</strong> ya está habilitado. Estos son tus datos de acceso como administrador:</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0">
            <p style="margin:0 0 8px"><strong>Correo:</strong> ${email}</p>
            <p style="margin:0"><strong>Contraseña provisoria:</strong> ${password}</p>
          </div>
          <p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:11px 18px;border-radius:8px">Ingresar a CmSports</a></p>
          <p>Al ingresar, ve a <strong>Configuración → Cambiar contraseña</strong>. Escribe esta contraseña provisoria como contraseña actual y luego elige una nueva.</p>
          <p style="color:#64748b;font-size:13px">Por seguridad, te recomendamos cambiarla en el primer ingreso.</p>
        </div>`,
    }),
  })

  if (!response.ok) return { error: 'No se pudo enviar el correo de bienvenida' }
  return { success: true }
}

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
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { error: 'Configura RESEND_API_KEY y RESEND_FROM_EMAIL antes de crear el club' }
  }

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

  const correo = await enviarBienvenidaClub({
    club: club.nombre,
    nombre: data.adminNombre,
    email: data.adminEmail.toLowerCase(),
    password: data.passwordProvisoria,
  })
  if (correo.error) {
    await admin.auth.admin.deleteUser(usuario.user.id)
    await admin.from('clubes').delete().eq('id', club.id)
    return { error: `${correo.error}. No se creó el club.` }
  }

  revalidatePath('/superadmin')
  return { success: true, emailEnviado: true }
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

export async function actualizarEstadoPagoClub(input: { clubId: string; estado: 'pagado' | 'pendiente' | 'atrasado' }) {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr }
  const { error } = await supabase.from('clubes')
    .update({ estado_pago: input.estado })
    .eq('id', input.clubId)
  if (error) return { error: 'Error al actualizar el estado' }
  revalidatePath('/superadmin/finanzas')
  return { success: true }
}
