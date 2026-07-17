'use server'

import { requireAdminClub } from '@/lib/auth/require'
import {
  generarMensualidadesSchema,
  mensualidadIdSchema,
  pagoMensualidadSchema,
  revertirMensualidadSchema,
  validationError,
} from '@/lib/validation/finanzas'

type ResultadoMensualidad = { mensualidad_id: string; movimiento_id?: string; estado: string }

export async function registrarPago(params: {
  jugadorId: string
  jugadorNombre?: string
  mensualidadId: string | null
  mes: number
  anio: number
  monto: number
  metodo: string
  registradoPor?: string
  idempotencyKey?: string
}) {
  const validacion = pagoMensualidadSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const input = validacion.data
  const { data, error } = await supabase.rpc('registrar_pago_mensualidad_atomico', {
    p_mensualidad_id: input.mensualidadId,
    p_jugador_id: input.jugadorId,
    p_mes: input.mes,
    p_anio: input.anio,
    p_monto: input.monto,
    p_metodo: input.metodo,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo registrar el pago' }

  const resultado = data as unknown as ResultadoMensualidad
  return { success: true, mensualidadId: resultado.mensualidad_id, movimientoId: resultado.movimiento_id }
}

export async function generarMensualidadesPendientes(params: { jugadorIds: string[]; mes: number; anio: number }) {
  const validacion = generarMensualidadesSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }
  if (!validacion.data.jugadorIds.length) return { success: true, creadas: 0 }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data, error } = await supabase.rpc('generar_mensualidades_jugadores_seguro', {
    p_jugador_ids: validacion.data.jugadorIds,
    p_mes: validacion.data.mes,
    p_anio: validacion.data.anio,
  })
  if (error) return { error: error.message }
  return { success: true, creadas: data ?? 0 }
}

export async function marcarAtrasado(params: { mensualidadId: string }) {
  const validacion = mensualidadIdSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.rpc('marcar_mensualidad_atrasada_seguro', {
    p_mensualidad_id: validacion.data.mensualidadId,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function revertirPago(params: {
  mensualidadId: string
  jugadorId?: string
  mes?: number
  anio?: number
  idempotencyKey?: string
}) {
  const validacion = revertirMensualidadSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const input = validacion.data
  const { data, error } = await supabase.rpc('revertir_pago_mensualidad_atomico', {
    p_mensualidad_id: input.mensualidadId,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo revertir el pago' }
  return { success: true }
}
