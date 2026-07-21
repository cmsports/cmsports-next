'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { reiniciarRanking } from '@/app/actions/ranking'

const supabase = createClient()
const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type FilaRanking = {
  jugadorId: string
  nombre: string
  pts: number
  victorias: number
  derrotas: number
  jugados: number
}

const medallas = ['🥇', '🥈', '🥉']

export default function RankingPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [ranking, setRanking] = useState<FilaRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [reiniciando, setReiniciando] = useState(false)
  const [reiniciadoEn, setReiniciadoEn] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!['admin', 'profesor'].includes(perfil.rol || '')) { router.replace('/dashboard'); return }
    cargar()
  }, [authLoading, perfil])

  async function cargar() {
    if (!perfil?.club_id) return
    setLoading(true)

    // 1. Leer timestamp de reinicio del club
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: club } = await sb
      .from('clubes')
      .select('ranking_reiniciado_en')
      .eq('id', perfil.club_id)
      .single()

    const reinicioTs = club?.ranking_reiniciado_en ?? null
    setReiniciadoEn(reinicioTs)

    // 2. Torneos internos finalizados del club
    let queryT = sb
      .from('torneos')
      .select('id,fecha_fin')
      .eq('club_id', perfil.club_id)
      .eq('tipo', 'interno')
      .eq('estado', 'finalizado')
    if (reinicioTs) queryT = queryT.gt('fecha_fin', reinicioTs)

    const { data: torneos } = await queryT
    if (!torneos?.length) { setRanking([]); setLoading(false); return }

    const torneoIds = (torneos as { id: string }[]).map(t => t.id)

    // 3. Partidos de esos torneos (reales, no byes)
    const { data: partidos } = await supabase
      .from('torneo_partidos')
      .select('jugador_a,jugador_b,ganador')
      .in('torneo_id', torneoIds)
      .not('jugador_b', 'is', null)
      .not('ganador', 'is', null)

    if (!partidos?.length) { setRanking([]); setLoading(false); return }

    // 4. Acumular estadísticas
    const stats: Record<string, { victorias: number; derrotas: number }> = {}
    const jugadoresIds = new Set<string>()

    for (const p of partidos) {
      const a = p.jugador_a as string
      const b = p.jugador_b as string
      const g = p.ganador as string
      jugadoresIds.add(a)
      jugadoresIds.add(b)
      if (!stats[a]) stats[a] = { victorias: 0, derrotas: 0 }
      if (!stats[b]) stats[b] = { victorias: 0, derrotas: 0 }
      if (g === a) { stats[a].victorias++; stats[b].derrotas++ }
      else if (g === b) { stats[b].victorias++; stats[a].derrotas++ }
    }

    // 5. Cargar nombres
    const { data: jugadores } = await supabase
      .from('jugadores')
      .select('id,nombre')
      .in('id', [...jugadoresIds])

    const nombreMap: Record<string, string> = {}
    for (const j of (jugadores || [])) nombreMap[j.id] = j.nombre

    // 6. Construir ranking
    const filas: FilaRanking[] = Object.entries(stats).map(([id, s]) => ({
      jugadorId: id,
      nombre: nombreMap[id] || 'Desconocido',
      victorias: s.victorias,
      derrotas: s.derrotas,
      jugados: s.victorias + s.derrotas,
      pts: s.victorias * 3,
    }))

    filas.sort((a, b) => b.pts - a.pts || b.victorias - a.victorias || a.derrotas - b.derrotas)
    setRanking(filas)
    setLoading(false)
  }

  async function handleReiniciar() {
    if (!confirm('¿Reiniciar ranking? Se borrará el historial acumulado y comenzará desde cero con los torneos futuros.')) return
    setReiniciando(true)
    const res = await reiniciarRanking()
    setReiniciando(false)
    if (res.error) { alert(res.error); return }
    cargar()
  }

  const esAdmin = perfil?.rol === 'admin'

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando ranking...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: text }}>Ranking</h1>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Basado en torneos internos finalizados · Victoria = 3 pts</div>
            {reiniciadoEn && (
              <div style={{ fontSize: 11, color: hint, marginTop: 3 }}>
                Desde: {new Date(reiniciadoEn).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
          {esAdmin && (
            <button
              onClick={handleReiniciar}
              disabled={reiniciando}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {reiniciando ? 'Reiniciando...' : '↺ Reiniciar Ranking'}
            </button>
          )}
        </div>

        {/* Tabla */}
        {ranking.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
            No hay partidos registrados en torneos internos
          </div>
        ) : (
          <div style={{ ...card, overflow: 'hidden' }}>
            {/* Cabecera */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 60px 60px', gap: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px' }}>
              {['#', 'Jugador', 'PTS', 'V', 'D', 'PJ'].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
              ))}
            </div>

            {ranking.map((fila, idx) => (
              <div
                key={fila.jugadorId}
                onClick={() => router.push(`/jugadores/${fila.jugadorId}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 60px 60px 60px 60px',
                  gap: 0,
                  padding: '14px 16px',
                  borderBottom: idx < ranking.length - 1 ? '1px solid #f1f5f9' : 'none',
                  cursor: 'pointer',
                  background: idx === 0 ? '#fffbeb' : idx === 1 ? '#f8fafc' : idx === 2 ? '#fdf4ff' : '#fff',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ fontSize: 16 }}>{medallas[idx] ?? <span style={{ fontSize: 13, color: muted, fontWeight: 600 }}>{idx + 1}</span>}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: text, alignSelf: 'center' }}>{fila.nombre}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed', alignSelf: 'center' }}>{fila.pts}</div>
                <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, alignSelf: 'center' }}>{fila.victorias}</div>
                <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, alignSelf: 'center' }}>{fila.derrotas}</div>
                <div style={{ fontSize: 13, color: muted, alignSelf: 'center' }}>{fila.jugados}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: hint, textAlign: 'center' }}>
          PTS = puntos · V = victorias · D = derrotas · PJ = partidos jugados
        </div>
      </div>
    </AppLayout>
  )
}
