'use client'

import { useState } from 'react'
import { Check, X, Cloud, ClipboardList, Wallet, Trophy } from 'lucide-react'
import styles from './HeroDemo.module.css'

// ponytail: demo de mentira, sin Supabase ni fetch. Es una vitrina de los
// gestos —tomar lista, cobrar, cargar un resultado—, no los módulos reales. Si
// algún día tiene que mostrar datos de verdad, va contra un club de
// demostración, nunca contra Buin.

const JUGADORES = [
  { nombre: 'Ana Rojas', cat: 'Sub-15' },
  { nombre: 'Matías Soto', cat: 'Adulto' },
  { nombre: 'Valentina Díaz', cat: 'Sub-13' },
  { nombre: 'Diego Fuentes', cat: 'Sub-17' },
  { nombre: 'Camila Vera', cat: 'Sub-15' },
]

const CUOTAS = [
  { nombre: 'Ana Rojas', monto: 25000 },
  { nombre: 'Matías Soto', monto: 30000 },
  { nombre: 'Valentina Díaz', monto: 25000 },
  { nombre: 'Diego Fuentes', monto: 25000 },
]

const PARTIDOS = [
  { a: 'Rojas', b: 'Soto' },
  { a: 'Díaz', b: 'Pérez' },
  { a: 'Fuentes', b: 'Vera' },
]

const MODULOS = [
  { id: 'asistencia', label: 'Asistencia', icon: ClipboardList },
  { id: 'finanzas', label: 'Finanzas', icon: Wallet },
  { id: 'torneos', label: 'Torneos', icon: Trophy },
] as const

type Modulo = (typeof MODULOS)[number]['id']

const pesos = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

function Asistencia({ avisar }: { avisar: (t: string) => void }) {
  const [presentes, setPresentes] = useState([true, true, false, true, false])

  const cuantos = presentes.filter(Boolean).length
  const pct = Math.round((cuantos / presentes.length) * 100)

  return (
    <>
      <div className={styles.bloque}>
        <span>Bloque Martes 18:00 · Sede Buin</span>
        <span className={styles.hoy}>Hoy</span>
      </div>

      <ul className={styles.lista}>
        {JUGADORES.map((j, i) => (
          <li key={j.nombre}>
            <button
              type="button"
              onClick={() => {
                setPresentes((prev) => prev.map((v, k) => (k === i ? !v : v)))
                avisar(presentes[i] ? `${j.nombre} queda ausente` : `${j.nombre} queda presente`)
              }}
              className={styles.fila}
              data-tono={presentes[i] ? 'ok' : 'bad'}
              aria-pressed={presentes[i]}
              aria-label={`${j.nombre}: marcar ${presentes[i] ? 'ausente' : 'presente'}`}
            >
              <span className={styles.avatar} aria-hidden>{j.nombre.charAt(0)}</span>
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
          <strong>{cuantos}/{presentes.length}</strong>
        </div>
        <div className={styles.kpiBarra}>
          <small>Asistencia del bloque</small>
          <div className={styles.barra}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <b>{pct}%</b>
        </div>
      </div>
    </>
  )
}

function Finanzas({ avisar }: { avisar: (t: string) => void }) {
  const [pagadas, setPagadas] = useState([true, false, false, false])

  const total = CUOTAS.reduce((s, c) => s + c.monto, 0)
  const cobrado = CUOTAS.reduce((s, c, i) => s + (pagadas[i] ? c.monto : 0), 0)
  const pct = Math.round((cobrado / total) * 100)

  return (
    <>
      <div className={styles.bloque}>
        <span>Mensualidades · Marzo</span>
        <span className={styles.hoy}>Al día</span>
      </div>

      <ul className={styles.lista}>
        {CUOTAS.map((c, i) => (
          <li key={c.nombre}>
            <button
              type="button"
              onClick={() => {
                setPagadas((prev) => prev.map((v, k) => (k === i ? !v : v)))
                avisar(pagadas[i] ? `Se revirtió el pago de ${c.nombre}` : `Pago de ${c.nombre} registrado`)
              }}
              className={styles.fila}
              data-tono={pagadas[i] ? 'ok' : 'warn'}
              aria-pressed={pagadas[i]}
              aria-label={`${c.nombre}: marcar como ${pagadas[i] ? 'pendiente' : 'pagada'}`}
            >
              <span className={styles.avatar} aria-hidden>{c.nombre.charAt(0)}</span>
              <span className={styles.nombre}>
                {c.nombre}
                <em>{pesos.format(c.monto)}</em>
              </span>
              <span className={styles.estado}>
                {pagadas[i] ? <Check size={14} /> : <X size={14} />}
                {pagadas[i] ? 'Pagada' : 'Pendiente'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <small>Recaudado</small>
          <strong>{pesos.format(cobrado)}</strong>
        </div>
        <div className={styles.kpiBarra}>
          <small>Del mes</small>
          <div className={styles.barra}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <b>{pct}%</b>
        </div>
      </div>
    </>
  )
}

function Torneos({ avisar }: { avisar: (t: string) => void }) {
  // [sets de a, sets de b] por partido
  const [marcador, setMarcador] = useState([[3, 1], [2, 2], [0, 0]])

  // Al mejor de 5: el tercer set cierra el partido. Pasado eso los dos botones
  // quedan `disabled`, que es lo único que impide seguir sumando.
  function anotar(i: number, lado: 0 | 1) {
    const m = marcador[i]
    const nuevo = lado === 0 ? [m[0] + 1, m[1]] : [m[0], m[1] + 1]
    setMarcador((prev) => prev.map((v, k) => (k === i ? nuevo : v)))

    const quien = lado === 0 ? PARTIDOS[i].a : PARTIDOS[i].b
    avisar(Math.max(...nuevo) >= 3 ? `${quien} gana el partido` : `Set para ${quien}`)
  }

  const cerrados = marcador.filter((m) => Math.max(...m) >= 3).length

  return (
    <>
      <div className={styles.bloque}>
        <span>Torneo Otoño · Cuartos</span>
        <span className={styles.hoy}>En vivo</span>
      </div>

      <ul className={styles.lista}>
        {PARTIDOS.map((p, i) => {
          const [sa, sb] = marcador[i]
          const listo = Math.max(sa, sb) >= 3
          return (
            <li key={p.a} className={styles.partido} data-listo={listo}>
              <button
                type="button"
                className={styles.lado}
                data-gana={listo && sa > sb}
                onClick={() => anotar(i, 0)}
                disabled={listo}
                aria-label={`Sumar un set a ${p.a}`}
              >
                {p.a}
              </button>
              <span className={styles.sets}>{sa}<i>–</i>{sb}</span>
              <button
                type="button"
                className={styles.lado}
                data-gana={listo && sb > sa}
                onClick={() => anotar(i, 1)}
                disabled={listo}
                aria-label={`Sumar un set a ${p.b}`}
              >
                {p.b}
              </button>
            </li>
          )
        })}
      </ul>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <small>Cerrados</small>
          <strong>{cerrados}/{PARTIDOS.length}</strong>
        </div>
        <div className={styles.kpiBarra}>
          <small>Avance de la ronda</small>
          <div className={styles.barra}>
            <i style={{ width: `${Math.round((cerrados / PARTIDOS.length) * 100)}%` }} />
          </div>
          <b>{Math.round((cerrados / PARTIDOS.length) * 100)}%</b>
        </div>
      </div>
    </>
  )
}

const PISTA: Record<Modulo, string> = {
  asistencia: 'Toque un jugador para tomar la lista',
  finanzas: 'Toque una cuota para registrar el pago',
  torneos: 'Toque al ganador de cada set',
}

export default function HeroDemo() {
  const [modulo, setModulo] = useState<Modulo>('asistencia')
  const [aviso, setAviso] = useState<string | null>(null)
  const [pulso, setPulso] = useState(0)

  function avisar(texto: string) {
    setAviso(texto)
    setPulso((p) => p + 1)
  }

  function cambiar(id: Modulo) {
    setModulo(id)
    setAviso(null)
    setPulso(0)
  }

  return (
    <div className={styles.frame}>
      <div className={styles.chrome}>
        <span className={styles.dots} aria-hidden>
          <i /><i /><i />
        </span>
        <span className={styles.chromeTitle}>CMsports</span>
        <span className={styles.enVivo}>
          <span className={styles.latido} aria-hidden /> en vivo
        </span>
      </div>

      <div className={styles.modulos} role="tablist" aria-label="Módulos de la demo">
        {MODULOS.map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={modulo === m.id}
              className={styles.moduloBtn}
              onClick={() => cambiar(m.id)}
            >
              <Icon size={14} />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* la key remonta el módulo entero: cada uno arranca en su estado inicial */}
      <div className={styles.body} key={modulo}>
        {modulo === 'asistencia' && <Asistencia avisar={avisar} />}
        {modulo === 'finanzas' && <Finanzas avisar={avisar} />}
        {modulo === 'torneos' && <Torneos avisar={avisar} />}

        {/* la key repite la animación CSS en cada toque */}
        <p key={pulso} className={styles.guardado}>
          <Cloud size={13} />
          {aviso ? `${aviso}. El club lo ve al instante.` : PISTA[modulo]}
        </p>
      </div>
    </div>
  )
}
