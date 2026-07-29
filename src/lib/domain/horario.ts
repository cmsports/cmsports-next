// Horario semanal del club: la plantilla fija desde la que se generan las
// clases de cada semana. Cambia poco (rotación de profesores cada ~3 meses).

export const DIAS = [
  { value: 'lun', label: 'Lunes',     corto: 'Lun' },
  { value: 'mar', label: 'Martes',    corto: 'Mar' },
  { value: 'mie', label: 'Miércoles', corto: 'Mié' },
  { value: 'jue', label: 'Jueves',    corto: 'Jue' },
  { value: 'vie', label: 'Viernes',   corto: 'Vie' },
] as const

export type DiaSemana = typeof DIAS[number]['value']

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
const DIA_POR_INDICE: Record<number, DiaSemana | undefined> = {
  1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie',
}

export function diaDesdeFecha(fechaISO: string): DiaSemana | null {
  const d = new Date(`${fechaISO}T12:00:00`)
  return DIA_POR_INDICE[d.getDay()] ?? null
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
