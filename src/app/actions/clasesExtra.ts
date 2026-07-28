'use server'

// El cobro de las clases extraordinarias.
//
// Vive aparte de `asistencia.ts` a propósito: registrar que alguien vino es una
// cosa y cobrarle es otra, con otras reglas y otro rol. Marcar la clase lo puede
// hacer el profesor; mover plata pasa por `_finanzas_admin_contexto()`, que
// exige admin.

import { requireAdminClub, requirePerfil } from '@/lib/auth/require'

const STAFF = ['admin', 'superadmin', 'profesor']

/**
 * Las manda a cobro: pasan de "el profe les puso precio" a "se le está
 * cobrando". La base rechaza las que todavía no tienen monto.
 */
export async function enviarClasesExtraACobro(params: { ids: string[] }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden enviar a cobro' }
  }
  if (params.ids.length === 0) return { error: 'No hay clases seleccionadas' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('enviar_clases_extra_a_cobro', {
    p_ids: params.ids,
  })
  if (error) return { error: error.message }

  return { ok: true, enviadas: (data as number) ?? 0 }
}

/**
 * Las cobra: un solo movimiento de ingreso por todas las del mismo jugador.
 *
 * La clave de idempotencia se genera en la pantalla y se manda igual en cada
 * reintento: sin eso, un doble clic o un reintento por red lenta deja dos
 * ingresos por la misma clase.
 */
export async function pagarClasesExtra(params: {
  ids: string[]
  metodo: 'efectivo' | 'transferencia'
  idempotencyKey: string
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Acceso denegado' }
  if (params.ids.length === 0) return { error: 'No hay clases seleccionadas' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('registrar_pago_clases_extra_atomico', {
    p_ids: params.ids,
    p_metodo: params.metodo,
    p_idempotency_key: params.idempotencyKey,
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo registrar el pago' }

  const r = data as { movimiento_id: string; monto: number; clases: number }
  return { ok: true, movimientoId: r.movimiento_id, monto: r.monto, clases: r.clases }
}

/** Deshace el cobro: borra el movimiento y las devuelve a "por cobrar". */
export async function revertirPagoClasesExtra(params: {
  movimientoId: string
  idempotencyKey: string
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Acceso denegado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('revertir_pago_clases_extra_atomico', {
    p_movimiento_id: params.movimientoId,
    p_idempotency_key: params.idempotencyKey,
  })
  if (error) return { error: error.message }

  return { ok: true }
}
