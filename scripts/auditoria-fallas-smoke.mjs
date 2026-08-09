// Comprueba si las tres fallas del smoke son bugs o afirmaciones viejas.
//
// El smoke marcó tres. Las tres huelen a test que se quedó atrás, y eso es
// justo lo que hay que verificar en vez de suponer: la vez pasada un "crítico"
// reportado resultó falso positivo por no ir a mirar.
//
// Escribe filas de prueba con fecha 2099 y las borra al terminar.
//
//   node scripts/auditoria-fallas-smoke.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BUIN = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
const F = '2099-06-15'

let bugs = 0
const bug   = m => { console.log(`  🔴 BUG REAL: ${m}`); bugs++ }
const viejo = m => console.log(`  ✓ test viejo: ${m}`)

const { data: jug } = await db.from('jugadores').select('id,nombre').eq('club_id', BUIN).limit(1).single()

// ══ 1. ¿La tabla `clases` existe? ¿La usa alguien? ════════════════════════
console.log('\n1. "Could not find the table public.clases"\n')

const { error: errClases } = await db.from('clases').select('id').limit(1)
console.log(`   la tabla clases ${errClases ? 'NO existe' : 'existe'}`)

function archivos(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) archivos(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !f.includes('.test.')) out.push(p)
  }
  return out
}
const usan = archivos('src').filter(a => /\.from\(['"]clases['"]\)/.test(readFileSync(a, 'utf8')))
if (errClases && usan.length) bug(`la tabla no existe pero ${usan.length} archivo(s) la consultan: ${usan.join(', ')}`)
else if (errClases) viejo('la tabla se eliminó y ningún archivo de src la consulta — el smoke quedó atrás')
else viejo('la tabla existe; el error del smoke fue de caché de esquema')

// ══ 2. monto = 0 y monto < 0 en clases extraordinarias ════════════════════
console.log('\n2. "No acepta monto cero ni negativo"\n')

const { data: ex, error: errIns } = await db.from('clases_extraordinarias')
  .insert({ club_id: BUIN, jugador_id: jug.id, fecha: F, bloque_id: null, hora: '19:00' })
  .select('id').single()

if (errIns) { console.log(`   no se pudo crear la fila de prueba: ${errIns.message}`) }
else {
  const { error: e0 } = await db.from('clases_extraordinarias').update({ monto: 0 }).eq('id', ex.id)
  const { error: eNeg } = await db.from('clases_extraordinarias').update({ monto: -500 }).eq('id', ex.id)

  console.log(`   monto = 0     -> ${e0 ? 'RECHAZADO' : 'aceptado'}`)
  console.log(`   monto = -500  -> ${eNeg ? 'RECHAZADO' : 'ACEPTADO'}`)

  // La migración 100 aflojó el CHECK a propósito: 0 = "sin cargo, el profe
  // debía esta clase". El smoke sigue afirmando la regla de la 099.
  if (!e0) viejo('monto 0 se acepta porque la migración 100 lo permitió a propósito ("sin cargo")')
  else bug('monto 0 se rechaza, pero la 100 y toda la UI lo tratan como "sin cargo"')

  if (!eNeg) bug('acepta monto NEGATIVO — eso descuenta plata de un total')
  else viejo('el negativo sí se rechaza, que es lo que importaba de esa afirmación')

  await db.from('clases_extraordinarias').delete().eq('id', ex.id)
}

// ══ 3. sesiones_usadas vs asistencia ══════════════════════════════════════
console.log('\n3. "sesiones_usadas 0 != asistencias 2"\n')

const { count: todas } = await db.from('asistencia')
  .select('*', { count: 'exact', head: true }).eq('jugador_id', jug.id)
const { count: presentes } = await db.from('asistencia')
  .select('*', { count: 'exact', head: true }).eq('jugador_id', jug.id).eq('estado', 'presente')
const { data: j2 } = await db.from('jugadores').select('sesiones_usadas').eq('id', jug.id).single()

console.log(`   ${jug.nombre}`)
console.log(`   filas en asistencia (todas):    ${todas}`)
console.log(`   solo estado = 'presente':      ${presentes}`)
console.log(`   jugadores.sesiones_usadas:     ${j2.sesiones_usadas}`)

// La tabla guarda faltas desde el 2026-07-29. El smoke cuenta count(*) sin
// filtrar, así que compara sesiones contra presentes + ausentes.
if (j2.sesiones_usadas === presentes) {
  viejo("sesiones_usadas coincide con los presentes; el smoke cuenta sin filtrar estado='presente'")
} else if (j2.sesiones_usadas === todas) {
  bug('sesiones_usadas cuenta también las faltas')
} else {
  bug(`sesiones_usadas (${j2.sesiones_usadas}) no coincide ni con presentes (${presentes}) ni con el total (${todas})`)
}

// ══ Y de paso: ninguna consulta nueva puede olvidar el filtro ═════════════
console.log('\n4. Consultas a `asistencia` sin filtrar estado (regla del CLAUDE.md)\n')
let sinFiltro = 0
for (const a of archivos('src')) {
  const txt = readFileSync(a, 'utf8')
  for (const m of txt.matchAll(/\.from\(['"]asistencia['"]\)([\s\S]{0,260})/g)) {
    const cola = m[1]
    // Solo cuentan las lecturas: insert/update/delete no llevan filtro.
    if (!/\.select\(/.test(cola)) continue
    if (!/estado/.test(cola)) { console.log(`   ⚠️  ${a}`); sinFiltro++ }
  }
}
if (!sinFiltro) console.log('   ninguna: todas las lecturas filtran por estado')

console.log(`\n${'─'.repeat(60)}`)
console.log(bugs ? `${bugs} bug(s) real(es).` : 'Las tres fallas son afirmaciones viejas del smoke, no bugs.')
process.exit(bugs ? 1 : 0)
