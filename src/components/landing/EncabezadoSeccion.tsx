import styles from './EncabezadoSeccion.module.css'

// Encabezado común de las secciones: etiqueta, título e intro. Antes estas
// tres etiquetas iban sueltas y repetidas en cada sección.

export default function EncabezadoSeccion({
  label,
  titulo,
  intro,
}: {
  label: string
  titulo: string
  intro?: string
}) {
  return (
    <header className={styles.encabezado}>
      <p className={styles.label}>{label}</p>
      <h2 className={styles.titulo}>{titulo}</h2>
      {intro && <p className={styles.intro}>{intro}</p>}
    </header>
  )
}
