/**
 * Retención y morosidad: cuándo avisar, cuándo alertar y cuándo bloquear.
 *
 * ── Esto actúa sobre personas ───────────────────────────────────────────
 *
 * Es el módulo más delicado del plan. Un umbral mal calculado bloquea a un
 * alumno que está al día, y quien se entera es él, en la puerta, delante de sus
 * compañeros.
 *
 * Por eso el archivo entero está escrito alrededor de tres reglas:
 *
 *   1. **El default es NUNCA.** Los umbrales en `0` significan "no hacer nada",
 *      que es lo que hace Buin hoy: bloquea a mano con `toggleEstadoJugador`.
 *      Un club que no configuró nada no puede empezar a bloquear gente.
 *
 *   2. **Nada de esto bloquea a nadie.** Estas funciones solo CALCULAN a quién
 *      le correspondería y por qué. Ejecutarlo es otra cosa, y el plan exige un
 *      mes de marcha en seco antes de encenderlo.
 *
 *   3. **Toda fecha es de Chile.** `new Date()` y `toISOString()` dan UTC, que
 *      en Chile adelanta el día — o sea, bloquear a alguien un día antes de
 *      tiempo. Es un bug conocido del proyecto y acá costaría caro.
 *
 * Ver `docs/plan-spinhouse-maestro.md` §7.4.
 */

import type { LectorConfig } from './clubConfig'

/** Una cuota emitida, tal como vive en `mensualidades`. */
export type Cuota = {
  mes: number
  anio: number
  estado: string
  monto?: number | null
}

/** Un registro de asistencia. La tabla guarda faltas además de presencias. */
export type Marca = {
  fecha: string
  estado: string
}

const PAGADA = new Set(['pagado', 'pagada'])

/** Si la cuota quedó saldada. Todo lo demás —pendiente, atrasado— es deuda. */
export function estaPagada(cuota: Cuota): boolean {
  return PAGADA.has((cuota.estado ?? '').toLowerCase())
}

/**
 * Las cuotas impagas, de la más vieja a la más nueva.
 *
 * Descarta las que no tienen monto: una cuota sin monto es "todavía no le
 * asignaron cuota", no una deuda. Cobrarle a alguien por una cuota que nadie
 * llegó a fijar sería exactamente el error que la migración 097 vino a evitar.
 */
export function cuotasImpagas(cuotas: readonly Cuota[]): Cuota[] {
  return cuotas
    .filter(c => !estaPagada(c) && (c.monto ?? 0) > 0)
    .sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes))
}

/** La fecha ISO en que vence la cuota de ese mes. */
export function vencimientoDe(cuota: Cuota, diaVencimiento: number): string {
  const dia = String(Math.min(Math.max(diaVencimiento, 1), 28)).padStart(2, '0')
  return `${cuota.anio}-${String(cuota.mes).padStart(2, '0')}-${dia}`
}

/** Días entre dos fechas ISO. Negativo si la segunda es anterior. */
export function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = new Date(`${desdeISO}T12:00:00`)
  const b = new Date(`${hastaISO}T12:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * Cuántos días lleva de mora, contados desde el vencimiento de su cuota impaga
 * más vieja.
 *
 * Cero si no debe nada, y también si su cuota más vieja todavía no venció: una
 * cuota emitida el día 1 y vencida el día 5 no está en mora el día 3.
 *
 * `hoyISO` se pasa siempre y nunca se calcula acá dentro, para que las pruebas
 * puedan fijar el día y para obligar a quien llame a usar `fechaChile()`.
 */
export function diasDeMora(params: {
  cuotas: readonly Cuota[]
  hoyISO: string
  diaVencimiento: number
}): number {
  const { cuotas, hoyISO, diaVencimiento } = params
  const impagas = cuotasImpagas(cuotas)
  if (impagas.length === 0) return 0

  const dias = diasEntre(vencimientoDe(impagas[0], diaVencimiento), hoyISO)
  return Math.max(0, dias)
}

/** Lo que le correspondería a un jugador según su mora. */
export type EstadoMorosidad = 'al_dia' | 'con_deuda' | 'para_avisar' | 'para_bloquear'

/**
 * Qué corresponde hacer con este jugador.
 *
 * Un umbral en `0` está apagado y **nunca** dispara, por muchos días de mora
 * que tenga. Ese cero es lo único que impide que un club en producción empiece
 * a bloquear alumnos de un día para otro.
 */
export function estadoDeMorosidad(config: LectorConfig, diasMora: number): EstadoMorosidad {
  if (diasMora <= 0) return 'al_dia'

  const bloqueo = config('morosidad.dias_bloqueo')
  if (bloqueo > 0 && diasMora >= bloqueo) return 'para_bloquear'

  const aviso = config('morosidad.dias_aviso')
  if (aviso > 0 && diasMora >= aviso) return 'para_avisar'

  return 'con_deuda'
}

/**
 * Cuántas clases seguidas faltó, contando desde la última hacia atrás.
 *
 * ⚠️ La tabla `asistencia` guarda faltas además de presencias, así que una
 * fecha sin registro **no es** una ausencia acá: es un día que nadie pasó lista.
 * Contar los huecos como faltas alertaría por un profe que se olvidó del
 * cuaderno, no por un alumno que dejó de venir.
 *
 * Un feriado tampoco rompe la racha, por la misma razón: no deja registro.
 */
export function faltasSeguidas(marcas: readonly Marca[]): number {
  const ordenadas = [...marcas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

  let seguidas = 0
  for (const m of ordenadas) {
    const estado = (m.estado ?? '').toLowerCase()
    if (estado === 'presente') break
    if (estado === 'ausente' || estado === 'falta') seguidas++
    // Cualquier otro estado —justificado, por ejemplo— no suma ni corta.
  }
  return seguidas
}

/** Si hay que alertar al profe por inasistencias. `0` = nunca. */
export function debeAlertarPorFaltas(config: LectorConfig, faltas: number): boolean {
  const umbral = config('retencion.faltas_alerta')
  return umbral > 0 && faltas >= umbral
}

/**
 * El mensaje que el profe le manda al apoderado desde la alerta.
 *
 * Viene redactado a propósito. Un botón que abre WhatsApp en blanco deja al
 * profe escribiendo de pie en la cancha, y ahí el mensaje o no sale o sale
 * seco. El plan (§8.5) lo pide redactado por eso.
 *
 * El tono es una decisión, no un descuido: **pregunta, no reclama.** El alumno
 * que faltó tres veces seguidas puede estar enfermo, castigado o aburrido, y
 * un mensaje que da por sentado lo último es el que termina de perderlo.
 *
 * No dice cuántas faltas ni menciona plata. Lo primero suena a lista de
 * asistencia de colegio; lo segundo no es asunto del profe —la matriz de
 * permisos le prohíbe ver montos— y mezclarlo convierte una pregunta por el
 * alumno en un cobro.
 */
export function mensajeFaltasApoderado(params: {
  nombreAlumno: string
  nombreClub?: string | null
}): string {
  const primerNombre = params.nombreAlumno.trim().split(/\s+/)[0] || params.nombreAlumno
  const club = params.nombreClub?.trim()
  return [
    `Hola! Te escribo de ${club || 'la escuela'}.`,
    `Notamos que ${primerNombre} no ha venido a las últimas clases. ¿Está todo bien?`,
    `Si necesita cambiar de horario o recuperar alguna clase, lo vemos sin problema. ¡Quedamos atentos!`,
  ].join(' ')
}

/**
 * Días desde el último signo de vida: una asistencia o un pago.
 *
 * `null` cuando no hay ninguno de los dos, que **no** es lo mismo que "muchos
 * días": puede ser alguien que se acaba de inscribir y todavía no vino. Marcarlo
 * inactivo por eso sería sacarlo del padrón el día que entra.
 */
export function diasSinMovimiento(params: {
  ultimaAsistenciaISO?: string | null
  ultimoPagoISO?: string | null
  hoyISO: string
}): number | null {
  const { ultimaAsistenciaISO, ultimoPagoISO, hoyISO } = params
  const fechas = [ultimaAsistenciaISO, ultimoPagoISO].filter(Boolean) as string[]
  if (fechas.length === 0) return null

  const masReciente = fechas.sort().at(-1)!
  return Math.max(0, diasEntre(masReciente, hoyISO))
}

/** Si corresponde marcarlo inactivo. `0` = nunca, y sin datos tampoco. */
export function debeMarcarseInactivo(config: LectorConfig, diasSin: number | null): boolean {
  const umbral = config('retencion.dias_inactivo')
  if (umbral <= 0 || diasSin == null) return false
  return diasSin >= umbral
}

// ── La marcha en seco ─────────────────────────────────────────────────────

export type JugadorParaRevisar = {
  id: string
  nombre: string
  cuotas: readonly Cuota[]
  marcas?: readonly Marca[]
  ultimaAsistenciaISO?: string | null
  ultimoPagoISO?: string | null
}

export type Veredicto = {
  id: string
  nombre: string
  diasMora: number
  deuda: number
  estado: EstadoMorosidad
  faltasSeguidas: number
  alertaPorFaltas: boolean
  diasSinMovimiento: number | null
  paraInactivar: boolean
  /** En castellano, para mostrarlo tal cual en la pantalla. */
  motivo: string
}

/**
 * Qué pasaría si esto estuviera encendido, sin encender nada.
 *
 * Es la pantalla que el plan exige revisar durante un mes antes de activar el
 * bloqueo automático. Si en ese mes aparece **un solo** falso positivo, no se
 * enciende: se corrige y se cuenta otro mes.
 */
export function simular(params: {
  config: LectorConfig
  jugadores: readonly JugadorParaRevisar[]
  hoyISO: string
}): Veredicto[] {
  const { config, jugadores, hoyISO } = params
  const diaVencimiento = config('morosidad.dia_vencimiento')

  return jugadores.map(j => {
    const impagas = cuotasImpagas(j.cuotas)
    const diasMora = diasDeMora({ cuotas: j.cuotas, hoyISO, diaVencimiento })
    const estado = estadoDeMorosidad(config, diasMora)
    const deuda = impagas.reduce((t, c) => t + (c.monto ?? 0), 0)

    const faltas = faltasSeguidas(j.marcas ?? [])
    const alertaPorFaltas = debeAlertarPorFaltas(config, faltas)

    const sinMovimiento = diasSinMovimiento({
      ultimaAsistenciaISO: j.ultimaAsistenciaISO,
      ultimoPagoISO: j.ultimoPagoISO,
      hoyISO,
    })
    const paraInactivar = debeMarcarseInactivo(config, sinMovimiento)

    const motivos: string[] = []
    if (estado === 'para_bloquear') {
      motivos.push(`${diasMora} días de mora y ${impagas.length} ${impagas.length === 1 ? 'cuota impaga' : 'cuotas impagas'}`)
    } else if (estado === 'para_avisar') {
      motivos.push(`${diasMora} días de mora`)
    }
    if (alertaPorFaltas) motivos.push(`${faltas} clases seguidas sin venir`)
    if (paraInactivar) motivos.push(`${sinMovimiento} días sin asistir ni pagar`)

    return {
      id: j.id,
      nombre: j.nombre,
      diasMora,
      deuda,
      estado,
      faltasSeguidas: faltas,
      alertaPorFaltas,
      diasSinMovimiento: sinMovimiento,
      paraInactivar,
      motivo: motivos.join(' · '),
    }
  })
}

/** Solo los que harían algo: para la pantalla, que muestra lo que pasaría. */
export function conAlgoQueHacer(veredictos: readonly Veredicto[]): Veredicto[] {
  return veredictos
    .filter(v => v.estado === 'para_bloquear' || v.estado === 'para_avisar' || v.alertaPorFaltas || v.paraInactivar)
    .sort((a, b) => b.diasMora - a.diasMora)
}
