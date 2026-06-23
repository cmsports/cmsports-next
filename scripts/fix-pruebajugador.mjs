import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const { data: perfil, error: perfilErr } = await supabase
    .from('perfiles')
    .select('id, club_id, nombre, email, jugador_id')
    .eq('email', 'pruebajugador@gmail.com')
    .single()

  if (perfilErr || !perfil) {
    console.error('No se encontró el perfil pruebajugador@gmail.com:', perfilErr)
    process.exit(1)
  }
  console.log('Perfil encontrado:', perfil)

  if (perfil.jugador_id) {
    console.log('Ya tiene jugador_id asignado:', perfil.jugador_id, '— nada que hacer.')
    return
  }

  const { data: club, error: clubErr } = await supabase
    .from('clubes')
    .select('id, nombre, mensualidad_base')
    .eq('id', perfil.club_id)
    .single()

  if (clubErr || !club) {
    console.error('No se encontró el club del perfil:', clubErr)
    process.exit(1)
  }
  console.log('Club:', club.nombre, club.id)

  const { data: nuevoJugador, error: jugErr } = await supabase
    .from('jugadores')
    .insert({
      club_id: club.id,
      nombre: perfil.nombre || 'Jugador de Prueba',
      email: perfil.email,
      categoria: 'intermedio',
      elo: 1200,
      sesiones_usadas: 0,
      sesiones_limite: 12,
      estado: 'activo',
      es_externo: false,
      mensualidad: club.mensualidad_base || 25000,
      tipo_plan: 'mensual',
      entrenamientos_por_semana: 2,
    })
    .select('id, nombre')
    .single()

  if (jugErr || !nuevoJugador) {
    console.error('Error creando jugador:', jugErr)
    process.exit(1)
  }
  console.log('Jugador creado:', nuevoJugador)

  const { error: updateErr } = await supabase
    .from('perfiles')
    .update({ jugador_id: nuevoJugador.id })
    .eq('id', perfil.id)

  if (updateErr) {
    console.error('Error enlazando perfil:', updateErr)
    process.exit(1)
  }
  console.log('Perfil enlazado correctamente con jugador_id =', nuevoJugador.id)
}

main()
