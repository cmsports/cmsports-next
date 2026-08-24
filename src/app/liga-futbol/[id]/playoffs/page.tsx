'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { useEnVivo } from '@/lib/useEnVivo'
import LigaFutbolNav from '@/components/liga-futbol/LigaFutbolNav'
import { iniciarPlayoffs } from '@/app/actions/liga-futbol'
import { ganadorPartido, type FasePlayoff } from '@/lib/domain/liga-futbol'

const supabase = createClient()

const ink = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const LABEL_FASE: Record<string, string> = {
  cuartos: 'Cuartos de final', semifinal: 'Semifinal', final: 'Final', tercer_lugar: 'Tercer lugar',
}
const ORDEN_FASE: Record<string, number> = { cuartos: 0, semifinal: 1, final: 2, tercer_lugar: 2 }

interface Liga { nombre: string; formato: string; estado: string }
interface Equipo { id: string; nombre: string; color_principal: string | null }
interface Fecha { id: string; fase_playoff: FasePlayoff | null; nombre: string | null; numero: number }
interface Partido {
  id: string; fecha_id: string | null; orden_bracket: number | null
  equipo_local_id: string; equipo_visita_id: string
  goles_local: number | null; goles_visita: number | null
  estado: string; equipo_wo_id: string | null
}

export default function PlayoffsLigaFutbol() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const params = useParams()
  const ligaId = params.id as string

  const [liga, setLiga] = useState<Liga | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [iniciando, setIniciando] = useState(false)

  useEnVivo(['lf_partidos', 'lf_fechas', 'lf_ligas'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!ligaId) return
    Promise.all([
      supabase.from('lf_ligas').select('nombre, formato, estado').eq('id', ligaId).single(),
      supabase.from('lf_equipos').select('id, nombre, color_principal').eq('liga_id', ligaId),
      supabase.from('lf_fechas').select('id, fase_playoff, nombre, numero').eq('liga_id', ligaId).eq('es_playoff', true).order('numero'),
      supabase.from('lf_partidos').select('id, fecha_id, orden_bracket, equipo_local_id, equipo_visita_id, goles_local, goles_visita, estado, equipo_wo_id')
        .eq('liga_id', ligaId).not('fecha_id', 'is', null),
    ]).then(([ligaRes, eqRes, fechasRes, partRes]) => {
      setLiga(ligaRes.data as any)
      setEquipos(eqRes.data as any || [])
      const fechasPlayoff = (fechasRes.data as any) || []
      setFechas(fechasPlayoff)
      const idsPlayoff = new Set(fechasPlayoff.map((f: Fecha) => f.id))
      setPartidos(((partRes.data as any) || []).filter((p: Partido) => idsPlayoff.has(p.fecha_id)))
      setLoading(false)
    })
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil, ligaId])

  async function handleIniciar() {
    setIniciando(true); setError('')
    const res = await iniciarPlayoffs(ligaId)
    setIniciando(false)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  const equipoPorId = (id: string) => equipos.find(e => e.id === id)

  if (authLoading || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!liga) return (
    <AppLayout perfil={perfil}>
      <div style={{ textAlign: 'center', padding: 60, color: muted }}>Liga no encontrada</div>
    </AppLayout>
  )

  const fasesPresentes = [...new Set(fechas.map(f => f.fase_playoff).filter(Boolean))] as FasePlayoff[]
  const columnas = fasesPresentes.filter(f => f !== 'tercer_lugar').sort((a, b) => ORDEN_FASE[a] - ORDEN_FASE[b])
  const tercerLugarFecha = fechas.find(f => f.fase_playoff === 'tercer_lugar')

  function partidosDeFase(fase: FasePlayoff) {
    const fechaIds = fechas.filter(f => f.fase_playoff === fase).map(f => f.id)
    return partidos.filter(p => fechaIds.includes(p.fecha_id!)).sort((a, b) => (a.orden_bracket ?? 0) - (b.orden_bracket ?? 0))
  }

  function MatchCard({ p }: { p: Partido }) {
    const local = equipoPorId(p.equipo_local_id)
    const visita = equipoPorId(p.equipo_visita_id)
    const jugado = p.estado === 'finalizado' || p.estado === 'wo'
    const ganadorId = jugado ? ganadorPartido({
      equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
      golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
      estado: p.estado, equipoWoId: p.equipo_wo_id,
    }) : null

    const filaEquipo = (id: string, nombre: string, goles: number | null, esGanador: boolean) => (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px',
        background: esGanador ? '#f0fdf4' : 'transparent', borderRadius: 6,
        fontWeight: esGanador ? 800 : 500, color: esGanador ? '#166534' : ink, fontSize: 13,
      }}>
        <span>{nombre}</span>
        {jugado && <span>{goles ?? 0}</span>}
      </div>
    )

    return (
      <div
        onClick={() => router.push(`/liga-futbol/${ligaId}/fecha/${p.fecha_id}`)}
        style={{
          background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(15,23,42,0.06)', overflow: 'hidden', cursor: 'pointer', width: 220,
        }}>
        {filaEquipo(p.equipo_local_id, local?.nombre || '—', p.goles_local, ganadorId === p.equipo_local_id)}
        <div style={{ height: 1, background: '#f1f5f9' }} />
        {filaEquipo(p.equipo_visita_id, visita?.nombre || '—', p.goles_visita, ganadorId === p.equipo_visita_id)}
      </div>
    )
  }

  const puedeIniciar = liga.estado === 'en_curso' && liga.formato !== 'todos_vs_todos' && columnas.length === 0

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/liga-futbol/${ligaId}`)}
          style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Volver a {liga.nombre}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>🏆 Playoffs</h1>
          {puedeIniciar && (
            <button
              onClick={handleIniciar}
              disabled={iniciando}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
                border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 13,
                fontWeight: 700, cursor: iniciando ? 'default' : 'pointer',
                boxShadow: '0 3px 10px rgba(217,119,6,0.35)',
              }}>
              {iniciando ? 'Armando bracket...' : '🏆 Iniciar playoffs'}
            </button>
          )}
        </div>
      </div>

      <LigaFutbolNav ligaId={ligaId} />

      {error && (
        <div onClick={() => setError('')} style={{
          background: '#fef2f2', color: '#dc2626', borderRadius: 10,
          padding: '10px 14px', fontSize: 13, marginBottom: 16,
          cursor: 'pointer', border: '1px solid #fecaca',
        }}>
          ⚠️ {error}
        </div>
      )}

      {columnas.length === 0 ? (
        <div style={{ background: '#ffffff', border: '2px dashed #d1d5db', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: muted, marginBottom: 6 }}>Playoffs sin iniciar</div>
          <div style={{ fontSize: 13, color: hint }}>
            {liga.formato === 'todos_vs_todos'
              ? 'Este formato no tiene fase de playoffs'
              : 'Terminá todas las fechas de la fase regular para armar el bracket'}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 40, overflowX: 'auto', paddingBottom: 12 }}>
            {columnas.map(fase => (
              <div key={fase} style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#d97706', textAlign: 'center' }}>{LABEL_FASE[fase]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 40, justifyContent: 'space-around', flex: 1 }}>
                  {partidosDeFase(fase).map(p => <MatchCard key={p.id} p={p} />)}
                </div>
              </div>
            ))}
          </div>

          {tercerLugarFecha && (
            <div style={{ marginTop: 30 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#d97706', marginBottom: 12 }}>🥉 Tercer lugar</div>
              {partidosDeFase('tercer_lugar').map(p => <MatchCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
