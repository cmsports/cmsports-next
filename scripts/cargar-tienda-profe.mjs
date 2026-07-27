// Carga el catálogo inicial de la Tienda del profe.
//
// Crea los productos con nombre, categoría, descripción y color. El precio y la
// foto quedan pendientes a propósito: no se inventan precios de una tienda real,
// y las fotos hay que subirlas desde la página.
//
// Es idempotente: si el producto ya existe con ese nombre, lo saltea. Se puede
// correr de nuevo sin duplicar nada.
//
//   node scripts/cargar-tienda-profe.mjs

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

// color solo aplica a gomas y vestimenta; en el resto va vacío.
const CATALOGO = [
  // ── Maderos ──
  { nombre: 'Andro Treiber — mango amarillo', categoria: 'maderos',
    descripcion: 'Madera de carbono, ataque rápido.' },
  { nombre: 'Andro Treiber — mango rojo', categoria: 'maderos',
    descripcion: 'Madera de carbono, ataque rápido.' },
  { nombre: 'Lion Boer Training Blade', categoria: 'maderos',
    descripcion: '5 capas de madera y 2 de carbono. Allround, ideal para formación.' },
  { nombre: 'Loki Kirin K1', categoria: 'maderos',
    descripcion: 'Nanocarbono, 5 capas. Velocidad 75, control 66.' },

  // ── Gomas ──
  { nombre: 'Andro Rasanter R45', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'Alemana, esponja 45°. Equilibrio entre velocidad y control.' },
  { nombre: 'Andro Rasanter R50', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'Alemana, esponja 50°. Más rápida que la R45.' },
  { nombre: 'Andro Rasant PowerSponge', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'Esponja de alta densidad, 2,1 mm. Hecha en Alemania.' },
  { nombre: 'Andro Good!', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'Goma de entrada, 2,0 mm. Buena relación precio-rendimiento.' },
  { nombre: 'Andro Chaos', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'Antitopspin. Espesores 0,9 y 1,2 mm.' },
  { nombre: 'Loki Rxton 3', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'China, superficie pegajosa. Mucho efecto.' },
  { nombre: 'Loki Athlon 2', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'China, para juego de ataque cercano a la mesa.' },
  { nombre: 'Yinhe Mercury II', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'Lisa, china. Control y efecto para formación.' },
  { nombre: 'Yinhe Neptune', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'Púas largas. Para juego defensivo y de perturbación.' },
  { nombre: '999 LSZ I', categoria: 'gomas', color: 'Rojo / Negro',
    descripcion: 'China, pegajosa.' },

  // ── Accesorios ──
  { nombre: 'Haifu Sea Moon', categoria: 'accesorios',
    descripcion: 'Booster para gomas. Aumenta la elasticidad de la esponja.' },
  { nombre: 'Cinta de canto DHS', categoria: 'accesorios',
    descripcion: 'Protector de borde para la paleta.' },
  { nombre: 'Spray limpiador de gomas', categoria: 'accesorios',
    descripcion: 'Limpiador 60 ml con paño. Mantiene el agarre de la superficie.' },
]

const { data: existentes, error: errLeer } = await supabase
  .from('tienda_buin_productos').select('nombre').eq('club_id', CLUB_ID)
if (errLeer) throw errLeer

const yaEstan = new Set((existentes ?? []).map(p => p.nombre.trim().toLowerCase()))
const nuevos = CATALOGO.filter(p => !yaEstan.has(p.nombre.toLowerCase()))

if (nuevos.length === 0) {
  console.log('Ya estaban los 17. No se creó nada.')
  process.exit(0)
}

const { error } = await supabase.from('tienda_buin_productos').insert(
  nuevos.map(p => ({
    club_id: CLUB_ID,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    color: p.color ?? null,
    stock: 0,
    precio: null,
    imagen_url: null,
  }))
)
if (error) throw error

console.log(`Creados ${nuevos.length} productos:`)
for (const p of nuevos) console.log(`  · ${p.categoria.padEnd(11)} ${p.nombre}`)
console.log('\nFalta ponerles precio, stock y foto desde Tienda del profe.')
