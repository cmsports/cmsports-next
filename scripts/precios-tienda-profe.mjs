// Corrige el catálogo de la Tienda del profe contra el PDF oficial.
//
// La primera carga se hizo identificando los productos desde fotos sueltas, y
// cuatro nombres salieron mal. El catálogo con precios los corrigió:
//
//   Loki Athlon 2            → Double Fish Athlon
//   Cinta de canto DHS       → Mica protectora DHS sin adhesivo
//   Andro Treiber mango rojo → Andro Super Core OFF-
//   Andro Treiber amarillo   → Andro Super Core OFF
//
// Además faltaba el pegamento Xushaofa, que no venía en las fotos.
//
//   node scripts/precios-tienda-profe.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CLUB_ID = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'

// `buscar` es el nombre con el que quedó cargado; `nombre` es el del catálogo.
const CATALOGO = [
  // ── Gomas ──
  { buscar: 'Yinhe Mercury II',       nombre: 'Goma Yinhe Mercury',    precio: 10000 },
  { buscar: '999 LSZ I',              nombre: 'LSZ I',                 precio: 10000 },
  { buscar: 'Loki Rxton 3',           nombre: 'Loki Rxton',            precio: 15000 },
  { buscar: 'Loki Athlon 2',          nombre: 'Double Fish Athlon',    precio: 15000,
    descripcion: 'China, para juego de ataque cercano a la mesa.' },
  { buscar: 'Andro Rasanter R50',     nombre: 'Andro Rasanter R50',    precio: 30000 },
  { buscar: 'Andro Rasanter R45',     nombre: 'Andro Rasanter R45',    precio: 45000 },
  { buscar: 'Andro Rasant PowerSponge', nombre: 'Andro Rasant PowerSponge', precio: 25000 },
  { buscar: 'Andro Good!',            nombre: 'Andro Good!',           precio: 25000 },
  { buscar: 'Yinhe Neptune',          nombre: 'Poro Yinhe Neptune OX y 1.5', precio: 5000,
    descripcion: 'Púas largas. Espesores OX y 1,5 mm. Para juego defensivo.' },
  { buscar: 'Andro Chaos',            nombre: 'Andro Chaos',           precio: 15000 },

  // ── Accesorios ──
  { buscar: 'Haifu Sea Moon',         nombre: 'Acelerador para goma Haifu', precio: 10000,
    descripcion: 'Booster Sea Moon. Aumenta la elasticidad de la esponja.' },
  { buscar: 'Spray limpiador de gomas', nombre: 'Limpiador de gomas',  precio: 7000 },
  { buscar: 'Cinta de canto DHS',     nombre: 'Mica protectora DHS sin adhesivo', precio: 1500,
    descripcion: 'Protege la superficie de la goma. Precio por unidad.' },

  // ── Maderos ──
  { buscar: 'Loki Kirin K1',          nombre: 'Loki Kirin / Loki K1',  precio: 10000,
    descripcion: 'Nanocarbono, 5 capas. Disponible en clásico y lapicero.' },
  { buscar: 'Lion Boer Training Blade', nombre: 'Boer Lion — Lapicero', precio: 10000,
    descripcion: '5 capas de madera y 2 de carbono. Allround, ideal para formación.' },
  { buscar: 'Andro Treiber — mango rojo',     nombre: 'Andro Super Core OFF-', precio: 30000,
    descripcion: 'Madera de carbono. Ofensiva, algo más controlada que la OFF.' },
  { buscar: 'Andro Treiber — mango amarillo', nombre: 'Andro Super Core OFF',  precio: 35000,
    descripcion: 'Madera de carbono. Ofensiva, la más rápida de la línea.' },
]

// No venía en las fotos, solo en el catálogo.
const FALTANTE = {
  nombre: 'Pegamento Xushaofa',
  categoria: 'accesorios',
  descripcion: 'Pegamento al agua para armar la paleta.',
  precio: 4000,
}

const { data: productos, error: errLeer } = await supabase
  .from('tienda_buin_productos').select('id,nombre').eq('club_id', CLUB_ID)
if (errLeer) throw errLeer

const porNombre = new Map(productos.map(p => [p.nombre.trim().toLowerCase(), p.id]))

let corregidos = 0
const noEncontrados = []

for (const p of CATALOGO) {
  const id = porNombre.get(p.buscar.toLowerCase())
  if (!id) { noEncontrados.push(p.buscar); continue }

  const cambios = { nombre: p.nombre, precio: p.precio, stock: 1 }
  if (p.descripcion) cambios.descripcion = p.descripcion

  const { error } = await supabase.from('tienda_buin_productos').update(cambios).eq('id', id)
  if (error) throw error

  const renombrado = p.buscar !== p.nombre ? `  (era "${p.buscar}")` : ''
  console.log(`  $${String(p.precio).padStart(6)}  ${p.nombre}${renombrado}`)
  corregidos++
}

if (!porNombre.has(FALTANTE.nombre.toLowerCase())) {
  const { error } = await supabase.from('tienda_buin_productos').insert({
    club_id: CLUB_ID, ...FALTANTE, color: null, stock: 1, imagen_url: null,
  })
  if (error) throw error
  console.log(`  $${String(FALTANTE.precio).padStart(6)}  ${FALTANTE.nombre}  (nuevo, faltaba)`)
}

console.log(`\n${corregidos} productos con precio.`)
if (noEncontrados.length) console.log('No se encontraron:', noEncontrados.join(', '))
console.log('El stock quedó en 1 porque el catálogo dice "consultar disponibilidad".')
console.log('Falta solo subir las fotos desde la página.')
