import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// RUTA TEMPORAL DE DEBUG — eliminar después de diagnosticar
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'falta ?email=...' }, { status: 400 })

  const admin = createAdminClient()

  const [{ data: jugador }, { data: perfil }] = await Promise.all([
    admin.from('jugadores').select('id,nombre,email,estado,club_id').ilike('email', email).maybeSingle(),
    admin.from('perfiles').select('id,rol,jugador_id,club_id').ilike('email', email).maybeSingle(),
  ])

  return NextResponse.json({
    jugador,
    perfil,
    diagnostico: {
      jugador_encontrado: !!jugador,
      estado_jugador: jugador?.estado ?? 'NO ENCONTRADO',
      perfil_encontrado: !!perfil,
      jugador_id_en_perfil: perfil?.jugador_id ?? 'NULL ← ACA ESTA EL PROBLEMA',
      ids_coinciden: jugador?.id === perfil?.jugador_id,
    },
  })
}
