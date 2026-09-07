import type { CSSProperties } from 'react'
import styles from './EncabezadoSeccion.module.css'

// Cada encabezado de sección dejaba ~650x130 px vacíos a la derecha. Ahí va un
// peloteo de tenis de mesa: la mesa, la red y la pelota recorriendo su
// trayectoria. Es decorativo —aria-hidden— y se esconde en móvil, donde no
// sobra ese espacio.

const RUTAS = [
  'M14,104 C86,12 232,12 306,104',
  'M14,100 Q84,18 160,100 T306,100',
  'M14,108 C70,40 130,96 176,60 C230,18 268,58 306,96',
]

export default function EncabezadoSeccion({
  label,
  titulo,
  intro,
  variante = 0,
}: {
  label: string
  titulo: string
  intro?: string
  variante?: number
}) {
  const ruta = RUTAS[variante % RUTAS.length]
  const duracion = `${4.5 + (variante % 3) * 1.2}s`

  return (
    <header className={styles.encabezado}>
      <div>
        <p className={styles.label}>{label}</p>
        <h2 className={styles.titulo}>{titulo}</h2>
        {intro && <p className={styles.intro}>{intro}</p>}
      </div>

      <svg
        className={styles.trazo}
        viewBox="0 0 320 140"
        role="presentation"
        aria-hidden
        focusable="false"
      >
        {/* mesa y red */}
        <path className={styles.mesa} d="M8,124 H312" />
        <path className={styles.red} d="M160,124 V104" />
        <path className={styles.pata} d="M40,124 V134 M280,124 V134" />

        {/* la trayectoria dibujada, y la pelota recorriéndola */}
        <path className={styles.estela} d={ruta} />
        <circle
          className={styles.pelota}
          r="5"
          style={{ '--ruta': `path('${ruta}')`, '--dur': duracion } as CSSProperties}
        />
      </svg>
    </header>
  )
}
