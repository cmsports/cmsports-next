'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function crearClub(input: { nombre: string; ciudad: string; deporte: string; planMensual: number }) {
  const supabase = await createClient()
  const { error } = await supabase.from('clubes').insert({
    nombre: input.nombre.trim(),
    ciudad: input.ciudad.trim() || null,
    deporte: input.deporte.trim() || null,
    plan_mensual: input.planMensual,
  })
  if (error) return { error: 'Error al crear el club' }
  revalidatePath('/superadmin')
  return { success: true }
}

export async function actualizarPlanClub(input: { clubId: string; planMensual: number }) {
  const supabase = await createClient()
  const { error } = await supabase.from('clubes')
    .update({ plan_mensual: input.planMensual })
    .eq('id', input.clubId)
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
  const supabase = await createClient()

  const { error } = await supabase.from('pagos_clubes').insert({
    club_id: input.clubId,
    monto: input.monto,
    periodo_mes: input.periodoMes,
    periodo_anio: input.periodoAnio,
    metodo: input.metodo || null,
    notas: input.notas || null,
  })
  if (error) return { error: 'Error al registrar el pago' }

  const { error: estadoError } = await supabase.from('clubes')
    .update({ estado_pago: 'pagado' })
    .eq('id', input.clubId)
  if (estadoError) return { error: 'Pago registrado pero falló actualizar el estado' }

  revalidatePath('/superadmin/finanzas')
  return { success: true }
}

export async function actualizarEstadoPagoClub(input: { clubId: string; estado: 'pagado' | 'pendiente' | 'atrasado' }) {
  const supabase = await createClient()
  const { error } = await supabase.from('clubes')
    .update({ estado_pago: input.estado })
    .eq('id', input.clubId)
  if (error) return { error: 'Error al actualizar el estado' }
  revalidatePath('/superadmin/finanzas')
  return { success: true }
}
