export type TipoCompetenciaExportable = 'torneo' | 'liga'
export type FormatoExportacionPartidos = 'csv' | 'json'

/** Contrato v1: null indica un dato no registrado, nunca un resultado inventado. */
export interface PartidoExportable {
  id: string
  fase: string | null
  ronda: number | null
  orden: number | null
  grupo_id: string | null
  grupo_nombre: string | null
  division_id: string | null
  division_nombre: string | null
  fecha: string | null
  hora: string | null
  encuentro_id: string | null
  numero_en_encuentro: number | null
  equipo_a_id: string | null
  equipo_a_nombre: string | null
  equipo_b_id: string | null
  equipo_b_nombre: string | null
  ganador_equipo_id: string | null
  jugador_a_id: string | null
  jugador_a_nombre: string | null
  jugador_a2_id: string | null
  jugador_a2_nombre: string | null
  jugador_b_id: string | null
  jugador_b_nombre: string | null
  jugador_b2_id: string | null
  jugador_b2_nombre: string | null
  ganador_id: string | null
  ganador_nombre: string | null
  sets_a: number | null
  sets_b: number | null
  puntos_a: number | null
  puntos_b: number | null
  parciales: [number, number][] | null
  es_walkover: boolean
  estado: string
}

export interface ExportacionPartidos {
  version: 1
  fecha_exportacion: string
  competencia: {
    tipo: TipoCompetenciaExportable
    id: string
    nombre: string
    modalidad: string | null
    fecha_inicio: string | null
    fecha_fin: string | null
  }
  partidos: PartidoExportable[]
}

export const COLUMNAS_PARTIDOS = [
  'id', 'fase', 'ronda', 'orden', 'grupo_id', 'grupo_nombre', 'division_id', 'division_nombre', 'fecha', 'hora',
  'encuentro_id', 'numero_en_encuentro', 'equipo_a_id', 'equipo_a_nombre', 'equipo_b_id', 'equipo_b_nombre', 'ganador_equipo_id',
  'jugador_a_id', 'jugador_a_nombre', 'jugador_a2_id', 'jugador_a2_nombre', 'jugador_b_id', 'jugador_b_nombre',
  'jugador_b2_id', 'jugador_b2_nombre', 'ganador_id', 'ganador_nombre', 'sets_a', 'sets_b', 'puntos_a', 'puntos_b',
  'parciales', 'es_walkover', 'estado',
] as const satisfies readonly (keyof PartidoExportable)[]

/** RFC 4180 + neutralización de fórmulas incluso tras espacios/control Unicode. */
export function celdaCsv(valor: unknown): string {
  let texto = valor == null ? '' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  if (/^[\s\u0000-\u001f\u007f\u200b-\u200f\ufeff]*[=+\-@]/u.test(texto) || /^[\t\r\n]/.test(texto)) texto = `'${texto}`
  return `"${texto.replace(/"/g, '""')}"`
}

export function serializarPartidos(datos: ExportacionPartidos, formato: FormatoExportacionPartidos): string {
  if (formato === 'json') return JSON.stringify(datos, null, 2)
  const cabecera = ['competencia_tipo', 'competencia_id', 'competencia_nombre', 'modalidad', 'competencia_fecha_inicio', 'competencia_fecha_fin', ...COLUMNAS_PARTIDOS]
  return '\ufeff' + [cabecera.map(celdaCsv).join(','), ...datos.partidos.map(p => [
    datos.competencia.tipo, datos.competencia.id, datos.competencia.nombre, datos.competencia.modalidad,
    datos.competencia.fecha_inicio, datos.competencia.fecha_fin, ...COLUMNAS_PARTIDOS.map(k => p[k]),
  ].map(celdaCsv).join(','))].join('\r\n') + '\r\n'
}

/** Suma días calendario al día de la jornada, sin conversiones a la hora UTC. */
export function fechaConOffset(fecha: string | null | undefined, offset = 0): string | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const [ano, mes, dia] = fecha.split('-').map(Number)
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + offset))
  return `${resultado.getUTCFullYear()}-${String(resultado.getUTCMonth() + 1).padStart(2, '0')}-${String(resultado.getUTCDate()).padStart(2, '0')}`
}
