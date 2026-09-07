'use client'

import { useState } from 'react'
import { Check, X, Cloud } from 'lucide-react'
import styles from './HeroDemo.module.css'

// ponytail: demo de mentira, sin Supabase ni fetch. Es una vitrina del gesto
// "tomar lista", no el módulo real. Si algún día tiene que mostrar datos de
// verdad, va contra un club de demostración, no contra Buin.
const JUGADORES = [
  { nombre: 'Ana Rojas', cat: 'Sub-15' },
  { nombre: 'Matías Soto', cat: 'Adulto' },
  { nombre: 'Valentina Díaz', cat: 'Sub-13' },
  { nombre: 'Diego Fuentes', cat: 'Sub-17' },
  { nombre: 'Camila Vera', cat: 'Sub-15' },
]

const INICIAL = [true, true, false, true, false]

export default function HeroDemo() {
  const [presentes, setPresentes] = useState(INICIAL)
  const [pulso, setPulso] = useState(0)

  const total = presentes.length
  const cuantos = presentes.filter(Boolean).length
  const pct = Math.round((cuantos / total) * 100)

  function alternar(i: number) {
    setPresentes((prev) => prev.map((v, j) => (j === i ? !v : v)))
    setPulso((p) => p + 1)
  }

  return (
    <div className={styles.frame}>
      <div className={styles.chrome}>
        <span className={styles.dots} aria-hidden>
          <i /><i /><i />
        </span>
        <span className={styles.chromeTitle}>CMsports · Asistencia</span>
        <span className={styles.enVivo}>
          <span className={styles.latido} aria-hidden /> en vivo
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.bloque}>
          <span>Bloque Martes 18:00 · Sede Buin</span>
          <span className={styles.hoy}>Hoy</span>
        </div>

        <ul className={styles.lista}>
          {JUGADORES.map((j, i) => (
            <li key={j.nombre}>
              <button
                type="button"
                onClick={() => alternar(i)}
                className={styles.fila}
                data-presente={presentes[i]}
                data-guia={pulso === 0 && i === 2}
                aria-pressed={presentes[i]}
                aria-label={`${j.nombre}: marcar ${presentes[i] ? 'ausente' : 'presente'}`}
              >
                <span className={styles.avatar} aria-hidden>
                  {j.nombre.charAt(0)}
                </span>
                <span className={styles.nombre}>
                  {j.nombre}
                  <em>{j.cat}</em>
                </span>
                <span className={styles.estado}>
                  {presentes[i] ? <Check size={14} /> : <X size={14} />}
                  {presentes[i] ? 'Presente' : 'Ausente'}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <small>Presentes</small>
            <strong>{cuantos}/{total}</strong>
          </div>
          <div className={styles.kpiBarra}>
            <small>Asistencia del bloque</small>
            <div className={styles.barra}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <b>{pct}%</b>
          </div>
        </div>

        {/* la key remonta el nodo en cada toque, y eso repite la animación CSS */}
        <p key={pulso} className={styles.guardado}>
          <Cloud size={13} />
          {pulso === 0
            ? 'Toque un jugador para tomar la lista'
            : 'Guardado. El club lo ve al instante.'}
        </p>
      </div>
    </div>
  )
}
