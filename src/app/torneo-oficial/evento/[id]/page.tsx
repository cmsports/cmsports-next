'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { CONFIG } from '@/lib/config'
import {
  configurarCabezasOficial,
  corregirResultadoOficial,
  formarGruposOficial,
  inscribirJugadorOficial,
  programarEventoOficial,
  registrarResultadoOficial,
  reiniciarLlavesOficial,
  sincronizarLlavesOficial,
} from '@/app/actions/torneo-oficial'
import {
  clasificarGrupoIttf,
  formatearSets,
  type PartidoOficialStats,
  type SetMarcador,
} from '@/lib/domain/oficial-ittf'
import BracketOficial from '@/components/torneo-oficial/BracketOficial'
import { exportarGruposOficialPdf, exportarLlavesOficialPdf, exportarProgramaOficialPdf } from '@/lib/oficial-export-pdf'

const supabase = createClient()

type Tab = 'grupos' | 'llaves' | 'programa'

type Evento = {
  id: string
  nombre: string
  categoria: string
  genero: string
  fase: string
  formato_partido: string
  campeonato_id: string
  campeon_inscrito_id: string | null
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
  fase: string
  grupo_id: string | null
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
  sets: SetMarcador[]
  es_walkover: boolean
  orden: number
  mesa: number | null
  programado_en: string | null
}

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
} as const

const FASE_LABELS = CONFIG.FASE_LABELS as Record<string, string>

export default function EventoOficialPage() {
  const { id } = useParams<{ id: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const syncLlavesRef = useRef<string | null>(null)

  const [evento, setEvento] = useState<Evento | null>(null)
  const [camp, setCamp] = useState<Campeonato | null>(null)
  const [inscritos, setInscritos] = useState<Inscrito[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [miembrosGrupo, setMiembrosGrupo] = useState<Array<{ grupo_id: string; inscrito_id: string }>>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('grupos')

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [asocNueva, setAsocNueva] = useState('')
  const [inscribiendo, setInscribiendo] = useState(false)
  const [formando, setFormando] = useState(false)
  const [syncLlaves, setSyncLlaves] = useState(false)
  const [programando, setProgramando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [setsEdit, setSetsEdit] = useState<Record<string, string>>({})
  const [guardandoRes, setGuardandoRes] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [reiniciando, setReiniciando] = useState(false)

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: ev } = await db.from('oficial_eventos')
      .select('id,nombre,categoria,genero,fase,formato_partido,campeonato_id,campeon_inscrito_id')
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
    } else setMiembrosGrupo([])

    const { data: par } = await db.from('oficial_partidos')
      .select('id,fase,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,orden,mesa,programado_en')
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
    { conClub: ['oficial_eventos', 'oficial_inscritos', 'oficial_grupos', 'oficial_grupo_inscritos', 'oficial_partidos'] },
  )

  useEffect(() => {
    if (!evento || loading || authLoading) return
    if (evento.fase !== 'grupos' && evento.fase !== 'llaves') return
    if (!grupos.length) return
    const firma = `${grupos.length}|${partidos.filter(p => p.fase === 'grupos' && p.ganador_id).length}`
    if (syncLlavesRef.current === firma) return
    syncLlavesRef.current = firma
    void sincronizarLlavesOficial({ eventoId: id }).then(() => void cargar())
  }, [evento?.fase, grupos.length, partidos, loading, authLoading, id, cargar])

  useEffect(() => {
    if (evento?.fase === 'llaves' || evento?.fase === 'finalizado') setTab(t => t === 'grupos' ? 'llaves' : t)
  }, [evento?.fase])

  const nombrePorId = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of inscritos) m.set(i.id, i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre)
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

  const partidosPlayoff = useMemo(() =>
    partidos.filter(p => p.fase !== 'grupos').sort((a, b) => {
      const fa = CONFIG.FASES_ORDEN.indexOf(a.fase as typeof CONFIG.FASES_ORDEN[number])
      const fb = CONFIG.FASES_ORDEN.indexOf(b.fase as typeof CONFIG.FASES_ORDEN[number])
      return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || a.orden - b.orden
    }),
  [partidos])

  const partidosPorFase = useMemo(() => {
    const map = new Map<string, Partido[]>()
    for (const p of partidosPlayoff) {
      const lista = map.get(p.fase) ?? []
      lista.push(p)
      map.set(p.fase, lista)
    }
    return map
  }, [partidosPlayoff])

  const programaFilas = useMemo(() =>
    [...partidos]
      .filter(p => p.programado_en && p.inscrito_a_id)
      .sort((a, b) => new Date(a.programado_en!).getTime() - new Date(b.programado_en!).getTime())
      .map(p => ({
        hora: new Date(p.programado_en!).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
        mesa: p.mesa ?? 0,
        evento: evento?.nombre || '',
        fase: FASE_LABELS[p.fase] || p.fase,
        partido: `${nombrePorId.get(p.inscrito_a_id!) || '?'} vs ${p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) : 'BYE'}`,
        resultado: p.ganador_id ? formatearSets(p.sets) : undefined,
      })),
  [partidos, evento, nombrePorId])

  async function inscribir() {
    setErrorMsg('')
    setInscribiendo(true)
    const res = await inscribirJugadorOficial({ eventoId: id, nombre: nombreNuevo, asociacion: asocNueva || undefined })
    setInscribiendo(false)
    if (res.error) { setErrorMsg(res.error); return }
    setNombreNuevo(''); setAsocNueva('')
    void cargar()
  }

  async function cambiarCabeza(inscritoId: string, valor: string) {
    const num = valor === '' ? null : Number(valor)
    const cabezas = inscritos.filter(i => i.id !== inscritoId && i.cabeza_numero != null)
      .map(i => ({ inscritoId: i.id, numero: i.cabeza_numero! }))
    if (num != null) cabezas.push({ inscritoId, numero: num })
    cabezas.sort((a, b) => a.numero - b.numero)
    const res = await configurarCabezasOficial({ eventoId: id, cabezas })
    if (res.error) setErrorMsg(res.error)
    else void cargar()
  }

  async function formarGrupos() {
    setErrorMsg(''); setFormando(true)
    const res = await formarGruposOficial({ eventoId: id })
    setFormando(false)
    if (res.error) { setErrorMsg(res.error); return }
    void cargar()
  }

  async function armarLlaves() {
    setErrorMsg(''); setSyncLlaves(true)
    const res = await sincronizarLlavesOficial({ eventoId: id })
    setSyncLlaves(false)
    if (res.error) setErrorMsg(res.error)
    else void cargar()
  }

  async function programar() {
    setErrorMsg(''); setProgramando(true)
    const res = await programarEventoOficial({ eventoId: id })
    setProgramando(false)
    if (res.error) setErrorMsg(res.error)
    else void cargar()
  }

  async function guardarResultado(partidoId: string, opts?: { walkover?: boolean; ganadorId?: string }) {
    const texto = setsEdit[partidoId]?.trim()
    if (!opts?.walkover && !texto) return
    setGuardandoRes(partidoId)
    const res = await registrarResultadoOficial({
      partidoId,
      setsTexto: opts?.walkover ? undefined : texto,
      esWalkover: opts?.walkover,
      ganadorId: opts?.ganadorId,
    })
    setGuardandoRes(null)
    if (res.error) { setErrorMsg(res.error); return }
    setSetsEdit(prev => { const n = { ...prev }; delete n[partidoId]; return n })
    void cargar()
  }

  async function corregir(partidoId: string, ganadorId: string) {
    setGuardandoRes(partidoId)
    const res = await corregirResultadoOficial({
      partidoId,
      nuevoGanadorId: ganadorId,
      setsTexto: setsEdit[partidoId],
    })
    setGuardandoRes(null)
    if (res.error) { setErrorMsg(res.error); return }
    setEditandoId(null)
    void cargar()
  }

  async function reiniciarLlaves() {
    if (!confirm('¿Borrar las llaves no jugadas y reconstruir desde los grupos?')) return
    setReiniciando(true)
    const res = await reiniciarLlavesOficial({ eventoId: id })
    setReiniciando(false)
    if (res.error) setErrorMsg(res.error)
    else void cargar()
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

  async function exportarGruposPdf() {
    if (!evento || !camp) return
    await exportarGruposOficialPdf({
      titulo: evento.nombre,
      club: camp.nombre,
      grupos: grupos.map(g => ({
        nombre: g.nombre,
        filas: statsGrupo(g.id).map((s, idx) => ({
          pos: idx + 1,
          nombre: nombrePorId.get(s.inscritoId) || s.inscritoId,
          pts: s.pts,
          pg: s.pg,
          pp: s.pp,
        })),
      })),
      nombreArchivo: `${evento.nombre.replace(/\s+/g, '_')}_grupos.pdf`,
    })
  }

  async function exportarProgramaPdf() {
    if (!evento || !camp) return
    await exportarProgramaOficialPdf({
      titulo: `Programa — ${evento.nombre}`,
      club: camp.nombre,
      filas: programaFilas,
      nombreArchivo: `${evento.nombre.replace(/\s+/g, '_')}_programa.pdf`,
    })
  }

  async function exportarLlavesPdf() {
    if (!evento || !camp) return
    await exportarLlavesOficialPdf({
      titulo: `Llaves — ${evento.nombre}`,
      club: camp.nombre,
      filas: partidosPlayoff.map(p => ({
        fase: FASE_LABELS[p.fase] || p.fase,
        partido: `${nombrePorId.get(p.inscrito_a_id!) || '?'} vs ${p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) : 'BYE'}`,
        resultado: p.ganador_id ? `${formatearSets(p.sets)}${p.es_walkover ? ' W.O.' : ''}` : '—',
      })),
      nombreArchivo: `${evento.nombre.replace(/\s+/g, '_')}_llaves.pdf`,
    })
  }

  function renderPartidoRow(p: Partido) {
    const a = p.inscrito_a_id ? nombrePorId.get(p.inscrito_a_id) : '?'
    const esBye = !p.inscrito_b_id
    const b = esBye ? 'BYE' : (p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) : '?')
    const cerrado = Boolean(p.ganador_id)
    const ganadorNombre = p.ganador_id ? nombrePorId.get(p.ganador_id) : null

    return (
      <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: cerrado ? '#f8fafc' : '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>
            {a} <span style={{ color: '#94a3b8' }}>vs</span> {b}
            {p.mesa ? <span style={{ color: '#64748b', fontSize: 12 }}> · M{p.mesa}</span> : null}
          </span>
          {cerrado ? (
            editandoId === p.id ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="Sets corregidos" value={setsEdit[p.id] ?? ''}
                  onChange={e => setSetsEdit(prev => ({ ...prev, [p.id]: e.target.value }))}
                  style={{ ...inputStyle, width: 160, margin: 0 }} />
                {p.inscrito_a_id && (
                  <button type="button" onClick={() => void corregir(p.id, p.inscrito_a_id!)} style={btnSmall}>Gana A</button>
                )}
                {p.inscrito_b_id && (
                  <button type="button" onClick={() => void corregir(p.id, p.inscrito_b_id!)} style={btnSmall}>Gana B</button>
                )}
                <button type="button" onClick={() => setEditandoId(null)} style={btnGhost}>Cancelar</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                  {ganadorNombre && !esBye ? `✓ ${ganadorNombre}` : 'BYE'} · {formatearSets(p.sets)}{p.es_walkover ? ' · W.O.' : ''}
                </span>
                {!esBye && evento?.fase !== 'finalizado' && (
                  <button type="button" onClick={() => setEditandoId(p.id)} style={btnGhost}>Corregir</button>
                )}
              </div>
            )
          ) : esBye ? (
            <span style={{ fontSize: 12, color: '#64748b' }}>Avance automático</span>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="11-6; 11-8; 11-4" value={setsEdit[p.id] ?? ''}
                onChange={e => setSetsEdit(prev => ({ ...prev, [p.id]: e.target.value }))}
                style={{ ...inputStyle, width: 180, margin: 0 }} />
              <button type="button" onClick={() => void guardarResultado(p.id)} disabled={guardandoRes === p.id} style={btnSmall}>
                {guardandoRes === p.id ? '…' : 'Guardar'}
              </button>
              {p.inscrito_a_id && p.inscrito_b_id && (
                <>
                  <button type="button" title="W.O. gana A"
                    onClick={() => void guardarResultado(p.id, { walkover: true, ganadorId: p.inscrito_a_id! })}
                    style={btnWo}>W.O. A</button>
                  <button type="button" title="W.O. gana B"
                    onClick={() => void guardarResultado(p.id, { walkover: true, ganadorId: p.inscrito_b_id! })}
                    style={btnWo}>W.O. B</button>
                </>
              )}
              <button type="button" onClick={() => router.push(`/torneo-oficial/marcador/${p.id}`)} style={btnMarcador}>Marcador</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const enInscripcion = evento?.fase === 'inscripcion'
  const campeonNombre = evento?.campeon_inscrito_id ? nombrePorId.get(evento.campeon_inscrito_id) : null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 80px' }}>
        <button type="button" onClick={() => router.push(camp ? `/torneo-oficial/${camp.id}` : '/torneo-oficial')} style={btnBack}>
          ← {camp?.nombre || 'Volver'}
        </button>

        {loading || !evento ? (
          <p style={{ color: '#94a3b8' }}>{loading ? 'Cargando…' : 'Evento no encontrado'}</p>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>{evento.nombre}</h1>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
                {evento.categoria} · {evento.genero} · {evento.formato_partido.toUpperCase()} · fase {evento.fase}
                {campeonNombre ? ` · 🏆 ${campeonNombre}` : ''}
              </p>
            </div>

            {errorMsg && <div style={{ ...card, padding: 12, marginBottom: 14, color: '#e11d48', fontSize: 13 }}>{errorMsg}</div>}

            {!enInscripcion && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {(['grupos', 'llaves', 'programa'] as Tab[]).map(t => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    style={{ ...tabBtn, ...(tab === t ? tabBtnActivo : {}) }}>
                    {t === 'grupos' ? 'Grupos' : t === 'llaves' ? 'Llaves' : 'Programa'}
                  </button>
                ))}
                {tab === 'llaves' && (
                  <>
                    <button type="button" onClick={() => void armarLlaves()} disabled={syncLlaves} style={btnGhost}>
                      {syncLlaves ? 'Sincronizando…' : '↻ Sincronizar llaves'}
                    </button>
                    <button type="button" onClick={() => void reiniciarLlaves()} disabled={reiniciando} style={btnGhost}>
                      {reiniciando ? '…' : 'Reiniciar llaves'}
                    </button>
                    {partidosPlayoff.length > 0 && (
                      <button type="button" onClick={() => void exportarLlavesPdf()} style={btnGhost}>PDF llaves</button>
                    )}
                  </>
                )}
                {tab === 'programa' && (
                  <>
                    <button type="button" onClick={() => void programar()} disabled={programando} style={btnGhost}>
                      {programando ? 'Programando…' : 'Auto-programar'}
                    </button>
                    <button type="button" onClick={() => void exportarProgramaPdf()} style={btnGhost}>PDF programa</button>
                  </>
                )}
                {tab === 'grupos' && grupos.length > 0 && (
                  <button type="button" onClick={() => void exportarGruposPdf()} style={btnGhost}>PDF grupos</button>
                )}
              </div>
            )}

            {enInscripcion && (
              <>
                <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Inscripción ({inscritos.length})</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <div><label style={labelStyle}>Nombre</label>
                      <input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Asociación (opc.)</label>
                      <input value={asocNueva} onChange={e => setAsocNueva(e.target.value)} style={inputStyle} /></div>
                    <button type="button" onClick={() => void inscribir()} disabled={inscribiendo || !nombreNuevo.trim()}
                      style={{ ...btnPrimary, opacity: inscribiendo ? 0.6 : 1 }}>{inscribiendo ? '…' : 'Inscribir'}</button>
                  </div>
                </div>
                {inscritos.length > 0 && (
                  <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Cabezas de serie</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {inscritos.map(i => (
                        <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                          <span style={{ flex: 1 }}>{nombrePorId.get(i.id)}</span>
                          <select value={i.cabeza_numero ?? ''} onChange={e => void cambiarCabeza(i.id, e.target.value)}
                            style={{ ...inputStyle, width: 90 }}>
                            <option value="">—</option>
                            {Array.from({ length: Math.min(inscritos.length, 16) }, (_, n) => n + 1).map(n => (
                              <option key={n} value={n}>{n}ª cabeza</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => void formarGrupos()} disabled={formando || inscritos.length < 4}
                      style={{ ...btnPrimary, marginTop: 16, width: '100%' }}>
                      {formando ? 'Formando grupos…' : `Formar grupos (${inscritos.length} inscritos, mín. 4)`}
                    </button>
                  </div>
                )}
              </>
            )}

            {(enInscripcion || tab === 'grupos') && grupos.map(g => {
              const stats = statsGrupo(g.id)
              const partidosG = partidosPorGrupo.get(g.id) ?? []
              return (
                <div key={g.id} style={{ ...card, padding: 16, marginBottom: 16 }}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Grupo {g.nombre}</h2>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                        <th style={thStyle}>#</th><th style={thStyle}>Jugador</th><th style={thStyle}>Pts</th>
                        <th style={thStyle}>PG</th><th style={thStyle}>PP</th><th style={thStyle}>J+</th><th style={thStyle}>J−</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((s, idx) => (
                        <tr key={s.inscritoId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={tdStyle}>{idx + 1}</td>
                          <td style={tdStyle}>{nombrePorId.get(s.inscritoId)}</td>
                          <td style={tdStyle}><strong>{s.pts}</strong></td>
                          <td style={tdStyle}>{s.pg}</td><td style={tdStyle}>{s.pp}</td>
                          <td style={tdStyle}>{s.juegosGanados}</td><td style={tdStyle}>{s.juegosPerdidos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'grid', gap: 10 }}>{partidosG.map(renderPartidoRow)}</div>
                </div>
              )
            })}

            {tab === 'llaves' && (
              partidosPlayoff.length === 0 ? (
                <div style={{ ...card, padding: 24, color: '#64748b', textAlign: 'center' }}>
                  Aún no hay llaves. Cierra al menos un grupo o pulsa «Sincronizar llaves».
                </div>
              ) : (
                <>
                  <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Cuadro eliminatorio</h2>
                    <BracketOficial partidos={partidosPlayoff} nombrePorId={nombrePorId} />
                  </div>
                  {[...partidosPorFase.entries()].map(([fase, lista]) => (
                    <div key={fase} style={{ ...card, padding: 16, marginBottom: 16 }}>
                      <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>{FASE_LABELS[fase] || fase}</h2>
                      <div style={{ display: 'grid', gap: 10 }}>{lista.sort((a, b) => a.orden - b.orden).map(renderPartidoRow)}</div>
                    </div>
                  ))}
                </>
              )
            )}

            {tab === 'programa' && (
              programaFilas.length === 0 ? (
                <div style={{ ...card, padding: 24, color: '#64748b', textAlign: 'center' }}>
                  Sin partidos programados. Usa «Auto-programar» (configura mesas en el campeonato).
                </div>
              ) : (
                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                        <th style={thStyle}>Hora</th><th style={thStyle}>Mesa</th><th style={thStyle}>Fase</th><th style={thStyle}>Partido</th><th style={thStyle}>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {programaFilas.map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={tdStyle}>{f.hora}</td><td style={tdStyle}>{f.mesa}</td><td style={tdStyle}>{f.fase}</td>
                          <td style={tdStyle}>{f.partido}</td><td style={tdStyle}>{f.resultado || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 14, boxSizing: 'border-box' }
const thStyle: CSSProperties = { padding: '8px 10px', fontWeight: 600 }
const tdStyle: CSSProperties = { padding: '8px 10px' }
const btnBack: CSSProperties = { background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', marginBottom: 14, cursor: 'pointer' }
const btnPrimary: CSSProperties = { background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }
const btnSmall: CSSProperties = { background: '#0f172a', color: 'white', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }
const btnMarcador: CSSProperties = { background: '#0369a1', color: 'white', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }
const btnWo: CSSProperties = { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, padding: '6px 8px', fontSize: 11, cursor: 'pointer' }
const tabBtn: CSSProperties = { background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }
const tabBtnActivo: CSSProperties = { background: '#0f172a', color: '#fff', borderColor: '#0f172a' }
