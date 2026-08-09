// Audita las migraciones: cuáles corrieron, cuáles no, y cuáles no se protegen.
//
// Las migraciones de este proyecto se pegan a mano en el SQL Editor, así que
// nada impide correr dos veces la misma. Eso ya pasó: la 089 se ejecutó dos
// veces y borró plata real de producción. La 128 agregó el registro y el
// portazo `_migracion_nueva()`, pero el portazo solo protege si está escrito
// en cada archivo — y nada obliga a escribirlo.
//
// Esto compara los archivos contra `_migraciones_aplicadas` y revisa que cada
// migración nueva lleve su guarda.
//
//   node scripts/auditar-migraciones.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const DIR = 'supabase/migrations'
// El registro nace con la 128: exigirle el portazo a las anteriores no tiene
// sentido, ya estaban corridas cuando se inventó.
const DESDE_REGISTRO = 128

// Anuladas a propósito. Tienen guarda y no se les toca: docs/migraciones-destructivas.md
const ANULADAS = ['089_arranque_limpio_buin', '060_limpiar_jugadores_externos', '081_baja_jugadores_retirados']

let problemas = 0
const mal = m => { console.log(`  🔴 ${m}`); problemas++ }
const ok  = m => console.log(`  ✓ ${m}`)

const archivos = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const numero = f => parseInt(f.slice(0, 3), 10)

console.log(`\n${archivos.length} migraciones en ${DIR}\n`)

// ══ 1. El portazo en toda migración desde la 128 ══════════════════════════
console.log('1. Portazo `_migracion_nueva()` en las migraciones nuevas\n')
const sinPortazo = []
for (const f of archivos) {
  if (numero(f) < DESDE_REGISTRO) continue
  const txt = readFileSync(join(DIR, f), 'utf8')
  if (!/_migracion_nueva\s*\(/.test(txt)) sinPortazo.push(f)
}
if (sinPortazo.length) { for (const f of sinPortazo) mal(`${f} — sin portazo: se puede correr dos veces`) }
else ok(`las ${archivos.filter(f => numero(f) >= DESDE_REGISTRO).length} migraciones desde la ${DESDE_REGISTRO} lo tienen`)

// El registro de la base se lee una vez: hace falta acá y en el paso 5.
const { data: aplicadas, error: errReg } = await db.from('_migraciones_aplicadas').select('nombre,aplicada_en')
const registradas = new Set((aplicadas ?? []).map(r => r.nombre))

// ══ 2. ¿El portazo de cada archivo frena de verdad? ═══════════════════════
console.log('\n2. El portazo de cada archivo frena de verdad\n')
//
// La pregunta NO es si el nombre coincide con el del archivo. Es si, al pegar
// ese archivo de nuevo, algo lo detiene. Un archivo renumerado después de
// correr (pasó con la 130 → 131, porque el 130 ya lo ocupaba otra) tiene que
// seguir registrando su nombre viejo: es el que está en la base. Exigir que
// coincida con el nombre del archivo pedía justo lo contrario y convertía un
// portazo correcto en un falso positivo.
let flojos = 0
for (const f of archivos) {
  if (numero(f) < DESDE_REGISTRO) continue
  // Sin comentarios: la 128 documenta el uso con un ejemplo
  // (`_migracion_nueva('125_nombre_del_archivo')`) y leerlo crudo hacía que
  // esta misma auditoría reportara un falso positivo contra ella.
  const txt = readFileSync(join(DIR, f), 'utf8')
    .split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
  const m = txt.match(/_migracion_nueva\s*\(\s*'([^']+)'/)
  if (!m) continue

  const nombre = m[1]
  const propio = f.replace(/\.sql$/, '')
  if (nombre === propio) continue                 // caso normal
  if (registradas.has(nombre)) {                  // renumerada: frena igual
    console.log(`  ·  ${f} registra '${nombre}' (nombre con el que corrió) — frena igual`)
    continue
  }
  mal(`${f} registra '${nombre}', que no está en la base ni es su nombre: no frena nada`)
  flojos++
}
if (!flojos) ok('todos frenan')

// ══ 3. Las anuladas siguen con su guarda ═════════════════════════════════
console.log('\n3. Las migraciones anuladas siguen bloqueadas\n')
for (const nombre of ANULADAS) {
  const f = archivos.find(a => a.startsWith(nombre.slice(0, 3)))
  if (!f) { mal(`${nombre} — no está el archivo`); continue }
  const txt = readFileSync(join(DIR, f), 'utf8')
  if (/RAISE EXCEPTION[^;]*anulada/i.test(txt)) ok(`${f} bloqueada`)
  else mal(`${f} SIN guarda — se puede re-ejecutar y volver a destruir`)
}

// ══ 4. Destructivas sin respaldo ═════════════════════════════════════════
console.log('\n4. Migraciones con DELETE/TRUNCATE/DROP TABLE y sin respaldo\n')
let riesgosas = 0
for (const f of archivos) {
  const txt = readFileSync(join(DIR, f), 'utf8')
  // Sin comentarios: el encabezado suele explicar el DELETE que ya no hace.
  const sql = txt.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
  const destructiva = /\b(DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/i.test(sql)
  if (!destructiva) continue
  const tieneRespaldo = /CREATE TABLE\s+_respaldo/i.test(sql)
  const anulada = ANULADAS.some(a => f.startsWith(a.slice(0, 3)))
  // DROP de tablas que la propia migración crea, o vistas, no cuentan.
  if (!tieneRespaldo && !anulada) { console.log(`  ⚠️  ${f} — destructiva sin CREATE TABLE _respaldo (revisar a mano)`); riesgosas++ }
}
if (!riesgosas) ok('ninguna')

// ══ 5. Archivos vs lo que dice la base ═══════════════════════════════════
console.log('\n5. Qué corrió de verdad\n')
if (errReg) {
  mal(`no se pudo leer _migraciones_aplicadas: ${errReg.message}`)
} else {
  const nuevas = archivos.filter(f => numero(f) >= DESDE_REGISTRO).map(f => f.replace(/\.sql$/, ''))

  // Un archivo cuenta como corrido si su nombre está registrado O si el nombre
  // que usa su portazo lo está: es el caso de las renumeradas.
  const corrioComo = n => {
    if (registradas.has(n)) return true
    const txt = readFileSync(join(DIR, `${n}.sql`), 'utf8')
      .split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    const m = txt.match(/_migracion_nueva\s*\(\s*'([^']+)'/)
    return !!m && registradas.has(m[1])
  }
  const pendientes = nuevas.filter(n => !corrioComo(n))
  // Un nombre registrado es fantasma solo si NINGÚN archivo lo reclama, ni por
  // su nombre ni por el del portazo. Y las anuladas no cuentan: la 128 las
  // registró a propósito, sin archivo propio, justo para que no se repitan.
  const reclamados = new Set()
  for (const n of nuevas) {
    reclamados.add(n)
    const txt = readFileSync(join(DIR, `${n}.sql`), 'utf8')
      .split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    const m = txt.match(/_migracion_nueva\s*\(\s*'([^']+)'/)
    if (m) reclamados.add(m[1])
  }
  const fantasmas = [...registradas]
    .filter(n => !reclamados.has(n))
    .filter(n => !ANULADAS.includes(n))

  console.log(`   registradas en la base: ${registradas.size}`)
  if (pendientes.length) {
    console.log('\n   SIN CORRER (el archivo existe, la base no lo tiene):')
    for (const p of pendientes) console.log(`     · ${p}`)
    console.log('     ↑ si el código desplegado las necesita, falla en producción')
  } else ok('no hay migraciones nuevas sin correr')

  if (fantasmas.length) {
    console.log('\n   REGISTRADAS SIN ARCHIVO (corrieron y el .sql no está en el repo):')
    for (const f of fantasmas) mal(`     · ${f}`)
  }
}

console.log(`\n${'─'.repeat(60)}`)
console.log(problemas ? `${problemas} problema(s).` : 'Migraciones en orden.')
process.exit(problemas ? 1 : 0)
