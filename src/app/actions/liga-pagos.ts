'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { anularAbonoLigaSchema, pagoLigaSchema, validationError } from '@/lib/validation/finanzas'

type ResultadoPagoLiga = {
  pago_id: string
  abono_id: string
  movimiento_id: string
  nuevo_estado: 'pendiente' | 'parcial' | 'pagado'
  nuevo_monto_pagado: number
}

export async function registrarPagoLiga(params: {
  divisionId: string
  jugadorId: string
  montoTotal: number
  montoAbono: number
  fecha: string
  metodo?: string
  nombreJugador?: string
  nombreLiga?: string
  idempotencyKey?: string
}) {
  const validacion = pagoLigaSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const input = validacion.data
  const { data, error } = await supabase.rpc('registrar_pago_liga_atomico', {
    p_division_id: input.divisionId,
    p_jugador_id: input.jugadorId,
    p_monto_total: input.montoTotal,
    p_monto_abono: input.montoAbono,
    p_fecha: input.fecha,
    p_metodo: input.metodo ?? null,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo registrar el abono' }

  const resultado = data as unknown as ResultadoPagoLiga
  return {
    success: true,
    pagoId: resultado.pago_id,
    abonoId: resultado.abono_id,
    movimientoId: resultado.movimiento_id,
    nuevoEstado: resultado.nuevo_estado,
    nuevoMontoPagado: resultado.nuevo_monto_pagado,
  }
}
export async function anularUltimoAbono(params: { pagoId: string; idempotencyKey?: string }) {
  const validacion = anularAbonoLigaSchema.safeParse(params)
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const input = validacion.data
  const { data, error } = await supabase.rpc('anular_ultimo_abono_liga_atomico', {
    p_pago_id: input.pagoId,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo anular el abono' }

  const resultado = data as unknown as ResultadoPagoLiga
  return {
    success: true,
    nuevoEstado: resultado.nuevo_estado,
    nuevoMontoPagado: resultado.nuevo_monto_pagado,
  }
}
