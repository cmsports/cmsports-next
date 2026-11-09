// Horario semanal del club: la plantilla fija desde la que se generan las
// clases de cada semana. Cambia poco (rotación de profesores cada ~3 meses).

/**
 * Los siete días, de lunes a domingo (la semana del club arranca el lunes).
 *
 * `bloques_horario.dia_semana` acepta los siete desde la migración 073. Las
 * pantallas que dibujan una grilla filtran a los días que tienen bloques, así
 * que un club que no abre el fin de semana sigue viendo solo lunes a viernes.
 */
export const DIAS = [
  { value: 'lun', label: 'Lunes',     corto: 'Lun' },
  { value: 'mar', label: 'Martes',    corto: 'Mar' },
  { value: 'mie', label: 'Miércoles', corto: 'Mié' },
  { value: 'jue', label: 'Jueves',    corto: 'Jue' },
  { value: 'vie', label: 'Viernes',   corto: 'Vie' },
  { value: 'sab', label: 'Sábado',    corto: 'Sáb' },
  { value: 'dom', label: 'Domingo',   corto: 'Dom' },
] as const

export type DiaSemana = typeof DIAS[number]['value']

/** Claves válidas de `dia_semana`, para validar lo que llega del navegador. */
export const DIAS_VALIDOS: readonly string[] = DIAS.map(d => d.value)

/** Los días de la semana laboral de siempre; el fin de semana es opcional. */
export const DIAS_HABILES: readonly DiaSemana[] = ['lun', 'mar', 'mie', 'jue', 'vie']

export type BloqueHorario = {
  id: string
  nombre: string
  sede: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
  cupo_maximo: number
  cupo_libres: number
  activo: boolean
}

// Los <input type="time"> devuelven HH:MM; Postgres guarda HH:MM:SS.
export function hhmm(hora: string | null | undefined): string {
  return (hora ?? '').slice(0, 5)
}

export function rangoHorario(inicio: string, fin: string): string {
  return `${hhmm(inicio)} - ${hhmm(fin)}`
}

/** Margen para que el alumno se marque desde la app: media hora para cada lado. */
export const TOLERANCIA_ASISTENCIA_MIN = 30

export function minutosDelDia(hora: string | null | undefined): number {
  const [h, m] = hhmm(hora).split(':')
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0)
}

/**
 * Si a esta hora el alumno puede marcarse en ese bloque. Abre media hora antes
 * y cierra media hora después, para el que llega justo y el que se acuerda al
 * salir. Se recorta al día para que un bloque de 23:45 no dé la vuelta.
 */
export function ventanaAbierta(
  horaInicio: string,
  horaFin: string,
  ahora: string,
  tolerancia = TOLERANCIA_ASISTENCIA_MIN,
): boolean {
  const desde = Math.max(0,    minutosDelDia(horaInicio) - tolerancia)
  const hasta = Math.min(1439, minutosDelDia(horaFin)    + tolerancia)
  const t = minutosDelDia(ahora)
  return t >= desde && t <= hasta
}

// `inicioVentana` explicaba al alumno a qué hora se abría su marcado. El
// alumno ya no se marca solo (migración 105), así que no queda nadie a quien
// explicarle.

export function diaLabel(dia: string): string {
  return DIAS.find(d => d.value === dia)?.label ?? dia
}

// getDay() usa domingo=0; la semana del club arranca el lunes.
const DIA_POR_INDICE: readonly DiaSemana[] = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

/**
 * El día de la semana de una fecha, sábado y domingo incluidos.
 *
 * Antes devolvía null el fin de semana ("el club no abre") y los llamadores
 * usaban ese null para dos cosas distintas: saber si hay clases y saber si la
 * semana en curso ya cerró. Son preguntas separadas desde que hay bloques de
 * fin de semana: para la segunda está `esDiaHabil`.
 */
export function diaDesdeFecha(fechaISO: string): DiaSemana {
  return DIA_POR_INDICE[new Date(`${fechaISO}T12:00:00`).getDay()]
}

/**
 * Si la fecha cae de lunes a viernes.
 *
 * Es la guarda de "no reescribir una semana cerrada": el sábado y el domingo
 * `fechasDeSemanaChile` apunta a la semana que ya terminó, y mover inscripciones
 * o asistencias ahí cambia algo que ya pasó y se contó. Que un club tenga
 * bloques de fin de semana no cambia eso.
 */
export function esDiaHabil(fechaISO: string): boolean {
  const d = new Date(`${fechaISO}T12:00:00`).getDay()
  return d >= 1 && d <= 5
}

/** Alias histórico: la clave cruda del día. Hoy es lo mismo que `diaDesdeFecha`. */
export const diaSemanaDeFecha = diaDesdeFecha

/** Un bloque, con lo justo para decidir desde cuándo vale estar inscrito en él. */
export type BloqueDiaHora = { id: string; dia_semana: string; hora_inicio: string }

/**
 * Desde cuándo vale cada inscripción nueva.
 *
 * Casi siempre es hoy: inscribir a alguien no puede darle un pasado que no
 * tuvo. Si arrancara antes, los días ya vencidos y sin lista le entran como
 * falta, y termina debiendo clases a las que nadie lo esperaba.
 *
 * La excepción es mover a alguien de día dentro del mismo horario —sale mié
 * 17:00, entra mar 17:00—: eso es la misma clase corrida de día, no una clase
 * nueva. Si el día nuevo ya pasó **en la semana que está corriendo**, la
 * inscripción tiene que alcanzarlo, porque la asistencia de esa semana se
 * traslada con él y si no quedaría parada en un día en que no figuraba inscrito.
 *
 * "La semana que está corriendo" es la parte fina. `fechasDeSemanaChile` cuenta
 * el domingo como día 7, y el sábado y el domingo cuentan como fin de semana: el domingo cierra la semana que ya
 * terminó entera. Cambiar a alguien de jueves a viernes un domingo lo metía en
 * la lista del viernes anterior y le movía la asistencia del jueves pasado:
 * reescribir una semana cerrada porque se tocó el horario el fin de semana. Por
 * eso solo se retrocede si hoy es día hábil.
 *
 * @param semana  Fechas lun-vie de la semana que `fechasDeSemanaChile` calcula.
 * @returns Por id de bloque que entra, su `vigente_desde`.
 */
export function iniciosDeInscripcion(params: {
  hoy: string
  semana: Record<string, string>
  salen: BloqueDiaHora[]
  entran: BloqueDiaHora[]
}): Map<string, string> {
  const { hoy, semana, salen, entran } = params
  const inicios = new Map<string, string>()
  for (const b of entran) inicios.set(b.id, hoy)

  // Fin de semana: no hay semana en curso que completar.
  if (!esDiaHabil(hoy)) return inicios

  for (const sale of salen) {
    const entra = entran.find(e => e.hora_inicio === sale.hora_inicio && e.dia_semana !== sale.dia_semana)
    if (!entra) continue
    const fechaNueva = semana[entra.dia_semana]
    if (fechaNueva && fechaNueva < hoy) inicios.set(entra.id, fechaNueva)
  }
  return inicios
}

// Acá vivían `lunesDeSemana`, `fechaISO` y `fechasDeSemana`: armaban la semana
// que la pantalla de Clases pedía generar. Esa pantalla y su tabla se
// eliminaron (migración 111) y estas tres quedaron llamándose solo entre
// ellas. Para la fecha de hoy en Chile está `fechaChile()`, que es la que
// corresponde: estas usaban la zona horaria del navegador.

/** Horas de inicio distintas, ordenadas: son las filas de la grilla. */
export function franjasDe(bloques: BloqueHorario[]): string[] {
  return [...new Set(bloques.map(b => hhmm(b.hora_inicio)))].sort()
}

/** Carga semanal de un profesor, en horas. */
export function horasSemanales(bloques: BloqueHorario[]): number {
  return bloques.reduce((total, b) => {
    const [hi, mi] = hhmm(b.hora_inicio).split(':').map(Number)
    const [hf, mf] = hhmm(b.hora_fin).split(':').map(Number)
    return total + (hf * 60 + mf - (hi * 60 + mi)) / 60
  }, 0)
}
