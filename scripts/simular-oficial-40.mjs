/**
 * Simula un campeonato oficial con ~40 inscritos en club Demostración TDM.
 * Solo escribe en oficial_* del club demo — NUNCA Buin.
 *
 * Uso:
 *   node scripts/simular-oficial-40.mjs
 *   node scripts/simular-oficial-40.mjs --limpiar
 *
 * Requiere .env.local (URL + SERVICE_ROLE). Tablas oficial_* (156+; ideal 180/181).
 * La lógica de dominio se reimplementa aquí (como sim-torneo-35.mjs) porque
 * node no carga los .ts del app sin loader; los tests vitest sí ejercitan el dominio real.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const CLUB_DEMO = '0884dbef-798d-4ce3-9e7a-deace0b4aa95'
/** Prefijo legacy + nombre canónico visible en la UI de Demostración. */
const PREFIJO = '[SIM40]'
const NOMBRE_CAMPEONATO = 'Simulación Manual JG — 40 inscritos'
const N = 40

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const NOMBRES = [
  'Mateo', 'Sofía', 'Benjamín', 'Isidora', 'Vicente', 'Emilia', 'Agustín', 'Martina',
  'Joaquín', 'Antonia', 'Diego', 'Josefa', 'Tomás', 'Florencia', 'Cristóbal', 'Valentina',
  'Felipe', 'Catalina', 'Ignacio', 'Amanda', 'Lucas', 'Trinidad', 'Gaspar', 'Constanza',
  'Bastián', 'Renata', 'Maximiliano', 'Fernanda', 'Bruno', 'Javiera', 'Simón', 'Rocío',
  'Álvaro', 'Millaray', 'Nicolás', 'Camila', 'Sebastián', 'Francisca', 'Matías', 'Paula',
]
const ASOCIACIONES = ['Buin', 'Paine', 'Demo Norte', 'Demo Sur', 'San Bernardo', 'Maipú', 'Puente Alto', 'La Florida']

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

function calcularNumGrupos(n) {
  return Math.max(2, Math.ceil(n / 3))
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

/** Serpiente simple + cabezas en grupos distintos (suficiente para seed). */
function seedingSerpenteo(jugadores, numGrupos, cabezaIds) {
  const porId = new Map(jugadores.map((j) => [j.id, j]))
  const cabezas = [...new Set(cabezaIds)].map((id) => porId.get(id)).filter(Boolean)
  const cabezasSet = new Set(cabezas.map((j) => j.id))
  const resto = jugadores.filter((j) => !cabezasSet.has(j.id))
  const out = []
  cabezas.forEach((j, i) => out.push({ jugadorId: j.id, grupoIndex: i % numGrupos }))
  let dir = 1
  let g = 0
  for (const j of resto) {
    out.push({ jugadorId: j.id, grupoIndex: g })
    g += dir
    if (g >= numGrupos) { g = numGrupos - 1; dir = -1 }
    if (g < 0) { g = 0; dir = 1 }
  }
  return out
}

function ordenPartidosGrupoIttf(ids) {
  const n = ids.length
  if (n < 2) return []
  if (n === 3) return [[ids[0], ids[2]], [ids[1], ids[2]], [ids[0], ids[1]]]
  if (n === 4) {
    return [
      [ids[0], ids[2]], [ids[1], ids[3]], [ids[0], ids[1]],
      [ids[2], ids[3]], [ids[0], ids[3]], [ids[1], ids[2]],
    ]
  }
  const partidos = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) partidos.push([ids[i], ids[j]])
  return partidos
}

function programarPartidosGreedy(partidos, { mesas, bloqueMinutos, inicio }) {
  const resultado = new Map()
  if (!partidos.length || mesas < 1) return resultado
  const ordenados = [...partidos].sort((a, b) => a.prioridad - b.prioridad)
  const asignados = []
  for (const p of ordenados) {
    let bloque = 0
    let asignado = false
    while (!asignado && bloque < 500) {
      for (let mesa = 1; mesa <= mesas; mesa++) {
        const programadoEn = new Date(inicio.getTime() + bloque * bloqueMinutos * 60_000)
        const mesaOcupada = asignados.some(
          (a) => a.slot.mesa === mesa && a.slot.programadoEn.getTime() === programadoEn.getTime(),
        )
        if (mesaOcupada) continue
        const idsA = [p.inscritoA, p.inscritoB].filter(Boolean)
        const jugadorOcupado = asignados.some((a) => {
          if (a.slot.programadoEn.getTime() !== programadoEn.getTime()) return false
          const idsB = [a.partido.inscritoA, a.partido.inscritoB].filter(Boolean)
          return idsA.some((id) => idsB.includes(id))
        })
        if (jugadorOcupado) continue
        const slot = { mesa, programadoEn }
        asignados.push({ partido: p, slot })
        resultado.set(p.id, slot)
        asignado = true
        break
      }
      if (!asignado) bloque++
    }
  }
  return resultado
}

function calcularTamanoBracket(n) {
  let tam = 2
  while (tam < n) tam *= 2
  return tam
}

async function limpiarSimsPrevias() {
  const { data: porPrefijo } = await supabase
    .from('oficial_campeonatos')
    .select('id, nombre')
    .eq('club_id', CLUB_DEMO)
    .ilike('nombre', `${PREFIJO}%`)
  const { data: porNombre } = await supabase
    .from('oficial_campeonatos')
    .select('id, nombre')
    .eq('club_id', CLUB_DEMO)
    .eq('nombre', NOMBRE_CAMPEONATO)
  const camps = [...(porPrefijo || []), ...(porNombre || [])]
  const vistos = new Set()
  const unicos = camps.filter((c) => {
    if (vistos.has(c.id)) return false
    vistos.add(c.id)
    return true
  })
  if (!unicos.length) {
    console.log('No hay sims previas que limpiar.')
    return
  }
  for (const c of unicos) {
    const { error } = await supabase.from('oficial_campeonatos').delete().eq('id', c.id).eq('club_id', CLUB_DEMO)
    if (error) console.error('No se pudo borrar', c.nombre, error.message)
    else console.log('Borrado', c.nombre)
  }
}

async function main() {
  if (process.argv.includes('--limpiar')) {
    await limpiarSimsPrevias()
    return
  }

  const { data: club } = await supabase.from('clubes').select('id, nombre').eq('id', CLUB_DEMO).maybeSingle()
  if (!club) {
    console.error('Club Demostración no encontrado:', CLUB_DEMO)
    process.exit(1)
  }
  console.log('Club:', club.nombre, club.id)

  const fecha = hoyChile()
  const nombreCamp = NOMBRE_CAMPEONATO

  // Idempotente: si ya existe el canónico, no duplicar.
  const { data: existente } = await supabase
    .from('oficial_campeonatos')
    .select('id')
    .eq('club_id', CLUB_DEMO)
    .eq('nombre', NOMBRE_CAMPEONATO)
    .maybeSingle()
  if (existente?.id) {
    console.log('Ya existe:', NOMBRE_CAMPEONATO)
    console.log(`URL: /torneo-oficial/${existente.id}`)
    console.log('Para recrear: node scripts/simular-oficial-40.mjs --limpiar && node scripts/simular-oficial-40.mjs')
    return
  }

  // Limpia sims legacy con prefijo [SIM40]
  await limpiarSimsPrevias()

  const { data: camp, error: campErr } = await supabase.from('oficial_campeonatos').insert({
    club_id: CLUB_DEMO,
    nombre: nombreCamp,
    sede: 'Gimnasio Demo',
    zona: 'Metropolitana Demo',
    fecha_inicio: fecha,
    estado: 'inscripcion',
    mesas_count: 8,
    bloque_minutos: 25,
    hora_inicio: '09:00:00',
  }).select('id').single()
  if (campErr || !camp) {
    console.error('crear campeonato:', campErr?.message)
    process.exit(1)
  }
  console.log('Campeonato', camp.id)

  const { data: evento, error: evErr } = await supabase.from('oficial_eventos').insert({
    club_id: CLUB_DEMO,
    campeonato_id: camp.id,
    nombre: 'Individual Absoluto Varones',
    categoria: 'Absoluto',
    genero: 'varones',
    formato_partido: 'bo5',
    fase: 'inscripcion',
    estado: 'en_curso',
    clasifican_por_grupo: 2,
  }).select('id').single()
  if (evErr || !evento) {
    console.error('crear evento:', evErr?.message)
    process.exit(1)
  }
  console.log('Evento', evento.id)

  const inscritosRows = NOMBRES.slice(0, N).map((n, i) => ({
    club_id: CLUB_DEMO,
    evento_id: evento.id,
    nombre: `${n} Sim${i + 1}`,
    asociacion: ASOCIACIONES[i % ASOCIACIONES.length],
    genero: 'V',
    ranking: i + 1,
    orden_inscripcion: i + 1,
    cabeza_numero: i < 8 ? i + 1 : null,
  }))

  const { data: inscritos, error: insErr } = await supabase
    .from('oficial_inscritos')
    .insert(inscritosRows)
    .select('id, nombre, asociacion, cabeza_numero')
  if (insErr || !inscritos?.length) {
    console.error('inscribir:', insErr?.message)
    process.exit(1)
  }
  console.log('Inscritos', inscritos.length)

  const numGrupos = calcularNumGrupos(inscritos.length)
  const jugadores = inscritos.map((i) => ({ id: i.id, nombre: i.nombre, club: i.asociacion }))
  const cabezas = [...inscritos]
    .filter((i) => i.cabeza_numero != null)
    .sort((a, b) => (a.cabeza_numero ?? 0) - (b.cabeza_numero ?? 0))
    .map((c) => c.id)

  const asignaciones = seedingSerpenteo(jugadores, numGrupos, cabezas)
  console.log(`Grupos: ${numGrupos}`)

  const { data: grupos, error: gErr } = await supabase
    .from('oficial_grupos')
    .insert(Array.from({ length: numGrupos }, (_, i) => ({
      club_id: CLUB_DEMO,
      evento_id: evento.id,
      nombre: nombreGrupo(i),
      orden: i,
    })))
    .select('id, orden')
  if (gErr || !grupos) {
    console.error('grupos:', gErr?.message)
    process.exit(1)
  }

  const miembros = []
  for (const g of grupos) {
    const ids = asignaciones.filter((a) => a.grupoIndex === g.orden).map((a) => a.jugadorId)
    ids.forEach((inscritoId, orden) => {
      miembros.push({ club_id: CLUB_DEMO, grupo_id: g.id, inscrito_id: inscritoId, orden })
    })
  }
  const { error: mErr } = await supabase.from('oficial_grupo_inscritos').insert(miembros)
  if (mErr) {
    console.error('miembros:', mErr.message)
    process.exit(1)
  }

  const partidos = []
  for (const g of grupos) {
    const ids = asignaciones.filter((a) => a.grupoIndex === g.orden).map((a) => a.jugadorId)
    ordenPartidosGrupoIttf(ids).forEach(([a, b], i) => {
      partidos.push({
        club_id: CLUB_DEMO,
        evento_id: evento.id,
        grupo_id: g.id,
        fase: 'grupos',
        orden: i,
        inscrito_a_id: a,
        inscrito_b_id: b,
      })
    })
  }
  const { data: partidosDb, error: pErr } = await supabase
    .from('oficial_partidos')
    .insert(partidos)
    .select('id, fase, orden, grupo_id, inscrito_a_id, inscrito_b_id')
  if (pErr || !partidosDb) {
    console.error('partidos:', pErr?.message)
    process.exit(1)
  }
  console.log('Partidos de grupo', partidosDb.length)

  // Numeración ITTF (ignora si falta columna 181)
  let nro = 1
  const porGrupo = [...partidosDb].sort((a, b) => {
    const ga = grupos.find((g) => g.id === a.grupo_id)?.orden ?? 0
    const gb = grupos.find((g) => g.id === b.grupo_id)?.orden ?? 0
    return ga - gb || a.orden - b.orden
  })
  for (const p of porGrupo) {
    const { error } = await supabase.from('oficial_partidos').update({ numero_ittf: nro++ }).eq('id', p.id)
    if (error && String(error.message || '').includes('numero_ittf')) {
      console.warn('Columna numero_ittf ausente (pegar migración 181). Sigo sin numerar.')
      break
    }
  }

  await supabase.from('oficial_eventos').update({ fase: 'grupos' }).eq('id', evento.id)
  await supabase.from('oficial_campeonatos').update({ estado: 'en_curso' }).eq('id', camp.id)

  const inicio = new Date(`${fecha}T09:00:00-03:00`)
  const pendientes = partidosDb.map((p) => ({
    id: p.id,
    inscritoA: p.inscrito_a_id,
    inscritoB: p.inscrito_b_id,
    prioridad: p.orden,
  }))
  const asignProg = programarPartidosGreedy(pendientes, { mesas: 8, bloqueMinutos: 25, inicio })
  const omitidos = pendientes.length - asignProg.size
  if (omitidos > 0) console.warn(`⚠️ Programación omitió ${omitidos} partidos`)

  for (const [partidoId, slot] of asignProg) {
    await supabase.from('oficial_partidos').update({
      mesa: slot.mesa,
      programado_en: slot.programadoEn.toISOString(),
    }).eq('id', partidoId)
  }

  const clasificados = numGrupos * 2
  const tamLlave = calcularTamanoBracket(clasificados)

  console.log('\n── Resumen ──')
  console.log(`Campeonato: ${nombreCamp}`)
  console.log(`URL: /torneo-oficial/${camp.id}`)
  console.log(`Evento: /torneo-oficial/evento/${evento.id}`)
  console.log(`Inscritos: ${inscritos.length} · Grupos: ${numGrupos} · Partidos grupo: ${partidosDb.length}`)
  console.log(`Programados: ${asignProg.size}${omitidos ? ` · omitidos: ${omitidos}` : ''}`)
  console.log(`Cuadro esperado: ${clasificados} clasif → llave ${tamLlave}, BYEs ${tamLlave - clasificados}`)
  console.log(`\nLimpiar: node scripts/simular-oficial-40.mjs --limpiar`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
