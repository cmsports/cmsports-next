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

const NOMBRES = ['Matías', 'Sofía', 'Benjamín', 'Valentina', 'Joaquín', 'Isidora', 'Cristóbal', 'Martína', 'Vicente', 'Florencia', 'Tomás', 'Catalina', 'Diego', 'Fernanda', 'Felipe', 'Javiera', 'Ignacio', 'Antonia', 'Gabriel', 'Camila', 'Sebastián', 'Constanza', 'Maximiliano', 'Daniela', 'Nicolás', 'Paula', 'Rodrigo', 'Carolina', 'Esteban', 'Francisca']
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sánchez', 'Romero', 'Alarcón', 'Tapia', 'Flores', 'Torres', 'Vargas', 'Castillo', 'Reyes', 'Fuentes', 'Hernández']
const CATEGORIAS = ['principiante', 'intermedio', 'avanzado']
const TIPOS_PLAN = ['mensual', 'semanal', 'libre']

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

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

async function main() {
  const { data: club, error: clubErr } = await supabase
    .from('clubes')
    .select('id, nombre, mensualidad_base')
    .ilike('nombre', '%paine%')
    .single()

  if (clubErr || !club) {
    console.error('No se encontró Club Paine:', clubErr)
    process.exit(1)
  }
  console.log('Club encontrado:', club.nombre, club.id)

  const mensualidadBase = club.mensualidad_base || 25000
  const usadosRut = new Set()
  const hoy = new Date('2026-06-22')
  const ANIO = 2026
  const MES = 6
  const ultimoDia = hoy.getDate()

  const jugadoresInsert = Array.from({ length: 30 }, (_, i) => {
    const nombre = `${rnd(NOMBRES)} ${rnd(APELLIDOS)}`
    const estado = Math.random() < 0.9 ? 'activo' : 'bloqueado'
    const tipo_plan = rnd(TIPOS_PLAN)
    return {
      club_id: club.id,
      nombre,
      rut: rutFalso(usadosRut),
      email: `jugador.prueba${i + 1}@test.cmsports.cl`,
      telefono: `9${rndInt(10000000, 99999999)}`,
      categoria: rnd(CATEGORIAS),
      sesiones_usadas: 0,
      sesiones_limite: 12,
      estado,
      es_externo: false,
      mensualidad: mensualidadBase,
      tipo_plan,
      entrenamientos_por_semana: rndInt(1, 4),
    }
  })

  const { data: jugadores, error: jugErr } = await supabase
    .from('jugadores')
    .insert(jugadoresInsert)
    .select('id, nombre, estado')

  if (jugErr) {
    console.error('Error insertando jugadores:', jugErr)
    process.exit(1)
  }
  console.log(`Insertados ${jugadores.length} jugadores de prueba.`)

  const asistenciaInsert = []
  for (const j of jugadores) {
    if (j.estado === 'bloqueado') continue
    const diasEntrena = rndInt(1, 4)
    const diasUsados = new Set()
    const intentos = Math.min(ultimoDia, diasEntrena * 5)
    for (let k = 0; k < intentos && diasUsados.size < diasEntrena; k++) {
      const dia = rndInt(1, ultimoDia)
      if (diasUsados.has(dia)) continue
      diasUsados.add(dia)
      const fecha = `${ANIO}-${String(MES).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      const hora = `${String(rndInt(9, 20)).padStart(2, '0')}:${rnd(['00', '15', '30', '45'])}:00`
      asistenciaInsert.push({
        jugador_id: j.id,
        club_id: club.id,
        fecha,
        hora,
        metodo: 'manual',
      })
    }
  }

  if (asistenciaInsert.length) {
    const { error: asisErr } = await supabase.from('asistencia').insert(asistenciaInsert)
    if (asisErr) console.error('Error insertando asistencia:', asisErr)
    else console.log(`Insertados ${asistenciaInsert.length} registros de asistencia (junio 2026).`)
  }

  const mensualidadesInsert = jugadores.map((j) => {
    const estado = rnd(['pagado', 'pagado', 'pagado', 'pendiente', 'atrasado'])
    const metodo = rnd(['efectivo', 'transferencia'])
    const fecha_pago = estado === 'pagado'
      ? `${ANIO}-${String(MES).padStart(2, '0')}-${String(rndInt(1, ultimoDia)).padStart(2, '0')}`
      : null
    return {
      club_id: club.id,
      jugador_id: j.id,
      mes: MES,
      anio: ANIO,
      monto: mensualidadBase,
      estado,
      fecha_pago,
      metodo: estado === 'pagado' ? metodo : null,
      notas: 'Dato de prueba generado automáticamente',
    }
  })

  const { error: mensErr } = await supabase.from('mensualidades').insert(mensualidadesInsert)
  if (mensErr) console.error('Error insertando mensualidades:', mensErr)
  else console.log(`Insertadas ${mensualidadesInsert.length} mensualidades de junio 2026.`)

  console.log('Listo.')
}

main()
