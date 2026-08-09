// Auditoría de entrega: lo que hay que mirar antes de decir que está listo.
//
// No repite lo que ya cubren los smoke (privacidad, políticas, escrituras).
// Mira otra cosa: si los datos que hoy tiene el club son coherentes entre sí,
// y si hay algo cargado a medias que va a explotar recién cuando alguien lo
// use. Un sistema puede pasar todos los tests y estar igual de roto porque la
// plata no cuadra o porque falta un dato que nadie miró.
//
//   node scripts/auditar-entrega.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BUIN = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'

const hoy = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const [anio, mes] = hoy.split('-').map(Number)
const clp = n => `$${(n ?? 0).toLocaleString('es-CL')}`

let graves = 0, avisos = 0
const grave = m => { console.log(`  🔴 ${m}`); graves++ }
const aviso = m => { console.log(`  🟡 ${m}`); avisos++ }
const ok    = m => console.log(`  ✓ ${m}`)

console.log(`\nAuditoría de entrega — Asociación Buin — ${hoy}\n${'═'.repeat(62)}`)

// ══ 1. El libro cuadra ════════════════════════════════════════════════════
console.log('\n1. La plata del mes: lo cobrado contra lo registrado\n')

const { data: movs } = await db.from('movimientos')
  .select('tipo,categoria,monto,mes_correspondiente,anio_correspondiente').eq('club_id', BUIN)
  .gte('fecha', `${hoy.slice(0, 7)}-01`).lte('fecha', `${hoy.slice(0, 7)}-31`)
const ingresos = (movs ?? []).filter(m => m.tipo === 'ingreso')
const porCat = {}
for (const m of ingresos) porCat[m.categoria] = (porCat[m.categoria] ?? 0) + m.monto
console.log(`   entró este mes: ${clp(ingresos.reduce((s, m) => s + m.monto, 0))}`)
for (const [c, v] of Object.entries(porCat)) console.log(`     · ${c}: ${clp(v)}`)

// La comparación tiene que ser contra el mes QUE SE PAGA, no contra la fecha
// en que entró la plata. Una cuota de julio pagada en agosto es un movimiento
// con fecha de agosto y `mes_correspondiente` julio: contarla como agosto hacía
// que esta misma auditoría reportara un descuadre de $407.500 que no existía.
const delMes = ingresos.filter(m =>
  m.categoria === 'mensualidad' && m.mes_correspondiente === mes && m.anio_correspondiente === anio)
const cobradoDelMes = delMes.reduce((s, m) => s + m.monto, 0)
const atrasadas = ingresos.filter(m =>
  m.categoria === 'mensualidad' && (m.mes_correspondiente !== mes || m.anio_correspondiente !== anio))
if (atrasadas.length) {
  console.log(`   de eso, ${clp(atrasadas.reduce((s, m) => s + m.monto, 0))} son cuotas atrasadas de meses anteriores`)
}

const { data: pagadas } = await db.from('mensualidades')
  .select('monto').eq('club_id', BUIN).eq('mes', mes).eq('anio', anio).eq('estado', 'pagado')
const sumaPagadas = (pagadas ?? []).reduce((s, m) => s + (m.monto ?? 0), 0)
if (sumaPagadas === cobradoDelMes) ok(`las ${pagadas?.length ?? 0} cuotas de este mes marcadas pagadas calzan con el libro (${clp(sumaPagadas)})`)
else grave(`cuotas del mes marcadas pagadas ${clp(sumaPagadas)} != ingresos por cuotas del mes ${clp(cobradoDelMes)} — diferencia ${clp(Math.abs(sumaPagadas - cobradoDelMes))}`)

// ══ 2. Clases extra: nada cobrado sin movimiento, nada colgado ════════════
console.log('\n2. Clases extraordinarias\n')

const { data: extras } = await db.from('clases_extraordinarias')
  .select('id,jugador_id,fecha,monto,cobrada_en,pagada_en,movimiento_id').eq('club_id', BUIN)

const pagadasEx = (extras ?? []).filter(e => e.pagada_en)
const sinMov = pagadasEx.filter(e => !e.movimiento_id)
if (sinMov.length) grave(`${sinMov.length} clase(s) extra marcadas pagadas SIN movimiento en el libro`)
else ok(`las ${pagadasEx.length} clases extra pagadas tienen su movimiento`)

const sinPrecio = (extras ?? []).filter(e => !e.pagada_en && e.monto == null)
if (sinPrecio.length) {
  aviso(`${sinPrecio.length} clase(s) extra sin precio asignado: no se pueden cobrar y el jugador las ve como "por definir"`)
  for (const e of sinPrecio.slice(0, 5)) {
    const { data: j } = await db.from('jugadores').select('nombre').eq('id', e.jugador_id).maybeSingle()
    console.log(`       · ${j?.nombre ?? e.jugador_id} — ${e.fecha}`)
  }
} else ok('ninguna clase extra quedó sin precio')

const porCobrar = (extras ?? []).filter(e => !e.pagada_en && e.monto > 0)
if (porCobrar.length) aviso(`${clp(porCobrar.reduce((s, e) => s + e.monto, 0))} en ${porCobrar.length} clase(s) extra sin cobrar`)

// ══ 3. Jugadores sin lo mínimo para operar ════════════════════════════════
console.log('\n3. Fichas incompletas\n')

const { data: jugs } = await db.from('jugadores')
  .select('id,nombre,telefono,mensualidad,sesiones_limite,tipo_plan')
  .eq('club_id', BUIN).eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false')

const sinCuota = (jugs ?? []).filter(j => !j.mensualidad)
const sinTel   = (jugs ?? []).filter(j => !j.telefono?.trim())
if (sinCuota.length) aviso(`${sinCuota.length} de ${jugs?.length} jugadores sin cuota asignada — su mensualidad sale "Cuota por asignar"`)
else ok('todos tienen cuota')
if (sinTel.length) aviso(`${sinTel.length} de ${jugs?.length} sin teléfono — no se les puede mandar el cobro por WhatsApp`)
else ok('todos tienen teléfono')

// ══ 4. Jugadores sin grupo: no les cuenta la asistencia ═══════════════════
console.log('\n4. Jugadores sin grupo vigente\n')

const { data: bj } = await db.from('bloque_jugadores')
  .select('jugador_id,vigente_desde,vigente_hasta')
const conBloque = new Set((bj ?? [])
  .filter(b => b.vigente_desde <= hoy && (b.vigente_hasta == null || b.vigente_hasta >= hoy))
  .map(b => b.jugador_id))
const sinGrupo = (jugs ?? []).filter(j => !conBloque.has(j.id))
if (sinGrupo.length) {
  aviso(`${sinGrupo.length} jugador(es) activos sin bloque vigente: no aparecen en listas ni suman asistencia`)
  for (const j of sinGrupo.slice(0, 6)) console.log(`       · ${j.nombre}`)
} else ok('todos los activos tienen grupo vigente')

// ══ 5. Cuentas de acceso ══════════════════════════════════════════════════
console.log('\n5. Acceso de los jugadores\n')

const { data: perfiles } = await db.from('perfiles').select('id,nombre,email,jugador_id,rol').eq('club_id', BUIN).not('jugador_id', 'is', null)
const idsJug = new Set((jugs ?? []).map(j => j.id))
const conCuenta = new Set((perfiles ?? []).map(p => p.jugador_id).filter(id => idsJug.has(id)))
const sinCuenta = (jugs ?? []).filter(j => !conCuenta.has(j.id))
console.log(`   ${conCuenta.size} de ${jugs?.length} jugadores activos tienen cuenta`)
for (const j of sinCuenta) aviso(`${j.nombre} no puede entrar a ver su estado de cuenta`)

// Un perfil solo es huérfano si su jugador NO EXISTE. Antes se comparaba
// contra los activos, así que los bloqueados —que existen, están bloqueados y
// van a /cuenta-bloqueada como corresponde— salían denunciados como huérfanos.
// Eran 11 reportados por 8 reales.
const { data: todosJug } = await db.from('jugadores').select('id').eq('club_id', BUIN)
const idsExisten = new Set((todosJug ?? []).map(j => j.id))
const huerfanos = (perfiles ?? []).filter(p => !idsExisten.has(p.jugador_id))
if (huerfanos.length) {
  aviso(`${huerfanos.length} cuenta(s) cuyo jugador fue borrado: pueden iniciar sesión y ven "Perfil no vinculado"`)
  for (const p of huerfanos) console.log(`       · ${p.nombre ?? '(sin nombre)'} — ${p.email ?? ''}`)
} else ok('ninguna cuenta apunta a un jugador borrado')

// ══ 6. Teléfonos que WhatsApp no acepta ═══════════════════════════════════
console.log('\n6. Teléfonos que el botón de WhatsApp va a rechazar\n')

const wa = raw => {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  d = d.replace(/^00/, '').replace(/^56/, '').replace(/^0/, '')
  return d.length >= 9 && d.startsWith('9') ? `56${d.slice(0, 9)}` : null
}
const malos = (jugs ?? []).filter(j => j.telefono?.trim() && !wa(j.telefono))
if (malos.length) {
  aviso(`${malos.length} teléfono(s) cargados que no son celular chileno válido — el botón no aparece`)
  for (const j of malos.slice(0, 6)) console.log(`       · ${j.nombre}: "${j.telefono}"`)
} else ok('todos los teléfonos cargados sirven para WhatsApp')

// Solo Buin. Los otros clubes de la base no son alcance de este proyecto y
// meterlos acá solo ensucia el informe con problemas de otro.
const { data: club } = await db.from('clubes').select('nombre,telefono').eq('id', BUIN).single()
if (!wa(club?.telefono)) aviso(`el club no tiene teléfono usable ("${club?.telefono ?? ''}") — los jugadores no ven el botón de comprobante`)
else ok(`teléfono del club: ${club.telefono}`)

// ══ 7. Cierre ═════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(62)}`)
console.log(graves ? `${graves} problema(s) GRAVE(s) y ${avisos} aviso(s).`
                   : `Sin problemas graves. ${avisos} aviso(s) de datos por completar.`)
process.exit(graves ? 1 : 0)
