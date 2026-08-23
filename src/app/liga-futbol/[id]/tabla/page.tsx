'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { useEnVivo } from '@/lib/useEnVivo'
import LigaFutbolNav from '@/components/liga-futbol/LigaFutbolNav'
import { calcularTablaPosiciones, calcularGoleadores, calcularTarjetas, type EquipoStats } from '@/lib/domain/liga-futbol'
import { exportarTablaLigaFutbolPdf } from '@/lib/liga-futbol-tabla-pdf'
import { exportarStatsLigaFutbolExcel } from '@/lib/liga-futbol-stats-excel'

const supabase = createClient()

const ink = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const indigo = '#6366f1'

const RESULTADO_COLOR: Record<string, string> = { V: '#059669', E: '#d97706', D: '#dc2626' }

interface Liga {
  nombre: string; formato: string
  puntos_victoria: number; puntos_empate: number; puntos_derrota: number; puntos_wo_perdedor: number
}
interface Equipo { id: string; nombre: string; color_principal: string | null; grupo_id: string | null }
interface Grupo { id: string; nombre: string; orden: number }
interface Partido {
  equipo_local_id: string; equipo_visita_id: string
  goles_local: number | null; goles_visita: number | null
  estado: string; equipo_wo_id: string | null; grupo_id: string | null
}

export default function TablaLigaFutbol() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const params = useParams()
  const ligaId = params.id as string

  const [liga, setLiga] = useState<Liga | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [clubNombre, setClubNombre] = useState('')
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null)

  useEnVivo(['lf_partidos'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!ligaId) return
    Promise.all([
      supabase.from('lf_ligas').select('nombre, formato, puntos_victoria, puntos_empate, puntos_derrota, puntos_wo_perdedor').eq('id', ligaId).single(),
      supabase.from('lf_equipos').select('id, nombre, color_principal, grupo_id').eq('liga_id', ligaId),
      supabase.from('lf_grupos').select('id, nombre, orden').eq('liga_id', ligaId).order('orden'),
      supabase.from('lf_partidos').select('equipo_local_id, equipo_visita_id, goles_local, goles_visita, estado, equipo_wo_id, grupo_id').eq('liga_id', ligaId),
    ]).then(([ligaRes, eqRes, gruposRes, partRes]) => {
      setLiga(ligaRes.data as any)
      setEquipos(eqRes.data as any || [])
      setGrupos(gruposRes.data as any || [])
      setPartidos(partRes.data as any || [])
      setLoading(false)
    })
    if (perfil?.club_id) {
      supabase.from('clubes').select('nombre').eq('id', perfil.club_id).single()
        .then(({ data }) => setClubNombre(data?.nombre ?? ''))
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil, ligaId])

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

  const reglas = {
    puntosVictoria: liga.puntos_victoria, puntosEmpate: liga.puntos_empate,
    puntosDerrota: liga.puntos_derrota, puntosWoPerdedor: liga.puntos_wo_perdedor,
  }

  function tablaDe(equiposDelGrupo: Equipo[], partidosDelGrupo: Partido[]): EquipoStats[] {
    return calcularTablaPosiciones(
      equiposDelGrupo.map(e => e.id),
      partidosDelGrupo.map(p => ({
        equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
        golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
        estado: p.estado, equipoWoId: p.equipo_wo_id,
      })),
      reglas,
    )
  }

  const equipoPorId = (id: string) => equipos.find(e => e.id === id)

  async function handleExportarPdf() {
    setExportando('pdf')
    await exportarTablaLigaFutbolPdf(liga!.nombre, clubNombre, tablaDe(equipos, partidos), equipoPorId)
    setExportando(null)
  }

  async function handleExportarExcel() {
    setExportando('excel')
    const [golesRes, tarjRes, jugRes] = await Promise.all([
      supabase.from('lf_goles').select('jugador_id, equipo_id, tipo, lf_partidos!inner(liga_id)').eq('lf_partidos.liga_id', ligaId),
      supabase.from('lf_tarjetas').select('jugador_id, equipo_id, tipo, lf_partidos!inner(liga_id)').eq('lf_partidos.liga_id', ligaId),
      supabase.from('lf_jugadores').select('id, nombre, lf_equipos!inner(liga_id)').eq('lf_equipos.liga_id', ligaId),
    ])
    const jugadores = (jugRes.data as any) || []
    await exportarStatsLigaFutbolExcel(
      liga!.nombre,
      tablaDe(equipos, partidos),
      calcularGoleadores((golesRes.data as any) || []),
      calcularTarjetas((tarjRes.data as any) || []),
      {
        equipo: id => equipoPorId(id)?.nombre || '—',
        jugador: id => jugadores.find((j: any) => j.id === id)?.nombre || '—',
      },
    )
    setExportando(null)
  }

  function renderTabla(equiposDelGrupo: Equipo[], tabla: EquipoStats[]) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              {['#', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS', 'Últimos 5'].map(h => (
                <th key={h} style={{ textAlign: h === 'Equipo' ? 'left' : 'center', padding: '10px 12px', color: hint, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.map((row, i) => {
              const eq = equiposDelGrupo.find(e => e.id === row.equipoId)
              return (
                <tr key={row.equipoId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: hint, fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: ink }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: eq?.color_principal || '#e2e8f0', flexShrink: 0 }} />
                    {eq?.nombre || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: muted }}>{row.pj}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: muted }}>{row.pg}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: muted }}>{row.pe}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: muted }}>{row.pp}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: muted }}>{row.gf}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: muted }}>{row.gc}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: muted }}>{row.dg > 0 ? `+${row.dg}` : row.dg}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: ink }}>{row.pts}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                      {row.ultimos5.map((r, idx) => (
                        <span key={idx} style={{
                          width: 18, height: 18, borderRadius: 4, background: RESULTADO_COLOR[r],
                          color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{r}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/liga-futbol/${ligaId}`)}
          style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Volver a {liga.nombre}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>📊 Tabla de posiciones</h1>
          {liga.formato !== 'grupos_playoffs' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleExportarPdf} disabled={exportando !== null} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                padding: '8px 14px', fontSize: 12, fontWeight: 600, color: muted,
                cursor: exportando ? 'default' : 'pointer',
              }}>{exportando === 'pdf' ? 'Generando...' : '📄 PDF'}</button>
              <button onClick={handleExportarExcel} disabled={exportando !== null} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                padding: '8px 14px', fontSize: 12, fontWeight: 600, color: muted,
                cursor: exportando ? 'default' : 'pointer',
              }}>{exportando === 'excel' ? 'Generando...' : '📊 Excel'}</button>
            </div>
          )}
        </div>
      </div>

      <LigaFutbolNav ligaId={ligaId} />

      {liga.formato === 'grupos_playoffs' && grupos.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grupos.map(g => {
            const equiposDelGrupo = equipos.filter(e => e.grupo_id === g.id)
            const partidosDelGrupo = partidos.filter(p => p.grupo_id === g.id)
            return (
              <div key={g.id} style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                <div style={{ background: `linear-gradient(135deg, ${indigo}, #8b5cf6)`, padding: '12px 20px' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>{g.nombre}</span>
                </div>
                <div style={{ padding: '4px 8px 16px' }}>{renderTabla(equiposDelGrupo, tablaDe(equiposDelGrupo, partidosDelGrupo))}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.06)', padding: '8px 8px 16px' }}>
          {renderTabla(equipos, tablaDe(equipos, partidos))}
        </div>
      )}

      {equipos.length === 0 && (
        <div style={{ background: '#ffffff', border: '2px dashed #d1d5db', borderRadius: 16, padding: '40px 24px', textAlign: 'center', color: muted }}>
          Sin equipos inscritos todavía
        </div>
      )}
    </AppLayout>
  )
}
