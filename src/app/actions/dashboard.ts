'use server'

import { requireAdminClub } from '@/lib/auth/require'

export async function obtenerLinkInvitacion() {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr }

  let { data: inv } = await supabase.from('invitaciones').select('codigo').eq('club_id', clubId).eq('activa', true).limit(1)
  if (!inv?.length) {
    await supabase.from('invitaciones').insert({ club_id: clubId })
    const { data: newInv } = await supabase.from('invitaciones').select('codigo').eq('club_id', clubId).eq('activa', true).limit(1)
    inv = newInv
  }
  return { codigo: inv?.[0]?.codigo || '', clubId }
}
