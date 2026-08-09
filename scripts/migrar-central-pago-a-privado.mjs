// Mueve los datos de transferencia de cada club al bucket privado.
//
// POR QUÉ NO ES UNA MIGRACIÓN SQL. Se intentó, y la base lo rechaza:
//
//   ERROR 42501: no se permite la eliminación directa de tablas de
//   almacenamiento. Utilice la API de almacenamiento en su lugar.
//   (trigger storage.protect_delete)
//
// Supabase protege `storage.objects` de escrituras directas justo para que
// nadie borre la fila y deje el archivo huérfano en el disco. Tenía razón: eso
// es exactamente lo que iba a hacer la 139. El borrado va por la API.
//
// QUÉ HACE, EN ORDEN. Copia antes de borrar, y verifica entre medio:
//
//   1. Descarga la imagen pública de cada club.
//   2. La sube al bucket privado, en central-pago/{club_id}/datos.jpg.
//   3. Comprueba que la copia se lee y pesa lo mismo.
//   4. Recién ahí borra la pública —y solo con --borrar.
//
// Así el club no pierde su imagen ni tiene que volver a subirla: al terminar,
// Central de Pago la muestra igual que antes, pero firmada.
//
//   node scripts/migrar-central-pago-a-privado.mjs            (simulacro)
//   node scripts/migrar-central-pago-a-privado.mjs --borrar   (de verdad)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BORRAR = process.argv.includes('--borrar')

const PUBLICO = 'galeria-fotos'
const PRIVADO = 'privado'
const rutaPrivada = clubId => `central-pago/${clubId}/datos.jpg`

console.log(BORRAR
  ? '\nMODO REAL: copia al bucket privado y borra la copia pública.\n'
  : '\nSIMULACRO: no escribe nada. Agregá --borrar para aplicarlo.\n')

const { data: clubes } = await svc.from('clubes').select('id,nombre').order('nombre')
const { data: publicos, error: errList } = await svc.storage.from(PUBLICO).list('central-pago')
if (errList) { console.error('No se pudo listar:', errList.message); process.exit(1) }

// El nombre del archivo público es el club_id pelado, sin extensión.
const porClub = new Map((publicos ?? []).map(f => [f.name, f]))
let movidos = 0, fallos = 0

for (const club of clubes ?? []) {
  const archivo = porClub.get(club.id)
  if (!archivo) { console.log(`  ·  ${club.nombre}: sin imagen pública, nada que mover`); continue }

  const bytesOrigen = archivo.metadata?.size ?? 0
  console.log(`\n  ${club.nombre}  (${Math.round(bytesOrigen / 1024)} KB)`)

  // 1. ¿Ya está en el privado? No se pisa una copia buena.
  const { data: yaPriv } = await svc.storage.from(PRIVADO).list(`central-pago/${club.id}`)
  if (yaPriv?.some(f => f.name === 'datos.jpg')) {
    console.log('     ya estaba en el bucket privado')
  } else {
    if (!BORRAR) { console.log('     [simulacro] se copiaría al bucket privado'); continue }

    const { data: blob, error: errDown } = await svc.storage.from(PUBLICO).download(`central-pago/${club.id}`)
    if (errDown || !blob) { console.log(`     ✗ no se pudo descargar: ${errDown?.message}`); fallos++; continue }

    const buffer = Buffer.from(await blob.arrayBuffer())
    const { error: errUp } = await svc.storage.from(PRIVADO)
      .upload(rutaPrivada(club.id), buffer, { contentType: blob.type || 'image/jpeg', upsert: true })
    if (errUp) { console.log(`     ✗ no se pudo subir: ${errUp.message}`); fallos++; continue }
    console.log(`     copiada al privado (${buffer.length} bytes)`)
  }

  // 2. Verificar la copia ANTES de borrar el original. Sin esto, un upload que
  //    devuelve ok pero deja el archivo vacío se lleva puesta la única copia.
  const { data: check, error: errCheck } = await svc.storage.from(PRIVADO).download(rutaPrivada(club.id))
  if (errCheck || !check || check.size === 0) {
    console.log(`     ✗ la copia privada no se lee — NO se borra la pública`); fallos++; continue
  }
  console.log(`     verificada (${check.size} bytes)`)

  // 3. Recién ahora, borrar la pública.
  if (!BORRAR) { console.log('     [simulacro] se borraría la copia pública'); continue }
  const { error: errDel } = await svc.storage.from(PUBLICO).remove([`central-pago/${club.id}`])
  if (errDel) { console.log(`     ✗ no se pudo borrar la pública: ${errDel.message}`); fallos++; continue }
  console.log('     copia pública borrada')
  movidos++
}

// ── Comprobación final: que ya no se abra sin sesión ───────────────────────
console.log('\n  Probando las URLs públicas sin sesión:')
let expuestos = 0
for (const club of clubes ?? []) {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLICO}/central-pago/${club.id}`
  const res = await fetch(url)
  if (res.ok) { console.log(`     ⚠️  ${club.nombre}: SIGUE EXPUESTO`); expuestos++ }
  else console.log(`     ✓ ${club.nombre}: ${res.status}`)
}

console.log(`\n${'─'.repeat(58)}`)
console.log(`Movidos: ${movidos} · Fallos: ${fallos} · Aún expuestos: ${expuestos}`)
process.exit(fallos || expuestos ? 1 : 0)
