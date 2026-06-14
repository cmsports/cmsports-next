'use server'

import { createClient } from '@/lib/supabase/server'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export async function registrarPago(params: {
  clubId: string
  jugadorId: string
  jugadorNombre: string
  mensualidadId: string | null
  mes: number
  anio: number
  monto: number
  metodo: string
  registradoPor: string
}) {
  const supabase = await createClient()
  const { clubId, jugadorId, jugadorNombre, mensualidadId, mes, anio, monto, metodo, registradoPor } = params
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

export async function revertirPago(params: {
  clubId: string
  mensualidadId: string
  jugadorId: string
  mes: number
  anio: number
}) {
  const supabase = await createClient()
  const { clubId, mensualidadId, jugadorId, mes, anio } = params

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
