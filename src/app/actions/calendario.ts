'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePerfil } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { esUuid } from '@/lib/domain/uuid'

export async function eliminarActividadCalendario(params: { id: string; origen: 'actividad' | 'evento' }) {
  const auth = await requirePerfil()
  if (auth.error) return { error: auth.error }
  if (!['admin', 'profesor'].includes(auth.perfil.rol ?? '')) return { error: 'Acceso denegado.' }
  if (!params || !esUuid(params.id) || !['actividad', 'evento'].includes(params.origen)) {
    return { error: 'Actividad no válida.' }
  }

  const clubId = auth.perfil.club_id
  const { data: club, error: moduloError } = await auth.supabase.from('clubes')
    .select('modulos_habilitados').eq('id', clubId).maybeSingle()
  if (moduloError) return { error: 'No se pudo verificar el permiso del calendario.' }
  if (!club?.modulos_habilitados?.includes('calendario_integrado')) {
    return { error: 'El calendario integrado no está habilitado para este club.' }
  }

  // La agenda nueva solo concede lectura al navegador. El borrado se hace en
  // el servidor, después de verificar sesión, rol y módulo, siempre por id Y
  // club de la sesión. La FK elimina su nómina en la misma transacción.
  // No se admiten torneos, jornadas de liga ni clases como origen de borrado.
  const admin = createAdminClient() as unknown as SupabaseClient
  const tabla = params.origen === 'actividad' ? 'calendario_actividades' : 'eventos'
  const { data, error } = await admin.from(tabla).delete()
    .eq('id', params.id).eq('club_id', clubId).select('id')
  if (error) return { error: 'No se pudo eliminar la actividad: ' + error.message }
  if (data?.length !== 1 || data[0].id !== params.id) {
    return { error: 'La actividad ya no existe o no pertenece a tu club.' }
  }
  return { success: true }
}
