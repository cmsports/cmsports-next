import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((linea) => linea.includes('='))
    .map((linea) => {
      const indice = linea.indexOf('=')
      return [linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ACCESOS = [
  { nombre: 'Juaquin Orellana', email: 'juaquin.orellana@cmsports.cl', password: 'juaquin123' },
  { nombre: 'Elian Tapia', email: 'elian.tapia@cmsports.cl', password: 'elian123' },
  { nombre: 'Eduardo Sánchez', email: 'eduardo.sanchez@cmsports.cl', password: 'eduardo123' },
  { nombre: 'Rodrigo Salazar', email: 'rodrigo.salazar@cmsports.cl', password: 'rodrigo123' },
  { nombre: 'Mauricio Salazar', email: 'mauricio.salazar@cmsports.cl', password: 'mauricio123' },
  { nombre: 'Denise', email: 'denise@cmsports.cl', password: 'denise123' },
  { nombre: 'Benjamín Cárdenas', email: 'benjamin.cardenas@cmsports.cl', password: 'benjamin123' },
]

async function buscarUsuario(email) {
  for (let pagina = 1; ; pagina += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 1000 })
    if (error) throw error
    const usuario = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase())
    if (usuario) return usuario
    if (data.users.length < 1000) return null
  }
}

async function main() {
  const { data: clubes, error: clubError } = await supabase
    .from('clubes')
    .select('id, nombre, mensualidad_base')
    .in('nombre', ['Club Buin', 'Club Buín'])

  if (clubError) throw clubError
  if (clubes.length > 1) {
    throw new Error(`Se esperaba un solo Club Buin y se encontraron ${clubes.length}: ${clubes.map((c) => c.nombre).join(', ')}`)
  }

  const club = clubes[0]
  if (!club) throw new Error('No se encontró Club Buín; créalo primero desde Superadmin')
  for (const acceso of ACCESOS) {
    let usuario = await buscarUsuario(acceso.email)
    if (usuario) {
      const { data, error } = await supabase.auth.admin.updateUserById(usuario.id, {
        password: acceso.password,
        email_confirm: true,
      })
      if (error) throw error
      usuario = data.user
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: acceso.email,
        password: acceso.password,
        email_confirm: true,
      })
      if (error) throw error
      usuario = data.user
    }

    const { data: existentes, error: consultaError } = await supabase
      .from('jugadores')
      .select('id')
      .eq('club_id', club.id)
      .eq('email', acceso.email)
      .limit(1)
    if (consultaError) throw consultaError

    let jugadorId = existentes[0]?.id
    const datosJugador = {
      club_id: club.id,
      nombre: acceso.nombre,
      email: acceso.email,
      categoria: 'principiante',
      sesiones_usadas: 0,
      sesiones_limite: 12,
      estado: 'activo',
      es_externo: false,
      mensualidad: club.mensualidad_base || 25000,
      tipo_plan: 'mensual',
      entrenamientos_por_semana: 3,
    }

    if (jugadorId) {
      const { error } = await supabase.from('jugadores').update(datosJugador).eq('id', jugadorId)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('jugadores').insert(datosJugador).select('id').single()
      if (error) throw error
      jugadorId = data.id
    }

    const { error: perfilError } = await supabase.from('perfiles').upsert({
      id: usuario.id,
      club_id: club.id,
      nombre: acceso.nombre,
      email: acceso.email,
      rol: 'jugador',
      jugador_id: jugadorId,
    })
    if (perfilError) throw perfilError

    console.log(`OK | ${acceso.nombre} | ${acceso.email}`)
  }

  console.log(`Listo: ${ACCESOS.length} jugadores vinculados a ${club.nombre}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
