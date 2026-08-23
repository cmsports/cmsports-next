'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { useEnVivo } from '@/lib/useEnVivo'
import LigaFutbolNav from '@/components/liga-futbol/LigaFutbolNav'
import { calcularTarjetas, calcularFairPlay } from '@/lib/domain/liga-futbol'

const supabase = createClient()

const ink = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

interface Equipo { id: string; nombre: string; color_principal: string | null }
interface Jugador { id: string; nombre: string; numero: number | null }
interface Sancion {
  id: string; jugador_id: string; equipo_id: string; tipo: string
  fechas_suspension: number | null; motivo: string | null; estado: string
  fecha_desde_id: string | null; fecha_hasta_id: string | null
}
interface Fecha { id: string; numero: number; nombre: string | null }

const TABS = ['Tarjetas', 'Fairplay', 'Sanciones'] as const
type Tab = typeof TABS[number]

export default function TarjetasLigaFutbol() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const params = useParams()
  const ligaId = params.id as string

  const [ligaNombre, setLigaNombre] = useState('')
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [tarjetasRaw, setTarjetasRaw] = useState<{ jugador_id: string; equipo_id: string; tipo: string }[]>([])
  const [sanciones, setSanciones] = useState<Sancion[]>([])
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Tarjetas')

  useEnVivo(['lf_tarjetas', 'lf_sanciones'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!ligaId) return
    Promise.all([
      supabase.from('lf_ligas').select('nombre').eq('id', ligaId).single(),
      supabase.from('lf_equipos').select('id, nombre, color_principal').eq('liga_id', ligaId),
      supabase.from('lf_jugadores').select('id, nombre, numero, lf_equipos!inner(liga_id)').eq('lf_equipos.liga_id', ligaId),
      supabase.from('lf_tarjetas').select('jugador_id, equipo_id, tipo, lf_partidos!inner(liga_id)').eq('lf_partidos.liga_id', ligaId),
      supabase.from('lf_sanciones').select('*').eq('liga_id', ligaId).order('creado_en', { ascending: false }),
      supabase.from('lf_fechas').select('id, numero, nombre').eq('liga_id', ligaId),
    ]).then(([ligaRes, eqRes, jugRes, tarjRes, sancRes, fechasRes]) => {
      setLigaNombre(ligaRes.data?.nombre || '')
      setEquipos(eqRes.data as any || [])
      setJugadores(jugRes.data as any || [])
      setTarjetasRaw((tarjRes.data as any) || [])
      setSanciones(sancRes.data as any || [])
      setFechas(fechasRes.data as any || [])
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
  const fechaPorId = (id: string | null) => fechas.find(f => f.id === id)

  if (authLoading || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  const tarjetas = calcularTarjetas(tarjetasRaw)
  const fairplay = calcularFairPlay(tarjetasRaw, equipos.map(e => e.id))

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/liga-futbol/${ligaId}`)}
          style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Volver a {ligaNombre || 'la liga'}
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>🟨🟥 Disciplina</h1>
      </div>

      <LigaFutbolNav ligaId={ligaId} />

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#d97706' : muted, background: 'none', border: 'none',
            borderBottom: tab === t ? '3px solid #d97706' : '3px solid transparent',
            cursor: 'pointer', marginBottom: -2,
          }}>{t}</button>
        ))}
      </div>

      {tab === 'Tarjetas' && (
        tarjetas.length === 0 ? (
          <div style={{ background: '#ffffff', border: '2px dashed #d1d5db', borderRadius: 16, padding: '40px 24px', textAlign: 'center', color: muted }}>
            Sin tarjetas registradas
          </div>
        ) : (
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
            {tarjetas.map((t, i) => {
              const jug = jugadorPorId(t.jugadorId)
              const eq = equipoPorId(t.equipoId)
              return (
                <div key={t.jugadorId} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                  borderBottom: i < tarjetas.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{jug?.nombre || '—'}</div>
                    <div style={{ fontSize: 12, color: hint }}>{eq?.nombre || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    {t.amarillas > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>🟨 {t.amarillas}</span>}
                    {t.rojas > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>🟥 {t.rojas}</span>}
                    {t.dobleAmarilla > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>🟨🟥 {t.dobleAmarilla}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {tab === 'Fairplay' && (
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
          {fairplay.map((f, i) => {
            const eq = equipoPorId(f.equipoId)
            return (
              <div key={f.equipoId} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                borderBottom: i < fairplay.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <span style={{ width: 24, fontSize: 13, color: hint, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: eq?.color_principal || '#e2e8f0', flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: ink }}>{eq?.nombre || '—'}</div>
                <span style={{ fontSize: 12, color: hint }}>🟨 {f.amarillas} · 🟥 {f.rojas}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: ink, minWidth: 30, textAlign: 'right' }}>{f.puntos}</span>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'Sanciones' && (
        sanciones.length === 0 ? (
          <div style={{ background: '#ffffff', border: '2px dashed #d1d5db', borderRadius: 16, padding: '40px 24px', textAlign: 'center', color: muted }}>
            Sin sanciones registradas
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sanciones.map(s => {
              const jug = jugadorPorId(s.jugador_id)
              const eq = equipoPorId(s.equipo_id)
              const desde = fechaPorId(s.fecha_desde_id)
              const hasta = fechaPorId(s.fecha_hasta_id)
              return (
                <div key={s.id} style={{
                  background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0',
                  padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  opacity: s.estado === 'anulada' ? 0.5 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{jug?.nombre || '—'} <span style={{ color: hint, fontWeight: 400 }}>· {eq?.nombre}</span></div>
                    <div style={{ fontSize: 12, color: hint, marginTop: 2 }}>{s.motivo}</div>
                  </div>
                  {s.fechas_suspension && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '3px 10px', borderRadius: 16 }}>
                      {s.fechas_suspension} fecha{s.fechas_suspension !== 1 ? 's' : ''}
                    </span>
                  )}
                  {desde && hasta && (
                    <span style={{ fontSize: 11, color: hint }}>
                      {desde.nombre || `Fecha ${desde.numero}`} → {hasta.nombre || `Fecha ${hasta.numero}`}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 16,
                    color: s.estado === 'activa' ? '#d97706' : s.estado === 'cumplida' ? '#059669' : muted,
                    background: s.estado === 'activa' ? '#fef3c7' : s.estado === 'cumplida' ? '#d1fae5' : '#f1f5f9',
                  }}>
                    {s.estado === 'activa' ? 'Activa' : s.estado === 'cumplida' ? 'Cumplida' : 'Anulada'}
                  </span>
                </div>
              )
            })}
          </div>
        )
      )}
    </AppLayout>
  )
}
