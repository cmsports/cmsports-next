'use server'

// Tablas liga_jugador_pagos, liga_abonos y audit_log son nuevas (migración 016).
// Se usa `as any` hasta que se regeneren los tipos con `npx supabase gen types`.

import { requireAdminClub } from '@/lib/auth/require'

// Registra un pago (o abono parcial) de un jugador en una división.
// Crea el registro en liga_jugador_pagos si no existe, inserta el abono,
// y refleja el ingreso en la tabla movimientos (Finanzas).
export async function registrarPagoLiga(params: {
  divisionId: string
  jugadorId: string
  montoTotal: number
  montoAbono: number
  fecha: string
  metodo?: string
  nombreJugador: string
  nombreLiga: string
}) {
  const { error: authErr, supabase, clubId, nombre, userId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { divisionId, jugadorId, montoTotal, montoAbono, fecha, metodo, nombreJugador, nombreLiga } = params

  if (montoAbono <= 0) return { error: 'El monto del abono debe ser mayor a cero' }
  if (montoTotal <= 0) return { error: 'El monto total debe ser mayor a cero' }

  const db = supabase as any

  // 1. Obtener o crear el registro de pago del jugador
  const { data: pagoExistente } = await db
    .from('liga_jugador_pagos')
    .select('id, monto_total, monto_pagado')
    .eq('division_id', divisionId)
    .eq('jugador_id', jugadorId)
    .single()

  let pagoId: string
  let montoPagadoActual: number

  if (pagoExistente) {
    pagoId = pagoExistente.id as string
    montoPagadoActual = pagoExistente.monto_pagado as number
  } else {
    const { data: nuevoPago, error: errorPago } = await db
      .from('liga_jugador_pagos')
      .insert({ division_id: divisionId, jugador_id: jugadorId, monto_total: montoTotal, monto_pagado: 0 })
      .select('id')
      .single()
    if (errorPago || !nuevoPago) return { error: 'No se pudo inicializar el pago: ' + (errorPago?.message ?? '') }
    pagoId = nuevoPago.id as string
    montoPagadoActual = 0
  }

  // 2. Registrar ingreso en Finanzas (movimientos)
  const descripcion = `Inscripción liga — ${nombreJugador} · ${nombreLiga}`
  const { data: movimiento, error: errorMov } = await supabase
    .from('movimientos')
    .insert({
      club_id: clubId,
      tipo: 'ingreso',
      categoria: 'inscripcion_liga',
      descripcion,
      monto: montoAbono,
      fecha,
      registrado_por_nombre: nombre || 'Admin',
    })
    .select('id')
    .single()
  if (errorMov || !movimiento) return { error: 'No se pudo registrar el movimiento financiero: ' + (errorMov?.message ?? '') }

  // 3. Insertar abono
  const { error: errorAbono } = await db
    .from('liga_abonos')
    .insert({ pago_id: pagoId, monto: montoAbono, fecha, metodo: metodo || null, movimiento_id: movimiento.id })
  if (errorAbono) return { error: 'No se pudo registrar el abono: ' + errorAbono.message }

  // 4. Actualizar monto_pagado y estado
  const nuevoMontoPagado = montoPagadoActual + montoAbono
  const nuevoEstado = nuevoMontoPagado >= montoTotal ? 'pagado' : nuevoMontoPagado > 0 ? 'parcial' : 'pendiente'

  await db
    .from('liga_jugador_pagos')
    .update({ monto_pagado: nuevoMontoPagado, estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq('id', pagoId)

  // 5. Auditoría
  await db.from('audit_log').insert({
    entity_type: 'liga_jugador_pagos',
    entity_id: pagoId,
    action: 'abono',
    after: { monto_abono: montoAbono, movimiento_id: movimiento.id, estado: nuevoEstado },
    user_id: userId,
  })

  return { success: true, nuevoEstado, nuevoMontoPagado }
}

// Anula el último abono de un jugador y revierte el movimiento de Finanzas.
export async function anularUltimoAbono(params: { pagoId: string }) {
  const { error: authErr, supabase, userId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const db = supabase as any

  const { data: abono } = await db
    .from('liga_abonos')
    .select('id, monto, movimiento_id')
    .eq('pago_id', params.pagoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!abono) return { error: 'No hay abonos que anular' }

  if (abono.movimiento_id) {
    await supabase.from('movimientos').delete().eq('id', abono.movimiento_id as string)
  }

  await db.from('liga_abonos').delete().eq('id', abono.id)

  const { data: abonosRestantes } = await db
    .from('liga_abonos')
    .select('monto')
    .eq('pago_id', params.pagoId)

  const { data: pago } = await db
    .from('liga_jugador_pagos')
    .select('monto_total')
    .eq('id', params.pagoId)
    .single()

  const nuevoMontoPagado = (abonosRestantes ?? []).reduce((s: number, a: { monto: number }) => s + a.monto, 0)
  const montoTotal = (pago?.monto_total as number) ?? 0
  const nuevoEstado = nuevoMontoPagado >= montoTotal ? 'pagado' : nuevoMontoPagado > 0 ? 'parcial' : 'pendiente'

  await db
    .from('liga_jugador_pagos')
    .update({ monto_pagado: nuevoMontoPagado, estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq('id', params.pagoId)

  await db.from('audit_log').insert({
    entity_type: 'liga_jugador_pagos',
    entity_id: params.pagoId,
    action: 'anular_abono',
    before: { monto_abono: abono.monto, movimiento_id: abono.movimiento_id },
    after: { monto_pagado: nuevoMontoPagado, estado: nuevoEstado },
    user_id: userId,
  })

  return { success: true, nuevoEstado, nuevoMontoPagado }
}
