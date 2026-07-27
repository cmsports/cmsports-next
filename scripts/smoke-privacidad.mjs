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
