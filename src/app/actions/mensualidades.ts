'use server'

import { requireAdminClub, requirePerfil } from '@/lib/auth/require'
import {
  eximirMensualidadSchema,
  generarMensualidadesSchema,
  mensualidadIdSchema,
  pagoMensualidadSchema,
  revertirExencionSchema,
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

/**
 * Corrige la mensualidad de un mes cualquiera, incluso uno ya cerrado.
 *
 * Todo el trabajo lo hace `corregir_mensualidad` en la base, que además de
 * guardar el cambio deja la auditoría y genera el movimiento de ajuste. Que
 * viva allá y no acá importa: si alguien corrigiera una cuota por otra vía, el
 * ajuste y el rastro se generarían igual.
 *
 * El ajuste es la diferencia, no el monto completo: corregir un pago de $25.000
 * a $30.000 mete $5.000 al libro, no un segundo ingreso de $30.000.
 */
export async function corregirMensualidad(params: {
  jugadorId: string
  mes: number
  anio: number
  estado: 'pagado' | 'pendiente' | 'sin_registro'
  monto?: number | null
  fechaPago?: string | null
  metodo?: string | null
  motivo?: string
}) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!['admin', 'superadmin'].includes(perfil.rol ?? '')) {
    return { error: 'Solo el administrador puede corregir mensualidades' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('corregir_mensualidad', {
    p_jugador_id: params.jugadorId,
    p_mes:        params.mes,
    p_anio:       params.anio,
    p_estado:     params.estado,
    p_monto:      params.monto ?? null,
    p_fecha_pago: params.fechaPago || null,
    p_metodo:     params.metodo || null,
    p_motivo:     params.motivo?.trim() || null,
  })
  if (error) return { error: error.message }

  return { ok: true }
}

/**
 * "No vino este mes": la cuota deja de cobrarse.
 *
 * Sale de lo pendiente del jugador y de la tasa de morosidad, pero NO se
 * registra como pagada, porque no entró plata. Deja una línea en Finanzas con
 * monto 0 para que el mes exento quede visible en el libro y no solo en la
 * ficha.
 *
 * Es de ese mes y de ninguno más: el siguiente se emite normal.
 */
export async function eximirMensualidad(params: {
  mensualidadId: string
  motivo?: string
  idempotencyKey?: string
}) {
  const validacion = eximirMensualidadSchema.safeParse({
    ...params,
    idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
  })
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const input = validacion.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('eximir_mensualidad_atomico', {
    p_mensualidad_id: input.mensualidadId,
    p_motivo: input.motivo ?? null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo eximir la cuota' }
  return { success: true }
}

/** Deshace la exención: la cuota vuelve a estar pendiente. */
export async function revertirExencion(params: {
  mensualidadId: string
  idempotencyKey?: string
}) {
  const validacion = revertirExencionSchema.safeParse({
    ...params,
    idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
  })
  if (!validacion.success) return { error: validationError(validacion.error) }

  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('revertir_exencion_mensualidad', {
    p_mensualidad_id: validacion.data.mensualidadId,
    p_idempotency_key: validacion.data.idempotencyKey,
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo deshacer la exención' }
  return { success: true }
}
