'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { reiniciarRanking } from '@/app/actions/ranking'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'

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

type CategoriaRanking = {
  categoria: string
  genero: string | null
  filas: FilaRanking[]
}

const medallas = ['🥇', '🥈', '🥉']

export default function RankingPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [rankingPorCategoria, setRankingPorCategoria] = useState<CategoriaRanking[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reiniciando, setReiniciando] = useState(false)
  const [reiniciadoEn, setReiniciadoEn] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) { router.replace('/dashboard'); return }
    cargar()
  }, [authLoading, perfil])

  async function cargar() {
    if (!perfil?.club_id) return
    setLoading(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    // 1. Timestamp de reinicio del club
    const { data: club } = await sb
      .from('clubes')
      .select('ranking_reiniciado_en')
      .eq('id', perfil.club_id)
      .single()
    const reinicioTs = club?.ranking_reiniciado_en ?? null
    setReiniciadoEn(reinicioTs)

    // 2. Torneos internos del club
    let queryT = sb
      .from('torneos')
      .select('id,categoria,genero,fecha_fin,creado_en')
      .eq('club_id', perfil.club_id)
      .eq('tipo', 'interno')
      .neq('estado', 'cancelado')
    if (reinicioTs) queryT = queryT.gt('creado_en', reinicioTs)

    const { data: torneos } = await queryT
    if (!torneos?.length) {
      setRankingPorCategoria([])
      setLoading(false)
      return
    }

    // 3. Mapear torneoId → { categoria, genero }
    const torneoMeta: Record<string, { categoria: string; genero: string | null }> = {}
    for (const t of (torneos as { id: string; categoria: string | null; genero: string | null }[])) {
      torneoMeta[t.id] = { categoria: t.categoria ?? 'Sin categoría', genero: t.genero ?? null }
    }
    const torneoIds = Object.keys(torneoMeta)

    // 4. Todos los partidos de esos torneos (1 sola query)
    const { data: partidos } = await supabase
      .from('torneo_partidos')
      .select('torneo_id,jugador_a,jugador_b,ganador')
      .in('torneo_id', torneoIds)
      .not('jugador_b', 'is', null)
      .not('ganador', 'is', null)

    if (!partidos?.length) { setRankingPorCategoria([]); setLoading(false); return }

    // 5. Acumular estadísticas por categoria + genero
    const statsPorClave: Record<string, Record<string, { victorias: number; derrotas: number }>> = {}
    const jugadoresIds = new Set<string>()

    for (const p of partidos) {
      const meta = torneoMeta[p.torneo_id as string]
      const clave = `${meta?.categoria ?? 'Sin categoría'}||${meta?.genero ?? ''}`
      if (!statsPorClave[clave]) statsPorClave[clave] = {}
      const stats = statsPorClave[clave]

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

    // 6. Cargar nombres de jugadores (1 sola query)
    const { data: jugadores } = await supabase
      .from('jugadores')
      .select('id,nombre')
      .in('id', [...jugadoresIds])

    const nombreMap: Record<string, string> = {}
    for (const j of (jugadores || [])) nombreMap[j.id] = j.nombre

    // 7. Construir ranking por categoria + genero
    const conDatos: Record<string, CategoriaRanking> = {}
    for (const [clave, stats] of Object.entries(statsPorClave)) {
      const [categoria, genero] = clave.split('||')
      const filas: FilaRanking[] = Object.entries(stats).map(([id, s]) => ({
        jugadorId: id,
        nombre: nombreMap[id] || 'Desconocido',
        victorias: s.victorias,
        derrotas: s.derrotas,
        jugados: s.victorias + s.derrotas,
        pts: s.victorias * 3,
      }))
      filas.sort((a, b) => b.pts - a.pts || b.victorias - a.victorias || a.derrotas - b.derrotas)
      conDatos[clave] = { categoria, genero: genero || null, filas }
    }

    const resultado: CategoriaRanking[] = Object.values(conDatos)
    resultado.sort((a, b) => {
      const catCmp = a.categoria.localeCompare(b.categoria, 'es')
      if (catCmp !== 0) return catCmp
      // varones primero, damas después, sin género al final
      const gOrder = (g: string | null) => g === 'varones' ? 0 : g === 'damas' ? 1 : 2
      return gOrder(a.genero) - gOrder(b.genero)
    })

    setRankingPorCategoria(resultado)
    if (resultado.length > 0 && !categoriaActiva) setCategoriaActiva(`${resultado[0].categoria}||${resultado[0].genero ?? ''}`)
    setLoading(false)
  }

  async function handleReiniciar() {
    if (!confirm('¿Reiniciar ranking? Se borrará el historial acumulado y comenzará desde cero con los torneos futuros.')) return
    setReiniciando(true)
    const res = await reiniciarRanking()
    setReiniciando(false)
    if (res.error) { alert(res.error); return }
    setCategoriaActiva(null)
    cargar()
  }

  const esAdmin = perfil?.rol === 'admin'
  const rankingActivo = rankingPorCategoria.find(r => `${r.categoria}||${r.genero ?? ''}` === categoriaActiva)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando ranking...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: text }}>Ranking</h1>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Por categoría y género · torneos internos · Victoria = 3 pts</div>
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

        {/* Cuadrito informativo */}
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            ℹ️ ¿Cómo se calculan los puntos?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            <div style={{ background: '#ede9fe', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#3730a3', fontWeight: 600 }}>
              🏆 Victoria en partido = <strong>3 pts</strong>
            </div>
            <div style={{ background: '#ede9fe', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#3730a3', fontWeight: 600 }}>
              ❌ Derrota = <strong>0 pts</strong>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#6d28d9', lineHeight: 1.6 }}>
            Los puntos se acumulan de <strong>todos los torneos internos</strong>. En torneos largos (128, 64, 32 jugadores…) quien avanza más rondas acumula más puntos. Cada categoría tiene su propio ranking independiente, separado por Varones y Damas.
          </div>
        </div>

        {rankingPorCategoria.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
            No hay partidos registrados en torneos internos
          </div>
        ) : (
          <>
            {/* Tabs de categorías */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {rankingPorCategoria.map(r => (
                <button
                  key={`${r.categoria}||${r.genero ?? ''}`}
                  onClick={() => setCategoriaActiva(`${r.categoria}||${r.genero ?? ''}`)}
                  style={{
                    background: categoriaActiva === `${r.categoria}||${r.genero ?? ''}` ? '#7c3aed' : '#ffffff',
                    color: categoriaActiva === `${r.categoria}||${r.genero ?? ''}` ? '#ffffff' : muted,
                    border: `1px solid ${categoriaActiva === `${r.categoria}||${r.genero ?? ''}` ? '#7c3aed' : '#e2e8f0'}`,
                    borderRadius: 20,
                    padding: '6px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {categoriaLabel(r.categoria)}
                  {r.genero && (
                    <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.85 }}>
                      {r.genero === 'varones' ? '♂' : '♀'}
                    </span>
                  )}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>({r.filas.length})</span>
                </button>
              ))}
            </div>

            {/* Tabla del ranking activo */}
            {rankingActivo && rankingActivo.filas.length === 0 && (
              <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
                Sin partidos registrados en <strong style={{ color: muted }}>{categoriaLabel(rankingActivo.categoria)}{rankingActivo.genero ? ` · ${rankingActivo.genero === 'varones' ? 'Varones' : 'Damas'}` : ''}</strong>
              </div>
            )}
            {rankingActivo && rankingActivo.filas.length > 0 && (
              <div style={{ ...card, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 60px 60px', gap: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px' }}>
                  {['#', 'Jugador', 'PTS', 'V', 'D', 'PJ'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                  ))}
                </div>
                {rankingActivo.filas.map((fila, idx) => (
                  <div
                    key={fila.jugadorId}
                    onClick={() => router.push(`/jugadores/${fila.jugadorId}`)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1fr 60px 60px 60px 60px',
                      gap: 0,
                      padding: '14px 16px',
                      borderBottom: idx < rankingActivo.filas.length - 1 ? '1px solid #f1f5f9' : 'none',
                      cursor: 'pointer',
                      background: idx === 0 ? '#fffbeb' : idx === 1 ? '#f8fafc' : idx === 2 ? '#fdf4ff' : '#fff',
                    }}
                  >
                    <div style={{ fontSize: 16 }}>
                      {medallas[idx] ?? <span style={{ fontSize: 13, color: muted, fontWeight: 600 }}>{idx + 1}</span>}
                    </div>
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
          </>
        )}
      </div>
    </AppLayout>
  )
}
