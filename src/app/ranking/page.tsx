'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { reiniciarRanking } from '@/app/actions/ranking'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'
import { calcularRankingInterno, puntosPorFase, type ResultadoJugadorRanking } from '@/lib/domain/rankingInterno'
import { CONFIG } from '@/lib/config'
import { useEnVivo } from '@/lib/useEnVivo'

const supabase = createClient()
const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type CategoriaRanking = {
  categoria: string
  genero: string | null
  filas: ResultadoJugadorRanking[]
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

  // Sin esto la tabla quedaba fija desde que se abría: cargar un resultado de
  // torneo o cambiar su categoría/género no se veía hasta recargar la página.
  //
  // `torneo_partidos` no tiene columna club_id propia (solo torneo_id, que
  // hay que cruzar con `torneos` para saber de qué club es), así que acá va
  // sin filtrar por club — con los ~4 clubes que hoy usan el sistema el costo
  // es una recarga de más cuando OTRO club anota un resultado, y es preferible
  // a no enterarse nunca de los propios. `torneos` sí tiene club_id y va
  // filtrado. El reinicio del ranking ya refresca solo, con su propio cargar()
  // en handleReiniciar, así que no hace falta escuchar clubes acá.
  useEnVivo(['torneo_partidos', 'torneos'], perfil?.club_id ?? null, () => { void cargar() }, { conClub: ['torneos'] })

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

    // 4. Todos los partidos de esos torneos (1 sola query). `fase` es lo que
    // deja pesar distinto una victoria en semifinal que una en la primera
    // ronda de un cuadro grande — ver calcularRankingInterno.
    const { data: partidos } = await supabase
      .from('torneo_partidos')
      .select('torneo_id,jugador_a,jugador_b,ganador,fase')
      .in('torneo_id', torneoIds)
      .not('jugador_b', 'is', null)
      .not('ganador', 'is', null)

    if (!partidos?.length) { setRankingPorCategoria([]); setLoading(false); return }

    // 5. Agrupar los partidos por categoria + genero
    const partidosPorClave: Record<string, { jugador_a: string; jugador_b: string; ganador: string; fase: string | null }[]> = {}
    const jugadoresIds = new Set<string>()

    for (const p of partidos) {
      const meta = torneoMeta[p.torneo_id as string]
      const clave = `${meta?.categoria ?? 'Sin categoría'}||${meta?.genero ?? ''}`
      if (!partidosPorClave[clave]) partidosPorClave[clave] = []
      partidosPorClave[clave].push({
        jugador_a: p.jugador_a as string, jugador_b: p.jugador_b as string,
        ganador: p.ganador as string, fase: p.fase as string | null,
      })
      jugadoresIds.add(p.jugador_a as string)
      jugadoresIds.add(p.jugador_b as string)
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
    for (const [clave, partidosDeClave] of Object.entries(partidosPorClave)) {
      const [categoria, genero] = clave.split('||')
      const filas = calcularRankingInterno(partidosDeClave, id => nombreMap[id] || 'Desconocido')
      conDatos[clave] = { categoria, genero: genero || null, filas }
    }

    const resultado: CategoriaRanking[] = Object.values(conDatos)
    resultado.sort((a, b) => {
      const catCmp = a.categoria.localeCompare(b.categoria, 'es')
      if (catCmp !== 0) return catCmp
      // varones, damas, mixto, y sin género al final
      const gOrder = (g: string | null) => g === 'varones' ? 0 : g === 'damas' ? 1 : g === 'mixto' ? 2 : 3
      return gOrder(a.genero) - gOrder(b.genero)
    })

    // El jugador solo ve la categoría donde compite. Se filtra por dónde
    // aparece él y no por su `categoria` de ficha: la del ranking sale del
    // torneo y las dos no siempre se escriben igual, así que compararlas por
    // texto lo dejaría sin ranking sin que nadie entendiera por qué.
    const soloSuyas = perfil?.rol === 'jugador' && perfil.jugador_id
      ? resultado.filter(r => r.filas.some(f => f.jugadorId === perfil.jugador_id))
      : resultado

    setRankingPorCategoria(soloSuyas)
    if (soloSuyas.length > 0 && !categoriaActiva) setCategoriaActiva(`${soloSuyas[0].categoria}||${soloSuyas[0].genero ?? ''}`)
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
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Por categoría y género · torneos internos · puntos duplican por ronda</div>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {CONFIG.FASES_ORDEN.map(fase => (
              <div key={fase} style={{ background: '#ede9fe', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: '#3730a3', fontWeight: 600 }}>
                {CONFIG.FASE_LABELS[fase]} = <strong>{puntosPorFase(fase)} pts</strong>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#6d28d9', lineHeight: 1.6 }}>
            Ganar un partido suma los puntos de la ronda en la que se jugó — se <strong>duplican</strong> a cada ronda, así que avanzar profundo pesa mucho más que ganar un solo partido temprano. Perder no resta nada. Los puntos se acumulan de <strong>todos los torneos internos</strong>. Cada categoría tiene su propio ranking, separado por Varones y Damas. Dos jugadores con los mismos puntos comparten puesto.
          </div>
        </div>

        {rankingPorCategoria.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
            {perfil?.rol === 'jugador'
              ? 'Todavía no jugaste partidos en torneos internos'
              : 'No hay partidos registrados en torneos internos'}
          </div>
        ) : (
          <>
            {/* Tabs de categorías. Con una sola no hay nada que elegir, que es
                el caso del jugador: solo ve la suya. */}
            <div style={{ display: rankingPorCategoria.length > 1 ? 'flex' : 'none', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
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
                      {r.genero === 'varones' ? '♂' : r.genero === 'damas' ? '♀' : '⚥'}
                    </span>
                  )}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>({r.filas.length})</span>
                </button>
              ))}
            </div>

            {/* Tabla del ranking activo */}
            {rankingActivo && rankingActivo.filas.length === 0 && (
              <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
                Sin partidos registrados en <strong style={{ color: muted }}>{categoriaLabel(rankingActivo.categoria)}{rankingActivo.genero ? ` · ${rankingActivo.genero === 'varones' ? 'Varones' : rankingActivo.genero === 'damas' ? 'Damas' : 'Mixto'}` : ''}</strong>
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
                      // El color de podio sigue el puesto compartido (rank), no
                      // la posición en la lista: si dos empatan en 1°, los dos
                      // se ven dorados.
                      background: fila.rank === 1 ? '#fffbeb' : fila.rank === 2 ? '#f8fafc' : fila.rank === 3 ? '#fdf4ff' : '#fff',
                    }}
                  >
                    <div style={{ fontSize: 16 }}>
                      {medallas[fila.rank - 1] ?? <span style={{ fontSize: 13, color: muted, fontWeight: 600 }}>{fila.rank}</span>}
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
