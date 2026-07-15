'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarResultadoPartido, asignarPartidoManual, desprogramarPartido } from '@/app/actions/liga'
import { generarBloquesHorario, BLOQUE_INICIO, BLOQUE_FIN } from '@/lib/domain/liga'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const RESULTADOS_BO5 = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3']

const selStyle = {
  fontSize:11, border:'1px solid #c7d2e0', borderRadius:6,
  padding:'3px 6px', color:text, background:'white', outline:'none',
} as const

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
  fechaId: string | null
  bloqueHorario: string | null
}

interface FechaLiga { id: string; numero: number; esAjuste: boolean }

export function FixtureDivision({
  divisionId,
  ligaId,
  nombres,
}: {
  divisionId: string
  ligaId: string
  nombres: Record<string, string>
}) {
  const [partidos, setPartidos] = useState<PartidoFila[]>([])
  const [fechasLiga, setFechasLiga] = useState<FechaLiga[]>([])
  const [bloques, setBloques] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [resultados, setResultados] = useState<Record<string, string>>({})
  const [selFecha, setSelFecha] = useState<Record<string, string>>({})
  const [selBloque, setSelBloque] = useState<Record<string, string>>({})
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [asignandoId, setAsignandoId] = useState<string | null>(null)
  const [desprogramandoId, setDesprogramandoId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const cargar = useCallback(async () => {
    const db = supabase as any
    const [{ data: ligaInfo }, { data: fechasData }, { data: rawPartidos }] = await Promise.all([
      (supabase as any).from('ligas').select('bloque_minutos').eq('id', ligaId).single(),
      supabase.from('liga_fechas').select('id, numero, es_ajuste').eq('liga_id', ligaId).order('numero'),
      db.from('liga_partidos')
        .select('id, estado, jugador_a_id, jugador_b_id, sets_a, sets_b, ganador_id, orden_fixture, fecha_id, bloque_horario, liga_fechas(numero)')
        .eq('division_id', divisionId)
        .is('deleted_at', null)
        .order('orden_fixture', { ascending: true }),
    ])

    const bmin: number = ligaInfo?.bloque_minutos ?? 30
    setBloques(generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, bmin))
    setFechasLiga((fechasData || []).map((f: any) => ({ id: f.id, numero: f.numero, esAjuste: f.es_ajuste })))

    const lista: PartidoFila[] = (rawPartidos || []).map((p: any) => {
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
        fechaId: p.fecha_id ?? null,
        bloqueHorario: p.bloque_horario ?? null,
      }
    })
    setPartidos(lista)

    // Pre-poblar selectores con valores actuales
    const initFecha: Record<string, string> = {}
    const initBloque: Record<string, string> = {}
    for (const p of lista) {
      if (p.fechaId) initFecha[p.id] = p.fechaId
      if (p.bloqueHorario) initBloque[p.id] = p.bloqueHorario
    }
    setSelFecha(initFecha)
    setSelBloque(initBloque)
    setLoading(false)
  }, [divisionId, ligaId])

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

  async function handleAsignar(partido: PartidoFila) {
    const fId = selFecha[partido.id]
    const bloque = selBloque[partido.id]
    if (!fId || !bloque) return
    setAsignandoId(partido.id)
    setErrorMsg('')
    const res = await asignarPartidoManual({ partidoId: partido.id, fechaId: fId, bloqueHorario: bloque })
    setAsignandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    cargar()
  }

  async function handleDesprogramar(partido: PartidoFila) {
    setDesprogramandoId(partido.id)
    setErrorMsg('')
    const res = await desprogramarPartido({ partidoId: partido.id })
    setDesprogramandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    cargar()
  }

  if (loading) return (
    <div style={{ padding:'16px 0', textAlign:'center', fontSize:12, color:hint }}>Cargando fixture...</div>
  )
  if (!partidos.length) return (
    <div style={{ fontSize:12, color:hint, marginTop:14 }}>Sin partidos en esta división. Generá el fixture primero.</div>
  )

  const jugados = partidos.filter(p => p.estado === 'finalizado' || p.estado === 'walkover').length

  return (
    <div style={{ marginTop:20, borderTop:'1px solid #e2e8f0', paddingTop:16 }}>
      {errorMsg && (
        <div onClick={() => setErrorMsg('')} style={{ background:'#fff1f2', color:'#e11d48', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:10, cursor:'pointer' }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ fontSize:12, fontWeight:600, color:muted }}>Fixture completo — {partidos.length} partidos</div>
        <div style={{ fontSize:11, color:hint }}>{jugados}/{partidos.length} jugados</div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {partidos.map(p => {
          const jugado = p.estado === 'finalizado' || p.estado === 'walkover'
          const nombreA = nombres[p.jugadorAId] ?? '—'
          const nombreB = nombres[p.jugadorBId] ?? '—'
          const resStr = jugado && p.setsA !== null && p.setsB !== null ? `${p.setsA}–${p.setsB}` : p.estado === 'walkover' ? 'W/O' : null
          const ganadorNombre = p.ganadorId ? (nombres[p.ganadorId] ?? '').split(' ')[0] : null
          const fechaLabel = p.fechaNumero != null
            ? `F${p.fechaNumero}${p.bloqueHorario ? ` · ${p.bloqueHorario}` : ''}`
            : 'Sin fecha'
          const fSelActual = selFecha[p.id] ?? ''
          const bSelActual = selBloque[p.id] ?? ''

          return (
            <div
              key={p.id}
              style={{
                borderRadius:8, fontSize:12,
                background: jugado ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${jugado ? '#bbf7d0' : '#e2e8f0'}`,
              }}
            >
              {/* Fila principal */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px' }}>
                <span style={{ width:90, flexShrink:0, fontWeight:600, color: p.fechaId ? muted : hint, fontSize:11, whiteSpace:'nowrap' }}>
                  {fechaLabel}
                </span>
                <span style={{ flex:1, color:text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  <span style={{ fontWeight: p.ganadorId === p.jugadorAId ? 700 : 400 }}>{nombreA}</span>
                  <span style={{ color:hint, margin:'0 5px' }}>vs</span>
                  <span style={{ fontWeight: p.ganadorId === p.jugadorBId ? 700 : 400 }}>{nombreB}</span>
                </span>

                {jugado ? (
                  <span style={{ flexShrink:0, fontWeight:700, color:'#16a34a', fontVariantNumeric:'tabular-nums' }}>
                    {resStr}{ganadorNombre ? ` (${ganadorNombre})` : ''}
                  </span>
                ) : (
                  <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
                    <select
                      value={resultados[p.id] ?? ''}
                      onChange={e => setResultados(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={selStyle}
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
                )}
              </div>

              {/* Sub-fila de programación (solo partidos no jugados) */}
              {!jugado && (
                <div style={{ display:'flex', gap:6, padding:'0 12px 8px', alignItems:'center', flexWrap:'wrap' }}>
                  <select
                    value={fSelActual}
                    onChange={e => { setSelFecha(prev => ({ ...prev, [p.id]: e.target.value })); setSelBloque(prev => ({ ...prev, [p.id]: '' })) }}
                    style={{ ...selStyle, minWidth:100 }}
                  >
                    <option value="">— fecha —</option>
                    {fechasLiga.map(f => (
                      <option key={f.id} value={f.id}>
                        Fecha {f.numero}{f.esAjuste ? ' (ajuste)' : ''}
                      </option>
                    ))}
                  </select>

                  <select
                    value={bSelActual}
                    onChange={e => setSelBloque(prev => ({ ...prev, [p.id]: e.target.value }))}
                    disabled={!fSelActual}
                    style={{ ...selStyle, minWidth:80, opacity: fSelActual ? 1 : 0.5 }}
                  >
                    <option value="">— hora —</option>
                    {bloques.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>

                  <button
                    onClick={() => handleAsignar(p)}
                    disabled={!fSelActual || !bSelActual || asignandoId === p.id}
                    style={{
                      background: fSelActual && bSelActual ? '#4f46e5' : '#e2e8f0',
                      color: fSelActual && bSelActual ? 'white' : hint,
                      border:'none', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600,
                      cursor: fSelActual && bSelActual ? 'pointer' : 'default',
                    }}
                  >
                    {asignandoId === p.id ? '...' : 'Asignar'}
                  </button>

                  {p.fechaId && (
                    <button
                      onClick={() => handleDesprogramar(p)}
                      disabled={desprogramandoId === p.id}
                      style={{ background:'transparent', border:'1px solid #fecaca', borderRadius:6, padding:'3px 10px', fontSize:11, color:'#dc2626', cursor:'pointer' }}
                    >
                      {desprogramandoId === p.id ? '...' : '× Desprogramar'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
