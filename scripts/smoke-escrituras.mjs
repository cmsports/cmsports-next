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
await probar('Generar la semana con los bloques reales', async () => {
  const { data: todos } = await db.from('bloques_horario')
    .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin').eq('club_id', BUIN).is('vigente_hasta', null)
  const filas = todos.map(b => ({
    club_id: BUIN, bloque_id: b.id, sede: b.sede, fecha: F, dia_semana: LARGO[b.dia_semana],
    hora_inicio: b.hora_inicio, hora_fin: b.hora_fin, contenido: b.nombre, publicada: false,
  }))
  const r = await db.from('clases').upsert(filas, { onConflict: 'bloque_id,fecha', ignoreDuplicates: true }).select('id')
  if (r.error) throw new Error(r.error.message)
  for (const c of r.data) basura.push(['clases', c.id])
  if (r.data.length !== todos.length) throw new Error(`generó ${r.data.length} de ${todos.length}`)
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
await rechaza('No acepta monto cero ni negativo', () =>
  db.from('clases_extraordinarias').update({ monto: 0 }).eq('id', extraId))
await probar('No le descuenta sesiones al jugador', async () => {
  const { data } = await db.from('jugadores').select('sesiones_usadas').eq('id', JUG).single()
  const { count } = await db.from('asistencia')
    .select('*', { count: 'exact', head: true }).eq('jugador_id', JUG)
  // El contador sale de `asistencia`. Si la clase extra se hubiera colado ahí,
  // estos dos números dejarían de coincidir.
  if (data.sesiones_usadas !== count) {
    throw new Error(`sesiones_usadas ${data.sesiones_usadas} != asistencias ${count}`)
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
