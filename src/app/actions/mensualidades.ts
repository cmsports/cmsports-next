'use server'

import { createClient } from '@/lib/supabase/server'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  return { error: null, supabase, clubId: perfil.club_id }
}

export async function registrarPago(params: {
  jugadorId: string
  jugadorNombre: string
  mensualidadId: string | null
  mes: number
  anio: number
  monto: number
  metodo: string
  registradoPor: string
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { jugadorId, jugadorNombre, mensualidadId, mes, anio, monto, metodo, registradoPor } = params
  const fechaPago = new Date().toISOString().slice(0, 10)

  if (mensualidadId) {
    const { error } = await supabase.from('mensualidades').update({
      estado: 'pagado',
      fecha_pago: fechaPago,
      monto,
      metodo,
    }).eq('id', mensualidadId).eq('club_id', clubId)

    if (error) return { error: 'Error al actualizar mensualidad' }
  } else {
    const { error } = await supabase.from('mensualidades').insert({
      club_id: clubId,
      jugador_id: jugadorId,
      mes,
      anio,
      estado: 'pagado',
      fecha_pago: fechaPago,
      monto,
      metodo,
    })

    if (error) return { error: 'Error al crear mensualidad' }
  }

  const { error: movError } = await supabase.from('movimientos').insert({
    club_id: clubId,
    tipo: 'ingreso',
    categoria: 'mensualidad',
    descripcion: `Mensualidad ${jugadorNombre} — ${MESES[mes - 1]} ${anio}`,
    monto,
    fecha: fechaPago,
    jugador_id: jugadorId,
    mes_correspondiente: mes,
    anio_correspondiente: anio,
    registrado_por_nombre: registradoPor,
  })

  if (movError) return { error: 'Pago registrado pero falló el movimiento financiero' }

  return { success: true }
}

export async function generarMensualidadesPendientes(params: {
  jugadorIds: string[]
  mes: number
  anio: number
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { jugadorIds, mes, anio } = params
  if (!jugadorIds.length) return { success: true }

  const { error } = await supabase.from('mensualidades').insert(
    jugadorIds.map(jugadorId => ({ club_id: clubId, jugador_id: jugadorId, mes, anio, estado: 'pendiente' }))
  )
  if (error) return { error: 'Error al generar mensualidades' }
  return { success: true }
}

export async function marcarAtrasado(params: { mensualidadId: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('mensualidades').update({ estado: 'atrasado' }).eq('id', params.mensualidadId).eq('club_id', clubId)
  if (error) return { error: 'Error al marcar atrasado' }
  return { success: true }
}

export async function revertirPago(params: {
  mensualidadId: string
  jugadorId: string
  mes: number
  anio: number
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { mensualidadId, jugadorId, mes, anio } = params

  const { error } = await supabase.from('mensualidades').update({
    estado: 'pendiente',
    fecha_pago: null,
    monto: null,
    metodo: null,
  }).eq('id', mensualidadId).eq('club_id', clubId)

  if (error) return { error: 'Error al revertir mensualidad' }

  await supabase.from('movimientos').delete()
    .eq('club_id', clubId)
    .eq('jugador_id', jugadorId)
    .eq('categoria', 'mensualidad')
    .eq('mes_correspondiente', mes)
    .eq('anio_correspondiente', anio)

  return { success: true }
}
