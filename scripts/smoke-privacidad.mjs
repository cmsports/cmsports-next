// Comprueba que ninguna tabla devuelva datos sin iniciar sesión.
//
// La llave anónima viaja dentro del navegador: es pública por diseño. Todo lo
// que se pueda leer con ella lo puede leer cualquiera que abra las
// herramientas de desarrollo.
//
// Se encontró así que perfiles exponía el correo de todos los usuarios de los
// cuatro clubes, y que los códigos de invitación estaban a la vista.
//
//   node scripts/smoke-privacidad.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

function archivos(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) archivos(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !f.includes('.test.')) out.push(p)
  }
  return out
}

const tablas = new Set()
for (const a of archivos('src')) {
  for (const m of readFileSync(a, 'utf8').matchAll(/\.from\(['"]([a-z_]+)['"]\)/g)) tablas.add(m[1])
}

// Y además todas las tablas de la base, no solo las que el código menciona.
//
// Buscar solo donde el código mira fue justo lo que dejó pasar el agujero de
// `clase_jugadores`: 888 filas legibles —y escribibles— con la llave pública,
// en una tabla que ninguna pantalla usa. Una tabla que nadie lee sigue teniendo
// los datos adentro.
if (env.SUPABASE_SERVICE_ROLE_KEY) {
  const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await svc.rpc('_auditoria_politicas')
  if (error) {
    console.log('Aviso: sin la función _auditoria_politicas (migración 102) solo se revisan')
    console.log('las tablas que el código menciona, y las olvidadas quedan sin probar.\n')
  } else {
    for (const f of data) tablas.add(f.tabla)
  }
}

console.log(`Intentando leer ${tablas.size} tablas sin sesión\n`)

const expuestas = []
for (const t of [...tablas].sort()) {
  const { data, error } = await anon.from(t).select('*', { count: 'exact' }).limit(1)
  if (!error && data?.length) {
    expuestas.push(t)
    console.log(`  EXPUESTA  ${t} — devuelve datos a cualquiera`)
  }
}

if (expuestas.length) {
  console.log(`\n${expuestas.length} tablas legibles sin sesión. Hay que cerrarlas.`)
  process.exit(1)
}
console.log('\nNinguna tabla devuelve datos sin sesión.')
