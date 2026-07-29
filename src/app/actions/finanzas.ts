'use server'

import { requireAdminClub } from '@/lib/auth/require'
import {
  editarMovimientoSchema,
  eliminarMovimientoSchema,
  movimientoSchema,
  validationError,
} from '@/lib/validation/finanzas'

export async function registrarMovimiento(params: {
  tipo: string
  categoria: string
  descripcion: string
  monto: number
  fecha: string
  profesorId?: string
  mesCorrespondiente?: number
  anioCorrespondiente?: number
  idempotencyKey?: string
}) {
  const validacion = movimientoSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const input = validacion.data
  const { data, error } = await supabase.rpc('registrar_movimiento_financiero_atomico', {
    p_tipo: input.tipo,
    p_categoria: input.categoria,
    p_descripcion: input.descripcion,
    p_monto: input.monto,
    p_fecha: input.fecha,
    p_profesor_id: input.profesorId ?? null,
    p_mes_correspondiente: input.mesCorrespondiente ?? null,
    p_anio_correspondiente: input.anioCorrespondiente ?? null,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo registrar el movimiento' }
  return { success: true, movimientoId: (data as unknown as { movimiento_id: string }).movimiento_id }
}

// Solo movimientos de carga manual. La RPC rechaza los que son reflejo de otra
// cosa (mensualidad, liga, torneo, clase extra) con el mensaje que dice desde
// qué pantalla se corrigen de verdad.
export async function editarMovimiento(params: {
  movimientoId: string
  categoria: string
  descripcion: string
  monto: number
  fecha: string
  profesorId?: string
  mesCorrespondiente?: number
  anioCorrespondiente?: number
  idempotencyKey: string
}) {
  const validacion = editarMovimientoSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const input = validacion.data
  const { error } = await supabase.rpc('editar_movimiento_financiero_atomico', {
    p_movimiento_id: input.movimientoId,
    p_categoria: input.categoria,
    p_descripcion: input.descripcion,
    p_monto: input.monto,
    p_fecha: input.fecha,
    p_profesor_id: input.profesorId ?? null,
    p_mes_correspondiente: input.mesCorrespondiente ?? null,
    p_anio_correspondiente: input.anioCorrespondiente ?? null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function eliminarMovimiento(params: { movimientoId: string; idempotencyKey: string }) {
  const validacion = eliminarMovimientoSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.rpc('eliminar_movimiento_financiero_atomico', {
    p_movimiento_id: validacion.data.movimientoId,
    p_idempotency_key: validacion.data.idempotencyKey,
  })
  if (error) return { error: error.message }
  return { success: true }
}
