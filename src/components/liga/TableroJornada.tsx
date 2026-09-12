'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarResultadoPartido, editarResultadoPartido, registrarWalkover } from '@/app/actions/liga'
import { actualizarEstadosJornada } from '@/app/actions/ligaJornadas'
import MarcadorSets from '@/components/torneos/MarcadorSets'
import { useEnVivo } from '@/lib/useEnVivo'

// El tablero de una fecha en una liga por jornadas: la misma grilla
// Horario × Mesa del tablero de siempre (tarjetas con los dos jugadores, el
// árbitro y el resultado), solo que sin arrastrar ni iniciar/terminar: acá
// la programación la arma el motor y la fecha se cierra sola. Un toque en
// la tarjeta abre la planilla de sets; el W.O. va con dos botones.

const supabase = createClient()
const ink = '#0f172a', muted = '#64748b', hint = '#94a3b8'

const DIV_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#ec4899', '#3b82f6']
function divColor(nombre: string) {
  let h = 0; for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) | 0
  return DIV_COLORS[Math.abs(h) % DIV_COLORS.length]
}
function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return (partes.length >= 2 ? partes[0][0] + partes[partes.length - 1][0] : nombre.slice(0, 2)).toUpperCase()
}

type Partido = {
  id: string
  mesaId: string | null
  hora: string | null
  jugadorAId: string
  jugadorBId: string
  arbitroId: string | null
  estado: string
  setsA: number | null
  setsB: number | null
  ganadorId: string | null
  parciales: Array<[number, number]> | null
}
type Mesa = { id: string; numero: number }

const ESTADO_INFO: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  programada: { label: 'Programada', emoji: '📋', color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
  en_juego:   { label: 'En juego',   emoji: '🟢', color: '#059669', bg: '#d1fae5', border: '#6ee7b7' },
  finalizada: { label: 'Terminada',  emoji: '✅', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
}

export function TableroJornada({ ligaId, fechaId, divisionId, divisionNombre, nombres, clubId, onCambio }: {
  ligaId: string
  fechaId: string
  divisionId: string
  divisionNombre: string
  nombres: Record<string, string>
  clubId: string | null
  onCambio?: () => void
}) {
  const [fecha, setFecha] = useState<{ numero: number; fecha: string | null; estado: string } | null>(null)
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [cargando, setCargando] = useState(true)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const [{ data: f }, { data: ps }, { data: ms }] = await Promise.all([
      sb.from('liga_fechas').select('numero, fecha, estado').eq('id', fechaId).single(),
      sb.from('liga_partidos')
        .select('id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id, estado, sets_a, sets_b, ganador_id, parciales')
        .eq('fecha_id', fechaId).eq('division_id', divisionId).is('deleted_at', null),
      sb.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero'),
    ])
    setFecha(f ?? null)
    setMesas((ms ?? []) as Mesa[])
    setPartidos(((ps ?? []) as Array<Record<string, unknown>>).map(p => ({
      id: p.id as string,
      mesaId: (p.mesa_id as string | null) ?? null,
      hora: p.bloque_horario ? String(p.bloque_horario).slice(0, 5) : null,
      jugadorAId: p.jugador_a_id as string,
      jugadorBId: p.jugador_b_id as string,
      arbitroId: (p.arbitro_id as string | null) ?? null,
      estado: p.estado as string,
      setsA: (p.sets_a as number | null) ?? null,
      setsB: (p.sets_b as number | null) ?? null,
      ganadorId: (p.ganador_id as string | null) ?? null,
      parciales: Array.isArray(p.parciales) ? (p.parciales as Array<[number, number]>) : null,
    })))
    setCargando(false)
  }, [ligaId, fechaId, divisionId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['liga_partidos'], clubId, () => { void cargar() }, { filtro: `liga_id=eq.${ligaId}` })

  async function despues(partidoId: string, res: { error?: string }) {
    if (!res.error) {
      const est = await actualizarEstadosJornada({ partidoId })
      if (est.error) res = est
    }
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setMarcando(null)
    await cargar()
    onCambio?.()
  }

  async function guardarSets(p: Partido, parciales: Array<[number, number]>) {
    setGuardando(true); setError('')
    const setsA = parciales.filter(([a, b]) => a > b).length
    const setsB = parciales.length - setsA
    const jugado = p.estado === 'finalizado' || p.estado === 'walkover'
    const res = jugado
      ? await editarResultadoPartido({ partidoId: p.id, setsA, setsB, parciales })
      : await registrarResultadoPartido({ partidoId: p.id, setsA, setsB, parciales })
    await despues(p.id, res)
  }

  async function guardarWO(p: Partido, ganadorId: string) {
    if (!confirm(`¿${nombres[ganadorId] ?? 'Este jugador'} gana por W.O. (el rival no se presentó)?`)) return
    setGuardando(true); setError('')
    await despues(p.id, await registrarWalkover({ partidoId: p.id, ganadorId }))
  }

  if (cargando) return <div style={{ padding: 32, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando…</div>
  if (!fecha) return <div style={{ padding: 16, color: muted, fontSize: 13 }}>Fecha no encontrada</div>

  const dc = divColor(divisionNombre)
  const est = ESTADO_INFO[fecha.estado] ?? ESTADO_INFO.programada
  const mesasUsadas = mesas.filter(m => partidos.some(p => p.mesaId === m.id))
  const horas = [...new Set(partidos.map(p => p.hora).filter((h): h is string => !!h))].sort()
  const partidoEn = (mesaId: string, hora: string) => partidos.find(p => p.mesaId === mesaId && p.hora === hora)
  const total = partidos.length
  const jugados = partidos.filter(p => p.estado === 'finalizado' || p.estado === 'walkover').length
  const pct = total ? Math.round((jugados / total) * 100) : 0
  const fechaLinda = fecha.fecha ? `${fecha.fecha.slice(8, 10)}/${fecha.fecha.slice(5, 7)}` : ''
  const abierto = partidos.find(p => p.id === marcando) ?? null

  return (
    <div>
      {/* Cabecera oscura, como el tablero de siempre */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', borderRadius: 16, padding: '18px 22px', marginBottom: 16, boxShadow: '0 8px 24px rgba(49,46,129,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 24 }}>🏓</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>Fecha {fecha.numero}{fechaLinda ? ` · ${fechaLinda}` : ''}</span>
              <span style={{ background: est.bg, color: est.color, border: `1px solid ${est.border}`, padding: '3px 11px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{est.emoji} {est.label}</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
              {divisionNombre} · {mesasUsadas.length ? `mesa${mesasUsadas.length > 1 ? 's' : ''} ${mesasUsadas.map(m => m.numero).join(', ')}` : 'sin mesas'} · ✏️ toca un partido para marcar el resultado
            </div>
          </div>
        </div>
        {total > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Progreso</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{jugados}/{total} partidos · {pct}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6ee7b7,#10b981)', borderRadius: 99, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div onClick={() => setError('')} style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14, cursor: 'pointer', border: '1px solid #fecaca' }}>⚠️ {error}</div>
      )}

      {total === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #e2e8f0', borderRadius: 16, padding: 28, textAlign: 'center', color: muted, fontSize: 13 }}>
          Esta división no juega en esta fecha.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
                  <th style={{ position: 'sticky', left: 0, background: '#1e1b4b', padding: '12px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Horario</th>
                  {mesasUsadas.map(m => (
                    <th key={m.id} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, minWidth: 190 }}>🏓 Mesa {m.numero}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {horas.map((hora, i) => (
                  <tr key={hora} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
                    <td style={{ position: 'sticky', left: 0, background: i % 2 === 0 ? '#fff' : '#fafbff', padding: '10px 16px', fontSize: 12, fontWeight: 700, color: ink, fontFamily: 'monospace', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>⏰ {hora}</td>
                    {mesasUsadas.map(m => {
                      const p = partidoEn(m.id, hora)
                      if (!p) return <td key={m.id} style={{ padding: 8, borderRight: '1px solid #f1f5f9' }}><div style={{ height: 52, borderRadius: 12, border: '1.5px dashed #e2e8f0', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' }} /></td>
                      const fin = p.estado === 'finalizado', wo = p.estado === 'walkover'
                      return (
                        <td key={m.id} style={{ padding: 8, borderRight: '1px solid #f1f5f9', verticalAlign: 'top', minWidth: 190 }}>
                          <div
                            onClick={() => setMarcando(x => (x === p.id ? null : p.id))}
                            style={{
                              borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                              background: fin ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : wo ? 'linear-gradient(135deg,#fffbeb,#fef9c3)' : '#fff',
                              border: `1px solid ${fin ? '#86efac' : wo ? '#fcd34d' : marcando === p.id ? '#6366f1' : '#e8edf5'}`,
                              borderLeft: `4px solid ${dc}`,
                              boxShadow: fin ? '0 2px 8px rgba(16,185,129,0.12)' : '0 2px 8px rgba(15,23,42,0.06)',
                            }}
                          >
                            {[p.jugadorAId, p.jugadorBId].map((jid, ji) => {
                              const nm = nombres[jid] ?? '—'
                              const gano = p.ganadorId === jid
                              return (
                                <div key={jid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: ji === 0 ? 3 : 0 }}>
                                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: dc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: 'white', flexShrink: 0, opacity: 0.85 }}>{nm !== '—' ? iniciales(nm) : '?'}</div>
                                  <span style={{ fontSize: 12, fontWeight: gano ? 800 : 600, color: gano ? '#15803d' : ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</span>
                                  {gano && <span style={{ fontSize: 10 }}>🏆</span>}
                                  {ji === 0 && !gano && <span style={{ fontSize: 9, color: hint, flexShrink: 0, marginLeft: 'auto' }}>vs</span>}
                                </div>
                              )
                            })}
                            {fin && (
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '4px 8px' }}>
                                <span style={{ fontSize: 13, fontWeight: 900, color: '#15803d', fontFamily: 'monospace' }}>{p.setsA}–{p.setsB}</span>
                                {p.parciales && <span style={{ fontSize: 10, color: '#166534', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.parciales.map(([a, b]) => `${a}-${b}`).join(' ')}</span>}
                                <span style={{ marginLeft: 'auto', fontSize: 12 }}>✅</span>
                              </div>
                            )}
                            {wo && (
                              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 8, padding: '4px 10px' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#a16207' }}>🏳️ W.O.</span>
                              </div>
                            )}
                            {!fin && !wo && (
                              <div style={{ fontSize: 10, color: muted, marginTop: 7, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', background: '#f8fafc', borderRadius: 6 }}>
                                <span style={{ fontSize: 12 }}>👤</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.arbitroId ? nombres[p.arbitroId] ?? '—' : 'Sin árbitro'}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Planilla de sets: un panel flotante sobre el tablero */}
      {abierto && (
        <div onClick={e => { if (e.target === e.currentTarget) setMarcando(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, width: 'min(460px, 100%)', boxShadow: '0 20px 60px rgba(15,23,42,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: ink }}>
                {abierto.estado === 'finalizado' ? 'Corregir resultado' : 'Marcar resultado'}
                <span style={{ fontSize: 12, color: hint, fontWeight: 500, marginLeft: 8 }}>{abierto.hora} · mesa {mesas.find(m => m.id === abierto.mesaId)?.numero ?? '—'}</span>
              </div>
              <button onClick={() => setMarcando(null)} style={{ background: 'transparent', border: 'none', color: hint, fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <MarcadorSets
              key={`${abierto.id}-${abierto.setsA ?? ''}-${abierto.setsB ?? ''}`}
              nombreA={nombres[abierto.jugadorAId] ?? '—'}
              nombreB={nombres[abierto.jugadorBId] ?? '—'}
              formato="bo5"
              guardando={guardando}
              onCancelar={() => setMarcando(null)}
              onListo={parciales => guardarSets(abierto, parciales)}
            />
            {abierto.estado !== 'finalizado' && abierto.estado !== 'walkover' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: muted }}>No se presentó:</span>
                <button onClick={() => guardarWO(abierto, abierto.jugadorAId)} disabled={guardando}
                  style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  W.O. · gana {(nombres[abierto.jugadorAId] ?? '').split(' ')[0]}
                </button>
                <button onClick={() => guardarWO(abierto, abierto.jugadorBId)} disabled={guardando}
                  style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  W.O. · gana {(nombres[abierto.jugadorBId] ?? '').split(' ')[0]}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
