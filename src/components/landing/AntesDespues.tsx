'use client'

import { motion } from 'motion/react'
import styles from './AntesDespues.module.css'

export default function AntesDespues() {
  return (
    <div className={styles.wrap}>
      <motion.div
        className={styles.card}
        initial={{ opacity: 0.55, x: 0 }}
        animate={{ opacity: [0.55, 0.35, 0.55], x: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <p className={styles.tagAntes}>Antes</p>
        <p className={styles.cardTitle}>Excel + WhatsApp + cuadernos</p>
        <ul>
          <li>Planilla_mensualidades_FINAL_v7.xlsx</li>
          <li>Lista asistencia (foto del chat)</li>
          <li>¿Quién pagó? — nadie sabe</li>
          <li>Torneo en papel</li>
        </ul>
        <div className={styles.fakeSheet} aria-hidden>
          <span /><span /><span /><span />
          <span /><span /><span /><span />
          <span /><span /><span /><span />
        </div>
      </motion.div>

      <motion.div
        className={styles.arrow}
        animate={{ x: [0, 8, 0], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      >
        →
      </motion.div>

      <motion.div
        className={`${styles.card} ${styles.cardDespues}`}
        initial={{ opacity: 1 }}
        animate={{ boxShadow: ['0 0 0 rgba(56,189,248,0)', '0 0 28px rgba(56,189,248,0.35)', '0 0 0 rgba(56,189,248,0)'] }}
        transition={{ duration: 3.2, repeat: Infinity }}
      >
        <p className={styles.tagDespues}>Con CMsports</p>
        <p className={styles.cardTitle}>Todo en un solo sistema</p>
        <ul>
          <li>Plantel y fichas al día</li>
          <li>Asistencia desde el celular</li>
          <li>Finanzas con trazabilidad</li>
          <li>Torneos y ranking en vivo</li>
        </ul>
        <div className={styles.fakeApp} aria-hidden>
          <div className={styles.appBar} />
          <div className={styles.appRows}>
            <i /><i /><i />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
