'use server'

import { requireAdmin } from '@/lib/auth/require'

export async function reiniciarRanking() {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }
  if (!perfil.club_id) return { error: 'Sin club' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('clubes')
    .update({ ranking_reiniciado_en: new Date().toISOString() })
    .eq('id', perfil.club_id)

  if (error) return { error: error.message }
  return { success: true }
}
