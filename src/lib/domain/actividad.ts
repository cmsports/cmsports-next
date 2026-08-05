import { fechaChile } from './fechaChile'

/**
 * Registro de actividad: reglas de captura y agregaciones del panel.
 *
 * Todo acá es puro y sin Supabase: la página del superadmin solo pinta lo que
 * estas funciones devuelven, y los promedios se pueden testear sin base.
 *
 * Convención de las filas (la fija el cliente, la documenta la migración 124):
 * - `segundos === 0` → ping de LLEGADA a una pantalla. Cuenta como visita.
 * - `segundos > 0`   → tramo de permanencia. Cuenta como tiempo.
 * Los pings periódicos nunca mandan 0, así que las dos cosas no se pisan.
 */

/** Ventana de "está usando la app ahora mismo". */
export const MINUTOS_EN_LINEA = 5

/** Ventana del promedio de uso y del ranking de módulos. */
export const DIAS_VENTANA = 30

export type FilaActividad = {
  usuarioId: string | null
  nombre: string | null
  rol: string | null
  club: string | null
  ruta: string
  modulo: string | null
  segundos: number
  ocurridoEn: string
}

// ── Captura ────────────────────────────────────────────────────────────────

/**
 * Corta la query string y el hash.
 *
 * Es la garantía de privacidad del módulo: en `?jugador=<uuid>` o
 * `#pago-1234` viaja información del contenido de la pantalla, y eso no se
 * registra. La tabla además tiene un CHECK que rechaza rutas con '?'.
 */
export function rutaSinParametros(url: string): string {
  return url.split('#')[0].split('?')[0]
}

const PREFIJOS_IGNORADOS = ['/api', '/login', '/logout', '/auth', '/_next']

/**
 * Si esta ruta vale la pena guardar.
 *
 * Se descartan las de API (no son pantallas), el login (aún no hay sesión) y
 * cualquier cosa con extensión, que son assets servidos por el mismo dominio.
 * Sin este filtro la tabla se llena de ruido que después hay que restar en
 * cada consulta.
 */
export function rutaRegistrable(ruta: string): boolean {
  if (!ruta.startsWith('/')) return false
  if (PREFIJOS_IGNORADOS.some(p => ruta === p || ruta.startsWith(`${p}/`))) return false
  return !/\.[a-z0-9]+$/i.test(ruta)
}

// ── Quién está en línea ────────────────────────────────────────────────────

export type SesionEnLinea = {
  usuarioId: string
  nombre: string | null
  rol: string | null
  club: string | null
  ruta: string
  modulo: string | null
  ocurridoEn: string
}

/**
 * Quiénes tuvieron actividad en los últimos `minutos`, con la pantalla en la
 * que estaban.
 *
 * Una sesión por persona: se queda el ping más reciente. Las filas sin
 * `usuarioId` (cuenta borrada) no aparecen — no hay a quién mostrar.
 * El orden es del más reciente al más antiguo.
 */
export function sesionesEnLinea(
  filas: readonly FilaActividad[],
  ahora = new Date(),
  minutos = MINUTOS_EN_LINEA,
): SesionEnLinea[] {
  const desde = ahora.getTime() - minutos * 60_000
  const ultima = new Map<string, FilaActividad>()

  for (const fila of filas) {
    if (!fila.usuarioId) continue
    const t = new Date(fila.ocurridoEn).getTime()
    if (!(t >= desde && t <= ahora.getTime())) continue
    const previa = ultima.get(fila.usuarioId)
    if (!previa || new Date(previa.ocurridoEn).getTime() < t) ultima.set(fila.usuarioId, fila)
  }

  return [...ultima.values()]
    .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn))
    .map(f => ({
      usuarioId: f.usuarioId!,
      nombre: f.nombre,
      rol: f.rol,
      club: f.club,
      ruta: f.ruta,
      modulo: f.modulo,
      ocurridoEn: f.ocurridoEn,
    }))
}

// ── Tiempo de uso promedio ─────────────────────────────────────────────────

export type PromedioDiario = {
  /** Promedio de segundos que usa la app una persona en un día que la usó. */
  segundos: number
  /** Cuántas personas distintas entraron en la ventana. */
  usuarios: number
  /** Cuántos días distintos tuvieron actividad. */
  dias: number
}

/**
 * Promedio de uso por usuario y por día sobre los últimos `dias`.
 *
 * El divisor son los pares (persona, día) CON actividad, no `usuarios × días`.
 * Es la lectura útil: "cuando alguien entra, se queda X". Promediar sobre los
 * 30 días completos daría casi cero apenas haya un usuario que entra una vez
 * al mes, y no diría nada sobre nadie.
 *
 * El día se corta en horario de Chile (`fechaChile`), igual que el resto del
 * sistema: un ping de las 22:00 en Santiago es de ese día, no del siguiente UTC.
 */
export function promedioDiarioPorUsuario(
  filas: readonly FilaActividad[],
  ahora = new Date(),
  dias = DIAS_VENTANA,
): PromedioDiario {
  const desde = ahora.getTime() - dias * 86_400_000
  const porUsuarioDia = new Map<string, number>()
  const usuarios = new Set<string>()
  const diasVistos = new Set<string>()

  for (const fila of filas) {
    if (!fila.usuarioId) continue
    const t = new Date(fila.ocurridoEn).getTime()
    if (!(t >= desde && t <= ahora.getTime())) continue
    const dia = fechaChile(new Date(fila.ocurridoEn))
    const clave = `${fila.usuarioId}|${dia}`
    porUsuarioDia.set(clave, (porUsuarioDia.get(clave) ?? 0) + fila.segundos)
    usuarios.add(fila.usuarioId)
    diasVistos.add(dia)
  }

  if (porUsuarioDia.size === 0) return { segundos: 0, usuarios: 0, dias: 0 }
  const total = [...porUsuarioDia.values()].reduce((a, b) => a + b, 0)
  return {
    segundos: Math.round(total / porUsuarioDia.size),
    usuarios: usuarios.size,
    dias: diasVistos.size,
  }
}

// ── Ranking de módulos ─────────────────────────────────────────────────────

export type UsoModulo = {
  /** `null` = pantallas que no pertenecen a ningún módulo (dashboard, perfil…). */
  modulo: string | null
  segundos: number
  visitas: number
}

/**
 * Módulos ordenados por tiempo acumulado, con las visitas al lado.
 *
 * Las dos métricas no dicen lo mismo y por eso van juntas: un módulo con
 * muchas visitas cortas (se entra, se mira, se sale) es distinto de uno con
 * pocas visitas largas. Visitas = pings de llegada (segundos = 0); si se
 * contaran todos los pings, quedarse quieto 10 minutos sumaría 10 visitas.
 *
 * El desempate por nombre es para que el orden sea estable cuando dos módulos
 * empatan en segundos: si no, el ranking baila entre recargas.
 */
export function rankingModulos(filas: readonly FilaActividad[]): UsoModulo[] {
  const acumulado = new Map<string, UsoModulo>()

  for (const fila of filas) {
    const clave = fila.modulo ?? ''
    const actual = acumulado.get(clave) ?? { modulo: fila.modulo ?? null, segundos: 0, visitas: 0 }
    actual.segundos += fila.segundos
    if (fila.segundos === 0) actual.visitas += 1
    acumulado.set(clave, actual)
  }

  return [...acumulado.values()].sort(
    (a, b) => b.segundos - a.segundos || b.visitas - a.visitas || (a.modulo ?? '').localeCompare(b.modulo ?? ''),
  )
}

// ── Formato ────────────────────────────────────────────────────────────────

/** Duración legible: "2 h 05 min", "12 min", "40 s". */
export function formatearDuracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  if (s < 60) return `${s} s`
  const minutos = Math.floor(s / 60)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${String(minutos % 60).padStart(2, '0')} min`
}

/** "hace 2 min", "hace 3 h", "hace 4 d". Para la lista de últimos movimientos. */
export function haceCuanto(iso: string, ahora = new Date()): string {
  const segundos = Math.round((ahora.getTime() - new Date(iso).getTime()) / 1000)
  if (segundos < 60) return 'hace instantes'
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`
  if (segundos < 86_400) return `hace ${Math.floor(segundos / 3600)} h`
  return `hace ${Math.floor(segundos / 86_400)} d`
}
