'use client'

/**
 * Dónde va un jugador en el ranking, por categoría.
 *
 * Lo miran dos pantallas: su propio perfil y su ficha en Jugadores. Es el mismo
 * componente en las dos para que el jugador y su entrenador vean exactamente el
 * mismo número —antes el ranking solo existía dentro del PDF del informe, así
 * que en pantalla no se veía en ninguna parte.
 */

import { useEffect, useState } from 'react'
import { cargarRankingDeJugador, type PuestoEnCategoria } from '@/lib/supabase/rankingJugador'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const morado = '#7c3aed'

export default function RankingJugador({ clubId, jugadorId, titulo = 'Ranking' }: {
  clubId: string
  jugadorId: string
  titulo?: string
}) {
  const [puestos, setPuestos] = useState<PuestoEnCategoria[] | null>(null)

  useEffect(() => {
    let vigente = true
    cargarRankingDeJugador(clubId, jugadorId)
      .then(r => { if (vigente) setPuestos(r) })
      .catch(() => { if (vigente) setPuestos([]) })
    return () => { vigente = false }
  }, [clubId, jugadorId])

  // Mientras carga no se muestra nada: un esqueleto que aparece y desaparece en
  // medio segundo molesta más de lo que informa.
  if (!puestos) return null

  if (puestos.length === 0) {
    return (
      <div style={{ ...card, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 6 }}>🏆 {titulo}</div>
        <div style={{ fontSize: 12, color: hint }}>
          Todavía no participó en torneos internos.
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text }}>🏆 {titulo}</div>
        <div style={{ fontSize: 11, color: hint }}>
          {puestos.length === 1 ? '1 categoría' : `${puestos.length} categorías`}
        </div>
      </div>

      {puestos.map((p, i) => {
        const podio = p.rank <= 3
        return (
          <div key={`${p.categoria}||${p.genero ?? ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 16,
              padding: i === 0 ? '0 0 14px' : '14px 0',
              borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>

            <div style={{ textAlign: 'center', minWidth: 56 }}>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1,
                color: podio ? '#b45309' : morado, fontVariantNumeric: 'tabular-nums' }}>
                {p.rank}°
              </div>
              <div style={{ fontSize: 10, color: hint, marginTop: 3 }}>de {p.total}</div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 5 }}>
                {categoriaLabel(p.categoria)}
                {/* Dos categorías pueden llamarse igual y ser rankings
                    distintos —"TC varones" y "TC damas"—, así que el género va
                    al lado o no se sabe cuál de las dos es. */}
                {p.genero && (
                  <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 500, color: hint }}>
                    {p.genero === 'varones' ? '♂' : p.genero === 'damas' ? '♀' : '⚥'}
                  </span>
                )}
              </div>
              {/* Mide contra el PUNTERO de esa categoría, no contra el mejor
                  puntaje del propio jugador: comparar sus categorías entre sí
                  le dibujaba la barra llena al que va noveno. */}
              <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${Math.round((p.pts / Math.max(p.ptsLider, 1)) * 100)}%`, height: '100%',
                  background: podio ? '#f59e0b' : morado, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 11, color: muted }}>
                <strong style={{ color: text }}>{p.pts}</strong> puntos
                {p.faltanParaSubir > 0 && ` · a ${p.faltanParaSubir} de subir`}
                {p.rank === 1 && ' · va primero'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
