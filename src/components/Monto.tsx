'use client'

/**
 * Una cifra de dinero que respeta el interruptor global del ojito.
 *
 * Se usa en lugar de escribir el monto formateado a mano:
 *
 *     <Monto valor={ingresos} />              // $5.054.613  ·  $ •••••
 *     <Monto valor={saldo} sinSimbolo />      // 5.054.613   ·  •••••
 *
 * Cuando los montos están ocultos muestra puntos en vez de la cifra, pero
 * conserva el símbolo y el color para que la pantalla no se desarme: el
 * usuario sigue viendo dónde hay plata, solo que no cuánta.
 */

import { useMontos } from '@/lib/ui/MontosProvider'
import { formatCLP } from '@/lib/domain/finanzas'

const OCULTO = '•••••'

export default function Monto({
  valor,
  sinSimbolo = false,
  className,
  style,
}: {
  valor: number | null | undefined
  sinSimbolo?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const { ocultos } = useMontos()

  if (ocultos) {
    return (
      <span className={className} style={style} aria-label="Monto oculto">
        {sinSimbolo ? OCULTO : `$ ${OCULTO}`}
      </span>
    )
  }

  const texto = sinSimbolo
    ? (valor ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })
    : formatCLP(valor)

  return <span className={className} style={style}>{texto}</span>
}

/**
 * Para los lugares donde el monto no puede ser un elemento aparte —el texto de
 * un botón, un `title`, una celda que ya arma su propio string—. Devuelve el
 * texto ya resuelto según el interruptor.
 */
export function useTextoMonto() {
  const { ocultos } = useMontos()
  return (valor: number | null | undefined, sinSimbolo = false) => {
    if (ocultos) return sinSimbolo ? OCULTO : `$ ${OCULTO}`
    return sinSimbolo
      ? (valor ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })
      : formatCLP(valor)
  }
}
