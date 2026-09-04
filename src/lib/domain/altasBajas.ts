/**
 * Altas, bajas y reingresos de un mes.
 *
 * ── Por qué esto necesitaba una definición del club ────────────────────────
 *
 * El plan maestro (§7.2) dejó esta tarjeta bloqueada con una pregunta abierta,
 * y la pregunta era buena: el sistema tiene dos cosas que **no** son "se fue
 * del club" y confundirlas da tres números distintos.
 *
 *   · `bloque_jugadores.vigente_hasta` — dejó UN grupo. Puede haberse cambiado
 *     a otro el mismo día, y entonces no se fue de ninguna parte.
 *   · `jugadores.estado` — activo o bloqueado. Un bloqueado por deuda sigue
 *     siendo alumno del club; lo que tiene es una cuenta cerrada.
 *
 * El club respondió, y su respuesta es la que implementa este archivo:
 * **"cuántos alumnos ingresaron, cuántos dejaron de asistir o de pagar y
 * cuántos reingresaron"**. O sea: la unidad es *estar entrenando*, no *estar
 * en tal grupo* ni *tener la cuenta abierta*.
 *
 * De ahí salen las tres definiciones, y las tres se calculan de una sola tabla:
 *
 *   · **Alta** — su PRIMERA inscripción del club empieza dentro del mes.
 *   · **Baja** — terminó el mes sin ninguna inscripción vigente, habiendo
 *     tenido alguna durante el mes.
 *   · **Reingreso** — abrió una inscripción en el mes, ya tenía historial y
 *     **no** venía vigente de antes.
 *
 * ── El caso que hay que no romper ─────────────────────────────────────────
 *
 * Cambiar de grupo cierra una inscripción y abre otra. Si "baja" fuera "se le
 * cerró una inscripción", cada cambio de horario sería una baja y la tarjeta
 * mostraría una deserción que no ocurrió. Por eso baja se define por el
 * **final del mes**, mirando si le quedó alguna vigente, y no por el cierre.
 * Es el caso 4 de las pruebas y es el que da sentido a toda la tarjeta.
 *
 * Las fechas son strings ISO `YYYY-MM-DD`, que se comparan bien con `<` y `>`
 * y evitan la clase entera de bugs de zona horaria. El mes se pasa desde
 * afuera, calculado con `fechaChile()`: acá dentro no se llama a `new Date()`.
 */

/** Una fila de `bloque_jugadores`, con lo mínimo que hace falta. */
export type Inscripcion = {
  jugadorId: string
  /** `vigente_desde`, siempre presente: es NOT NULL en la base. */
  desde: string
  /** `vigente_hasta`. `null` = sigue vigente. */
  hasta: string | null
}

export type Mes = { desde: string; hasta: string }

export type AltasBajas = {
  altas: number
  bajas: number
  reingresos: number
  /** altas + reingresos − bajas. Cuánto creció o se encogió el padrón. */
  neto: number
}

/** ¿Estaba vigente esa inscripción ese día? Ambos extremos cuentan. */
function vigenteEl(i: Inscripcion, fecha: string): boolean {
  return i.desde <= fecha && (i.hasta === null || i.hasta >= fecha)
}

export function altasYBajasDelMes(
  inscripciones: readonly Inscripcion[],
  mes: Mes,
): AltasBajas {
  const porJugador = new Map<string, Inscripcion[]>()
  for (const i of inscripciones) {
    porJugador.set(i.jugadorId, [...(porJugador.get(i.jugadorId) ?? []), i])
  }

  let altas = 0, bajas = 0, reingresos = 0

  for (const suyas of porJugador.values()) {
    const primera = suyas.reduce((min, i) => (i.desde < min ? i.desde : min), suyas[0].desde)

    // Venía de antes: tenía una inscripción abierta antes de que empezara el
    // mes. Es lo que distingue a un reingreso de alguien que nunca se fue.
    const veniaDeAntes = suyas.some(i => i.desde < mes.desde && vigenteEl(i, mes.desde))
    const empezoEnElMes = suyas.some(i => i.desde >= mes.desde && i.desde <= mes.hasta)
    const sigueAlFinal  = suyas.some(i => vigenteEl(i, mes.hasta))
    const estuvoEnElMes = veniaDeAntes || empezoEnElMes

    const esAlta = primera >= mes.desde && primera <= mes.hasta

    if (esAlta) altas++
    else if (empezoEnElMes && !veniaDeAntes) reingresos++

    // Baja: terminó el mes sin nada vigente, habiendo estado en él. El que ya
    // se había ido en un mes anterior no vuelve a contar como baja todos los
    // meses siguientes.
    if (estuvoEnElMes && !sigueAlFinal) bajas++
  }

  return { altas, bajas, reingresos, neto: altas + reingresos - bajas }
}
