'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { movimientoSchema, validationError } from '@/lib/validation/finanzas'

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
