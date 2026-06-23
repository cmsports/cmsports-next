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

function generarPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

async function main() {
  const email = 'adminusb@gmail.com'

  const { data: club, error: clubErr } = await supabase
    .from('clubes')
    .select('id, nombre')
    .ilike('nombre', '%bernardo%')
    .single()

  if (clubErr || !club) {
    console.error('No se encontró el club San Bernardo:', clubErr)
    process.exit(1)
  }
  console.log('Club encontrado:', club.nombre, club.id)

  const password = generarPassword()

  let { data: creado, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError?.message?.includes('already been registered') || createError?.code === 'email_exists') {
    const { data: lista } = await supabase.auth.admin.listUsers()
    const existente = lista?.users.find((u) => u.email === email)
    if (!existente) {
      console.error('Usuario ya registrado pero no se encontró en listUsers:', createError)
      process.exit(1)
    }
    const { data: actualizado, error: updateError } = await supabase.auth.admin.updateUserById(existente.id, { password })
    if (updateError || !actualizado?.user) {
      console.error('Error actualizando password del usuario existente:', updateError)
      process.exit(1)
    }
    creado = actualizado
    console.log('Usuario ya existía, password actualizada:', creado.user.id)
  } else if (createError || !creado?.user) {
    console.error('Error creando usuario:', createError)
    process.exit(1)
  } else {
    console.log('Usuario creado:', creado.user.id)
  }

  const { error: perfilError } = await supabase.from('perfiles').upsert({
    id: creado.user.id,
    club_id: club.id,
    nombre: 'Admin Unión San Bernardo',
    email,
    rol: 'admin',
  })

  if (perfilError) {
    console.error('Error creando perfil:', perfilError)
    process.exit(1)
  }

  console.log('Perfil admin creado correctamente.')
  console.log('Email:', email)
  console.log('Password:', password)
}

main()
