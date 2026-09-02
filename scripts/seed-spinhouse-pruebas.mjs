/**
 * Tres cuentas de prueba para Spinhouse: un admin, un entrenador y un jugador.
 *
 * Sirven para recorrer las tres vistas con los permisos reales, que es la única
 * forma de encontrar cierta clase de errores. La auditoría de agosto lo dejó
 * escrito: nueve hallazgos salieron de leer el código, y el décimo —de
 * severidad alta— saltó a los diez segundos de mirar la pantalla con una cuenta
 * de alumno.
 *
 * ── Cómo se usa ─────────────────────────────────────────────────────────
 *
 *     node scripts/seed-spinhouse-pruebas.mjs            crea las tres
 *     node scripts/seed-spinhouse-pruebas.mjs --borrar   las elimina
 *
 * Es IDEMPOTENTE: correrlo dos veces no duplica nada. Si la cuenta ya existe,
 * le repone la contraseña y sigue. Eso importa porque se va a correr varias
 * veces mientras se prueba.
 *
 * ── Por qué los correos terminan en .test ───────────────────────────────
 *
 * `.test` está reservado por el RFC 2606 justamente para esto: no puede
 * existir como dominio real. Así estas cuentas no pueden chocar con el correo
 * de una persona de verdad ni mandarle un mail a nadie por accidente.
 *
 * ── Lo que hace por cada rol, que no es lo mismo ────────────────────────
 *
 *   admin     auth.users + perfiles(rol='admin')
 *   profesor  auth.users + perfiles(rol='profesor') + ficha en `profesores`
 *             ⚠ con el MISMO correo en las dos: `get_my_profesor_id()` las
 *               enlaza por ahí, y si no coinciden el profe ve la pestaña de
 *               horas pero no puede marcar.
 *   jugador   ficha en `jugadores` + auth.users + perfiles(rol='jugador',
 *             jugador_id) + espejo en `credencial_visible`, que es de donde el
 *             admin saca la contraseña para entregarla.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BORRAR = process.argv.includes('--borrar')

// El club, por nombre y no por UUID: un UUID mal copiado se ve igual de bien
// que uno correcto. Mismo criterio que `_migracion_para_club`.
const CLUB = 'spinhouse'

const CUENTAS = [
  {
    rol: 'admin',
    nombre: 'Admin de Prueba',
    email: 'admin.prueba@spinhouse.test',
    password: 'spinhouse-admin-2026',
  },
  {
    rol: 'profesor',
    nombre: 'Entrenador de Prueba',
    email: 'profe.prueba@spinhouse.test',
    password: 'spinhouse-profe-2026',
    especialidad: 'Tenis de mesa',
  },
  {
    rol: 'jugador',
    nombre: 'Jugador de Prueba',
    email: 'jugador.prueba@spinhouse.test',
    password: 'spinhouse-alumno-2026',
    rut: '11111111-1',
    telefono: '912345678',
  },
]

/** Busca el usuario por correo recorriendo las páginas de auth. */
async function buscarUsuario(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error('No se pudo listar usuarios: ' + error.message)
    const hit = (data?.users ?? []).find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (!data?.users?.length || data.users.length < 1000) return null
  }
  return null
}

async function borrarTodo(clubId) {
  for (const c of CUENTAS) {
    const usuario = await buscarUsuario(c.email)
    if (!usuario) { console.log(`   · ${c.email} — no existía`); continue }

    await supabase.from('credencial_visible').delete().eq('usuario_id', usuario.id)

    if (c.rol === 'jugador') {
      const { data: perfil } = await supabase.from('perfiles')
        .select('jugador_id').eq('id', usuario.id).maybeSingle()
      await supabase.from('perfiles').delete().eq('id', usuario.id)
      if (perfil?.jugador_id) {
        await supabase.from('bloque_jugadores').delete().eq('jugador_id', perfil.jugador_id)
        await supabase.from('jugadores').delete().eq('id', perfil.jugador_id)
      }
    } else {
      await supabase.from('perfiles').delete().eq('id', usuario.id)
      if (c.rol === 'profesor') {
        await supabase.from('profesores').delete().eq('email', c.email).eq('club_id', clubId)
      }
    }

    const { error } = await supabase.auth.admin.deleteUser(usuario.id)
    console.log(error ? `   ✗ ${c.email} — ${error.message}` : `   ✓ ${c.email} — eliminada`)
  }
}

/** Crea el usuario de auth, o le repone la contraseña si ya estaba. */
async function usuarioDeAuth(c) {
  const existente = await buscarUsuario(c.email)
  if (existente) {
    const { error } = await supabase.auth.admin.updateUserById(existente.id, {
      password: c.password, email_confirm: true,
    })
    if (error) throw new Error(`No se pudo reponer la contraseña de ${c.email}: ${error.message}`)
    return { id: existente.id, nuevo: false }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: c.email, password: c.password, email_confirm: true,
    user_metadata: { nombre: c.nombre },
  })
  if (error || !data?.user) {
    throw new Error(`No se pudo crear ${c.email}: ${error?.message ?? 'sin detalle'}`)
  }
  return { id: data.user.id, nuevo: true }
}

async function main() {
  // ── El club ──────────────────────────────────────────────────────────
  const { data: clubes, error: clubErr } = await supabase
    .from('clubes').select('id, nombre, modulos_habilitados').ilike('nombre', `%${CLUB}%`)

  if (clubErr) { console.error('✗ No se pudo consultar clubes:', clubErr.message); process.exit(1) }

  if (!clubes?.length) {
    const { data: todos } = await supabase.from('clubes').select('nombre').order('nombre')
    console.error(`✗ No existe ningún club que contenga "${CLUB}".`)
    console.error('  Los clubes de esta base son:', (todos ?? []).map(c => c.nombre).join(' · '))
    process.exit(1)
  }
  if (clubes.length > 1) {
    console.error(`✗ Hay ${clubes.length} clubes que contienen "${CLUB}":`,
      clubes.map(c => c.nombre).join(' · '))
    console.error('  Con el nombre ambiguo no hay forma de saber a cuál apunta. No se ejecutó nada.')
    process.exit(1)
  }

  const club = clubes[0]
  console.log(`\nClub: ${club.nombre}\n  ${club.id}\n`)

  if (BORRAR) {
    console.log('Borrando las cuentas de prueba…')
    await borrarTodo(club.id)
    console.log('\nListo.\n')
    return
  }

  const creadas = []

  for (const c of CUENTAS) {
    try {
      const { id, nuevo } = await usuarioDeAuth(c)

      // ── perfiles: lo que todos los roles necesitan ──────────────────
      let jugadorId = null

      if (c.rol === 'jugador') {
        // La ficha primero: el perfil la referencia.
        const { data: ficha } = await supabase.from('jugadores')
          .select('id').eq('club_id', club.id).eq('email', c.email).maybeSingle()

        if (ficha) {
          jugadorId = ficha.id
        } else {
          const { data: nueva, error: errFicha } = await supabase.from('jugadores').insert({
            club_id: club.id, nombre: c.nombre, rut: c.rut, email: c.email,
            telefono: c.telefono, estado: 'activo', es_externo: false, sesiones_usadas: 0,
          }).select('id').single()
          if (errFicha) throw new Error(`No se pudo crear la ficha de jugador: ${errFicha.message}`)
          jugadorId = nueva.id
        }
      }

      const { error: errPerfil } = await supabase.from('perfiles').upsert({
        id, club_id: club.id, nombre: c.nombre, email: c.email,
        rol: c.rol, jugador_id: jugadorId,
      }, { onConflict: 'id' })
      if (errPerfil) throw new Error(`No se pudo crear el perfil: ${errPerfil.message}`)

      // ── Lo propio de cada rol ───────────────────────────────────────
      if (c.rol === 'profesor') {
        // El correo tiene que ser EL MISMO que el del perfil, o
        // `get_my_profesor_id()` no los enlaza y no puede marcar sus horas.
        const { data: ficha } = await supabase.from('profesores')
          .select('id').eq('club_id', club.id).eq('email', c.email).maybeSingle()

        if (!ficha) {
          const { error: errProf } = await supabase.from('profesores').insert({
            club_id: club.id, nombre: c.nombre, email: c.email,
            especialidad: c.especialidad, activo: true,
          })
          if (errProf) throw new Error(`No se pudo crear la ficha de profesor: ${errProf.message}`)
        }
      }

      if (c.rol === 'jugador') {
        // El admin saca la contraseña de acá para entregársela al alumno.
        // Sin `onConflict` explícito, igual que `crearJugador`: usa la PK de la
        // tabla. Nombrar una columna que no fuera la clave real haría fallar el
        // upsert recién en la segunda corrida.
        const { error: errCred } = await supabase.from('credencial_visible').upsert({
          usuario_id: id, club_id: club.id, password_plano: c.password,
          usuario_login: c.email, tipo_login: 'email',
        })
        if (errCred) console.warn(`   ⚠ credencial_visible: ${errCred.message}`)
      }

      creadas.push({ ...c, id, nuevo })
      console.log(`  ✓ ${c.rol.padEnd(9)} ${c.email.padEnd(34)} ${nuevo ? 'creada' : 'ya existía, contraseña repuesta'}`)
    } catch (e) {
      console.error(`  ✗ ${c.rol.padEnd(9)} ${c.email} — ${e.message}`)
    }
  }

  // ── Verificación: que el profe pueda marcar sus horas ────────────────
  const profe = creadas.find(c => c.rol === 'profesor')
  if (profe) {
    const { data: p } = await supabase.from('profesores')
      .select('email').eq('club_id', club.id).eq('email', profe.email).maybeSingle()
    const { data: perf } = await supabase.from('perfiles')
      .select('email').eq('id', profe.id).maybeSingle()

    const calzan = p?.email && perf?.email && p.email.toLowerCase() === perf.email.toLowerCase()
    console.log(calzan
      ? '\n  ✓ El correo del profesor calza entre `perfiles` y `profesores`: puede marcar horas.'
      : '\n  ⚠ El correo NO calza entre `perfiles` y `profesores`: va a ver la pestaña de horas pero no va a poder marcar.')
  }

  // ── Los módulos que necesitan estas pruebas ──────────────────────────
  const necesarios = ['clases', 'asistencia', 'mensualidades', 'finanzas', 'mesas']
  const faltan = necesarios.filter(m => !(club.modulos_habilitados ?? []).includes(m))
  if (faltan.length) {
    console.log(`\n  ⚠ Módulos apagados en este club: ${faltan.join(', ')}`)
    console.log('    Sin ellos las pantallas correspondientes no aparecen en el menú.')
  }

  if (creadas.length) {
    console.log('\n─────────────────────────────────────────────────────────────')
    console.log('  Para entrar:\n')
    for (const c of creadas) {
      console.log(`  ${c.rol.padEnd(9)}  ${c.email}`)
      console.log(`             ${c.password}\n`)
    }
    console.log('  Para borrarlas:  node scripts/seed-spinhouse-pruebas.mjs --borrar')
    console.log('─────────────────────────────────────────────────────────────\n')
  }
}

main().catch(e => { console.error('\n✗', e.message, '\n'); process.exit(1) })
