'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarResultadoPartido } from '@/app/actions/liga'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const RESULTADOS_BO5 = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3']

interface PartidoFila {
  id: string
  estado: string
  jugadorAId: string
  jugadorBId: string
  setsA: number | null
  setsB: number | null
  ganadorId: string | null
  ordenFixture: number
  fechaNumero: number | null
  fechaEstado: string | null
}

export function FixtureDivision({
  divisionId,
  nombres,
}: {
  divisionId: string
  nombres: Record<string, string>
}) {
  const [partidos, setPartidos] = useState<PartidoFila[]>([])
  const [loading, setLoading] = useState(true)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Record<string, string>>({})
  const [errorMsg, setErrorMsg] = useState('')

  const cargar = useCallback(async () => {
    const db = supabase as any
    const { data } = await db
      .from('liga_partidos')
      .select('id, estado, jugador_a_id, jugador_b_id, sets_a, sets_b, ganador_id, orden_fixture, liga_fechas(numero, estado)')
      .eq('division_id', divisionId)
      .is('deleted_at', null)
      .order('orden_fixture', { ascending: true })

    setPartidos((data || []).map((p: any) => {
      const f = Array.isArray(p.liga_fechas) ? p.liga_fechas[0] : p.liga_fechas
      return {
        id: p.id,
        estado: p.estado,
        jugadorAId: p.jugador_a_id,
        jugadorBId: p.jugador_b_id,
        setsA: p.sets_a,
        setsB: p.sets_b,
        ganadorId: p.ganador_id,
        ordenFixture: p.orden_fixture,
        fechaNumero: f?.numero ?? null,
        fechaEstado: f?.estado ?? null,
      }
    }))
    setLoading(false)
  }, [divisionId])

  useEffect(() => { cargar() }, [cargar])

  async function handleGuardar(partido: PartidoFila) {
    const val = resultados[partido.id]
    if (!val) return
    const [sA, sB] = val.split('-').map(Number)
    setGuardandoId(partido.id)
    const res = await registrarResultadoPartido({ partidoId: partido.id, setsA: sA, setsB: sB })
    setGuardandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    setResultados(prev => { const n = { ...prev }; delete n[partido.id]; return n })
    cargar()
  }

  if (loading) return (
    <div style={{ padding:'16px 0', textAlign:'center', fontSize:12, color:hint }}>
      Cargando fixture...
    </div>
  )
  if (!partidos.length) return (
    <div style={{ fontSize:12, color:hint, marginTop:14 }}>
      Sin partidos en esta división. Generá el fixture primero.
    </div>
  )

  const jugados = partidos.filter(p => p.estado === 'finalizado' || p.estado === 'walkover').length

  return (
    <div style={{ marginTop:20, borderTop:'1px solid #e2e8f0', paddingTop:16 }}>
      {errorMsg && (
        <div
          onClick={() => setErrorMsg('')}
          style={{ background:'#fff1f2', color:'#e11d48', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:10, cursor:'pointer' }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ fontSize:12, fontWeight:600, color:muted }}>
          Fixture completo — {partidos.length} partidos
        </div>
        <div style={{ fontSize:11, color:hint }}>
          {jugados}/{partidos.length} jugados
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {partidos.map(p => {
          const jugado = p.estado === 'finalizado' || p.estado === 'walkover'
          const enJuego = p.fechaEstado === 'en_juego'
          const nombreA = nombres[p.jugadorAId] ?? '—'
          const nombreB = nombres[p.jugadorBId] ?? '—'
          const resStr = jugado && p.setsA !== null && p.setsB !== null
            ? `${p.setsA}–${p.setsB}`
            : p.estado === 'walkover' ? 'W/O' : null
          const ganadorNombre = p.ganadorId ? (nombres[p.ganadorId] ?? '').split(' ')[0] : null

          return (
            <div
              key={p.id}
              style={{
                display:'flex', alignItems:'center', gap:8,
                padding:'7px 12px', borderRadius:8, fontSize:12,
                background: jugado ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${jugado ? '#bbf7d0' : '#e2e8f0'}`,
              }}
            >
              {/* Fecha */}
              <span style={{ width:58, flexShrink:0, fontWeight:600, color: p.fechaNumero ? muted : hint, fontSize:11 }}>
                {p.fechaNumero != null ? `Fecha ${p.fechaNumero}` : 'Sin fecha'}
              </span>

              {/* Jugadores */}
              <span style={{ flex:1, color:text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                <span style={{ fontWeight: p.ganadorId === p.jugadorAId ? 700 : 400 }}>{nombreA}</span>
                <span style={{ color:hint, margin:'0 5px', fontWeight:400 }}>vs</span>
                <span style={{ fontWeight: p.ganadorId === p.jugadorBId ? 700 : 400 }}>{nombreB}</span>
              </span>

              {/* Resultado o acción */}
              {jugado ? (
                <span style={{ flexShrink:0, fontWeight:700, color:'#16a34a', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                  {resStr}{ganadorNombre ? ` (${ganadorNombre})` : ''}
                </span>
              ) : enJuego ? (
                <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
                  <select
                    value={resultados[p.id] ?? ''}
                    onChange={e => setResultados(prev => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ fontSize:11, border:'1px solid #c7d2e0', borderRadius:6, padding:'3px 6px', color:text, background:'white', outline:'none' }}
                  >
                    <option value="">— resultado —</option>
                    {RESULTADOS_BO5.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    onClick={() => handleGuardar(p)}
                    disabled={!resultados[p.id] || guardandoId === p.id}
                    style={{
                      background: resultados[p.id] ? '#16a34a' : '#e2e8f0',
                      color: resultados[p.id] ? 'white' : hint,
                      border:'none', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600,
                      cursor: resultados[p.id] ? 'pointer' : 'default',
                    }}
                  >
                    {guardandoId === p.id ? '...' : 'OK'}
                  </button>
                </div>
              ) : (
                <span style={{ flexShrink:0, fontSize:11, color:hint }}>
                  {p.fechaNumero != null ? 'Programado' : 'Sin programar'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
