import { fechaChile } from '@/lib/domain/fechaChile'

export type EventoTecnico = {
  jugador_id?: string | null
  golpe_codigo: string
  zona_mesa: number | null
  resultado: string
  sesion_id?: string | null
  fecha?: string | null
  fase?: string | null
  tipo_error?: string | null
}

export type SesionTecnico = {
  id?: string
  jugador_id?: string | null
  fecha?: string | null
  tipo?: string | null
}

export type Ratings = {
  control: number
  ataque: number
  servicio: number
  regularidad: number
  eficacia: number
}

export type EfectividadGolpe = {
  codigo: string
  total: number
  ganados: number
  perdidos: number
  efectividad: number
}

export type ZonaHeat = {
  zona: number
  total: number
}

export type TipoErrorCount = {
  tipo: string
  total: number
}

export type FaseCount = {
  fase: string
  total: number
}

export type CalidadMuestra = 'baja' | 'media' | 'alta'

export type MetricasTecnicas = {
  eventos: number
  sesiones: number
  ganados: number
  perdidos: number
  enJuego: number
  efectividad: number
  errores: number
  errorRate: number
  servicio: number
  servicioGanado: number
  servicioEfectividad: number
  golpeMasUsado: string
  zonaMasUsada: number | null
  ratings: Ratings
  ratingPromedio: number
  /** Efectividad de puntos por golpe (SER/DER/REV/BLQ; ERR no aplica). */
  efectividadPorGolpe: EfectividadGolpe[]
  /** Conteo por zona 1–9. */
  zonas: ZonaHeat[]
  /** % de la mesa: corta (1–3), media (4–6), profunda (7–9). */
  zonasBandas: { corta: number; media: number; profunda: number; cortaPct: number; mediaPct: number; profundaPct: number }
  /** Eventos en juego / total. */
  enJuegoPct: number
  /** Eventos con resultado ganado o perdido / total. */
  puntosDecisivosPct: number
  /** Máxima racha de ERR consecutivos (por orden de aparición en el array). */
  rachaErroresMax: number
  /** 100 − % error, acotado. */
  consistencia: number
  /** Según volumen de eventos etiquetados. */
  calidadMuestra: CalidadMuestra
  calidadMuestraLabel: string
  /** Tipos de error (red / largo / fuera / otro) si se marcaron. */
  tiposError: TipoErrorCount[]
  /** Distribución por fase (servicio / peloteo / punto_decisivo). */
  porFase: FaseCount[]
}

const GOLPES_EFECTIVOS = ['SER', 'DER', 'REV', 'BLQ'] as const

export function metricasDe(
  eventos: EventoTecnico[],
  sesionesCount: number,
): MetricasTecnicas {
  const ganados = eventos.filter(e => e.resultado === 'punto_ganado').length
  const perdidos = eventos.filter(e => e.resultado === 'punto_perdido').length
  const enJuego = eventos.filter(e => e.resultado === 'en_juego').length
  const decisiones = ganados + perdidos
  const errores = eventos.filter(e => e.golpe_codigo === 'ERR').length
  const golpes = contar(eventos.map(e => e.golpe_codigo))
  const zonasRaw = contar(eventos.filter(e => e.zona_mesa).map(e => String(e.zona_mesa)))
  const servicio = eventos.filter(e => e.golpe_codigo === 'SER')
  const servicioGanado = servicio.filter(e => e.resultado === 'punto_ganado').length
  const efectividad = decisiones ? Math.round((ganados / decisiones) * 100) : 0
  const errorRate = eventos.length ? Math.round((errores / eventos.length) * 100) : 0
  const servicioEfectividad = servicio.length ? Math.round((servicioGanado / servicio.length) * 100) : 0
  const golpeMasUsado = Object.entries(golpes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
  const zonaMasUsada = Number(Object.entries(zonasRaw).sort((a, b) => b[1] - a[1])[0]?.[0]) || null

  const efectividadPorGolpe: EfectividadGolpe[] = GOLPES_EFECTIVOS.map(codigo => {
    const delGolpe = eventos.filter(e => e.golpe_codigo === codigo)
    const g = delGolpe.filter(e => e.resultado === 'punto_ganado').length
    const p = delGolpe.filter(e => e.resultado === 'punto_perdido').length
    const dec = g + p
    return {
      codigo,
      total: delGolpe.length,
      ganados: g,
      perdidos: p,
      efectividad: dec ? Math.round((g / dec) * 100) : 0,
    }
  })

  const zonas: ZonaHeat[] = Array.from({ length: 9 }, (_, i) => ({
    zona: i + 1,
    total: zonasRaw[String(i + 1)] ?? 0,
  }))
  const corta = zonas.slice(0, 3).reduce((a, z) => a + z.total, 0)
  const media = zonas.slice(3, 6).reduce((a, z) => a + z.total, 0)
  const profunda = zonas.slice(6, 9).reduce((a, z) => a + z.total, 0)
  const zonasConDato = corta + media + profunda
  const zonasBandas = {
    corta,
    media,
    profunda,
    cortaPct: zonasConDato ? Math.round((corta / zonasConDato) * 100) : 0,
    mediaPct: zonasConDato ? Math.round((media / zonasConDato) * 100) : 0,
    profundaPct: zonasConDato ? Math.round((profunda / zonasConDato) * 100) : 0,
  }

  const enJuegoPct = eventos.length ? Math.round((enJuego / eventos.length) * 100) : 0
  const puntosDecisivosPct = eventos.length ? Math.round((decisiones / eventos.length) * 100) : 0
  const rachaErroresMax = maxRachaErrores(eventos)
  const consistencia = Math.max(0, Math.min(100, 100 - errorRate))

  const calidadMuestra: CalidadMuestra =
    eventos.length >= 40 ? 'alta' : eventos.length >= 15 ? 'media' : 'baja'
  const calidadMuestraLabel =
    calidadMuestra === 'alta'
      ? 'Alta (≥40 eventos)'
      : calidadMuestra === 'media'
        ? 'Media (15–39 eventos)'
        : 'Baja (<15 eventos)'

  const tiposErrorMap = contar(
    eventos
      .filter(e => e.golpe_codigo === 'ERR' && e.tipo_error)
      .map(e => e.tipo_error as string),
  )
  const tiposError: TipoErrorCount[] = Object.entries(tiposErrorMap)
    .map(([tipo, total]) => ({ tipo, total }))
    .sort((a, b) => b.total - a.total)

  const fasesMap = contar(
    eventos.filter(e => e.fase).map(e => e.fase as string),
  )
  const porFase: FaseCount[] = Object.entries(fasesMap)
    .map(([fase, total]) => ({ fase, total }))
    .sort((a, b) => b.total - a.total)

  const ratings: Ratings = {
    control: consistencia,
    ataque: efectividad,
    servicio: servicioEfectividad,
    regularidad: Math.max(0, Math.min(100, consistencia + Math.min(20, Math.floor(eventos.length / 5)))),
    eficacia: efectividad,
  }

  return {
    eventos: eventos.length,
    sesiones: sesionesCount,
    ganados,
    perdidos,
    enJuego,
    efectividad,
    errores,
    errorRate,
    servicio: servicio.length,
    servicioGanado,
    servicioEfectividad,
    golpeMasUsado,
    zonaMasUsada,
    ratings,
    ratingPromedio: Math.round(Object.values(ratings).reduce((a, b) => a + b, 0) / 5),
    efectividadPorGolpe,
    zonas,
    zonasBandas,
    enJuegoPct,
    puntosDecisivosPct,
    rachaErroresMax,
    consistencia,
    calidadMuestra,
    calidadMuestraLabel,
    tiposError,
    porFase,
  }
}

function maxRachaErrores(eventos: EventoTecnico[]) {
  let max = 0
  let actual = 0
  for (const e of eventos) {
    if (e.golpe_codigo === 'ERR') {
      actual++
      if (actual > max) max = actual
    } else {
      actual = 0
    }
  }
  return max
}

export function contar(valores: string[]) {
  return valores.reduce<Record<string, number>>((resultado, valor) => {
    resultado[valor] = (resultado[valor] ?? 0) + 1
    return resultado
  }, {})
}

/** YYYY-MM desde fecha ISO date (Chile-ready if already date string). */
export function mesDeFecha(fecha: string | null | undefined) {
  if (!fecha || fecha.length < 7) return null
  return fecha.slice(0, 7)
}

export function etiquetaMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${nombres[(m || 1) - 1]} ${y}`
}

export function mesAnterior(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export type PuntoMensual = {
  mes: string
  etiqueta: string
  eventos: number
  efectividad: number
  errores: number
  sesiones: number
}

export function serieMensual(
  eventos: EventoTecnico[],
  sesiones: SesionTecnico[],
  meses = 6,
): PuntoMensual[] {
  const [yHoy, mHoy] = fechaChile().split('-').map(Number)
  const claves: string[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(yHoy, mHoy - 1 - i, 1))
    claves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  return claves.map(mes => {
    const evMes = eventos.filter(e => mesDeFecha(e.fecha) === mes)
    const sesMes = sesiones.filter(s => mesDeFecha(s.fecha) === mes)
    const m = metricasDe(evMes, sesMes.length)
    return {
      mes,
      etiqueta: etiquetaMes(mes),
      eventos: m.eventos,
      efectividad: m.efectividad,
      errores: m.errores,
      sesiones: m.sesiones,
    }
  })
}

export function filtrarPorRangoFecha<T extends { fecha?: string | null }>(
  items: T[],
  desde: string | null,
  hasta: string | null,
) {
  return items.filter(item => {
    if (!item.fecha) return false
    if (desde && item.fecha < desde) return false
    if (hasta && item.fecha > hasta) return false
    return true
  })
}

export function delta(actual: number, anterior: number) {
  return actual - anterior
}

export function textoDelta(valor: number, unidad = '') {
  if (valor === 0) return `= 0${unidad}`
  return `${valor > 0 ? '+' : ''}${valor}${unidad}`
}

export function faseAuto(golpe: string, resultado: string): string {
  if (golpe === 'SER') return 'servicio'
  if (resultado === 'punto_ganado' || resultado === 'punto_perdido') return 'punto_decisivo'
  return 'peloteo'
}

export const FASE_LABEL: Record<string, string> = {
  servicio: 'Servicio',
  peloteo: 'Peloteo',
  punto_decisivo: 'Punto decisivo',
  partido: 'Partido',
}

export const TIPO_ERROR_LABEL: Record<string, string> = {
  red: 'Red',
  largo: 'Largo',
  fuera: 'Fuera',
  otro: 'Otro',
}

export function etiquetaCalidad(calidad: CalidadMuestra) {
  if (calidad === 'alta') return 'Alta'
  if (calidad === 'media') return 'Media'
  return 'Baja'
}
