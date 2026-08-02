'use client'

// Confirmación de retiro de un jugador. Lo importante acá no es preguntar
// "¿estás seguro?", sino que el admin elija qué pasa con los partidos que le
// quedaban — porque las dos salidas son distintas y ninguna es obviamente
// justa. Se muestran las consecuencias de cada una en vez de esconderlas
// detrás de un nombre.

import { useState } from 'react'

interface Props {
  nombreJugador: string
  partidosPendientes: number | null // null mientras se cuentan
  procesando: boolean
  onCancelar: () => void
  onConfirmar: (modo: 'walkover' | 'eliminar') => void
}

const texto = '#0f172a'
const mutado = '#64748b'
const borde = '#e2e8f0'

export default function ModalRetiro({
  nombreJugador, partidosPendientes, procesando, onCancelar, onConfirmar,
}: Props) {
  const [modo, setModo] = useState<'walkover' | 'eliminar'>('walkover')

  const opciones = [
    {
      valor: 'walkover' as const,
      titulo: 'Dar por ganados a sus rivales',
      detalle: 'Cada rival gana ese partido por no presentación y suma los puntos. Es lo que hacen las federaciones. Tené en cuenta que al que le tocaba jugar contra él más adelante le queda un partido regalado.',
    },
    {
      valor: 'eliminar' as const,
      titulo: 'Borrar esos partidos',
      detalle: 'Nadie suma puntos por ellos. A cambio, cada jugador termina la liga con distinta cantidad de partidos jugados, así que conviene mirar el ranking por promedio y no sólo por puntos.',
    },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220, padding: 16 }}>
      <div style={{ background: '#fff', border: `1px solid ${borde}`, borderRadius: 16, width: '100%', maxWidth: 480, padding: 26, boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>

        <div style={{ fontSize: 16, fontWeight: 600, color: texto, marginBottom: 6 }}>
          Retirar a {nombreJugador} de la liga
        </div>
        <div style={{ fontSize: 12, color: mutado, marginBottom: 18, lineHeight: 1.5 }}>
          Lo que ya jugó no se toca: sus resultados y los puntos que sus rivales le sacaron
          quedan como están.{' '}
          {partidosPendientes === null
            ? 'Contando los partidos que le quedan…'
            : partidosPendientes === 0
              ? 'No le quedan partidos pendientes.'
              : `Le quedan ${partidosPendientes} partido${partidosPendientes > 1 ? 's' : ''} pendiente${partidosPendientes > 1 ? 's' : ''}. ¿Qué hacemos con ${partidosPendientes > 1 ? 'ellos' : 'él'}?`}
        </div>

        {(partidosPendientes ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
            {opciones.map(o => {
              const elegida = modo === o.valor
              return (
                <button key={o.valor} type="button" onClick={() => setModo(o.valor)}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 11, cursor: 'pointer',
                    border: `1.5px solid ${elegida ? '#4f46e5' : borde}`,
                    background: elegida ? '#eef2ff' : '#fff',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                      border: `1.5px solid ${elegida ? '#4f46e5' : '#cbd5e1'}`,
                      background: elegida ? '#4f46e5' : '#fff',
                      boxShadow: elegida ? 'inset 0 0 0 3px #fff' : 'none',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: elegida ? '#3730a3' : texto }}>
                      {o.titulo}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: mutado, lineHeight: 1.5, paddingLeft: 23 }}>
                    {o.detalle}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: mutado, marginBottom: 16, lineHeight: 1.5 }}>
          Si después reprogramás, {nombreJugador} ya no entra en el horario. Se puede
          reincorporar más adelante, pero los partidos que se resuelvan ahora no vuelven solos.
        </div>

        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancelar} disabled={procesando}
            style={{ fontSize: 13, padding: '9px 16px', borderRadius: 9, border: `1px solid ${borde}`, background: '#fff', color: mutado, cursor: procesando ? 'default' : 'pointer' }}>
            Cancelar
          </button>
          <button type="button" onClick={() => onConfirmar(modo)} disabled={procesando || partidosPendientes === null}
            style={{
              fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 9, border: 'none',
              background: procesando || partidosPendientes === null ? '#94a3b8' : '#dc2626',
              color: '#fff', cursor: procesando || partidosPendientes === null ? 'default' : 'pointer',
            }}>
            {procesando ? 'Retirando…' : 'Retirar de la liga'}
          </button>
        </div>
      </div>
    </div>
  )
}
