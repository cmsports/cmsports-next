import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const CLUB_ID = '1c5c01a1-70fc-4f38-9874-e69cceb7d41d'
const DIEGO_ID = 'a03f66fa-119e-456f-ae47-642a2154b4df'

const FECHA_INICIO = new Date('2026-05-01')
const FECHA_HOY = new Date('2026-06-23')

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function fmtFecha(d) { return d.toISOString().slice(0, 10) }

function rutFalso(usados) {
  let num
  do { num = rndInt(10000000, 24999999) } while (usados.has(num))
  usados.add(num)
  let suma = 0, mul = 2
  let n = num
  while (n > 0) { suma += (n % 10) * mul; n = Math.floor(n / 10); mul = mul === 7 ? 2 : mul + 1 }
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return `${num}-${dv}`
}

function diasEntre(inicio, fin) {
  const dias = []
  const d = new Date(inicio)
  while (d <= fin) { dias.push(new Date(d)); d.setDate(d.getDate() + 1) }
  return dias
}

async function main() {
  const usadosRut = new Set()

  // ─── 1. Profesor ───────────────────────────────────────
  const { data: profesor, error: profErr } = await supabase
    .from('profesores')
    .insert({ club_id: CLUB_ID, nombre: 'Carlos Andrade', especialidad: 'Técnica y táctica', email: 'carlos.andrade@cmsports.cl', activo: true })
    .select().single()
  if (profErr) { console.error('Error creando profesor:', profErr); process.exit(1) }
  console.log('Profesor creado:', profesor.nombre)

  // ─── 2. Jugadores (9 nuevos + Diego Soto existente) ────
  const nuevosBase = [
    { nombre: 'Javiera Muñoz', categoria: 'intermedio', elo: 1150, tipo_plan: 'mensual', ent: 2, mensualidad: 25000 },
    { nombre: 'Tomás Reyes', categoria: 'principiante', elo: 1100, tipo_plan: 'mensual', ent: 2, mensualidad: 25000 },
    { nombre: 'Camila Soto', categoria: 'avanzado', elo: 1080, tipo_plan: 'semanal', ent: 1, mensualidad: 15000 },
    { nombre: 'Nicolás Vargas', categoria: 'intermedio', elo: 1220, tipo_plan: 'mensual', ent: 3, mensualidad: 30000 },
    { nombre: 'Florencia Castillo', categoria: 'principiante', elo: 1160, tipo_plan: 'mensual', ent: 2, mensualidad: 25000 },
    { nombre: 'Joaquín Tapia', categoria: 'intermedio', elo: 1140, tipo_plan: 'mensual', ent: 3, mensualidad: 30000 },
    { nombre: 'Isidora Romero', categoria: 'avanzado', elo: 1090, tipo_plan: 'mensual', ent: 4, mensualidad: 40000 },
    { nombre: 'Vicente Fuentes', categoria: 'principiante', elo: 1130, tipo_plan: 'libre', ent: null, mensualidad: 20000 },
    { nombre: 'Constanza Silva', categoria: 'intermedio', elo: 1170, tipo_plan: 'mensual', ent: 2, mensualidad: 25000 },
  ]

  const jugadoresInsert = nuevosBase.map((j) => ({
    club_id: CLUB_ID,
    nombre: j.nombre,
    rut: rutFalso(usadosRut),
    telefono: `9${rndInt(10000000, 99999999)}`,
    categoria: j.categoria,
    elo: j.elo,
    sesiones_usadas: rndInt(0, 6),
    sesiones_limite: j.tipo_plan === 'libre' ? 99 : (j.ent || 3) * 4,
    estado: 'activo',
    es_externo: false,
    mensualidad: j.mensualidad,
    tipo_plan: j.tipo_plan,
    entrenamientos_por_semana: j.ent,
  }))

  const { data: nuevosJugadores, error: jugErr } = await supabase
    .from('jugadores').insert(jugadoresInsert).select('id, nombre, categoria, elo')
  if (jugErr) { console.error('Error creando jugadores:', jugErr); process.exit(1) }
  console.log(`Creados ${nuevosJugadores.length} jugadores nuevos.`)

  const { data: diego, error: diegoErr } = await supabase
    .from('jugadores').select('id, nombre, categoria, elo').eq('id', DIEGO_ID).single()
  if (diegoErr || !diego) { console.error('No se encontró a Diego Soto:', diegoErr); process.exit(1) }

  const jugadores = [diego, ...nuevosJugadores]
  const byName = (n) => jugadores.find((j) => j.nombre === n)

  // ─── 3. Mensualidades mayo + junio ─────────────────────
  const mensualidadesInsert = []
  for (const j of jugadores) {
    const jugInfo = j.id === DIEGO_ID ? { mensualidad: 25000 } : jugadoresInsert.find((x) => x.nombre === j.nombre)
    for (const mes of [5, 6]) {
      const estado = rnd(['pagado', 'pagado', 'pagado', 'pendiente', 'atrasado'])
      const fecha_pago = estado === 'pagado' ? `2026-${String(mes).padStart(2, '0')}-${String(rndInt(1, mes === 6 ? 22 : 28)).padStart(2, '0')}` : null
      mensualidadesInsert.push({
        club_id: CLUB_ID,
        jugador_id: j.id,
        mes, anio: 2026,
        monto: jugInfo.mensualidad || 25000,
        estado,
        fecha_pago,
        metodo: estado === 'pagado' ? rnd(['efectivo', 'transferencia']) : null,
        notas: 'Dato de prueba — San Bernardo',
      })
    }
  }
  const { data: mensInsertadas, error: mensErr } = await supabase.from('mensualidades').insert(mensualidadesInsert).select('*')
  if (mensErr) { console.error('Error insertando mensualidades:', mensErr); process.exit(1) }
  console.log(`Insertadas ${mensInsertadas.length} mensualidades.`)

  // ─── 4. Asistencia (mayo 1 - junio 23) ─────────────────
  const dias = diasEntre(FECHA_INICIO, FECHA_HOY)
  const asistenciaInsert = []
  for (const j of jugadores) {
    for (const dia of dias) {
      const diaSemana = dia.getDay()
      if (diaSemana === 0 || diaSemana === 6) continue // sin fines de semana
      if (Math.random() > 0.45) continue // asistencia ~2x/semana
      asistenciaInsert.push({
        jugador_id: j.id,
        club_id: CLUB_ID,
        fecha: fmtFecha(dia),
        hora: `${String(rndInt(17, 20)).padStart(2, '0')}:${rnd(['00', '15', '30', '45'])}:00`,
        metodo: 'manual',
      })
    }
  }
  const { error: asisErr } = await supabase.from('asistencia').insert(asistenciaInsert)
  if (asisErr) { console.error('Error insertando asistencia:', asisErr); process.exit(1) }
  console.log(`Insertadas ${asistenciaInsert.length} asistencias.`)

  // ─── 5. Clases + clase_jugadores ───────────────────────
  const contenidos = ['Saque y recepción', 'Topspin de derecha', 'Juego de pies', 'Bloqueo y contraataque', 'Servicio con efecto', 'Estrategia de partido', 'Resistencia y físico', 'Drive y revés']
  const clasesInsert = []
  for (const dia of dias) {
    const diaSemana = dia.getDay()
    if (diaSemana !== 1 && diaSemana !== 4) continue // lunes y jueves
    clasesInsert.push({
      club_id: CLUB_ID,
      profesor_id: profesor.id,
      dia_semana: diaSemana === 1 ? 'lunes' : 'jueves',
      hora_inicio: '18:00',
      hora_fin: '19:30',
      grupo: 'Intermedio-Avanzado',
      contenido: rnd(contenidos),
      fecha: fmtFecha(dia),
      publicada: true,
    })
  }
  const { data: clasesCreadas, error: clasesErr } = await supabase.from('clases').insert(clasesInsert).select('id')
  if (clasesErr) { console.error('Error insertando clases:', clasesErr); process.exit(1) }
  console.log(`Insertadas ${clasesCreadas.length} clases.`)

  const claseJugadoresInsert = []
  for (const c of clasesCreadas) {
    const asistentes = jugadores.filter(() => Math.random() < 0.7)
    for (const j of asistentes) claseJugadoresInsert.push({ clase_id: c.id, jugador_id: j.id })
  }
  const { error: cjErr } = await supabase.from('clase_jugadores').insert(claseJugadoresInsert)
  if (cjErr) { console.error('Error insertando clase_jugadores:', cjErr); process.exit(1) }
  console.log(`Insertadas ${claseJugadoresInsert.length} inscripciones a clases.`)

  // ─── 6. Finanzas: ingresos por mensualidad + gastos fijos ──
  const movimientosInsert = []
  for (const m of mensInsertadas) {
    if (m.estado !== 'pagado') continue
    const j = jugadores.find((x) => x.id === m.jugador_id)
    movimientosInsert.push({
      club_id: CLUB_ID,
      tipo: 'ingreso',
      categoria: 'mensualidad',
      descripcion: `Mensualidad ${j?.nombre || ''} — ${m.mes}/${m.anio}`,
      monto: m.monto,
      fecha: m.fecha_pago,
      jugador_id: m.jugador_id,
      mes_correspondiente: m.mes,
      anio_correspondiente: m.anio,
      registrado_por_nombre: 'Admin USB',
    })
  }
  for (const mes of [5, 6]) {
    const fecha = `2026-${String(mes).padStart(2, '0')}-05`
    movimientosInsert.push(
      { club_id: CLUB_ID, tipo: 'gasto', categoria: 'arriendo_cancha', descripcion: `Arriendo cancha — ${mes}/2026`, monto: 150000, fecha, mes_correspondiente: mes, anio_correspondiente: 2026, registrado_por_nombre: 'Admin USB' },
      { club_id: CLUB_ID, tipo: 'gasto', categoria: 'sueldo_profesor', descripcion: `Sueldo profesor Carlos Andrade — ${mes}/2026`, monto: 300000, fecha, profesor_id: profesor.id, mes_correspondiente: mes, anio_correspondiente: 2026, registrado_por_nombre: 'Admin USB' },
      { club_id: CLUB_ID, tipo: 'gasto', categoria: 'material_deportivo', descripcion: `Pelotas y mallas — ${mes}/2026`, monto: 40000, fecha, mes_correspondiente: mes, anio_correspondiente: 2026, registrado_por_nombre: 'Admin USB' },
      { club_id: CLUB_ID, tipo: 'gasto', categoria: 'servicios_basicos', descripcion: `Luz y agua — ${mes}/2026`, monto: 60000, fecha, mes_correspondiente: mes, anio_correspondiente: 2026, registrado_por_nombre: 'Admin USB' },
    )
  }
  const { error: movErr } = await supabase.from('movimientos').insert(movimientosInsert)
  if (movErr) { console.error('Error insertando movimientos:', movErr); process.exit(1) }
  console.log(`Insertados ${movimientosInsert.length} movimientos financieros.`)

  // ─── 7. Torneo interno: Copa Mayo USB ──────────────────
  const { data: torneo, error: torErr } = await supabase
    .from('torneos')
    .insert({
      club_id: CLUB_ID,
      nombre: 'Copa Mayo USB',
      formato: 'grupos',
      estado: 'finalizado',
      fase: 'finalizado',
      fecha_inicio: '2026-05-04',
      fecha_fin: '2026-05-18',
      precio_entrada: 0,
      inscripcion_abierta: false,
      cuota_inscripcion: 5000,
      contabilidad_enviada: true,
      premio_primero: 30000,
      premio_segundo: 15000,
      premio_tercero: 0,
    })
    .select().single()
  if (torErr) { console.error('Error creando torneo:', torErr); process.exit(1) }
  console.log('Torneo creado:', torneo.nombre)

  const { data: grupos, error: gruposErr } = await supabase
    .from('torneo_grupos')
    .insert([{ torneo_id: torneo.id, nombre: 'Grupo A' }, { torneo_id: torneo.id, nombre: 'Grupo B' }])
    .select('id, nombre')
  if (gruposErr) { console.error('Error creando grupos:', gruposErr); process.exit(1) }
  const grupoA = grupos.find((g) => g.nombre === 'Grupo A')
  const grupoB = grupos.find((g) => g.nombre === 'Grupo B')

  const equipoA = [byName('Diego Soto'), byName('Javiera Muñoz'), byName('Tomás Reyes'), byName('Camila Soto')]
  const equipoB = [byName('Nicolás Vargas'), byName('Florencia Castillo'), byName('Joaquín Tapia'), byName('Isidora Romero')]
  const ganadosA = [3, 2, 1, 0] // Diego, Javiera, Tomás, Camila
  const ganadosB = [3, 2, 1, 0] // Nicolás, Florencia, Joaquín, Isidora

  const { error: gjErr } = await supabase.from('grupo_jugadores').insert([
    ...equipoA.map((j, i) => ({ grupo_id: grupoA.id, jugador_id: j.id, partidos_jugados: 3, partidos_ganados: ganadosA[i], clasificado: i < 2 })),
    ...equipoB.map((j, i) => ({ grupo_id: grupoB.id, jugador_id: j.id, partidos_jugados: 3, partidos_ganados: ganadosB[i], clasificado: i < 2 })),
  ])
  if (gjErr) { console.error('Error creando grupo_jugadores:', gjErr); process.exit(1) }

  function roundRobinMatches(equipo, ganados) {
    const pares = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
    return pares.map(([i, k]) => {
      const ganaI = ganados[i] >= ganados[k] // el de mejor posición gana el cruce directo (simplificación)
      return { jugador_a: equipo[i].id, jugador_b: equipo[k].id, ganador: ganaI ? equipo[i].id : equipo[k].id }
    })
  }

  const partidosGrupos = [
    ...roundRobinMatches(equipoA, ganadosA).map((p) => ({ ...p, grupo_id: grupoA.id })),
    ...roundRobinMatches(equipoB, ganadosB).map((p) => ({ ...p, grupo_id: grupoB.id })),
  ].map((p, i) => ({ torneo_id: torneo.id, grupo_id: p.grupo_id, fase: 'grupos', jugador_a: p.jugador_a, jugador_b: p.jugador_b, ganador: p.ganador, orden: i }))

  const diegoJ = byName('Diego Soto'), nicolasJ = byName('Nicolás Vargas'), javieraJ = byName('Javiera Muñoz'), florenciaJ = byName('Florencia Castillo')

  const partidosBracket = [
    { torneo_id: torneo.id, grupo_id: null, fase: 'semis', jugador_a: diegoJ.id, jugador_b: florenciaJ.id, ganador: diegoJ.id, orden: 100 },
    { torneo_id: torneo.id, grupo_id: null, fase: 'semis', jugador_a: nicolasJ.id, jugador_b: javieraJ.id, ganador: nicolasJ.id, orden: 101 },
    { torneo_id: torneo.id, grupo_id: null, fase: 'final', jugador_a: diegoJ.id, jugador_b: nicolasJ.id, ganador: diegoJ.id, orden: 102 },
  ]

  const { error: partErr } = await supabase.from('torneo_partidos').insert([...partidosGrupos, ...partidosBracket])
  if (partErr) { console.error('Error creando torneo_partidos:', partErr); process.exit(1) }
  console.log(`Insertados ${partidosGrupos.length + partidosBracket.length} partidos del torneo.`)

  const posiciones = [
    { j: diegoJ, pos: 1, etiqueta: 'campeon' },
    { j: nicolasJ, pos: 2, etiqueta: 'subcampeon' },
    { j: javieraJ, pos: 3, etiqueta: 'semifinal' },
    { j: florenciaJ, pos: 4, etiqueta: 'semifinal' },
    { j: byName('Tomás Reyes'), pos: 5, etiqueta: 'fase_grupos' },
    { j: byName('Joaquín Tapia'), pos: 6, etiqueta: 'fase_grupos' },
    { j: byName('Camila Soto'), pos: 7, etiqueta: 'fase_grupos' },
    { j: byName('Isidora Romero'), pos: 8, etiqueta: 'fase_grupos' },
  ]

  const { error: tjErr } = await supabase.from('torneo_jugadores').insert(
    posiciones.map((p) => ({ torneo_id: torneo.id, jugador_id: p.j.id, posicion: p.pos, puntos: 0 })),
  )
  if (tjErr) { console.error('Error creando torneo_jugadores:', tjErr); process.exit(1) }

  const deltaPorEtiqueta = { campeon: 45, subcampeon: 25, semifinal: -5, fase_grupos: -15 }
  const elosFinales = {}
  const historialInsert = posiciones.map((p) => {
    const eloAntes = p.j.elo
    const eloDespues = eloAntes + deltaPorEtiqueta[p.etiqueta]
    elosFinales[p.j.id] = eloDespues
    return {
      jugador_id: p.j.id,
      club_id: CLUB_ID,
      torneo_id: torneo.id,
      elo_antes: eloAntes,
      elo_despues: eloDespues,
      posicion: p.etiqueta,
      fecha: '2026-05-18',
    }
  })
  const { error: histErr } = await supabase.from('historial_elo').insert(historialInsert)
  if (histErr) { console.error('Error creando historial_elo:', histErr); process.exit(1) }

  for (const [jugadorId, elo] of Object.entries(elosFinales)) {
    await supabase.from('jugadores').update({ elo }).eq('id', jugadorId)
  }
  console.log('Torneo interno completo con resultados y ELO actualizado.')

  const inscritos = posiciones.length
  await supabase.from('movimientos').insert([
    { club_id: CLUB_ID, tipo: 'ingreso', categoria: 'inscripcion_torneo', descripcion: `Inscripciones — ${torneo.nombre}`, monto: inscritos * 5000, fecha: '2026-05-04', mes_correspondiente: 5, anio_correspondiente: 2026, registrado_por_nombre: 'Admin USB' },
    { club_id: CLUB_ID, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 1° — ${torneo.nombre}`, monto: 30000, fecha: '2026-05-18', mes_correspondiente: 5, anio_correspondiente: 2026, registrado_por_nombre: 'Admin USB' },
    { club_id: CLUB_ID, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 2° — ${torneo.nombre}`, monto: 15000, fecha: '2026-05-18', mes_correspondiente: 5, anio_correspondiente: 2026, registrado_por_nombre: 'Admin USB' },
  ])

  // ─── 8. Torneos externos ───────────────────────────────
  const externosInsert = [
    { club_id: CLUB_ID, jugador_id: diegoJ.id, nombre_club: 'Club La Reina', categoria: 'intermedio', posicion: '1er lugar', fecha: '2026-05-25', puntos_elo: 20 },
    { club_id: CLUB_ID, jugador_id: diegoJ.id, nombre_club: 'Liga Metropolitana de Tenis de Mesa', categoria: 'intermedio', posicion: 'Cuartos de final', fecha: '2026-06-15', puntos_elo: 8 },
    { club_id: CLUB_ID, jugador_id: nicolasJ.id, nombre_club: 'Club Maipú', categoria: 'intermedio', posicion: 'Semifinal', fecha: '2026-06-08', puntos_elo: 12 },
    { club_id: CLUB_ID, jugador_id: byName('Isidora Romero').id, nombre_club: 'Club Providencia', categoria: 'avanzado', posicion: '2do lugar', fecha: '2026-05-30', puntos_elo: 15 },
  ]
  const { error: extErr } = await supabase.from('torneos_externos').insert(externosInsert)
  if (extErr) { console.error('Error creando torneos_externos:', extErr); process.exit(1) }
  console.log(`Insertados ${externosInsert.length} torneos externos.`)

  for (const e of externosInsert) {
    const actual = elosFinales[e.jugador_id] ?? jugadores.find((j) => j.id === e.jugador_id)?.elo ?? 1200
    const nuevo = actual + e.puntos_elo
    elosFinales[e.jugador_id] = nuevo
    await supabase.from('jugadores').update({ elo: nuevo }).eq('id', e.jugador_id)
  }

  // ─── 9. Evaluaciones trimestrales (Q2-2026) ────────────
  const evaluacionesInsert = jugadores.map((j) => ({
    club_id: CLUB_ID,
    jugador_id: j.id,
    profesor_id: profesor.id,
    periodo_trimestre: 'Q2-2026',
    fuerza: rndInt(5, 9),
    resistencia: rndInt(5, 9),
    velocidad: rndInt(5, 9),
    tecnica: rndInt(5, 9),
    tactica: rndInt(5, 9),
    feedback_profesor: 'Buen progreso en el trimestre, sigue trabajando la consistencia en los entrenamientos.',
    meta_proximo_periodo: 'Mejorar el servicio con efecto y la resistencia en partidos largos.',
    firmado_alumno: Math.random() < 0.6,
  }))
  const { error: evalErr } = await supabase.from('evaluaciones_trimestrales').insert(evaluacionesInsert)
  if (evalErr) { console.error('Error creando evaluaciones:', evalErr); process.exit(1) }
  console.log(`Insertadas ${evaluacionesInsert.length} evaluaciones trimestrales.`)

  console.log('\nListo. Datos completos para Club Unión San Bernardo.')
}

main()
