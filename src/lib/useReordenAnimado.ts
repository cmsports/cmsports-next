'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { createLayout, type AutoLayout } from 'animejs'

/**
 * Anima el reordenamiento de una lista.
 *
 * Cuando entra un resultado y la tabla se reordena, React reusa los nodos y los
 * mueve de golpe: la fila que subió tres puestos aparece arriba sin que nadie
 * haya visto que subió. El cambio es justo lo que la pantalla existe para
 * mostrar y es lo único que no se ve.
 *
 * La técnica es FLIP: se guarda dónde estaba cada fila, se deja que React pinte
 * el orden nuevo, y se anima desde la posición vieja hasta la nueva. Acá lo hace
 * `createLayout` de anime.js, que además cubre los dos casos que la versión a
 * mano siempre olvida —filas que entran y filas que salen—.
 *
 * `clave` es la firma del orden actual (los ids concatenados). Solo cuando esa
 * firma cambia hay algo que animar.
 *
 * Devuelve la ref que va en el contenedor directo de las filas.
 */
export function useReordenAnimado<T extends HTMLElement>(
  clave: string,
  opciones: { duracion?: number; ease?: string } = {},
) {
  const { duracion = 550, ease = 'outQuint' } = opciones

  const contenedor = useRef<T>(null)
  const layout = useRef<AutoLayout | null>(null)
  const claveVista = useRef<string | null>(null)
  const pendiente = useRef(false)

  // La foto del "antes" se toma acá, en pleno render, y no en un efecto.
  //
  // Para cuando corre `useLayoutEffect` el DOM ya tiene el orden nuevo y las
  // posiciones viejas se perdieron. El render, en cambio, pasa antes de que
  // React toque nada: es el último instante en que el DOM todavía describe de
  // dónde viene cada fila.
  //
  // Y la foto no puede tomarse *después* de `animate()`: `record()` cancela el
  // timeline en curso antes de medir, así que grabar de vuelta en el mismo tick
  // mataba la animación recién arrancada y las filas saltaban igual que antes.
  //
  // `react-hooks/refs` prohíbe tocar refs en el render y tiene razón como regla
  // general, pero acá no hay alternativa: React no expone para componentes de
  // función el gancho "justo antes de mutar el DOM" que las clases tenían en
  // `getSnapshotBeforeUpdate`, y es exactamente el instante que FLIP necesita.
  // Solo se mide y se guarda; nada de esto influye en lo que el render devuelve,
  // que es el daño que la regla busca evitar.
  /* eslint-disable react-hooks/refs */
  if (claveVista.current !== null && claveVista.current !== clave && layout.current) {
    layout.current.record()
    pendiente.current = true
  }
  claveVista.current = clave
  /* eslint-enable react-hooks/refs */

  useLayoutEffect(() => {
    if (!contenedor.current) return

    // Quien pidió no ver movimiento no lo ve. La consulta va acá y no en el
    // render porque en el servidor no existe `matchMedia`.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    layout.current ??= createLayout(contenedor.current, { duration: duracion, ease })

    if (pendiente.current) {
      pendiente.current = false
      layout.current.animate()
    }
  })

  // `revert()` devuelve los estilos en línea que la animación dejó puestos. Sin
  // esto, desmontar a mitad de una animación deja las filas con un `transform`
  // congelado.
  useEffect(() => () => { layout.current?.revert() }, [])

  return contenedor
}
