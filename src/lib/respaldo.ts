import { createAdminClient } from '@/lib/supabase/admin'

// Vuelca la base completa a JSON, club por club, para el respaldo semanal del
// panel superadmin. Es el espejo de `eliminarClub`: las mismas tablas que ese
// borrado barre son las que acá hay que guardar, más las globales.
//
// JSON y no xlsx a propósito: el respaldo tiene que poder volver a entrar a la
// base tal cual salió (tipos, nulls, uuids), y una planilla se come todo eso.

type Admin = ReturnType<typeof createAdminClient>
type Fila = Record<string, unknown>

// Tablas con columna `club_id`. Es la misma lista de TABLAS_BORRAR_POR_CLUB de
// actions/superadmin.ts —sacada del esquema real, no de memoria— más las cuatro
// que allá tienen su propio camino de borrado pero acá se leen igual.
export const TABLAS_POR_CLUB = [
  '_respaldo_asistencia_089', '_respaldo_mensualidades_089', '_respaldo_movimientos_089',
  'actividad', 'asistencia', 'audit_log', 'auditoria_asistencia', 'auditoria_mensualidades',
  'bloques_horario', 'clases_extraordinarias', 'credencial_visible', 'cuotas',
  'evaluaciones_trimestrales', 'eventos', 'feedback_jugadores', 'finanzas_operaciones',
  'flyer_referencias', 'fotos_galeria', 'grupos_entrenamiento', 'invitaciones',
  'jugador_documentos', 'jugador_horario_historial', 'kioscos_asistencia',
  'mensualidades', 'movimientos', 'pagos_clubes', 'partidos', 'presupuestos', 'profesores',
  'ranking_general', 'solicitudes_jugador', 'tienda_asociacion_productos',
  'tienda_buin_productos', 'torneos_externos', 'usuarios', 'vouchers',
  'jugadores', 'perfiles', 'torneos', 'ligas',
] as const

// Tablas sin `club_id`: cuelgan de una fila del club por otra llave.
// [tabla, columna, de dónde salen los ids]
const TABLAS_HIJAS: [string, string, string][] = [
  ['torneo_grupos', 'torneo_id', 'torneos'],
  ['torneo_partidos', 'torneo_id', 'torneos'],
  ['torneo_jugadores', 'torneo_id', 'torneos'],
  ['torneo_pagos', 'torneo_id', 'torneos'],
  ['torneo_felicitaciones', 'torneo_id', 'torneos'],
  ['torneo_cabezas_serie', 'torneo_id', 'torneos'],
  ['grupo_jugadores', 'grupo_id', 'torneo_grupos'],
  ['liga_divisiones', 'liga_id', 'ligas'],
  ['liga_fechas', 'liga_id', 'ligas'],
  ['liga_mesas', 'liga_id', 'ligas'],
  ['liga_partidos', 'liga_id', 'ligas'],
  ['liga_division_jugadores', 'division_id', 'liga_divisiones'],
  ['liga_jugador_pagos', 'division_id', 'liga_divisiones'],
  ['liga_abonos', 'pago_id', 'liga_jugador_pagos'],
  ['bloque_jugadores', 'bloque_id', 'bloques_horario'],
  ['bloque_profesores', 'bloque_id', 'bloques_horario'],
]

// Tablas que no son de ningún club: van una sola vez, en `_global/`.
const TABLAS_GLOBALES = ['clubes', 'configuracion_empresa', 'tareas', 'club_photos', 'banco_fotos', 'notificaciones_leidas']

const PAGINA = 1000

// Supabase corta en 1000 filas por consulta: sin paginar, un club con más
// asistencias que eso se respalda a medias y nadie se entera hasta el día que
// hay que restaurar.
async function leerTodo(admin: Admin, tabla: string, filtro?: { col: string; valores: string[] }): Promise<Fila[]> {
  if (filtro && !filtro.valores.length) return []
  const filas: Fila[] = []
  // Los ids van en lotes: un `.in()` con miles de uuids revienta el largo de la URL.
  const lotes = filtro ? trozos(filtro.valores, 200) : [null]
  for (const lote of lotes) {
    let desde = 0
    for (;;) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (admin as any).from(tabla).select('*')
      if (filtro && lote) q = q.in(filtro.col, lote)
      const { data, error } = await q.range(desde, desde + PAGINA - 1)
      // Una tabla que no existe (migración no aplicada todavía) no puede
      // arruinar el respaldo entero: se anota vacía y sigue.
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return []
        throw new Error(`${tabla}: ${error.message}`)
      }
      filas.push(...(data || []))
      if (!data || data.length < PAGINA) break
      desde += PAGINA
    }
  }
  return filas
}

function trozos<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

const ids = (filas: Fila[]) => filas.map(f => String(f.id)).filter(id => id && id !== 'undefined')

export async function respaldarClub(admin: Admin, clubId: string): Promise<Record<string, Fila[]>> {
  const datos: Record<string, Fila[]> = {}
  for (const tabla of TABLAS_POR_CLUB) {
    datos[tabla] = await leerTodo(admin, tabla, { col: 'club_id', valores: [clubId] })
  }
  // El orden de la lista importa: `grupo_jugadores` necesita los ids que dejó
  // `torneo_grupos`, y `liga_abonos` los de `liga_jugador_pagos`.
  for (const [tabla, col, padre] of TABLAS_HIJAS) {
    datos[tabla] = await leerTodo(admin, tabla, { col, valores: ids(datos[padre] || []) })
  }
  return datos
}

export async function respaldarGlobales(admin: Admin): Promise<Record<string, Fila[]>> {
  const datos: Record<string, Fila[]> = {}
  for (const tabla of TABLAS_GLOBALES) datos[tabla] = await leerTodo(admin, tabla)
  return datos
}

// Nombre de carpeta usable en cualquier sistema de archivos.
export function carpeta(nombre: string) {
  return nombre.replace(/[\\/:*?"<>|]/g, '-').trim() || 'club'
}
