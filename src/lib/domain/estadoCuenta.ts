// Lo que el jugador debe, visto desde su lado.
//
// LO QUE ARREGLA. "Mi Estado de Cuenta" mostraba un solo número —la mensualidad
// del mes— y lo presentaba como si fuera la deuda. No lo era: las clases
// extraordinarias son plata que se le cobra y viven en otra tabla, así que el
// admin las veía en Finanzas y el jugador no las veía en ninguna parte. El caso
// concreto: Jonathan con $35.000 en pantalla y $3.000 de una clase extra que
// nadie le había mostrado. Se entera cuando le cobran.
//
// POR QUÉ NO SE SUMAN A LA MENSUALIDAD. Porque no son la mensualidad: se cobran
// con otro RPC, generan otro movimiento y pueden quedar impagas cuando el mes ya
// está pagado. La migración 099 lo dejó escrito —"El cobro NO se suma al monto
// de la mensualidad"— y mutar la cuota rompería la corrección histórica. Acá se
// suman solo para mostrar un total; cada deuda sigue siendo la suya.
//
// LOS TRES MONTOS DE UNA CLASE EXTRA no son grados de lo mismo, son estados
// distintos, y mezclarlos es lo que hace que un total mienta:
//
//   null  nadie le puso precio todavía  → no es deuda, pero se avisa
//   0     el profe debía esa clase      → no es deuda, y conviene decirlo
//   > 0   tiene precio y no está pagada → esto sí es deuda

export type ClaseExtraJugador = {
  id: string
  fecha: string
  monto: number | null
  pagada_en: string | null
}

export type MensualidadJugador = {
  monto?: number | null
  estado?: string | null
} | null | undefined

export type CuentaJugador = {
  /** Lo que debe de mensualidad: 0 si está pagada. */
  mensualidad: number
  /** Suma de las clases extra con precio y sin pagar. */
  extras: number
  /** Lo que tiene que pagar hoy, todo junto. */
  total: number
  /** Con precio y sin pagar: las que suman. */
  porCobrar: ClaseExtraJugador[]
  /** Precio 0 — el profe debía la clase. */
  sinCargo: ClaseExtraJugador[]
  /** Todavía sin precio asignado. */
  sinMonto: ClaseExtraJugador[]
  /** Ya cobradas, para el historial. */
  pagadas: ClaseExtraJugador[]
}

/** Las más nuevas primero, que es como se leen. */
function porFechaDesc(a: ClaseExtraJugador, b: ClaseExtraJugador) {
  return b.fecha.localeCompare(a.fecha)
}

/**
 * Reparte las clases extra según su estado y arma el total real.
 *
 * `pagada_en` manda sobre el monto: una clase pagada no vuelve a ser deuda
 * aunque tenga precio. Se mira primero por eso.
 */
export function cuentaDelJugador(
  mensualidad: MensualidadJugador,
  extras: ClaseExtraJugador[] | null | undefined,
): CuentaJugador {
  // 'exento' es un mes que el club decidio no cobrar ("no vino este mes"), asi
  // que al jugador no se le muestra como deuda igual que uno pagado. Lo unico
  // que los distingue es que el exento no genero ingreso en Finanzas.
  const debeMensualidad =
    mensualidad?.estado === 'pagado' || mensualidad?.estado === 'exento'
      ? 0
      : Number(mensualidad?.monto ?? 0)

  const porCobrar: ClaseExtraJugador[] = []
  const sinCargo: ClaseExtraJugador[] = []
  const sinMonto: ClaseExtraJugador[] = []
  const pagadas: ClaseExtraJugador[] = []

  for (const e of extras ?? []) {
    if (e.pagada_en) pagadas.push(e)
    else if (e.monto == null) sinMonto.push(e)
    else if (e.monto <= 0) sinCargo.push(e)
    else porCobrar.push(e)
  }

  const totalExtras = porCobrar.reduce((suma, e) => suma + (e.monto ?? 0), 0)

  return {
    mensualidad: debeMensualidad,
    extras: totalExtras,
    total: debeMensualidad + totalExtras,
    porCobrar: porCobrar.sort(porFechaDesc),
    sinCargo: sinCargo.sort(porFechaDesc),
    sinMonto: sinMonto.sort(porFechaDesc),
    pagadas: pagadas.sort(porFechaDesc),
  }
}

/**
 * Si al jugador le falta pagar algo aparte de la mensualidad.
 *
 * Sirve para decidir si vale la pena mostrarle un total combinado: cuando lo
 * único que debe es la cuota, el total repetiría el número de arriba.
 */
export function tieneExtrasPendientes(cuenta: CuentaJugador): boolean {
  return cuenta.porCobrar.length > 0
}
