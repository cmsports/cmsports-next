'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { useEnVivo } from '@/lib/useEnVivo'
import LigaFutbolNav from '@/components/liga-futbol/LigaFutbolNav'
import { calcularGoleadores } from '@/lib/domain/liga-futbol'

const supabase = createClient()

const ink = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

interface Equipo { id: string; nombre: string; color_principal: string | null }
interface Jugador { id: string; nombre: string; numero: number | null }

const MEDALLA = ['🥇', '🥈', '🥉']

export default function GoleadoresLigaFutbol() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const params = useParams()
  const ligaId = params.id as string

  const [ligaNombre, setLigaNombre] = useState('')
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [goleadores, setGoleadores] = useState<ReturnType<typeof calcularGoleadores>>([])
  const [loading, setLoading] = useState(true)

  useEnVivo(['lf_goles'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!ligaId) return
    Promise.all([
      supabase.from('lf_ligas').select('nombre').eq('id', ligaId).single(),
      supabase.from('lf_equipos').select('id, nombre, color_principal').eq('liga_id', ligaId),
      supabase.from('lf_jugadores').select('id, nombre, numero, lf_equipos!inner(liga_id)').eq('lf_equipos.liga_id', ligaId),
      supabase.from('lf_goles').select('jugador_id, equipo_id, tipo, lf_partidos!inner(liga_id)').eq('lf_partidos.liga_id', ligaId),
    ]).then(([ligaRes, eqRes, jugRes, golesRes]) => {
      setLigaNombre(ligaRes.data?.nombre || '')
      setEquipos(eqRes.data as any || [])
      setJugadores(jugRes.data as any || [])
      setGoleadores(calcularGoleadores((golesRes.data as any) || []))
      setLoading(false)
    })
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil, ligaId])

  const equipoPorId = (id: string) => equipos.find(e => e.id === id)
  const jugadorPorId = (id: string) => jugadores.find(j => j.id === id)

  if (authLoading || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/liga-futbol/${ligaId}`)}
          style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Volver a {ligaNombre || 'la liga'}
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>⚽ Goleadores</h1>
      </div>

      <LigaFutbolNav ligaId={ligaId} />

      {goleadores.length === 0 ? (
        <div style={{ background: '#ffffff', border: '2px dashed #d1d5db', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚽</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: muted }}>Todavía no hay goles registrados</div>
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
          {goleadores.map((g, i) => {
            const jug = jugadorPorId(g.jugadorId)
            const eq = equipoPorId(g.equipoId)
            return (
              <div key={g.jugadorId} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                borderBottom: i < goleadores.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <span style={{ width: 32, fontSize: 16, fontWeight: 800, color: hint, textAlign: 'center' }}>
                  {MEDALLA[i] || i + 1}
                </span>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: eq?.color_principal || '#e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 14, flexShrink: 0,
                }}>
                  {jug?.numero ?? '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{jug?.nombre || '—'}</div>
                  <div style={{ fontSize: 12, color: hint }}>{eq?.nombre || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: ink }}>{g.goles}</div>
                  {g.penales > 0 && <div style={{ fontSize: 11, color: hint }}>{g.penales} de penal</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
