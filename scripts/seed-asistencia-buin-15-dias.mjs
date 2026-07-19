import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((linea) => linea.includes('='))
    .map((linea) => {
      const indice = linea.indexOf('=')
      return [linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CLUB_ID = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
const CORREOS = [
  'juaquin.orellana@cmsports.cl',
  'elian.tapia@cmsports.cl',
  'eduardo.sanchez@cmsports.cl',
  'rodrigo.salazar@cmsports.cl',
  'mauricio.salazar@cmsports.cl',
  'denise@cmsports.cl',
  'benjamin.cardenas@cmsports.cl',
]

function fechaISO(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

const { data: jugadores, error: jugadoresError } = await supabase
  .from('jugadores').select('id,nombre,email').eq('club_id', CLUB_ID).in('email', CORREOS).order('email')
if (jugadoresError) throw jugadoresError
if (jugadores.length !== 7) throw new Error(`Se esperaban 7 jugadores y se encontraron ${jugadores.length}`)

const hoy = new Date(2026, 6, 15)
const inicio = new Date(hoy)
inicio.setDate(hoy.getDate() - 14)

const fechas = []
for (const fecha = new Date(inicio); fecha <= hoy; fecha.setDate(fecha.getDate() + 1)) {
  if (fecha.getDay() !== 0 && fecha.getDay() !== 6) fechas.push(fechaISO(fecha))
}

const { data: existentes, error: existentesError } = await supabase
  .from('asistencia').select('fecha,jugador_id').eq('club_id', CLUB_ID).gte('fecha', fechas[0]).lte('fecha', fechas.at(-1))
if (existentesError) throw existentesError
const clavesExistentes = new Set(existentes.map((fila) => `${fila.fecha}|${fila.jugador_id}`))

const nuevas = []
for (let dia = 0; dia < fechas.length; dia += 1) {
  for (let indice = 0; indice < jugadores.length; indice += 1) {
    // Patrón variado y repetible: aproximadamente 55% de asistencia.
    if (((dia * 11 + indice * 7 + dia * indice) % 20) >= 11) continue
    const jugador = jugadores[indice]
    const clave = `${fechas[dia]}|${jugador.id}`
    if (clavesExistentes.has(clave)) continue
    nuevas.push({
      club_id: CLUB_ID,
      jugador_id: jugador.id,
      fecha: fechas[dia],
      hora: `${18 + ((dia + indice) % 3)}:${(indice % 2) * 30 === 0 ? '00' : '30'}:00`,
      metodo: 'manual',
    })
  }
}

if (nuevas.length) {
  const { error } = await supabase.from('asistencia').insert(nuevas)
  if (error) throw error
}

const { data: resumen, error: resumenError } = await supabase
  .from('asistencia').select('fecha,jugador_id').eq('club_id', CLUB_ID).gte('fecha', fechas[0]).lte('fecha', fechas.at(-1))
if (resumenError) throw resumenError
const porFecha = Object.groupBy(resumen, (fila) => fila.fecha)
console.log(`Agregadas ${nuevas.length} asistencias. Total del período: ${resumen.length}.`)
for (const fecha of fechas) console.log(`${fecha}: ${(porFecha[fecha] || []).length} asistencias`)
