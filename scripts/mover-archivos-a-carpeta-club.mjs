// Mueve los archivos que están sueltos en la raíz de los buckets de material
// (`bibliografia-buin`, `libro-profe-buin`) a la carpeta `{club_id}/`.
//
// ── Por qué hace falta ────────────────────────────────────────────────────
// Esos dos buckets guardaban todo en la raíz, y la raíz no tiene dueño: los
// cuatro endpoints se saltaban RLS con la llave de servicio y su única
// comprobación era «hay sesión», así que cualquier usuario de cualquier club
// veía el material de Buin. Desde la auditoría del 2026-08-26, la aplicación
// lee y escribe SOLO en `{club_id}/`.
//
// ── Por qué un script y no una migración ──────────────────────────────────
// La tentación es hacerlo en SQL:
//
//     UPDATE storage.objects SET name = '<club>/' || name WHERE ...
//
// y es un error. En Supabase la ruta física del archivo en S3 se deriva del
// `name`: renombrarlo por SQL deja la fila apuntando a un archivo que no está
// ahí, y se rompen todas las descargas sin forma cómoda de volver. La API de
// Storage sí mueve el objeto de verdad, y es lo que usa este script.
//
// ── Uso ───────────────────────────────────────────────────────────────────
//   node scripts/mover-archivos-a-carpeta-club.mjs <club_id>            (simulación)
//   node scripts/mover-archivos-a-carpeta-club.mjs <club_id> --aplicar  (mueve)
//
// Si en la carpeta del club YA está el archivo (alguien lo copió antes), el
// move responde "The resource already exists" y no toca nada. Para ese caso:
//
//   node scripts/mover-archivos-a-carpeta-club.mjs <club_id> --borrar-duplicados
//
// borra de la raíz SOLO los archivos cuya copia en `{club_id}/` existe y pesa
// exactamente lo mismo. Si el tamaño difiere, lo deja y lo dice. (Buin,
// 2026-09-12: las 16 fotos y el libro ya estaban en la carpeta.)
//
// El club va por parámetro a propósito: nada de ids escritos en el código
// (regla del CLAUDE.md sobre no atar el código compartido a un club).
//
// ── Orden respecto de lo demás ────────────────────────────────────────────
//   1. Este script (mueve los archivos)
//   2. Desplegar el código nuevo
//   3. Migración 220 (deja los buckets privados)
//
// Entre 1 y 2 el material se ve vacío para el club, porque el código viejo
// sigue mirando la raíz. Son los minutos del despliegue.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const BUCKETS = ['bibliografia-buin', 'libro-profe-buin']

// Lee .env.local sin dependencias extra, igual que el resto de los scripts.
function env(clave) {
  if (process.env[clave]) return process.env[clave]
  try {
    const texto = readFileSync('.env.local', 'utf8')
    const linea = texto.split('\n').find(l => l.startsWith(clave + '='))
    return linea ? linea.slice(clave.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch { return undefined }
}

const clubId = process.argv[2]
const aplicar = process.argv.includes('--aplicar')
const borrarDuplicados = process.argv.includes('--borrar-duplicados')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!clubId || !UUID.test(clubId)) {
  console.error('Falta el club_id (un UUID).')
  console.error('  node scripts/mover-archivos-a-carpeta-club.mjs <club_id> [--aplicar]')
  process.exit(1)
}

const url = env('NEXT_PUBLIC_SUPABASE_URL')
const key = env('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const { data: club } = await db.from('clubes').select('nombre').eq('id', clubId).maybeSingle()
if (!club) {
  console.error(`No existe ningún club con id ${clubId}.`)
  process.exit(1)
}

console.log(`Club: ${club.nombre}`)
console.log(
  borrarDuplicados ? 'Modo: BORRAR DUPLICADOS (borra de la raíz lo que ya está, idéntico, en la carpeta)\n'
    : aplicar ? 'Modo: APLICAR (mueve de verdad)\n'
      : 'Modo: simulación — agregá --aplicar para mover\n',
)

let totalMovidos = 0
let totalFallidos = 0

for (const bucket of BUCKETS) {
  const { data: raiz, error } = await db.storage.from(bucket).list('', { limit: 1000 })
  if (error) {
    console.log(`${bucket}: no se pudo listar (${error.message})`)
    continue
  }

  // Las carpetas aparecen como entradas sin `id`. Solo interesan los archivos
  // sueltos en la raíz.
  const sueltos = (raiz ?? []).filter(f => f.id && f.name !== '.emptyFolderPlaceholder')
  if (!sueltos.length) {
    console.log(`${bucket}: nada suelto en la raíz. Ya está ordenado.`)
    continue
  }

  console.log(`${bucket}: ${sueltos.length} archivo(s) en la raíz`)

  if (borrarDuplicados) {
    const { data: enCarpeta, error: errCarpeta } = await db.storage.from(bucket).list(clubId, { limit: 1000 })
    if (errCarpeta) {
      console.log(`   no se pudo listar la carpeta del club (${errCarpeta.message})`)
      continue
    }
    const tamanoEnCarpeta = new Map((enCarpeta ?? []).map(f => [f.name, f.metadata?.size]))
    for (const f of sueltos) {
      const tam = tamanoEnCarpeta.get(f.name)
      if (tam == null) {
        console.log(`   · ${f.name}: NO está en la carpeta, se deja (movelo con --aplicar)`)
        continue
      }
      if (tam !== f.metadata?.size) {
        console.log(`   ✗ ${f.name}: está en la carpeta pero pesa distinto (${tam} vs ${f.metadata?.size}), se deja`)
        totalFallidos++
        continue
      }
      const { error: errBorrar } = await db.storage.from(bucket).remove([f.name])
      if (errBorrar) {
        console.log(`   ✗ ${f.name}: ${errBorrar.message}`)
        totalFallidos++
      } else {
        console.log(`   ✓ ${f.name}: duplicado borrado de la raíz`)
        totalMovidos++
      }
    }
    continue
  }

  for (const f of sueltos) {
    const destino = `${clubId}/${f.name}`
    if (!aplicar) {
      console.log(`   ${f.name}  →  ${destino}`)
      continue
    }
    const { error: errMover } = await db.storage.from(bucket).move(f.name, destino)
    if (errMover) {
      console.log(`   ✗ ${f.name}: ${errMover.message}`)
      totalFallidos++
    } else {
      console.log(`   ✓ ${f.name}  →  ${destino}`)
      totalMovidos++
    }
  }
}

if (borrarDuplicados) {
  console.log(`\nDuplicados borrados: ${totalMovidos}. Dejados: ${totalFallidos}.`)
  if (totalFallidos > 0) process.exit(1)
} else if (aplicar) {
  console.log(`\nMovidos: ${totalMovidos}. Fallidos: ${totalFallidos}.`)
  if (totalFallidos > 0) process.exit(1)
} else {
  console.log('\nSimulación terminada. Nada se movió.')
}
