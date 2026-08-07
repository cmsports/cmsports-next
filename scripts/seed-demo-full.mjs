// Llena Club Demostración TDM con datos completos para mostrar el sistema.
//
// El club ya tenía jugadores, mensualidades, asistencia, movimientos y torneos,
// pero con los detalles de cada ficha en blanco y sin nada de lo que se agregó
// después: bloques de horario, calendario, feedback, liga y torneos externos.
// Este script llena esos huecos y completa hasta hoy lo que estaba a medias.
//
// Es aditivo y se puede volver a correr: cada sección salta lo que ya existe,
// así que no duplica. Solo toca club_id = Club Demostración TDM.
//
//   node scripts/seed-demo-full.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const CLUB_ID = '0884dbef-798d-4ce3-9e7a-deace0b4aa95'
// Hora de Chile, no UTC: `toISOString()` sobre `new Date()` adelanta el día.
const HOY = '2026-08-06'

// Aleatorio con semilla: dos corridas dan el mismo resultado, así los datos de
// la demo no cambian solos entre una revisión y la siguiente.
let semilla = 20260806
function rnd() {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
  return semilla / 0x7fffffff
}
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)]
const entero = (min, max) => Math.floor(rnd() * (max - min + 1)) + min
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function morir(paso, error) {
  console.error(`\n✗ ${paso}:`, error.message || error)
  process.exit(1)
}

function diasEntre(desdeISO, hastaISO) {
  const dias = []
  const d = new Date(`${desdeISO}T12:00:00`)
  const fin = new Date(`${hastaISO}T12:00:00`)
  while (d <= fin) { dias.push(new Date(d)); d.setDate(d.getDate() + 1) }
  return dias
}

const DIA_CORTO = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

const COMUNAS = ['Santiago', 'Ñuñoa', 'Providencia', 'La Florida', 'Maipú', 'Puente Alto', 'San Miguel', 'Macul']
const CALLES = ['Av. Los Leones', 'Pasaje El Roble', 'Calle Manuel Rodríguez', 'Av. Vicuña Mackenna',
  'Los Alerces', 'Calle Bulnes', 'Av. Irarrázaval', 'Pasaje Las Camelias', 'Calle Serrano', 'Av. Grecia']
const MEDICAS = ['Ninguna', 'Ninguna', 'Ninguna', 'Asma leve, usa inhalador', 'Alergia al polen',
  'Lente de contacto para jugar', 'Rodilla derecha operada 2024', 'Alergia a la penicilina']
const TALLAS = ['XS', 'S', 'M', 'L', 'XL']
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva',
  'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Araya', 'Torres']

async function main() {
  console.log('Club Demostración TDM — llenando datos\n')

  const { data: jugadores, error: jugErr } = await supabase
    .from('jugadores')
    .select('id,nombre,categoria,mensualidad,entrenamientos_por_semana,fecha_nacimiento')
    .eq('club_id', CLUB_ID).eq('es_externo', false).order('nombre')
  if (jugErr) morir('leyendo jugadores', jugErr)
  console.log(`${jugadores.length} jugadores en el club.`)

  // ── 1. Detalles de cada ficha ────────────────────────────────────────────
  // Estaban casi todos en NULL: la ficha del jugador se veía vacía.
  let fichasLlenas = 0
  for (const [i, j] of jugadores.entries()) {
    if (j.fecha_nacimiento) continue // ya tiene los detalles puestos
    const partes = j.nombre.split(' ')
    const nombrePila = partes[0]
    const apellido1 = partes.slice(1).join(' ') || elegir(APELLIDOS)
    const esMenor = j.categoria === 'intermedio' ? rnd() < 0.6 : rnd() < 0.35
    const anioNac = esMenor ? entero(2009, 2015) : entero(1988, 2006)
    const apoderado = `${elegir(['María', 'Claudia', 'Patricia', 'Jorge', 'Luis', 'Andrés'])} ${elegir(APELLIDOS)}`

    const { error } = await supabase.from('jugadores').update({
      fecha_nacimiento: `${anioNac}-${String(entero(1, 12)).padStart(2, '0')}-${String(entero(1, 28)).padStart(2, '0')}`,
      comuna: elegir(COMUNAS),
      direccion: `${elegir(CALLES)} ${entero(100, 4800)}, ${elegir(COMUNAS)}`,
      contacto_emergencia_nombre: apoderado,
      contacto_emergencia_telefono: `+569${entero(30000000, 99999999)}`,
      indicaciones_medicas: elegir(MEDICAS),
      federado: rnd() < 0.35,
      talla_polera: elegir(TALLAS),
      talla_short: elegir(TALLAS),
      nombres: nombrePila,
      apellido1,
      apellido2: elegir(APELLIDOS),
      horario: j.categoria === 'avanzado' ? '19:00-21:00' : '17:00-19:00',
    }).eq('id', j.id)
    if (error) morir(`detalles de ${j.nombre}`, error)
    fichasLlenas++
    if (i === 0) console.log('') // separación visual
  }
  console.log(`✓ Detalles completados en ${fichasLlenas} fichas (${jugadores.length - fichasLlenas} ya los tenían).`)

  // ── 2. Profesores ────────────────────────────────────────────────────────
  const { data: profesoresExistentes } = await supabase
    .from('profesores').select('id,nombre').eq('club_id', CLUB_ID)
  const nombresProf = new Set(profesoresExistentes.map((p) => p.nombre))
  const profesoresNuevos = [
    { nombre: 'Andrés Cárcamo', especialidad: 'Formación de menores', email: 'andres.carcamo@demo.cl' },
    { nombre: 'Paulina Herrera', especialidad: 'Alto rendimiento', email: 'paulina.herrera@demo.cl' },
  ].filter((p) => !nombresProf.has(p.nombre))

  if (profesoresNuevos.length) {
    const { error } = await supabase.from('profesores')
      .insert(profesoresNuevos.map((p) => ({ ...p, club_id: CLUB_ID, activo: true })))
    if (error) morir('creando profesores', error)
  }
  const { data: profesores } = await supabase
    .from('profesores').select('id,nombre').eq('club_id', CLUB_ID).order('nombre')
  console.log(`✓ ${profesores.length} profesores (${profesoresNuevos.length} nuevos).`)

  // ── 3. Grupos y bloques de horario ───────────────────────────────────────
  // El club no tenía ninguno, y los bloques son la fuente de verdad de los
  // días y la sede de cada jugador: sin ellos, Horario y Asistencia salen vacíos.
  const { data: gruposPrevios } = await supabase
    .from('grupos_entrenamiento').select('id,nombre').eq('club_id', CLUB_ID)

  // `grupos_entrenamiento.sede` tiene un CHECK que solo acepta 'buin' y
  // 'paine' (migración 085): las sedes de Buin quedaron escritas en el
  // esquema, así que ningún otro club puede nombrar las suyas. Se usan esos
  // dos valores porque son los únicos que la base admite hoy.
  const gruposDef = [
    { nombre: 'Menores Iniciación', sede: 'buin' },
    { nombre: 'Menores Competitivo', sede: 'buin' },
    { nombre: 'Todo Público', sede: 'buin' },
    { nombre: 'Adultos Mañana', sede: 'paine' },
  ]
  const faltantes = gruposDef.filter((g) => !gruposPrevios.some((p) => p.nombre === g.nombre))
  if (faltantes.length) {
    const { error } = await supabase.from('grupos_entrenamiento')
      .insert(faltantes.map((g) => ({ ...g, club_id: CLUB_ID, activo: true })))
    if (error) morir('creando grupos de entrenamiento', error)
  }
  const { data: grupos } = await supabase
    .from('grupos_entrenamiento').select('id,nombre,sede').eq('club_id', CLUB_ID)
  const grupoPorNombre = Object.fromEntries(grupos.map((g) => [g.nombre, g]))

  const bloquesDef = [
    { grupo: 'Menores Iniciación', dias: ['lun', 'mie'], inicio: '17:00:00', fin: '18:30:00', cupo: 14 },
    { grupo: 'Menores Competitivo', dias: ['mar', 'jue'], inicio: '17:30:00', fin: '19:30:00', cupo: 12 },
    { grupo: 'Todo Público', dias: ['lun', 'mie', 'vie'], inicio: '19:00:00', fin: '21:00:00', cupo: 16 },
    { grupo: 'Adultos Mañana', dias: ['mar', 'jue'], inicio: '09:00:00', fin: '10:30:00', cupo: 10 },
  ]

  const { data: bloquesPrevios } = await supabase
    .from('bloques_horario').select('id,nombre,dia_semana').eq('club_id', CLUB_ID)

  const bloquesInsert = []
  for (const b of bloquesDef) {
    const grupo = grupoPorNombre[b.grupo]
    for (const dia of b.dias) {
      if (bloquesPrevios.some((p) => p.nombre === b.grupo && p.dia_semana === dia)) continue
      bloquesInsert.push({
        club_id: CLUB_ID, grupo_id: grupo.id, nombre: b.grupo, sede: grupo.sede,
        dia_semana: dia, hora_inicio: b.inicio, hora_fin: b.fin,
        cupo_maximo: b.cupo, cupo_libres: 4, activo: true, vigente_desde: '2026-07-01',
      })
    }
  }
  if (bloquesInsert.length) {
    const { error } = await supabase.from('bloques_horario').insert(bloquesInsert)
    if (error) morir('creando bloques de horario', error)
  }
  const { data: bloques } = await supabase
    .from('bloques_horario').select('id,nombre,dia_semana,sede,hora_inicio').eq('club_id', CLUB_ID)
  console.log(`✓ ${bloques.length} bloques de horario (${bloquesInsert.length} nuevos), en ${grupos.length} grupos.`)

  // Profesores a cargo de cada bloque
  const { data: bpPrevios } = await supabase.from('bloque_profesores').select('bloque_id,profesor_id')
  const bpExistente = new Set(bpPrevios.map((x) => `${x.bloque_id}|${x.profesor_id}`))
  const profPorGrupo = {
    'Menores Iniciación': ['Andrés Cárcamo'],
    'Menores Competitivo': ['Andrés Cárcamo', 'Ricardo Muñoz'],
    'Todo Público': ['Ricardo Muñoz', 'Carolina Vega'],
    'Adultos Mañana': ['Paulina Herrera'],
  }
  const bpInsert = []
  for (const b of bloques) {
    for (const nombreProf of profPorGrupo[b.nombre] || []) {
      const prof = profesores.find((p) => p.nombre === nombreProf)
      if (!prof || bpExistente.has(`${b.id}|${prof.id}`)) continue
      bpInsert.push({ bloque_id: b.id, profesor_id: prof.id, vigente_desde: '2026-07-01' })
    }
  }
  if (bpInsert.length) {
    const { error } = await supabase.from('bloque_profesores').insert(bpInsert)
    if (error) morir('asignando profesores a bloques', error)
  }
  console.log(`✓ ${bpInsert.length} asignaciones de profesor a bloque.`)

  // ── 4. Jugadores en bloques ──────────────────────────────────────────────
  // El grupo sale de la categoría y la edad; los avanzados van a Todo Público
  // o Menores Competitivo, los intermedios a Iniciación, y algunos adultos
  // suman el bloque de la mañana.
  const { data: bjPrevios } = await supabase.from('bloque_jugadores').select('bloque_id,jugador_id')
  const bjExistente = new Set(bjPrevios.map((x) => `${x.bloque_id}|${x.jugador_id}`))

  const { data: jugadoresConEdad } = await supabase
    .from('jugadores').select('id,nombre,categoria,fecha_nacimiento,entrenamientos_por_semana')
    .eq('club_id', CLUB_ID).eq('es_externo', false)

  const bloquesDe = (nombre) => bloques.filter((b) => b.nombre === nombre)
  const bjInsert = []
  const grupoDeJugador = {}

  for (const j of jugadoresConEdad) {
    const anio = Number((j.fecha_nacimiento || '2000').slice(0, 4))
    const esMenor = 2026 - anio < 18
    const grupo = esMenor
      ? (j.categoria === 'avanzado' ? 'Menores Competitivo' : 'Menores Iniciación')
      : 'Todo Público'
    grupoDeJugador[j.id] = grupo

    // Toma tantos días del bloque como entrenamientos por semana tenga.
    const disponibles = bloquesDe(grupo)
    const cuantos = Math.min(j.entrenamientos_por_semana || 2, disponibles.length)
    for (const b of disponibles.slice(0, cuantos)) {
      if (!bjExistente.has(`${b.id}|${j.id}`)) bjInsert.push({ bloque_id: b.id, jugador_id: j.id })
    }
    // Un tercio de los adultos entrena además en la sede norte por la mañana.
    if (!esMenor && rnd() < 0.33) {
      for (const b of bloquesDe('Adultos Mañana')) {
        if (!bjExistente.has(`${b.id}|${j.id}`)) bjInsert.push({ bloque_id: b.id, jugador_id: j.id })
      }
    }
  }
  if (bjInsert.length) {
    const { error } = await supabase.from('bloque_jugadores').insert(bjInsert)
    if (error) morir('asignando jugadores a bloques', error)
  }
  console.log(`✓ ${bjInsert.length} inscripciones de jugador a bloque.`)

  // ── 5. Días y sede derivados de los bloques ──────────────────────────────
  // Los bloques mandan (regla del proyecto): entrena_* y sede son un reflejo,
  // nunca se escriben a mano por separado.
  const { data: bjTodos } = await supabase
    .from('bloque_jugadores').select('jugador_id,bloques_horario(dia_semana,sede,club_id)')
  const derivado = {}
  for (const fila of bjTodos) {
    const b = fila.bloques_horario
    if (!b || b.club_id !== CLUB_ID) continue
    const d = derivado[fila.jugador_id] ??= { dias: new Set(), sedes: new Set() }
    d.dias.add(b.dia_semana)
    d.sedes.add(b.sede)
  }
  for (const [jugadorId, d] of Object.entries(derivado)) {
    const sedes = [...d.sedes]
    const { error } = await supabase.from('jugadores').update({
      entrena_lun: d.dias.has('lun'), entrena_mar: d.dias.has('mar'),
      entrena_mie: d.dias.has('mie'), entrena_jue: d.dias.has('jue'),
      entrena_vie: d.dias.has('vie'),
      sede: sedes.length > 1 ? 'ambos' : sedes[0],
    }).eq('id', jugadorId)
    if (error) morir('sincronizando días y sede', error)
  }
  console.log(`✓ Días y sede sincronizados desde los bloques en ${Object.keys(derivado).length} jugadores.`)

  // ── 6. Asistencia hasta hoy, con faltas ──────────────────────────────────
  // Solo llegaba al 17 de julio y no tenía ni una falta registrada, así que el
  // porcentaje de asistencia salía siempre 100%.
  const { data: asisPrevia } = await supabase
    .from('asistencia').select('fecha').eq('club_id', CLUB_ID).order('fecha', { ascending: false }).limit(1)
  const desdeAsistencia = asisPrevia?.[0]?.fecha
    ? fmt(new Date(new Date(`${asisPrevia[0].fecha}T12:00:00`).getTime() + 86400000))
    : '2026-07-18'

  const asistenciaInsert = []
  if (desdeAsistencia <= HOY) {
    const bloquePorDia = {}
    for (const b of bloques) (bloquePorDia[b.dia_semana] ??= []).push(b)

    for (const dia of diasEntre(desdeAsistencia, HOY)) {
      const corto = DIA_CORTO[dia.getDay()]
      for (const b of bloquePorDia[corto] || []) {
        const inscritos = bjTodos.filter((x) => x.bloques_horario?.club_id === CLUB_ID)
        for (const fila of inscritos) {
          if (!bjInsert.concat(bjPrevios).some((x) => x.bloque_id === b.id && x.jugador_id === fila.jugador_id)) continue
          // ~82% asiste; el resto queda como falta, que es lo que la tabla guarda.
          const presente = rnd() < 0.82
          asistenciaInsert.push({
            jugador_id: fila.jugador_id, club_id: CLUB_ID, fecha: fmt(dia),
            hora: presente ? b.hora_inicio : null,
            metodo: 'manual', bloque_id: b.id,
            estado: presente ? 'presente' : 'ausente',
          })
        }
      }
    }
    // Sin duplicar al mismo jugador dos veces el mismo día y bloque.
    const vistos = new Set()
    const unicas = asistenciaInsert.filter((a) => {
      const k = `${a.jugador_id}|${a.fecha}|${a.bloque_id}`
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })
    for (let i = 0; i < unicas.length; i += 500) {
      const { error } = await supabase.from('asistencia').insert(unicas.slice(i, i + 500))
      if (error) morir('insertando asistencia', error)
    }
    const presentes = unicas.filter((a) => a.estado === 'presente').length
    console.log(`✓ ${unicas.length} registros de asistencia del ${desdeAsistencia} al ${HOY} (${presentes} presentes, ${unicas.length - presentes} faltas).`)
  } else {
    console.log('✓ Asistencia ya estaba al día.')
  }

  // ── 7. Mensualidades de agosto ───────────────────────────────────────────
  const { data: mensAgosto } = await supabase
    .from('mensualidades').select('jugador_id').eq('club_id', CLUB_ID).eq('mes', 8).eq('anio', 2026)
  const yaTieneAgosto = new Set(mensAgosto.map((m) => m.jugador_id))

  const mensualidadesInsert = jugadores
    .filter((j) => !yaTieneAgosto.has(j.id))
    .map((j) => {
      const estado = elegir(['pagado', 'pagado', 'pagado', 'pendiente', 'atrasado'])
      return {
        club_id: CLUB_ID, jugador_id: j.id, mes: 8, anio: 2026,
        monto: j.mensualidad || 25000, estado,
        fecha_pago: estado === 'pagado' ? `2026-08-${String(entero(1, 6)).padStart(2, '0')}` : null,
        metodo: estado === 'pagado' ? elegir(['efectivo', 'transferencia']) : null,
      }
    })
  if (mensualidadesInsert.length) {
    const { error } = await supabase.from('mensualidades').insert(mensualidadesInsert)
    if (error) morir('insertando mensualidades de agosto', error)
  }
  console.log(`✓ ${mensualidadesInsert.length} mensualidades de agosto.`)

  // ── 8. Movimientos financieros de agosto ─────────────────────────────────
  const { count: movAgosto } = await supabase.from('movimientos')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', CLUB_ID).eq('mes_correspondiente', 8).eq('anio_correspondiente', 2026)

  if (!movAgosto) {
    const movimientosInsert = []
    for (const m of mensualidadesInsert) {
      if (m.estado !== 'pagado') continue
      const j = jugadores.find((x) => x.id === m.jugador_id)
      movimientosInsert.push({
        club_id: CLUB_ID, tipo: 'ingreso', categoria: 'mensualidad',
        descripcion: `Mensualidad ${j?.nombre || ''} — 8/2026`,
        monto: m.monto, fecha: m.fecha_pago, jugador_id: m.jugador_id,
        mes_correspondiente: 8, anio_correspondiente: 2026,
        registrado_por_nombre: 'Admin Demostración',
      })
    }
    const gastos = [
      { categoria: 'arriendo_cancha', descripcion: 'Arriendo gimnasio — 8/2026', monto: 180000 },
      { categoria: 'sueldo_profesor', descripcion: 'Sueldo Ricardo Muñoz — 8/2026', monto: 350000 },
      { categoria: 'sueldo_profesor', descripcion: 'Sueldo Andrés Cárcamo — 8/2026', monto: 280000 },
      { categoria: 'material_deportivo', descripcion: 'Pelotas y gomas — 8/2026', monto: 55000 },
      { categoria: 'otro_gasto', descripcion: 'Luz, agua e internet — 8/2026', monto: 72000 },
    ]
    for (const g of gastos) {
      movimientosInsert.push({
        club_id: CLUB_ID, tipo: 'gasto', ...g, fecha: '2026-08-03',
        mes_correspondiente: 8, anio_correspondiente: 2026,
        registrado_por_nombre: 'Admin Demostración',
      })
    }
    const { error } = await supabase.from('movimientos').insert(movimientosInsert)
    if (error) morir('insertando movimientos de agosto', error)
    console.log(`✓ ${movimientosInsert.length} movimientos financieros de agosto.`)
  } else {
    console.log('✓ Movimientos de agosto ya existían.')
  }

  // ── 9. Calendario ────────────────────────────────────────────────────────
  const { count: eventosPrevios } = await supabase.from('eventos')
    .select('id', { count: 'exact', head: true }).eq('club_id', CLUB_ID)

  if (!eventosPrevios) {
    const eventos = [
      { titulo: 'Inicio temporada segundo semestre', tipo: 'otro', fecha_inicio: '2026-07-01T00:00:00', hora_inicio: '17:00:00' },
      { titulo: 'Torneo Interclubes — fecha 1', tipo: 'torneo', fecha_inicio: '2026-07-12T00:00:00', hora_inicio: '10:00:00', hora_fin: '18:00:00' },
      { titulo: 'Evaluación trimestral Q3', tipo: 'otro', fecha_inicio: '2026-07-25T00:00:00', descripcion: 'Evaluación física y técnica de todas las categorías.' },
      { titulo: 'Copa Demostración TDM', tipo: 'torneo', fecha_inicio: '2026-08-09T00:00:00', fecha_fin: '2026-08-10T00:00:00', hora_inicio: '09:30:00' },
      { titulo: 'Charla de nutrición deportiva', tipo: 'otro', fecha_inicio: '2026-08-14T00:00:00', hora_inicio: '19:00:00', descripcion: 'Abierta a jugadores y apoderados.' },
      { titulo: 'Liga Interna — fecha 3', tipo: 'torneo', fecha_inicio: '2026-08-16T00:00:00', hora_inicio: '10:00:00' },
      { titulo: 'Receso fiestas patrias', tipo: 'otro', fecha_inicio: '2026-09-15T00:00:00', fecha_fin: '2026-09-21T00:00:00' },
      { titulo: 'Campeonato Regional Metropolitano', tipo: 'torneo', fecha_inicio: '2026-09-26T00:00:00', hora_inicio: '09:00:00' },
      { titulo: 'Reunión de apoderados', tipo: 'otro', fecha_inicio: '2026-10-03T00:00:00', hora_inicio: '11:00:00' },
      { titulo: 'Torneo de cierre anual', tipo: 'torneo', fecha_inicio: '2026-12-06T00:00:00', hora_inicio: '09:00:00' },
    ]
    const { error } = await supabase.from('eventos')
      .insert(eventos.map((e) => ({ ...e, club_id: CLUB_ID })))
    if (error) morir('insertando eventos', error)
    console.log(`✓ ${eventos.length} eventos de calendario.`)
  } else {
    console.log('✓ Calendario ya tenía eventos.')
  }

  // ── 10. Feedback de profesores ───────────────────────────────────────────
  const { count: feedbackPrevio } = await supabase.from('feedback_jugadores')
    .select('id', { count: 'exact', head: true }).eq('club_id', CLUB_ID)

  if (!feedbackPrevio) {
    const comentarios = [
      'Muy buena actitud en el entrenamiento, mejoró el saque con efecto lateral.',
      'Le falta constancia en el revés, se le pidió repetir la serie de bloqueo.',
      'Excelente juego de pies hoy. Sigue así.',
      'Llegó tarde, alcanzó a hacer la mitad de la rutina.',
      'Progreso notorio en el topspin de derecha las últimas dos semanas.',
      'Necesita trabajar la lectura del saque rival.',
      'Muy buen partido de práctica, ganó 3-1 contra un rival de categoría superior.',
      'Se le corrigió la empuñadura, hay que reforzarlo la próxima clase.',
      'Buena resistencia física, aguantó toda la sesión sin bajar el ritmo.',
      'Le cuesta mantener la concentración en puntos largos.',
    ]
    const feedbackInsert = []
    for (const j of jugadores) {
      for (let k = 0; k < entero(1, 3); k++) {
        const prof = elegir(profesores)
        const dia = new Date(`2026-07-${String(entero(10, 31)).padStart(2, '0')}T12:00:00`)
        if (rnd() < 0.4) dia.setMonth(7, entero(1, 6)) // algunos en agosto
        feedbackInsert.push({
          club_id: CLUB_ID, jugador_id: j.id, autor_id: null, autor_nombre: prof.nombre,
          fecha: fmt(dia), hora: `${String(entero(17, 20)).padStart(2, '0')}:${elegir(['00', '15', '30', '45'])}:00`,
          comentario: elegir(comentarios),
        })
      }
    }
    const { error } = await supabase.from('feedback_jugadores').insert(feedbackInsert)
    if (error) morir('insertando feedback', error)
    console.log(`✓ ${feedbackInsert.length} comentarios de feedback.`)
  } else {
    console.log('✓ Feedback ya existía.')
  }

  // ── 11. Torneos externos ─────────────────────────────────────────────────
  const { count: externosPrevios } = await supabase.from('torneos_externos')
    .select('id', { count: 'exact', head: true }).eq('club_id', CLUB_ID)

  if (!externosPrevios) {
    const sedes = ['Club La Reina', 'Club Maipú', 'Liga Metropolitana TDM', 'Club Providencia',
      'Asociación Santiago Sur', 'Club Ñuñoa', 'Open Regional TDM']
    const posiciones = ['1er lugar', '2do lugar', '3er lugar', 'Semifinal', 'Cuartos de final', 'Fase de grupos']
    const externosInsert = []
    for (const j of jugadores) {
      if (rnd() > 0.45) continue
      for (let k = 0; k < entero(1, 2); k++) {
        externosInsert.push({
          club_id: CLUB_ID, jugador_id: j.id,
          nombre_club: elegir(sedes), categoria: j.categoria,
          posicion: elegir(posiciones),
          fecha: `2026-0${entero(5, 8)}-${String(entero(1, 28)).padStart(2, '0')}`,
        })
      }
    }
    const { error } = await supabase.from('torneos_externos').insert(externosInsert)
    if (error) morir('insertando torneos externos', error)
    console.log(`✓ ${externosInsert.length} participaciones en torneos externos.`)
  } else {
    console.log('✓ Torneos externos ya existían.')
  }

  // ── 12. Liga interna completa ────────────────────────────────────────────
  // Cada paso se salta solo si ya está hecho, en vez de mirar únicamente si la
  // liga existe: si una corrida anterior se cortó a la mitad —pasó con el
  // NOT NULL de `es_ajuste`— la liga quedaba creada pero sin fechas ni
  // partidos, y el guardián de "ya existe" impedía terminarla para siempre.
  const { data: ligasPrevias } = await supabase.from('ligas').select('id,nombre').eq('club_id', CLUB_ID)
  let liga = ligasPrevias[0]
  if (!liga) {
    const { data, error } = await supabase.from('ligas')
      .insert({ club_id: CLUB_ID, nombre: 'Liga Interna 2026', estado: 'en_curso' })
      .select().single()
    if (error) morir('creando la liga', error)
    liga = data
  }

  const { data: divPrevias } = await supabase.from('liga_divisiones').select('*').eq('liga_id', liga.id).order('orden')
  let divisiones = divPrevias
  if (!divisiones.length) {
    const { data, error } = await supabase.from('liga_divisiones').insert([
      { liga_id: liga.id, nombre: 'División Honor', orden: 1, capacidad_max: 10, fixture_generado: true },
      { liga_id: liga.id, nombre: 'División A', orden: 2, capacidad_max: 10, fixture_generado: true },
      { liga_id: liga.id, nombre: 'División B', orden: 3, capacidad_max: 10, fixture_generado: true },
    ]).select()
    if (error) morir('creando divisiones', error)
    divisiones = data
  }

  const { data: mesasPrevias } = await supabase.from('liga_mesas').select('*').eq('liga_id', liga.id).order('numero')
  let mesas = mesasPrevias
  if (!mesas.length) {
    const { data, error } = await supabase.from('liga_mesas')
      .insert([1, 2, 3, 4].map((n) => ({ liga_id: liga.id, numero: n }))).select()
    if (error) morir('creando mesas', error)
    mesas = data
  }

  const { data: fechasPrevias } = await supabase.from('liga_fechas').select('*').eq('liga_id', liga.id).order('numero')
  let fechas = fechasPrevias
  if (!fechas.length) {
    // `es_ajuste` va en todas las filas, no solo en la que es de ajuste: el
    // insert en lote iguala las columnas entre filas, así que la que no lo
    // trae se manda como NULL y choca con el NOT NULL de la tabla.
    const { data, error } = await supabase.from('liga_fechas').insert([
      { liga_id: liga.id, numero: 1, fecha: '2026-07-19', estado: 'finalizada', es_ajuste: false },
      { liga_id: liga.id, numero: 2, fecha: '2026-08-02', estado: 'finalizada', es_ajuste: false },
      { liga_id: liga.id, numero: 3, fecha: '2026-08-16', estado: 'programada', es_ajuste: false },
      { liga_id: liga.id, numero: 4, fecha: '2026-08-30', estado: 'programada', es_ajuste: false },
      { liga_id: liga.id, numero: 5, fecha: '2026-09-13', estado: 'programada', es_ajuste: true },
    ]).select()
    if (error) morir('creando fechas', error)
    fechas = data
  }

  // Reparto: avanzados a Honor y A, intermedios a B. 8 por división.
  const avanzados = jugadores.filter((j) => j.categoria === 'avanzado')
  const intermedios = jugadores.filter((j) => j.categoria === 'intermedio')
  const reparto = [
    { division: divisiones[0], jugadores: avanzados.slice(0, 8) },
    { division: divisiones[1], jugadores: avanzados.slice(8, 16) },
    { division: divisiones[2], jugadores: intermedios.slice(0, 8) },
  ]

  const { data: inscritosPrevios } = await supabase.from('liga_division_jugadores')
    .select('division_id,jugador_id').in('division_id', divisiones.map((d) => d.id))
  const yaInscrito = new Set(inscritosPrevios.map((x) => `${x.division_id}|${x.jugador_id}`))
  const inscritosInsert = reparto.flatMap((r) => r.jugadores
    .filter((j) => !yaInscrito.has(`${r.division.id}|${j.id}`))
    .map((j) => ({ division_id: r.division.id, jugador_id: j.id })))
  if (inscritosInsert.length) {
    const { error } = await supabase.from('liga_division_jugadores').insert(inscritosInsert)
    if (error) morir('inscribiendo jugadores en la liga', error)
  }

  // Todos contra todos en cada división: 3 divisiones de 8 = 84 partidos.
  const MARCADORES = [[3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3]]
  const BLOQUES_DIA = ['10:00:00', '11:00:00', '12:00:00', '13:00:00', '14:00:00', '15:00:00']
  const cruces = []
  for (const r of reparto) {
    for (let a = 0; a < r.jugadores.length; a++) {
      for (let b = a + 1; b < r.jugadores.length; b++) {
        cruces.push({ division: r.division, a: r.jugadores[a], b: r.jugadores[b] })
      }
    }
  }

  // La base impone tres reglas al programar un partido, y hay que respetarlas
  // todas a la vez: una mesa no puede tener dos partidos en el mismo bloque
  // (índice único fecha+mesa+bloque), y un jugador tampoco puede tener dos
  // partidos en el mismo bloque aunque sean en mesas distintas (trigger HC-01
  // de la migración 016). Repartir por contador no alcanza: hay que buscarle
  // hueco a cada cruce donde la mesa esté libre Y los dos jugadores también.
  const fechasJugables = fechas.filter((f) => !f.es_ajuste)
  const jugadoresEnBloque = new Map() // fecha|bloque -> Set(jugador)
  const mesasOcupadas = new Map()     // fecha|bloque -> nº de mesas usadas

  function buscarHueco(cruce) {
    for (const fecha of fechasJugables) {
      for (const bloque of BLOQUES_DIA) {
        const clave = `${fecha.id}|${bloque}`
        const usadas = mesasOcupadas.get(clave) ?? 0
        if (usadas >= mesas.length) continue
        const ocupados = jugadoresEnBloque.get(clave) ?? new Set()
        if (ocupados.has(cruce.a.id) || ocupados.has(cruce.b.id)) continue
        ocupados.add(cruce.a.id)
        ocupados.add(cruce.b.id)
        jugadoresEnBloque.set(clave, ocupados)
        mesasOcupadas.set(clave, usadas + 1)
        return { fecha, bloque, mesa: mesas[usadas] }
      }
    }
    return null
  }

  const { count: partidosPrevios } = await supabase.from('liga_partidos')
    .select('id', { count: 'exact', head: true }).eq('liga_id', liga.id)

  let insertados = partidosPrevios
  if (partidosPrevios < cruces.length) {
    // Una corrida anterior pudo dejar solo una parte; se rehace el fixture
    // completo en vez de intentar parcharlo encima.
    if (partidosPrevios) await supabase.from('liga_partidos').delete().eq('liga_id', liga.id)

    const partidosInsert = []
    let sinHueco = 0
    for (const [orden, c] of cruces.entries()) {
      const hueco = buscarHueco(c)
      if (!hueco) { sinHueco++; continue }
      const jugado = hueco.fecha.estado === 'finalizada'
      const [sa, sb] = elegir(MARCADORES)
      partidosInsert.push({
        liga_id: liga.id, division_id: c.division.id,
        jugador_a_id: c.a.id, jugador_b_id: c.b.id,
        fecha_id: hueco.fecha.id,
        mesa_id: hueco.mesa.id,
        bloque_horario: hueco.bloque,
        estado: jugado ? 'finalizado' : 'programado',
        sets_a: jugado ? sa : null,
        sets_b: jugado ? sb : null,
        ganador_id: jugado ? (sa > sb ? c.a.id : c.b.id) : null,
        orden_fixture: orden,
      })
    }
    // De a uno: el trigger HC-01 es por fila y un lote entero se caería por un
    // solo choque, perdiendo también los que sí estaban bien.
    insertados = 0
    for (const p of partidosInsert) {
      const { error } = await supabase.from('liga_partidos').insert(p)
      if (error) morir('creando el fixture de la liga', error)
      insertados++
    }
    if (sinHueco) console.log(`  (${sinHueco} cruces sin hueco disponible en el calendario)`)
  }
  console.log(`✓ ${liga.nombre}: ${divisiones.length} divisiones, ${fechas.length} fechas, ${mesas.length} mesas, ${inscritosInsert.length} inscritos nuevos, ${insertados} partidos.`)

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n─── Estado final de Club Demostración TDM ───')
  for (const t of ['jugadores', 'profesores', 'bloques_horario', 'asistencia', 'mensualidades',
    'movimientos', 'torneos', 'eventos', 'evaluaciones_trimestrales', 'feedback_jugadores',
    'torneos_externos', 'ligas']) {
    const { count } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('club_id', CLUB_ID)
    console.log(`  ${t}: ${count}`)
  }
  console.log('\nListo.')
}

main()
