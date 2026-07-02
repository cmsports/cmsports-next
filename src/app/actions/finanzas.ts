'use server'

import { requireAdminClub } from '@/lib/auth/require'

export async function registrarMovimiento(params: {
  tipo: string
  categoria: string
  descripcion: string
  monto: number
  fecha: string
  profesorId?: string
  mesCorrespondiente?: number
  anioCorrespondiente?: number
}) {
  const { error: authErr, supabase, clubId, nombre } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { tipo, categoria, descripcion, monto, fecha, profesorId, mesCorrespondiente, anioCorrespondiente } = params
  const { error } = await supabase.from('movimientos').insert({
    club_id: clubId, tipo, categoria, descripcion, monto, fecha,
    registrado_por_nombre: nombre || 'Admin',
    ...(profesorId ? { profesor_id: profesorId } : {}),
    ...(mesCorrespondiente && anioCorrespondiente ? { mes_correspondiente: mesCorrespondiente, anio_correspondiente: anioCorrespondiente } : {}),
  })
  if (error) return { error: 'Error al registrar movimiento: ' + error.message }
  return { success: true }
}
