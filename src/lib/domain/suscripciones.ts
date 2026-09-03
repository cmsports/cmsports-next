import { fechaChile } from '@/lib/domain/fechaChile'

export type EstadoPlan = 'prueba' | 'activo' | 'suspendido' | 'cancelado'

export function sumarMesesISO(fecha: string, meses = 1): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const indiceMes = mes - 1 + meses
  const anioDestino = anio + Math.floor(indiceMes / 12)
  const mesDestino = ((indiceMes % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate()
  return `${anioDestino}-${String(mesDestino + 1).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`
}

/**
 * Hoy en Chile. Los vencimientos son fechas, no instantes.
 *
 * Antes salía de la hora local del servidor: en Vercel eso es UTC, así que
 * entre las 21:00 y la medianoche de Chile ya contaba el día siguiente y un
 * plan aparecía vencido varias horas antes de tiempo. Es el mismo arreglo que
 * ya se hizo en `actions/horario.ts` y en `dashboard_kpis`.
 */
export function hoyISO(): string {
  return fechaChile()
}

export function planVencido(estado: EstadoPlan | string | null, proximoVencimiento: string | null, hoy = hoyISO()): boolean {
  return estado === 'activo' && !!proximoVencimiento && proximoVencimiento <= hoy
}

export function diasParaVencimiento(proximoVencimiento: string, hoy = hoyISO()): number {
  const a = Date.parse(`${hoy}T00:00:00Z`)
  const b = Date.parse(`${proximoVencimiento}T00:00:00Z`)
  return Math.ceil((b - a) / 86_400_000)
}

/**
 * Próximo vencimiento después de registrar el pago de un período.
 *
 * Antes era `sumarMesesISO(proximo_vencimiento)`: cada pago empujaba la fecha
 * un mes desde donde estuviera parada. Como activar el plan YA deja el
 * vencimiento un mes después del inicio, registrar el pago del primer mes lo
 * corría un mes de más — un plan que parte el 1 de agosto quedaba venciendo el
 * 1 de octubre en vez del 1 de septiembre.
 *
 * Ahora se ancla en la fecha de inicio: el vencimiento es el inicio más tantos
 * meses como períodos pagados lleve. Así es idempotente (registrar dos veces
 * el mismo mes no mueve nada) y no acumula error con el tiempo.
 *
 * Nunca retrocede: registrar un mes atrasado cuando ya se pagaron otros
 * posteriores conserva el vencimiento más lejano.
 */
export function vencimientoTrasPago(params: {
  fechaInicioPlan: string | null
  proximoVencimiento: string | null
  periodoMes: number
  periodoAnio: number
}): string | null {
  const { fechaInicioPlan, proximoVencimiento, periodoMes, periodoAnio } = params
  if (!fechaInicioPlan) return proximoVencimiento
  const [anioInicio, mesInicio] = fechaInicioPlan.split('-').map(Number)
  const periodosPagados = (periodoAnio - anioInicio) * 12 + (periodoMes - mesInicio) + 1
  if (periodosPagados < 1) return proximoVencimiento
  const calculado = sumarMesesISO(fechaInicioPlan, periodosPagados)
  // Fechas ISO: el orden lexicográfico es el orden cronológico.
  return !proximoVencimiento || calculado > proximoVencimiento ? calculado : proximoVencimiento
}

type ClubPlan = {
  estado_plan: string | null
  plan_mensual: number | null
  proximo_vencimiento: string | null
}

/**
 * Métricas de suscripción para los paneles del superadmin.
 *
 * Todo se cuenta SOLO sobre los clubes con plan activo. Los de prueba no son
 * clientes: inflaban el denominador ("2 de 4 al día" con un solo club real
 * pagando) y hacían ilegible el panel. `totalClubes` queda disponible aparte
 * para mostrarlo como contexto, no como denominador.
 *
 * Vive acá y no en cada pantalla porque /superadmin y /superadmin/finanzas
 * mostraban dos definiciones distintas de "al día": una miraba `estado_pago`
 * y la otra el vencimiento, así que se contradecían entre sí.
 */
export function metricasPlanes(clubes: ClubPlan[], hoy = hoyISO()) {
  const activos = clubes.filter(c => c.estado_plan === 'activo')
  const vencidos = activos.filter(c => planVencido(c.estado_plan, c.proximo_vencimiento, hoy))
  return {
    totalClubes: clubes.length,
    activos: activos.length,
    mrr: activos.reduce((total, c) => total + (c.plan_mensual || 0), 0),
    vencidos: vencidos.length,
    alDia: activos.length - vencidos.length,
  }
}

export type ConceptoPago = 'mensualidad' | 'implementacion' | 'soporte' | 'otro'

export const CONCEPTOS: { valor: ConceptoPago; label: string }[] = [
  { valor: 'mensualidad', label: 'Mensualidad' },
  { valor: 'implementacion', label: 'Implementación' },
  { valor: 'soporte', label: 'Soporte / desarrollo' },
  { valor: 'otro', label: 'Otro' },
]

export const LABEL_CONCEPTO = Object.fromEntries(CONCEPTOS.map(c => [c.valor, c.label])) as Record<string, string>

type PagoRecibido = { club_id: string; monto: number | null; fecha_pago: string }
type GastoEmpresa = { monto: number | null; fecha: string }

const suma = (filas: { monto: number | null }[]) => filas.reduce((total, f) => total + Number(f.monto || 0), 0)

/**
 * Las cuentas de CmSports: lo que entró, lo que salió y el acumulado por club.
 *
 * ── El mes se mide por `fecha_pago`, no por el período ───────────────────
 *
 * Antes "cobrado este mes" filtraba por `periodo_mes`/`periodo_anio`, o sea
 * por el mes que el pago CUBRE. Con el historial andando eso se rompe solo:
 * registrar hoy la implementación que Buin pagó hace meses aparecería como
 * plata entrada este mes, y un pago adelantado de octubre no aparecería
 * nunca. La caja se mide por la fecha en que la plata llegó; el período sigue
 * sirviendo para saber qué mes quedó cubierto, que es otra pregunta.
 *
 * ── Por qué el acumulado se calcula acá y no en SQL ──────────────────────
 *
 * Son cuatro clubes y unas decenas de pagos. Una vista o un `group by` en la
 * base sería una migración más para mantener y un lugar más donde la
 * definición de "total" pueda divergir de la de la pantalla.
 */
export function resumenCmsports(pagos: PagoRecibido[], gastos: GastoEmpresa[], hoy = hoyISO()) {
  const mes = hoy.slice(0, 7)
  const delMes = <T extends { fecha: string }>(f: T) => f.fecha.slice(0, 7) === mes

  const ingresos = suma(pagos)
  const egresos = suma(gastos)

  const porClub = new Map<string, { total: number; pagos: number; ultimo: string | null }>()
  for (const p of pagos) {
    const acum = porClub.get(p.club_id) || { total: 0, pagos: 0, ultimo: null }
    acum.total += Number(p.monto || 0)
    acum.pagos += 1
    // Fechas ISO: el orden lexicográfico es el cronológico.
    if (!acum.ultimo || p.fecha_pago > acum.ultimo) acum.ultimo = p.fecha_pago
    porClub.set(p.club_id, acum)
  }

  return {
    ingresos,
    egresos,
    balance: ingresos - egresos,
    ingresosMes: suma(pagos.filter(p => delMes({ fecha: p.fecha_pago }))),
    egresosMes: suma(gastos.filter(delMes)),
    porClub,
  }
}
