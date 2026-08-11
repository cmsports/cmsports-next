'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import {
  configurarCabezasOficial,
  formarGruposOficial,
  inscribirJugadorOficial,
  registrarResultadoOficial,
} from '@/app/actions/torneo-oficial'
import {
  clasificarGrupoIttf,
  formatearSets,
  type PartidoOficialStats,
  type SetMarcador,
} from '@/lib/domain/oficial-ittf'

const supabase = createClient()

type Evento = {
  id: string
  nombre: string
  categoria: string
  genero: string
  fase: string
  formato_partido: string
  campeonato_id: string
}

type Campeonato = { id: string; nombre: string }

type Inscrito = {
  id: string
  nombre: string
  asociacion: string | null
  cabeza_numero: number | null
  orden_inscripcion: number
}

type Grupo = { id: string; nombre: string; orden: number }

type Partido = {
  id: string
  grupo_id: string | null
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
  sets: SetMarcador[]
  es_walkover: boolean
  orden: number
}

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
} as const

export default function EventoOficialPage() {
  const { id } = useParams<{ id: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()

  const [evento, setEvento] = useState<Evento | null>(null)
  const [camp, setCamp] = useState<Campeonato | null>(null)
  const [inscritos, setInscritos] = useState<Inscrito[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [miembrosGrupo, setMiembrosGrupo] = useState<Array<{ grupo_id: string; inscrito_id: string }>>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [loading, setLoading] = useState(true)

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [asocNueva, setAsocNueva] = useState('')
  const [inscribiendo, setInscribiendo] = useState(false)
  const [formando, setFormando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [setsEdit, setSetsEdit] = useState<Record<string, string>>({})
  const [guardandoRes, setGuardandoRes] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: ev } = await db.from('oficial_eventos')
      .select('id,nombre,categoria,genero,fase,formato_partido,campeonato_id')
      .eq('id', id).eq('club_id', perfil.club_id).maybeSingle()
    setEvento(ev)

    if (ev?.campeonato_id) {
      const { data: c } = await db.from('oficial_campeonatos').select('id,nombre')
        .eq('id', ev.campeonato_id).maybeSingle()
      setCamp(c)
    }

    const { data: ins } = await db.from('oficial_inscritos')
      .select('id,nombre,asociacion,cabeza_numero,orden_inscripcion')
      .eq('evento_id', id).order('orden_inscripcion')
    setInscritos(ins || [])

    const { data: gr } = await db.from('oficial_grupos')
      .select('id,nombre,orden').eq('evento_id', id).order('orden')
    setGrupos(gr || [])

    const grupoIds = (gr || []).map((g: Grupo) => g.id)
    if (grupoIds.length) {
      const { data: mg } = await db.from('oficial_grupo_inscritos')
        .select('grupo_id,inscrito_id').in('grupo_id', grupoIds)
      setMiembrosGrupo(mg || [])
    } else {
      setMiembrosGrupo([])
    }

    const { data: par } = await db.from('oficial_partidos')
      .select('id,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,orden')
      .eq('evento_id', id).order('orden')
    setPartidos((par || []).map((p: Partido) => ({ ...p, sets: (p.sets || []) as SetMarcador[] })))
    setLoading(false)
  }, [id, perfil?.club_id])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) void cargar()
  }, [authLoading, perfil, cargar, router])

  useEnVivo(
    ['oficial_eventos', 'oficial_inscritos', 'oficial_grupos', 'oficial_grupo_inscritos', 'oficial_partidos'],
    perfil?.club_id ?? null,
    () => { void cargar() },
    {
      conClub: [
        'oficial_eventos', 'oficial_inscritos', 'oficial_grupos',
        'oficial_grupo_inscritos', 'oficial_partidos',
      ],
    },
  )

  const nombrePorId = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of inscritos) {
      m.set(i.id, i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre)
    }
    return m
  }, [inscritos])

  const inscritosPorGrupo = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const m of miembrosGrupo) {
      const lista = map.get(m.grupo_id) ?? []
      lista.push(m.inscrito_id)
      map.set(m.grupo_id, lista)
    }
    return map
  }, [miembrosGrupo])

  const partidosPorGrupo = useMemo(() => {
    const map = new Map<string, Partido[]>()
    for (const p of partidos) {
      if (!p.grupo_id) continue
      const lista = map.get(p.grupo_id) ?? []
      lista.push(p)
      map.set(p.grupo_id, lista)
    }
    return map
  }, [partidos])

  async function inscribir() {
    setErrorMsg('')
    setInscribiendo(true)
    const res = await inscribirJugadorOficial({
      eventoId: id,
      nombre: nombreNuevo,
      asociacion: asocNueva || undefined,
    })
    setInscribiendo(false)
    if (res.error) { setErrorMsg(res.error); return }
    setNombreNuevo('')
    setAsocNueva('')
    void cargar()
  }

  async function cambiarCabeza(inscritoId: string, valor: string) {
    const num = valor === '' ? null : Number(valor)
    const cabezas = inscritos
      .filter(i => i.id !== inscritoId && i.cabeza_numero != null)
      .map(i => ({ inscritoId: i.id, numero: i.cabeza_numero! }))
    if (num != null) cabezas.push({ inscritoId, numero: num })
    cabezas.sort((a, b) => a.numero - b.numero)
    const res = await configurarCabezasOficial({ eventoId: id, cabezas })
    if (res.error) setErrorMsg(res.error)
    else void cargar()
  }

  async function formarGrupos() {
    setErrorMsg('')
    setFormando(true)
    const res = await formarGruposOficial({ eventoId: id })
    setFormando(false)
    if (res.error) { setErrorMsg(res.error); return }
    void cargar()
  }

  async function guardarResultado(partidoId: string) {
    const texto = setsEdit[partidoId]?.trim()
    if (!texto) return
    setGuardandoRes(partidoId)
    const res = await registrarResultadoOficial({ partidoId, setsTexto: texto })
    setGuardandoRes(null)
    if (res.error) { setErrorMsg(res.error); return }
    setSetsEdit(prev => { const n = { ...prev }; delete n[partidoId]; return n })
    void cargar()
  }

  function statsGrupo(grupoId: string) {
    const ids = inscritosPorGrupo.get(grupoId) ?? []
    const partidosGrupo = partidosPorGrupo.get(grupoId) ?? []
    const statsInput: PartidoOficialStats[] = partidosGrupo
      .filter(p => p.ganador_id && p.inscrito_a_id && p.inscrito_b_id)
      .map(p => ({
        inscritoA: p.inscrito_a_id!,
        inscritoB: p.inscrito_b_id!,
        ganador: p.ganador_id,
        sets: p.sets,
        esWalkover: p.es_walkover,
      }))
    return clasificarGrupoIttf(ids, statsInput)
  }

  const enInscripcion = evento?.fase === 'inscripcion'

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 80px' }}>
        <button
          type="button"
          onClick={() => router.push(camp ? `/torneo-oficial/${camp.id}` : '/torneo-oficial')}
          style={btnBack}
        >
          ← {camp?.nombre || 'Volver'}
        </button>

        {loading || !evento ? (
          <p style={{ color: '#94a3b8' }}>{loading ? 'Cargando…' : 'Evento no encontrado'}</p>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>{evento.nombre}</h1>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
                {evento.categoria} · {evento.genero} · {evento.formato_partido.toUpperCase()} · fase {evento.fase}
              </p>
            </div>

            {errorMsg && (
              <div style={{ ...card, padding: 12, marginBottom: 14, color: '#e11d48', fontSize: 13 }}>
                {errorMsg}
              </div>
            )}

            {enInscripcion && (
              <>
                <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Inscripción ({inscritos.length})</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <div>
                      <label style={labelStyle}>Nombre</label>
                      <input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Asociación (opc.)</label>
                      <input value={asocNueva} onChange={e => setAsocNueva(e.target.value)} style={inputStyle} />
                    </div>
                    <button
                      type="button"
                      onClick={inscribir}
                      disabled={inscribiendo || !nombreNuevo.trim()}
                      style={{ ...btnPrimary, opacity: inscribiendo ? 0.6 : 1 }}
                    >
                      {inscribiendo ? '…' : 'Inscribir'}
                    </button>
                  </div>
                </div>

                {inscritos.length > 0 && (
                  <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Cabezas de serie</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {inscritos.map(i => (
                        <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                          <span style={{ flex: 1 }}>{nombrePorId.get(i.id)}</span>
                          <select
                            value={i.cabeza_numero ?? ''}
                            onChange={e => void cambiarCabeza(i.id, e.target.value)}
                            style={{ ...inputStyle, width: 90 }}
                          >
                            <option value="">—</option>
                            {Array.from({ length: Math.min(inscritos.length, 16) }, (_, n) => n + 1).map(n => (
                              <option key={n} value={n}>{n}ª cabeza</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={formarGrupos}
                      disabled={formando || inscritos.length < 4}
                      style={{ ...btnPrimary, marginTop: 16, width: '100%' }}
                    >
                      {formando ? 'Formando grupos…' : `Formar grupos (${inscritos.length} inscritos, mín. 4)`}
                    </button>
                  </div>
                )}
              </>
            )}

            {grupos.map(g => {
              const stats = statsGrupo(g.id)
              const partidosG = partidosPorGrupo.get(g.id) ?? []
              return (
                <div key={g.id} style={{ ...card, padding: 16, marginBottom: 16 }}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Grupo {g.nombre}</h2>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Jugador</th>
                        <th style={thStyle}>Pts</th>
                        <th style={thStyle}>PG</th>
                        <th style={thStyle}>PP</th>
                        <th style={thStyle}>J+</th>
                        <th style={thStyle}>J−</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((s, idx) => (
                        <tr key={s.inscritoId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={tdStyle}>{idx + 1}</td>
                          <td style={tdStyle}>{nombrePorId.get(s.inscritoId) || s.inscritoId}</td>
                          <td style={tdStyle}><strong>{s.pts}</strong></td>
                          <td style={tdStyle}>{s.pg}</td>
                          <td style={tdStyle}>{s.pp}</td>
                          <td style={tdStyle}>{s.juegosGanados}</td>
                          <td style={tdStyle}>{s.juegosPerdidos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {partidosG.map(p => {
                      const a = p.inscrito_a_id ? nombrePorId.get(p.inscrito_a_id) : '?'
                      const b = p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) : '?'
                      const cerrado = Boolean(p.ganador_id)
                      return (
                        <div
                          key={p.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: 12,
                            background: cerrado ? '#f8fafc' : '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14 }}>
                              {a} <span style={{ color: '#94a3b8' }}>vs</span> {b}
                            </span>
                            {cerrado ? (
                              <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                                {formatearSets(p.sets)}
                                {p.es_walkover ? ' · W.O.' : ''}
                              </span>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                  placeholder="11-6; 11-8; 11-4"
                                  value={setsEdit[p.id] ?? ''}
                                  onChange={e => setSetsEdit(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  style={{ ...inputStyle, width: 180, margin: 0 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => void guardarResultado(p.id)}
                                  disabled={guardandoRes === p.id}
                                  style={btnSmall}
                                >
                                  {guardandoRes === p.id ? '…' : 'Guardar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push(`/torneo-oficial/marcador/${p.id}`)}
                                  style={btnMarcador}
                                >
                                  Marcador
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </AppLayout>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }
const inputStyle: CSSProperties = {
  width: '100%', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '8px 10px', fontSize: 14, boxSizing: 'border-box',
}
const thStyle: CSSProperties = { padding: '6px 8px', fontWeight: 600 }
const tdStyle: CSSProperties = { padding: '8px' }
const btnBack: CSSProperties = {
  background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '6px 12px', marginBottom: 14, cursor: 'pointer',
}
const btnPrimary: CSSProperties = {
  background: '#0f172a', color: 'white', border: 'none', borderRadius: 8,
  padding: '10px 16px', fontWeight: 600, cursor: 'pointer',
}
const btnSmall: CSSProperties = {
  background: '#0f172a', color: 'white', border: 'none', borderRadius: 6,
  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
}
const btnMarcador: CSSProperties = {
  background: '#0369a1', color: 'white', border: 'none', borderRadius: 6,
  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
}
