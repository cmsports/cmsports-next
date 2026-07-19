// Crea 2 torneos de prueba (20 y 25 jugadores externos), con grupos armados,
// cabezas de serie asignadas y partidos de grupo listos para jugar — para
// probar el flujo completo (marcar ganadores, armar llaves) con 2 torneos
// corriendo al mismo tiempo. Reproduce en JS lo que hace
// cerrarInscripcionYGenerarGrupos (src/app/actions/torneos.ts), ya que las
// server actions no se pueden invocar desde un script (necesitan sesión).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((linea) => linea.includes('='))
    .map((linea) => {
      const indice = linea.indexOf('=')
      return [linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const CLUB_NOMBRE = 'Club de Prueba'
const TORNEOS = [
  { nombre: 'Torneo Prueba 20', numJugadores: 20 },
  { nombre: 'Torneo Prueba 25', numJugadores: 25 },
]

// ─── Copiado de src/lib/domain/torneos.ts (funciones puras, sin imports @/) ──

function calcularNumGrupos(numJugadores, jugadoresPorGrupo = 3) {
  return Math.max(2, Math.round(numJugadores / jugadoresPorGrupo))
}

function nombreGrupo(indice) {
  let numero = indice + 1
  let nombre = ''
  while (numero > 0) {
    numero--
    nombre = String.fromCharCode(65 + (numero % 26)) + nombre
    numero = Math.floor(numero / 26)
  }
  return nombre
}

function seedingSerpenteo(jugadores, numGrupos, cabezasDeSerie = []) {
  const porId = new Map(jugadores.map(j => [j.id, j]))
  const idsUnicos = [...new Set(cabezasDeSerie)]
  const cabezas = idsUnicos.map(id => porId.get(id)).filter(Boolean)
  const cabezasSet = new Set(cabezas.map(j => j.id))
  const resto = jugadores.filter(j => !cabezasSet.has(j.id))
  const ordenados = [...cabezas, ...resto]

  const asignaciones = []
  let dir = 1
  let gi = 0
  for (let i = 0; i < ordenados.length; i++) {
    asignaciones.push({ grupoIndex: gi, jugadorId: ordenados[i].id })
    if (i < ordenados.length - 1) {
      gi += dir
      if (gi >= numGrupos) { gi = numGrupos - 1; dir = -1 }
      else if (gi < 0) { gi = 0; dir = 1 }
    }
  }
  return asignaciones
}

function generarRoundRobin(jugadorIds) {
  const partidos = []
  for (let i = 0; i < jugadorIds.length; i++) {
    for (let j = i + 1; j < jugadorIds.length; j++) {
      partidos.push([jugadorIds[i], jugadorIds[j]])
    }
  }
  return partidos
}

// ─── Nombres al azar ──────────────────────────────────────────────────────

const NOMBRES = ['Mateo', 'Sofía', 'Benjamín', 'Isidora', 'Vicente', 'Emilia', 'Agustín', 'Martina', 'Joaquín', 'Antonia', 'Diego', 'Josefa', 'Tomás', 'Florencia', 'Cristóbal', 'Valentina', 'Felipe', 'Catalina', 'Ignacio', 'Amanda', 'Lucas', 'Trinidad', 'Gaspar', 'Constanza', 'Bastián']
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela']

function nombreAlAzar() {
  const n = NOMBRES[Math.floor(Math.random() * NOMBRES.length)]
  const a = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)]
  return `${n} ${a}`
}

async function crearTorneoDePrueba(clubId, { nombre, numJugadores }) {
  const { data: torneo, error: torneoError } = await supabase.from('torneos').insert({
    club_id: clubId,
    nombre,
    formato: 'grupos',
    estado: 'en_curso',
    fase: 'inscripcion',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    cuota_inscripcion: 0,
    precio_entrada: 0,
    inscripcion_abierta: true,
  }).select('id').single()
  if (torneoError) throw torneoError
  const torneoId = torneo.id

  const { data: jugadoresCreados, error: jugadoresError } = await supabase.from('jugadores')
    .insert(Array.from({ length: numJugadores }, () => ({
      club_id: clubId,
      nombre: nombreAlAzar(),
      categoria: 'principiante',
      sesiones_usadas: 0,
      sesiones_limite: 0,
      estado: 'activo',
      es_externo: true,
    })))
    .select('id, nombre')
  if (jugadoresError) throw jugadoresError

  const numGrupos = calcularNumGrupos(numJugadores)
  const numCabezas = Math.min(4, numGrupos)
  const cabezas = jugadoresCreados.slice(0, numCabezas)
  const { error: cabezasError } = await supabase.from('torneo_cabezas_serie').insert(
    cabezas.map((j, i) => ({ torneo_id: torneoId, jugador_id: j.id, numero: i + 1 })),
  )
  if (cabezasError) throw cabezasError

  const { data: grupos, error: gruposError } = await supabase.from('torneo_grupos')
    .insert(Array.from({ length: numGrupos }, (_, i) => ({ torneo_id: torneoId, nombre: nombreGrupo(i), orden: i })))
    .select('id, nombre')
  if (gruposError) throw gruposError

  const asignaciones = seedingSerpenteo(jugadoresCreados, numGrupos, cabezas.map(c => c.id))
  const ordenPorGrupo = new Map()
  const miembros = asignaciones.map(a => {
    const orden = ordenPorGrupo.get(a.grupoIndex) ?? 0
    ordenPorGrupo.set(a.grupoIndex, orden + 1)
    return { grupo_id: grupos[a.grupoIndex].id, jugador_id: a.jugadorId, orden }
  })
  const { error: miembrosError } = await supabase.from('grupo_jugadores').insert(miembros)
  if (miembrosError) throw miembrosError

  const partidos = []
  for (const g of grupos) {
    const jugadoresGrupo = miembros.filter(m => m.grupo_id === g.id).sort((a, b) => a.orden - b.orden).map(m => m.jugador_id)
    for (const [a, b] of generarRoundRobin(jugadoresGrupo)) {
      partidos.push({ torneo_id: torneoId, grupo_id: g.id, fase: 'grupos', jugador_a: a, jugador_b: b, orden: partidos.length })
    }
  }
  const { error: partidosError } = await supabase.from('torneo_partidos').insert(partidos)
  if (partidosError) throw partidosError

  const { error: updateError } = await supabase.from('torneos')
    .update({ fase: 'grupos', inscripcion_abierta: false })
    .eq('id', torneoId)
  if (updateError) throw updateError

  return { torneoId, numGrupos, numCabezas, numPartidos: partidos.length }
}

async function main() {
  const { data: clubes, error: clubError } = await supabase.from('clubes').select('id, nombre').eq('nombre', CLUB_NOMBRE)
  if (clubError) throw clubError
  const club = clubes[0]
  if (!club) throw new Error(`No se encontró "${CLUB_NOMBRE}"`)

  for (const t of TORNEOS) {
    const resultado = await crearTorneoDePrueba(club.id, t)
    console.log(`OK | ${t.nombre} | ${t.numJugadores} jugadores | ${resultado.numGrupos} grupos | ${resultado.numCabezas} cabezas de serie | ${resultado.numPartidos} partidos | id=${resultado.torneoId}`)
  }
  console.log(`Listo: ${TORNEOS.length} torneos de prueba creados en ${club.nombre}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
