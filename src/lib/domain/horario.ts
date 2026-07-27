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

/** El texto de a qué hora se abre, para explicarle al alumno por qué no puede. */
export function inicioVentana(horaInicio: string, tolerancia = TOLERANCIA_ASISTENCIA_MIN): string {
  const m = Math.max(0, minutosDelDia(horaInicio) - tolerancia)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function diaLabel(dia: string): string {
  return DIAS.find(d => d.value === dia)?.label ?? dia
}

// getDay() usa domingo=0; la semana del club arranca el lunes.
const DIA_POR_INDICE: Record<number, DiaSemana | undefined> = {
  1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie',
}

/**
 * El nombre largo que guarda `clases.dia_semana`: 'lunes', 'martes'…
 *
 * Las dos formas conviven porque el horario semanal usa la corta ('lun') y la
 * tabla de clases nació con la larga, con una restricción que la exige. Sin
 * esta conversión, generar la semana falla en cada fila.
 */
export function diaLargo(dia: string): string {
  return ({ lun: 'lunes', mar: 'martes', mie: 'miercoles', jue: 'jueves', vie: 'viernes' } as Record<string, string>)[dia] ?? dia
}

export function diaDesdeFecha(fechaISO: string): DiaSemana | null {
  const d = new Date(`${fechaISO}T12:00:00`)
  return DIA_POR_INDICE[d.getDay()] ?? null
}

/** Lunes de la semana con el desplazamiento indicado (0 = semana actual). */
export function lunesDeSemana(offset: number, hoy = new Date()): Date {
  const dia = hoy.getDay()
  const haciaLunes = dia === 0 ? 6 : dia - 1
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - haciaLunes + offset * 7)
  lunes.setHours(0, 0, 0, 0)
  return lunes
}

/** Fecha en formato YYYY-MM-DD sin pasar por UTC (evita correr un día). */
export function fechaISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Fecha de cada día hábil de la semana, indexada por día. */
export function fechasDeSemana(offset: number, hoy = new Date()): Record<DiaSemana, string> {
  const lunes = lunesDeSemana(offset, hoy)
  const fechas = {} as Record<DiaSemana, string>
  DIAS.forEach((d, i) => {
    const fecha = new Date(lunes)
    fecha.setDate(lunes.getDate() + i)
    fechas[d.value] = fechaISO(fecha)
  })
  return fechas
}

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
