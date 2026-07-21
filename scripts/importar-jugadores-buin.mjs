// Completa los datos de los jugadores del Club Buin ya existentes (dirección, contacto de
// emergencia, indicaciones médicas, federado) desde el CSV de la asociación, y separa la
// categoría MASTER genérica en MASTER A-J según año de nacimiento (tabla oficial).
// Solo actualiza jugadores por RUT ya presentes en el club Buin — nunca crea ni duplica.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const RUTA_CSV = process.argv[2] || 'C:\\Users\\Marcela Sandoval\\Downloads\\DATOS JUGADORES ASOCIACION 2026.xlsx - LISTADO JUGADORES.csv'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((linea) => linea.includes('='))
    .map((linea) => {
      const indice = linea.indexOf('=')
      return [linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()]
    })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// --- CSV parser (RFC4180: comillas, comas y saltos de línea dentro de celdas) ---
function parseCSV(texto) {
  const filas = []
  let fila = [], celda = '', dentroComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (dentroComillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++ }
      else if (c === '"') dentroComillas = false
      else celda += c
    } else {
      if (c === '"') dentroComillas = true
      else if (c === ',') { fila.push(celda); celda = '' }
      else if (c === '\r') { /* ignorar */ }
      else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = '' }
      else celda += c
    }
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila) }
  return filas
}

function parseFechaNacimiento(texto) {
  const limpio = (texto || '').trim()
  if (!limpio) return null
  const partes = limpio.split(/[/-]/).map((p) => p.trim())
  if (partes.length !== 3) return null
  let [a, b, c] = partes.map((p) => parseInt(p, 10))
  if (!a || !b || !c) return null
  const anio = c < 100 ? 2000 + c : c
  let dia, mes
  if (a > 12) { dia = a; mes = b }
  else if (b > 12) { mes = a; dia = b }
  else { dia = a; mes = b } // ambiguo: se asume día/mes/año (formato chileno)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Rangos MASTER de la tabla oficial (temporada 2026): letra según año de nacimiento.
const RANGOS_MASTER = [
  { desde: 1992, hasta: 1996, categoria: 'MASTER A' },
  { desde: 1987, hasta: 1991, categoria: 'MASTER B' },
  { desde: 1982, hasta: 1986, categoria: 'MASTER C' },
  { desde: 1977, hasta: 1981, categoria: 'MASTER D' },
  { desde: 1972, hasta: 1976, categoria: 'MASTER E' },
  { desde: 1967, hasta: 1971, categoria: 'MASTER F' },
  { desde: 1962, hasta: 1966, categoria: 'MASTER G' },
  { desde: 1957, hasta: 1961, categoria: 'MASTER H' },
  { desde: 1952, hasta: 1956, categoria: 'MASTER I' },
  { desde: 1947, hasta: 1951, categoria: 'MASTER J' },
]

// Categorías por año de nacimiento (misma tabla que src/lib/domain/categoriaBuin.ts)
const RANGOS_EDAD = [
  { desde: 2015, hasta: Infinity, categoria: 'PENECA' },
  { desde: 2013, hasta: 2014, categoria: 'PREINFANTIL' },
  { desde: 2011, hasta: 2012, categoria: 'INFANTIL' },
  { desde: 2007, hasta: 2010, categoria: 'JUVENIL' },
  ...RANGOS_MASTER,
]
function categoriaPorAnio(anio) {
  const rango = RANGOS_EDAD.find((r) => anio >= r.desde && anio <= r.hasta)
  return rango?.categoria ?? 'TC'
}

function normalizarRut(texto) {
  const limpio = (texto || '').replace(/[.\s]/g, '').toUpperCase()
  if (!limpio) return null
  if (limpio.includes('-')) return limpio
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

async function main() {
  const { data: todosLosClubes, error: clubError } = await supabase.from('clubes').select('id, nombre')
  if (clubError) throw clubError
  const clubes = todosLosClubes.filter((c) => /bu[ií]n/i.test(c.nombre))
  if (clubes.length !== 1) throw new Error(`Se esperaba un solo Club Buin, se encontraron ${clubes.length}: ${clubes.map((c) => c.nombre).join(', ')}`)
  const club = clubes[0]

  // 1) Separar MASTER genérico en MASTER A-J usando la fecha de nacimiento ya guardada.
  const { data: masters, error: mastersError } = await supabase
    .from('jugadores').select('id, fecha_nacimiento').eq('club_id', club.id).eq('categoria', 'MASTER')
  if (mastersError) throw mastersError
  let separados = 0, sinRango = 0
  for (const j of masters) {
    const anio = j.fecha_nacimiento ? parseInt(j.fecha_nacimiento.slice(0, 4), 10) : null
    const rango = anio ? RANGOS_MASTER.find((r) => anio >= r.desde && anio <= r.hasta) : null
    const nuevaCategoria = rango?.categoria ?? 'TC' // fuera de rango master -> TC, igual que la tabla oficial
    const { error } = await supabase.from('jugadores').update({ categoria: nuevaCategoria }).eq('id', j.id)
    if (error) throw error
    if (rango) separados++; else sinRango++
  }
  console.log(`Categorías MASTER separadas: ${separados} con letra asignada, ${sinRango} sin fecha (quedaron en TC).`)

  // 2) Completar dirección / contacto de emergencia / indicaciones médicas / federado desde el CSV.
  const { data: existentesDb, error: existentesError } = await supabase
    .from('jugadores').select('id, rut, nombre').eq('club_id', club.id).eq('es_externo', false)
  if (existentesError) throw existentesError
  const normalizarNombre = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
  const existentesPorRut = new Map(existentesDb.filter((j) => j.rut).map((j) => [j.rut.toUpperCase(), j.id]))
  const existentesPorNombre = new Map(existentesDb.map((j) => [normalizarNombre(j.nombre), j.id]))

  const filas = parseCSV(readFileSync(RUTA_CSV, 'utf8'))
  const filasJugadores = filas.filter((f) => /^\d+$/.test((f[0] || '').trim()))

  let actualizados = 0, creados = 0, sinCoincidencia = []
  for (const f of filasJugadores) {
    const [
      , nombres, apPaterno, apMaterno, , , , , rutTexto, fechaTexto, , federadoTexto,
      direccion, email, telefono, apoderado, telEmergencia, indicacionesMedicas, sede, diasEntrena,
    ] = f
    const nombreCompleto = [nombres, apPaterno, apMaterno].map((s) => (s || '').trim()).filter(Boolean).join(' ')
    const rut = normalizarRut(rutTexto)
    const id = (rut && existentesPorRut.get(rut)) || existentesPorNombre.get(normalizarNombre(nombreCompleto))
    const federado = federadoTexto?.trim().toUpperCase() === 'SI' ? true : federadoTexto?.trim().toUpperCase() === 'NO' ? false : null
    const datosContacto = {
      direccion: direccion?.trim() || null,
      contacto_emergencia_nombre: apoderado?.trim() || null,
      contacto_emergencia_telefono: telEmergencia?.trim() || null,
      indicaciones_medicas: indicacionesMedicas?.trim() || null,
      federado,
    }

    if (id) {
      const { error } = await supabase.from('jugadores').update(datosContacto).eq('id', id)
      if (error) throw error
      actualizados++
      continue
    }

    // No existe en la base: crearlo con lo que sabemos del CSV (grupo/horario quedan sin asignar).
    const fechaNacimiento = parseFechaNacimiento(fechaTexto)
    const entrenamientosPorSemana = parseInt(diasEntrena, 10) || 3
    const { error: insertError } = await supabase.from('jugadores').insert({
      club_id: club.id, nombre: nombreCompleto, rut,
      email: email?.trim().toLowerCase() || null,
      telefono: telefono?.trim() || null,
      fecha_nacimiento: fechaNacimiento,
      categoria: fechaNacimiento ? categoriaPorAnio(parseInt(fechaNacimiento.slice(0, 4), 10)) : null,
      comuna: sede?.trim() || null,
      ...datosContacto,
      tipo_plan: 'mensual', entrenamientos_por_semana: entrenamientosPorSemana,
      mensualidad: null, sesiones_limite: entrenamientosPorSemana * 4, sesiones_usadas: 0,
      estado: 'activo', es_externo: false,
    })
    if (insertError) { sinCoincidencia.push(`${nombreCompleto} (rut ${rut || 'sin rut'}): ${insertError.message}`); continue }
    creados++
  }

  console.log(`Datos de contacto completados en ${actualizados} jugadores existentes, ${creados} jugadores nuevos creados en ${club.nombre}.`)
  if (sinCoincidencia.length) {
    console.log(`\n${sinCoincidencia.length} filas del CSV con error (revisar manualmente):`)
    sinCoincidencia.forEach((s) => console.log(' - ' + s))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
