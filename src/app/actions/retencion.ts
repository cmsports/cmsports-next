'use server'

import { requireAdminClub } from '@/lib/auth/require'

export async function ejecutarRetencion(): Promise<{ error: string } | { success: true; resultado: { automatico: boolean; cambios: number; fecha: string } }> {
  const { error: authError, supabase } = await requireAdminClub()
  if (authError) return { error: authError }
  // RPC vuelve a comprobar club, rol y módulo; el navegador no elige club.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('ejecutar_retencion_club')
  if (error) return { error: 'No se pudo ejecutar la revisión: ' + error.message }
  return { success: true, resultado: data as { automatico: boolean; cambios: number; fecha: string } }
}

export async function activarRetencion(revisionConfirmada: boolean) {
  const { error: authError, supabase } = await requireAdminClub()
  if (authError) return { error: authError }
  // El mes mínimo se valida dentro de la transacción, no con una fecha del cliente.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('activar_retencion_club', { p_revision_confirmada: revisionConfirmada })
  if (error) return { error: 'No se pudo activar: ' + error.message }
  return { success: true }
}

export async function pausarRetencion() {
  const { error: authError, supabase, clubId } = await requireAdminClub()
  if (authError) return { error: authError }
  const { error } = await supabase.from('club_config').upsert(
    { club_id: clubId, clave: 'retencion.automatismo', valor: 'no' }, { onConflict: 'club_id,clave' },
  )
  if (error) return { error: 'No se pudo pausar: ' + error.message }
  return { success: true }
}
