// Aprieta todos los botones del sistema contra la base real y limpia después.
//
// Existe porque los dos peores bugs del proyecto —registrado_por y el formato
// del día en generar semana— estaban en código escrito pero nunca ejecutado.
// Ninguno se veía leyendo: los dos aparecieron al intentar escribir.
//
// Usa fechas del año 2099 y nombres que empiezan con ZZ, así nada se mezcla
// con datos reales. Al final borra todo lo que creó.
//
//   node scripts/smoke-escrituras.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const BUIN = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
const F = '2099-01-05'   // un lunes lejano
const LARGO = { lun: 'lunes', mar: 'martes', mie: 'miercoles', jue: 'jueves', vie: 'viernes' }

const basura = []
let ok = 0, mal = 0

async function probar(nombre, fn) {
  try { await fn(); console.log(`  OK    ${nombre}`); ok++ }
  catch (e) { console.log(`  FALLA ${nombre}\n          ${e.message}`); mal++ }
}
function debe(r, tabla) {
  if (r.error) throw new Error(r.error.message)
  if (tabla) basura.push([tabla, r.data.id])
  return r.data
}
async function rechaza(nombre, fn) {
  await probar(nombre, async () => {
    const r = await fn()
    if (!r.error) throw new Error('la base lo aceptó cuando no debía')
  })
}

const { data: j }    = await db.from('jugadores').select('id,nombre,mensualidad').eq('club_id', BUIN).limit(1)
const { data: bs }   = await db.from('bloques_horario').select('id').eq('club_id', BUIN).limit(1)
const { data: prof } = await db.from('profesores').select('id').eq('club_id', BUIN).limit(1)
const JUG = j[0].id, BLOQUE_REAL = bs[0].id, PROF = prof?.[0]?.id ?? null

let grupoId, bloqueId, mensId

console.log('\n=== HORARIO SEMANAL ===')
await probar('Crear grupo', async () => {
  grupoId = debe(await db.from('grupos_entrenamiento')
    .insert({ club_id: BUIN, nombre: 'ZZ Prueba', sede: 'buin' }).select('id').single()).id
})
await probar('Marcarle un día con su horario', async () => {
  bloqueId = debe(await db.from('bloques_horario').insert({
    club_id: BUIN, grupo_id: grupoId, nombre: 'ZZ Prueba', sede: 'buin',
    dia_semana: 'lun', hora_inicio: '07:00', hora_fin: '08:00', cupo_maximo: 12, cupo_libres: 5,
  }).select('id').single()).id
})
await probar('Asignarle profesor', async () => {
  if (PROF) debe(await db.from('bloque_profesores')
    .insert({ bloque_id: bloqueId, profesor_id: PROF }).select('id').single())
})
await probar('Renombrar el grupo propaga a sus días', async () => {
  debe(await db.from('grupos_entrenamiento').update({ nombre: 'ZZ Prueba 2' }).eq('id', grupoId).select('id').single())
  const { data } = await db.from('bloques_horario').select('nombre').eq('id', bloqueId).single()
  if (data.nombre !== 'ZZ Prueba 2') throw new Error('el día no heredó el nombre nuevo')
})
await probar('Inscribir un jugador', async () => {
  debe(await db.from('bloque_jugadores')
    .insert({ bloque_id: bloqueId, jugador_id: JUG, vigente_desde: '2099-01-01' }).select('id').single())
})
await rechaza('No deja inscribirlo dos veces', () =>
  db.from('bloque_jugadores').insert({ bloque_id: bloqueId, jugador_id: JUG, vigente_desde: '2099-01-02' }))
await probar('Quitarlo cierra la vigencia, no borra', async () => {
  debe(await db.from('bloque_jugadores').update({ vigente_hasta: F })
    .eq('bloque_id', bloqueId).eq('jugador_id', JUG).select('id').single())
})
await probar('Marcar un día sin clase', async () => {
  debe(await db.from('bloque_excepciones')
    .upsert({ bloque_id: BLOQUE_REAL, fecha: F, motivo: 'prueba' }, { onConflict: 'bloque_id,fecha' })
    .select('id').single(), 'bloque_excepciones')
})
// Acá había un caso "Generar la semana con los bloques reales" que insertaba
// en `clases`. Esa tabla ya no existe: la migración 111 la eliminó y la semana
// dejó de materializarse —se deriva de `bloques_horario` al vuelo—. El caso
// fallaba desde entonces con "Could not find the table public.clases", que es
// el smoke avisando de un concepto borrado, no de una regresión.
//
// Se quita en vez de reescribirse: no hay nada equivalente que probar. Lo que
// aquella prueba cuidaba —que los bloques vigentes se lean bien— lo cubren los
// casos de arriba.
await probar('Los bloques vigentes del club se leen completos', async () => {
  const { data: todos, error } = await db.from('bloques_horario')
    .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin')
    .eq('club_id', BUIN).is('vigente_hasta', null)
  if (error) throw new Error(error.message)
  if (!todos.length) throw new Error('el club no tiene ningún bloque vigente')
  const rotos = todos.filter(b => b.dia_semana == null || !b.hora_inicio || !b.hora_fin)
  if (rotos.length) throw new Error(`${rotos.length} bloque(s) sin día u horario`)
})
await probar('Dar de baja un día del grupo', async () => {
  debe(await db.from('bloques_horario').update({ vigente_hasta: F }).eq('id', bloqueId).select('id').single())
})

console.log('\n=== ASISTENCIA ===')
await probar('Pasar lista', async () => {
  debe(await db.from('asistencia')
    .insert({ club_id: BUIN, jugador_id: JUG, fecha: F, hora: '19:00', estado: 'presente' })
    .select('id').single(), 'asistencia')
})
await probar('Corregirla a ausente', async () => {
  debe(await db.from('asistencia').update({ estado: 'ausente' })
    .eq('jugador_id', JUG).eq('fecha', F).select('id').single())
})
await rechaza('No deja dos registros el mismo día', () =>
  db.from('asistencia').insert({ club_id: BUIN, jugador_id: JUG, fecha: F, hora: '20:00', estado: 'presente' }))
await rechaza('No acepta un estado inventado', () =>
  db.from('asistencia').update({ estado: 'quizas' }).eq('jugador_id', JUG).eq('fecha', F))
await probar('Guardar la auditoría de la corrección', async () => {
  debe(await db.from('auditoria_asistencia').insert({
    club_id: BUIN, jugador_id: JUG, fecha: F,
    estado_anterior: 'presente', estado_nuevo: 'ausente', motivo: 'prueba',
  }).select('id').single(), 'auditoria_asistencia')
})
await probar('Recalcular sesiones', async () => {
  const r = await db.rpc('recalcular_sesiones', { p_jugador: JUG })
  if (r.error) throw new Error(r.error.message)
})

console.log('\n=== FINANZAS ===')
await probar('Registrar una mensualidad pasada', async () => {
  mensId = debe(await db.from('mensualidades').insert({
    club_id: BUIN, jugador_id: JUG, mes: 1, anio: 2099, monto: 30000, estado: 'pagado', fecha_pago: F,
  }).select('id').single(), 'mensualidades').id
})
await rechaza('No deja dos cuotas del mismo mes', () =>
  db.from('mensualidades').insert({ club_id: BUIN, jugador_id: JUG, mes: 1, anio: 2099, monto: 1, estado: 'pendiente' }))
await probar('Movimiento de ajuste en el libro', async () => {
  debe(await db.from('movimientos').insert({
    club_id: BUIN, tipo: 'ingreso', categoria: 'ajuste_mensualidad', descripcion: 'ZZ prueba',
    monto: 5000, fecha: F, jugador_id: JUG, mes_correspondiente: 1, anio_correspondiente: 2099,
    mensualidad_id: mensId,
  }).select('id').single(), 'movimientos')
})
await probar('Auditoría del ajuste', async () => {
  debe(await db.from('auditoria_mensualidades').insert({
    club_id: BUIN, jugador_id: JUG, mes: 1, anio: 2099,
    estado_anterior: 'pendiente', estado_nuevo: 'pagado',
    monto_anterior: 25000, monto_nuevo: 30000, motivo: 'prueba',
  }).select('id').single(), 'auditoria_mensualidades')
})

console.log('\n=== JUGADORES, TIENDAS Y CALENDARIO ===')
await probar('Subir un documento', async () => {
  debe(await db.from('jugador_documentos').upsert({
    club_id: BUIN, jugador_id: JUG, tipo: 'carta_compromiso',
    archivo_path: 'zz/prueba.pdf', archivo_url: '', nombre_archivo: 'prueba.pdf', subido_por: 'smoke',
  }, { onConflict: 'jugador_id,tipo' }).select('id').single(), 'jugador_documentos')
})
await probar('Cambiar la cuota de un jugador', async () => {
  debe(await db.from('jugadores').update({ mensualidad: 12345 }).eq('id', JUG).select('id').single())
  await db.from('jugadores').update({ mensualidad: j[0].mensualidad }).eq('id', JUG)
})
await probar('Bloquear y reactivar un jugador', async () => {
  debe(await db.from('jugadores').update({ estado: 'bloqueado' }).eq('id', JUG).select('id').single())
  await db.from('jugadores').update({ estado: 'activo' }).eq('id', JUG)
})
await probar('Producto en la Tienda del profe', async () => {
  debe(await db.from('tienda_buin_productos')
    .insert({ club_id: BUIN, nombre: 'ZZ Prueba', categoria: 'accesorios', precio: 1, stock: 1 })
    .select('id').single(), 'tienda_buin_productos')
})
await probar('Producto en la Tienda Buin', async () => {
  debe(await db.from('tienda_asociacion_productos')
    .insert({ club_id: BUIN, nombre: 'ZZ Prueba', categoria: 'accesorios', precio: 1, stock: 1 })
    .select('id').single(), 'tienda_asociacion_productos')
})
await probar('Evento en el calendario', async () => {
  debe(await db.from('eventos')
    .insert({ club_id: BUIN, titulo: 'ZZ Prueba', tipo: 'feriado', fecha_inicio: F })
    .select('id').single(), 'eventos')
})

console.log('\n=== CLASES EXTRAORDINARIAS ===')
// El jugador que viene a un grupo que no es el suyo. Se escribe a mano y no por
// la función de la base porque acá no hay sesión: la service key deja auth.uid()
// en nulo y el guardia de rol la rechazaría. Lo que se comprueba es que la
// tabla acepte exactamente lo que la aplicación le manda.
let extraId
await probar('Registrarla sin grupo, que es el que hoy no entrena', async () => {
  extraId = debe(await db.from('clases_extraordinarias').insert({
    club_id: BUIN, jugador_id: JUG, fecha: F, bloque_id: null, hora: '19:00',
  }).select('id').single(), 'clases_extraordinarias').id
})
await probar('Ponerle precio después', async () => {
  debe(await db.from('clases_extraordinarias')
    .update({ monto: 8000 }).eq('id', extraId).select('id').single())
})
await probar('Completarle el grupo después', async () => {
  debe(await db.from('clases_extraordinarias')
    .update({ bloque_id: bloqueId }).eq('id', extraId).select('id').single())
})
await rechaza('No deja repetir jugador, fecha y grupo', () =>
  db.from('clases_extraordinarias').insert({
    club_id: BUIN, jugador_id: JUG, fecha: F, bloque_id: bloqueId,
  }))
// El monto 0 es válido y significa "sin cargo": el profe debía esa clase. La
// migración 100 aflojó el CHECK a propósito (`monto >= 0`) y toda la interfaz
// lo trata así. Este caso afirmaba la regla vieja de la 099 y fallaba desde
// entonces. Lo que sí hay que sostener es que un negativo no entre: un monto
// negativo restaría de un total que se le cobra a alguien.
await probar('Monto 0 se acepta: es "sin cargo"', async () => {
  debe(await db.from('clases_extraordinarias')
    .update({ monto: 0 }).eq('id', extraId).select('id').single())
})
await rechaza('No acepta monto negativo', () =>
  db.from('clases_extraordinarias').update({ monto: -500 }).eq('id', extraId))

await probar('No le descuenta sesiones al jugador', async () => {
  // Se compara contra exactamente lo que cuenta `recalcular_sesiones`: todas
  // las filas de `asistencia` DEL MES EN CURSO, presentes y ausentes.
  //
  // Las dos mitades importan y las dos estaban mal antes:
  //
  //   · Del mes. La 106 acotó el contador al mes en curso —antes decía "18/12"
  //     al segundo mes—. Comparar contra toda la historia no podía dar.
  //   · Presentes Y ausentes. La ausencia gasta sesión a propósito, porque el
  //     cupo se ocupó igual: decisión del club, escrita en la 087 y ratificada
  //     en la 106. Filtrar por 'presente' acá sería afirmar lo contrario de lo
  //     que el club decidió.
  //
  // Lo que el caso cuida es otra cosa: que la clase extra no entre en
  // `asistencia`. Si se colara, este número subiría de más.
  const hoyCL = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [anio, mes] = hoyCL.split('-').map(Number)
  const desde = `${hoyCL.slice(0, 7)}-01`
  const hasta = `${hoyCL.slice(0, 7)}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`

  await db.rpc('recalcular_sesiones', { p_jugador: JUG })
  const { data } = await db.from('jugadores').select('sesiones_usadas').eq('id', JUG).single()
  const { count } = await db.from('asistencia')
    .select('*', { count: 'exact', head: true })
    .eq('jugador_id', JUG).gte('fecha', desde).lte('fecha', hasta)

  if ((data.sesiones_usadas ?? 0) !== count) {
    throw new Error(`sesiones_usadas ${data.sesiones_usadas} != filas del mes ${count}`)
  }
})

console.log('\n=== LIMPIEZA ===')
for (const [tabla, id] of basura.reverse()) await db.from(tabla).delete().eq('id', id)
await db.from('bloque_jugadores').delete().eq('bloque_id', bloqueId)
await db.from('bloque_profesores').delete().eq('bloque_id', bloqueId)
await db.from('bloques_horario').delete().eq('grupo_id', grupoId)
await db.from('grupos_entrenamiento').delete().eq('id', grupoId)
await db.rpc('recalcular_sesiones', { p_jugador: JUG })

const sobras = []
for (const [t, col] of [['clases', 'fecha'], ['asistencia', 'fecha'], ['mensualidades', null], ['eventos', 'fecha_inicio'], ['clases_extraordinarias', 'fecha']]) {
  const q = db.from(t).select('*', { count: 'exact', head: true })
  const { count } = col ? await q.eq(col, F) : await q.eq('anio', 2099)
  if (count) sobras.push(`${t}: ${count}`)
}
const { count: gz } = await db.from('grupos_entrenamiento').select('*', { count: 'exact', head: true }).ilike('nombre', 'ZZ%')
if (gz) sobras.push(`grupos: ${gz}`)

console.log(sobras.length ? `  quedaron sobras -> ${sobras.join(', ')}` : '  base limpia, no quedó nada de prueba')
console.log(`\n${ok} pasaron, ${mal} fallaron`)
