'use client'

import type { ReactNode } from 'react'
import { Tabs } from '@/components/ui/tabs'
import styles from './LandingModulesTabs.module.css'

function MockJugadores() {
  return (
    <div className={styles.mock}>
      <div className={styles.mockHead}>
        <span>Plantel</span>
        <em>+ Nuevo</em>
      </div>
      {['Ana Rojas · Sub-15', 'Matías Soto · Adulto', 'Valentina Díaz · Sub-13'].map((row) => (
        <div key={row} className={styles.mockRow}>
          <span className={styles.avatar} />
          <span>{row}</span>
          <b className={styles.ok}>Activo</b>
        </div>
      ))}
    </div>
  )
}

function MockAsistencia() {
  return (
    <div className={styles.mock}>
      <div className={styles.mockHead}>
        <span>Bloque Mar 18:00</span>
        <em>Hoy</em>
      </div>
      {[
        { n: 'Presente', c: styles.ok },
        { n: 'Presente', c: styles.ok },
        { n: 'Ausente', c: styles.bad },
        { n: 'Presente', c: styles.ok },
      ].map((row, i) => (
        <div key={i} className={styles.mockRow}>
          <span className={styles.dot} />
          <span>Jugador {i + 1}</span>
          <b className={row.c}>{row.n}</b>
        </div>
      ))}
    </div>
  )
}

function MockFinanzas() {
  return (
    <div className={styles.mock}>
      <div className={styles.mockHead}>
        <span>Mensualidades</span>
        <em>Marzo</em>
      </div>
      <div className={styles.kpiRow}>
        <div>
          <small>Pagado</small>
          <strong className={styles.ok}>$1.2M</strong>
        </div>
        <div>
          <small>Pendiente</small>
          <strong className={styles.warn}>$340mil</strong>
        </div>
      </div>
      <div className={styles.bars}>
        <i style={{ width: '78%' }} />
        <i style={{ width: '52%' }} />
        <i style={{ width: '64%' }} />
      </div>
    </div>
  )
}

function MockTorneos() {
  return (
    <div className={styles.mock}>
      <div className={styles.mockHead}>
        <span>Llave · Cuartos</span>
        <em>En vivo</em>
      </div>
      <div className={styles.bracket}>
        <div className={styles.match}>
          <span>Rojas</span>
          <b>3</b>
          <span>Soto</span>
          <b>1</b>
        </div>
        <div className={styles.match}>
          <span>Díaz</span>
          <b>2</b>
          <span>Pérez</span>
          <b>3</b>
        </div>
      </div>
      <p className={styles.live}>● Público puede seguir sin cuenta</p>
    </div>
  )
}

function Panel({
  title,
  description,
  points,
  visual,
}: {
  title: string
  description: string
  points: string[]
  visual: ReactNode
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelGrid}>
        <div>
          <p className={styles.panelTitle}>{title}</p>
          <p className={styles.panelDesc}>{description}</p>
          <ul className={styles.points}>
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div className={styles.shot}>{visual}</div>
      </div>
    </div>
  )
}

const TABS = [
  {
    title: 'Jugadores',
    value: 'jugadores',
    content: (
      <Panel
        title="Plantel y fichas"
        description="Alta y edición de jugadores con datos personales, médicos, apoderados y categorías."
        points={[
          'Estados activo / bloqueado',
          'Inscripción online con aprobación',
          'Filtros por sede, categoría y pago',
        ]}
        visual={<MockJugadores />}
      />
    ),
  },
  {
    title: 'Asistencia',
    value: 'asistencia',
    content: (
      <Panel
        title="Lista en cancha"
        description="El profesor pasa lista desde el celular. El club ve historial y alertas."
        points={[
          'Pase de lista por grupos',
          'Clases extraordinarias y sin clase',
          'Kiosco por RUT (opcional)',
        ]}
        visual={<MockAsistencia />}
      />
    ),
  },
  {
    title: 'Finanzas',
    value: 'finanzas',
    content: (
      <Panel
        title="Mensualidades y caja"
        description="Saber quién está al día y qué entra o sale del club, con trazabilidad."
        points={[
          'Mensualidades, mora y estado de cuenta',
          'Ingresos, gastos y sueldos',
          'Central de pago y reportes',
        ]}
        visual={<MockFinanzas />}
      />
    ),
  },
  {
    title: 'Torneos',
    value: 'torneos',
    content: (
      <Panel
        title="Competencia y ranking"
        description="Torneos internos y externos, llaves, ranking y vista en vivo."
        points={[
          'Grupos, playoffs y final',
          'Espectadores sin crear cuenta',
          'Ranking general e interno',
        ]}
        visual={<MockTorneos />}
      />
    ),
  },
]

export default function LandingModulesTabs() {
  return <Tabs tabs={TABS} />
}
