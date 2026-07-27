// Comprueba que se pueda escribir en todas las tablas que el código toca.
//
// El smoke principal recorre los flujos importantes con datos armados a mano.
// Este es el complemento barato para el resto: en vez de inventar una fila
// válida por tabla —que serían treinta y nueve—, toma una que ya existe, le
// cambia lo que la identifica y la vuelve a insertar. Si entra, la tabla acepta
// escrituras; si no, sale el motivo.
//
// Es como se encontró el bug de registrado_por: no leyendo, escribiendo.
//
//   node scripts/smoke-tablas.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Tablas en las que el código escribe.
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
  const s = readFileSync(a, 'utf8')
  for (const m of s.matchAll(/\.from\(['"]([a-z_]+)['"]\)\s*\r?\n?\s*\.(?:insert|update|upsert|delete)/g)) {
    tablas.add(m[1])
  }
}

// No se pueden clonar: el id de un perfil viene de su cuenta de acceso, y
// notificaciones_leidas usa clave compuesta, sin columna id propia. Las dos se
// ejercitan en los flujos, no acá.
const NO_CLONABLES = new Set(['perfiles', 'notificaciones_leidas'])

// Campos que no se copian: los genera la base o identifican a la fila original.

const NO_COPIAR = new Set(['id', 'creado_en', 'created_at', 'actualizado_en', 'updated_at'])

/** Cambia lo que podría chocar contra un índice único. */
function despersonalizar(fila) {
  const copia = {}
  for (const [k, v] of Object.entries(fila)) {
    if (NO_COPIAR.has(k)) continue
    if (typeof v === 'string' && /nombre|titulo|codigo|slug/.test(k)) copia[k] = `ZZ ${v}`.slice(0, 80)
    else if (typeof v === 'string' && /email/.test(k)) copia[k] = `zz-smoke@ejemplo.cl`
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) copia[k] = '2099-01-05' + v.slice(10)
    else if (k === 'anio' && typeof v === 'number') copia[k] = 2099
    else copia[k] = v
  }
  return copia
}

let ok = 0, mal = 0, sinDatos = 0
const fallos = []

console.log(`Probando escritura en ${tablas.size} tablas\n`)

for (const tabla of [...tablas].sort()) {
  const { data: ejemplo, error: errLeer } = await db.from(tabla).select('*').limit(1)
  if (errLeer) { console.log(`  ?     ${tabla} — no se pudo leer: ${errLeer.message}`); mal++; continue }
  if (!ejemplo?.length) { console.log(`  --    ${tabla} — sin filas de ejemplo`); sinDatos++; continue }
  if (NO_CLONABLES.has(tabla)) { console.log(`  --    ${tabla} — no se puede clonar, se prueba en el flujo`); sinDatos++; continue }

  const { data, error } = await db.from(tabla).insert(despersonalizar(ejemplo[0])).select('id').single()

  // Que salte una restricción única o una regla de negocio no es un fallo: la
  // fila llegó bien formada hasta la comprobación y la base la frenó, que es
  // justo lo que tiene que pasar. Clonar una fila choca a propósito con esas
  // guardas, porque no se randomiza lo que la identifica.
  const guardaOk = error && (error.code === '23505' || /^[A-Z]{2}-\d/.test(error.message))

  if (guardaOk) {
    console.log(`  FRENA ${tabla} — ${error.message.slice(0, 60)}`)
    ok++
  } else if (error) {
    console.log(`  FALLA ${tabla}\n          ${error.message}`)
    fallos.push([tabla, error.message])
    mal++
  } else {
    await db.from(tabla).delete().eq('id', data.id)
    console.log(`  OK    ${tabla}`)
    ok++
  }
}

console.log(`\n${ok} responden bien (escriben o frenan como deben) · ${mal} fallan · ${sinDatos} sin datos`)
if (fallos.length) {
  console.log('\nPara revisar:')
  for (const [t, m] of fallos) console.log(`  ${t}: ${m}`)
}
