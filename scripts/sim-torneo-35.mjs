// Simula un torneo de 35 jugadores con cabezas de serie, juega todos los
// partidos de grupo (cabezas ganan la mayoría) y deja el bracket sin armar
// para que Marcela lo pruebe manualmente.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const CLUB_NOMBRE = 'Club Paine'
const NUM_JUGADORES = 35

const NOMBRES = ['Mateo','Sofía','Benjamín','Isidora','Vicente','Emilia','Agustín','Martina','Joaquín','Antonia','Diego','Josefa','Tomás','Florencia','Cristóbal','Valentina','Felipe','Catalina','Ignacio','Amanda','Lucas','Trinidad','Gaspar','Constanza','Bastián','Renato','Camila','Maximiliano','Fernanda','Sebastián','Paula','Nicolás','Daniela','Gabriel','Francisca']
const APELLIDOS = ['González','Muñoz','Rojas','Díaz','Pérez','Soto','Contreras','Silva','Martínez','Sepúlveda','Morales','Rodríguez','López','Fuentes','Hernández','Torres','Araya','Flores','Espinoza','Valenzuela','Bravo','Reyes','Núñez','Jara','Vera']

function nombreAlAzar(usados) {
  let nombre
  do {
    nombre = `${NOMBRES[Math.floor(Math.random() * NOMBRES.length)]} ${APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)]}`
  } while (usados.has(nombre))
  usados.add(nombre)
  return nombre
}

function calcularNumGrupos(n) { return Math.max(2, Math.round(n / 3)) }
function nombreGrupo(i) {
  let n = i + 1, s = ''
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) }
  return s
}

function seedingSerpenteo(jugadores, numGrupos, cabezaIds) {
  const porId = new Map(jugadores.map(j => [j.id, j]))
  const cabezas = [...new Set(cabezaIds)].map(id => porId.get(id)).filter(Boolean)
  const cabezasSet = new Set(cabezas.map(j => j.id))
  const resto = jugadores.filter(j => !cabezasSet.has(j.id))
  const ordenados = [...cabezas, ...resto]
  const asig = []
  let dir = 1, gi = 0
  for (let i = 0; i < ordenados.length; i++) {
    asig.push({ grupoIndex: gi, jugadorId: ordenados[i].id })
    if (i < ordenados.length - 1) {
      gi += dir
      if (gi >= numGrupos) { gi = numGrupos - 1; dir = -1 }
      else if (gi < 0) { gi = 0; dir = 1 }
    }
  }
  return asig
}

function generarRoundRobin(ids) {
  const p = []
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      p.push([ids[i], ids[j]])
  return p
}

async function main() {
  const { data: clubes } = await supabase.from('clubes').select('id, nombre').eq('nombre', CLUB_NOMBRE)
  const club = clubes?.[0]
  if (!club) throw new Error(`No se encontró "${CLUB_NOMBRE}"`)

  // Crear torneo
  const { data: torneo, error: te } = await supabase.from('torneos').insert({
    club_id: club.id, nombre: 'SIM 35 jugadores', formato: 'grupos', estado: 'en_curso',
    fase: 'inscripcion', fecha_inicio: new Date().toISOString().slice(0, 10),
    cuota_inscripcion: 0, precio_entrada: 0, inscripcion_abierta: true,
  }).select('id').single()
  if (te) throw te
  const torneoId = torneo.id
  console.log(`Torneo creado: ${torneoId}`)

  // Crear jugadores
  const usados = new Set()
  const { data: jugadores, error: je } = await supabase.from('jugadores')
    .insert(Array.from({ length: NUM_JUGADORES }, () => ({
      club_id: club.id, nombre: nombreAlAzar(usados), categoria: 'principiante',
      sesiones_usadas: 0, sesiones_limite: 0, estado: 'activo', es_externo: true,
    }))).select('id, nombre')
  if (je) throw je
  console.log(`${jugadores.length} jugadores creados`)

  // Grupos
  const numGrupos = calcularNumGrupos(NUM_JUGADORES)
  console.log(`${numGrupos} grupos`)

  // Cabezas de serie: elegir al azar, máximo = numGrupos
  const numCabezas = Math.min(numGrupos, 12)
  const shuffled = [...jugadores].sort(() => Math.random() - 0.5)
  const cabezas = shuffled.slice(0, numCabezas)
  const cabezaIds = new Set(cabezas.map(c => c.id))

  const { error: ce } = await supabase.from('torneo_cabezas_serie').insert(
    cabezas.map((j, i) => ({ torneo_id: torneoId, jugador_id: j.id, numero: i + 1 }))
  )
  if (ce) throw ce
  console.log(`${numCabezas} cabezas de serie: ${cabezas.map((c, i) => `#${i + 1} ${c.nombre}`).join(', ')}`)

  // Crear grupos
  const { data: grupos, error: ge } = await supabase.from('torneo_grupos')
    .insert(Array.from({ length: numGrupos }, (_, i) => ({ torneo_id: torneoId, nombre: nombreGrupo(i), orden: i })))
    .select('id, nombre')
  if (ge) throw ge

  // Asignar jugadores a grupos
  const asig = seedingSerpenteo(jugadores, numGrupos, cabezas.map(c => c.id))
  const ordenPorGrupo = new Map()
  const miembros = asig.map(a => {
    const orden = ordenPorGrupo.get(a.grupoIndex) ?? 0
    ordenPorGrupo.set(a.grupoIndex, orden + 1)
    return { grupo_id: grupos[a.grupoIndex].id, jugador_id: a.jugadorId, orden }
  })
  const { error: me } = await supabase.from('grupo_jugadores').insert(miembros)
  if (me) throw me

  // Crear partidos de grupo
  const partidos = []
  for (const g of grupos) {
    const jugadoresGrupo = miembros.filter(m => m.grupo_id === g.id).sort((a, b) => a.orden - b.orden).map(m => m.jugador_id)
    for (const [a, b] of generarRoundRobin(jugadoresGrupo)) {
      partidos.push({ torneo_id: torneoId, grupo_id: g.id, fase: 'grupos', jugador_a: a, jugador_b: b, orden: partidos.length })
    }
  }
  const { error: pe } = await supabase.from('torneo_partidos').insert(partidos)
  if (pe) throw pe

  // Fase grupos
  await supabase.from('torneos').update({ fase: 'grupos', inscripcion_abierta: false }).eq('id', torneoId)

  // Jugar partidos de grupo: cabezas ganan 90% de las veces
  console.log(`Jugando ${partidos.length} partidos de grupo...`)
  for (const p of partidos) {
    const aEsCabeza = cabezaIds.has(p.jugador_a)
    const bEsCabeza = cabezaIds.has(p.jugador_b)
    let ganador
    if (aEsCabeza && !bEsCabeza) {
      ganador = Math.random() < 0.9 ? p.jugador_a : p.jugador_b
    } else if (bEsCabeza && !aEsCabeza) {
      ganador = Math.random() < 0.9 ? p.jugador_b : p.jugador_a
    } else if (aEsCabeza && bEsCabeza) {
      ganador = Math.random() < 0.5 ? p.jugador_a : p.jugador_b
    } else {
      ganador = Math.random() < 0.5 ? p.jugador_a : p.jugador_b
    }

    await supabase.from('torneo_partidos').update({ ganador }).eq('torneo_id', torneoId)
      .eq('grupo_id', p.grupo_id).eq('jugador_a', p.jugador_a).eq('jugador_b', p.jugador_b)
  }

  // Actualizar stats en grupo_jugadores
  for (const g of grupos) {
    const jugadoresGrupo = miembros.filter(m => m.grupo_id === g.id).map(m => m.jugador_id)
    const partidosGrupo = partidos.filter(p => p.grupo_id === g.id)

    for (const jId of jugadoresGrupo) {
      const jugados = partidosGrupo.filter(p => p.jugador_a === jId || p.jugador_b === jId)
      // Re-leer ganadores de la DB
      const { data: resultados } = await supabase.from('torneo_partidos')
        .select('ganador')
        .eq('torneo_id', torneoId).eq('grupo_id', g.id)
        .or(`jugador_a.eq.${jId},jugador_b.eq.${jId}`)
      const ganados = (resultados ?? []).filter(r => r.ganador === jId).length

      await supabase.from('grupo_jugadores')
        .update({ partidos_jugados: jugados.length, partidos_ganados: ganados })
        .eq('grupo_id', g.id).eq('jugador_id', jId)
    }
  }

  // Cerrar todos los grupos
  for (const g of grupos) {
    await supabase.from('torneo_grupos').update({ cerrado: true }).eq('id', g.id)
  }

  console.log(`\nTodos los grupos cerrados. Fase: grupos`)
  console.log(`\nAbre el torneo "SIM 35 jugadores" y arma el bracket manualmente.`)

  // Mostrar resultados por grupo
  for (const g of grupos) {
    const { data: gj } = await supabase.from('grupo_jugadores')
      .select('jugador_id, partidos_ganados, partidos_jugados')
      .eq('grupo_id', g.id)
      .order('partidos_ganados', { ascending: false })
    const jugadoresMap = new Map(jugadores.map(j => [j.id, j.nombre]))
    console.log(`\nGrupo ${g.nombre}:`)
    for (const m of gj ?? []) {
      const esCabeza = cabezaIds.has(m.jugador_id) ? ` ★ cabeza #${cabezas.findIndex(c => c.id === m.jugador_id) + 1}` : ''
      console.log(`  ${jugadoresMap.get(m.jugador_id)} — ${m.partidos_ganados}/${m.partidos_jugados}${esCabeza}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
