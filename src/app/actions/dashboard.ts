'use server'

import { createClient } from '@/lib/supabase/server'

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  return { error: null, supabase, clubId: perfil.club_id }
}

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
