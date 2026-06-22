'use server'

import { createClient } from '@/lib/supabase/server'

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null, nombre: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null, nombre: null }
  return { error: null, supabase, clubId: perfil.club_id, nombre: perfil.nombre }
}

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
