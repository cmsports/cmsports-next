// Comprueba contra la base real lo que las pantallas del jugador van a mostrar.
//
// SOLO LECTURA. No escribe nada. Existe porque el arreglo del estado de cuenta
// se podía verificar con tests de dominio pero no con datos de verdad: los
// tests prueban que 35000 + 3000 da 38000, no que Jonathan tenga esas dos
// filas. Lo que fallaba era justamente el dato, no la suma.
//
//   node scripts/verificar-estado-cuenta.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const svc  = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const BUIN = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
let fallos = 0
const fallo = m => { console.log(`  ✗ ${m}`); fallos++ }
const ok    = m => console.log(`  ✓ ${m}`)

// Misma partición que src/lib/domain/estadoCuenta.ts
function cuenta(mens, extras) {
  const mensualidad = mens?.estado === 'pagado' ? 0 : Number(mens?.monto ?? 0)
  const porCobrar = extras.filter(e => !e.pagada_en && e.monto != null && e.monto > 0)
  const sinCargo  = extras.filter(e => !e.pagada_en && e.monto != null && e.monto <= 0)
  const sinMonto  = extras.filter(e => !e.pagada_en && e.monto == null)
  const suma = porCobrar.reduce((s, e) => s + e.monto, 0)
  return { mensualidad, extras: suma, total: mensualidad + suma, porCobrar, sinCargo, sinMonto }
}

// ── 1. Lo que va a ver cada jugador con clases extra impagas ───────────────
console.log('\n1. Jugadores de Buin con clases extra sin pagar\n')

const hoy = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const [anio, mes] = hoy.split('-').map(Number)
console.log(`  Hoy en Chile: ${hoy} → mensualidad de ${mes}/${anio}\n`)

const { data: extrasTodas, error: errEx } = await svc
  .from('clases_extraordinarias')
  .select('id,jugador_id,fecha,monto,pagada_en')
  .eq('club_id', BUIN).is('pagada_en', null)

if (errEx) {
  fallo(`No se pudieron leer las clases extra: ${errEx.message}`)
} else if (!extrasTodas.length) {
  console.log('  (ninguna clase extra impaga en Buin — nada que contrastar)')
} else {
  const porJugador = new Map()
  for (const e of extrasTodas) {
    const previas = porJugador.get(e.jugador_id)
    if (previas) previas.push(e); else porJugador.set(e.jugador_id, [e])
  }

  for (const [jugadorId, suyas] of porJugador) {
    const { data: j } = await svc.from('jugadores').select('nombre').eq('id', jugadorId).single()
    const { data: m } = await svc.from('mensualidades').select('monto,estado')
      .eq('jugador_id', jugadorId).eq('mes', mes).eq('anio', anio).maybeSingle()

    const c = cuenta(m, suyas)
    const clp = n => `$${n.toLocaleString('es-CL')}`

    console.log(`  ${j?.nombre ?? jugadorId}`)
    console.log(`    Mensualidad ${mes}/${anio}: ${m ? `${clp(m.monto ?? 0)} (${m.estado})` : 'sin emitir'}`)
    for (const e of suyas) {
      const et = e.monto == null ? 'sin monto' : e.monto === 0 ? 'sin cargo' : clp(e.monto)
      console.log(`    Clase extra ${e.fecha}: ${et}`)
    }
    console.log(`    ANTES mostraba:  ${m?.monto ? clp(m.monto) : '—'}`)
    console.log(`    AHORA muestra:   ${clp(c.total)}`)

    if (c.total !== c.mensualidad) {
      ok(`la diferencia (${clp(c.extras)}) es la que el jugador no veía`)
    } else if (c.sinMonto.length) {
      ok(`sus ${c.sinMonto.length} extra(s) no tienen precio: no suman, y ahora las ve listadas`)
    }
    console.log('')
  }
}

// ── 2. Que el jugador tenga permiso de leer las suyas ──────────────────────
// La pantalla usa la llave anónima con la sesión del jugador. Si la política
// no existiera, la consulta nueva devolvería vacío y el arreglo no serviría.
console.log('2. La política que deja al jugador leer sus clases extra\n')

const { data: pols, error: errPol } = await svc.rpc('_auditoria_politicas').then(
  r => r.error ? { data: null, error: r.error } : { data: r.data, error: null },
)
if (errPol) {
  console.log(`  (sin _auditoria_politicas: ${errPol.message})`)
} else {
  const t = pols.find(p => p.tabla === 'clases_extraordinarias')
  if (t) ok(`clases_extraordinarias tiene RLS con ${t.politicas ?? '?'} política(s)`)
  else fallo('clases_extraordinarias no aparece en la auditoría de políticas')
}

// ── 3. Los datos bancarios, hoy, sin sesión ────────────────────────────────
console.log('\n3. ¿Los datos de transferencia se abren sin iniciar sesión?\n')

const { data: clubes } = await svc.from('clubes').select('id,nombre,telefono').order('nombre')
let expuestos = 0
for (const c of clubes ?? []) {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/galeria-fotos/central-pago/${c.id}`
  const res = await fetch(url)
  if (res.ok) {
    const kb = Math.round(Number(res.headers.get('content-length') ?? 0) / 1024)
    console.log(`  ⚠️  ${c.nombre}: EXPUESTO sin sesión (${kb} KB) — la migración 139 cierra esto`)
    expuestos++
  } else {
    ok(`${c.nombre}: no hay imagen pública (${res.status})`)
  }
}

// ── 4. Los clubes sin teléfono usable no verán el botón de WhatsApp ────────
// Misma regla que telefonoWhatsApp() en src/lib/whatsapp.ts: un número mal
// cargado da el mismo resultado que ninguno, así que no alcanza con mirar si
// el campo está vacío.
function telefonoWhatsApp(raw) {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  d = d.replace(/^00/, '').replace(/^56/, '').replace(/^0/, '')
  return d.length >= 9 && d.startsWith('9') ? `56${d.slice(0, 9)}` : null
}

console.log('\n4. Teléfono por club (el botón de comprobante sale de acá)\n')
for (const c of clubes ?? []) {
  const n = telefonoWhatsApp(c.telefono)
  if (n) ok(`${c.nombre}: ${c.telefono} → wa.me/${n}`)
  else if (!c.telefono?.trim()) console.log(`  ⚠️  ${c.nombre}: SIN teléfono — sus jugadores no verán el botón`)
  else console.log(`  ⚠️  ${c.nombre}: "${c.telefono}" NO es un celular chileno válido — sin botón`)
}

// ── 5. Que la tabla siga cerrada a la llave pública ────────────────────────
console.log('\n5. Sin sesión, la llave pública no puede leer clases extra\n')
const { data: fuga } = await anon.from('clases_extraordinarias').select('id').limit(1)
if (fuga?.length) fallo('clases_extraordinarias devuelve datos sin sesión')
else ok('clases_extraordinarias no devuelve nada sin sesión')

console.log(`\n${'─'.repeat(60)}`)
console.log(expuestos ? `${expuestos} club(es) con datos bancarios públicos → correr la migración 139` : 'Sin datos bancarios públicos.')
console.log(fallos ? `${fallos} comprobación(es) fallida(s).` : 'Comprobaciones OK.')
process.exit(fallos ? 1 : 0)
