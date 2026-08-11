'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { CONFIG } from '@/lib/config'
import {
  actualizarConfigProgramacionOficial,
  crearEventoOficial,
  programarCampeonatoOficial,
} from '@/app/actions/torneo-oficial'
import { formatearSets, type SetMarcador } from '@/lib/domain/oficial-ittf'
import { exportarProgramaOficialPdf } from '@/lib/oficial-export-pdf'
import { cargarOficialConCache } from '@/lib/torneo-oficial/carga-cliente'

const supabase = createClient()

type Evento = {
  id: string
  nombre: string
  categoria: string
  genero: string
  fase: string
  formato_partido: string
  campeon_inscrito_id: string | null
}

type Campeonato = {
  id: string
  nombre: string
  sede: string | null
  zona: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado: string
  mesas_count: number
  bloque_minutos: number
  hora_inicio: string
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.08)' } as const
const FASE_LABELS = CONFIG.FASE_LABELS as Record<string, string>

export default function CampeonatoOficialDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const clubId = perfil?.club_id
  const [camp, setCamp] = useState<Campeonato | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [programaRows, setProgramaRows] = useState<Array<{ hora: string; mesa: number; evento: string; fase: string; partido: string; resultado?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [categoria, setCategoria] = useState('Juvenil')
  const [genero, setGenero] = useState<'varones' | 'damas' | 'mixto'>('varones')
  const [formato, setFormato] = useState<'bo3' | 'bo5' | 'bo7'>('bo5')
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [programando, setProgramando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [mesas, setMesas] = useState('8')
  const [bloque, setBloque] = useState('25')
  const [horaInicio, setHoraInicio] = useState('09:00')
  const cargadoRef = useRef(false)

  type DatosCamp = {
    camp: Campeonato | null
    eventos: Evento[]
    programaRows: Array<{ hora: string; mesa: number; evento: string; fase: string; partido: string; resultado?: string }>
    error?: string
  }

  const aplicarDatos = useCallback((d: DatosCamp) => {
    if (d.error) setErrorMsg(d.error)
    setCamp(d.camp)
    setEventos(d.eventos)
    setProgramaRows(d.programaRows)
    if (d.camp) {
      setMesas(String(d.camp.mesas_count))
      setBloque(String(d.camp.bloque_minutos))
      setHoraInicio(String(d.camp.hora_inicio).slice(0, 5))
    }
    cargadoRef.current = true
  }, [])

  const cargar = useCallback(async (silencioso = false) => {
    if (!clubId) return
    if (!silencioso) setErrorMsg('')

    await cargarOficialConCache(
      `oficial:camp:${id}:${clubId}`,
      async (): Promise<DatosCamp> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any

        const { data: c, error: errC } = await db.from('oficial_campeonatos')
          .select('id,nombre,sede,zona,fecha_inicio,fecha_fin,estado')
          .eq('id', id).eq('club_id', clubId).maybeSingle()

        if (errC) return { camp: null, eventos: [], programaRows: [], error: errC.message || 'Error al cargar el campeonato' }
        if (!c) return { camp: null, eventos: [], programaRows: [] }

        let mesas_count = 8
        let bloque_minutos = 25
        let hora_inicio = '09:00:00'
        const { data: cfg, error: errCfg } = await db.from('oficial_campeonatos')
          .select('mesas_count,bloque_minutos,hora_inicio')
          .eq('id', id).maybeSingle()
        if (!errCfg && cfg) {
          mesas_count = cfg.mesas_count ?? mesas_count
          bloque_minutos = cfg.bloque_minutos ?? bloque_minutos
          hora_inicio = cfg.hora_inicio ?? hora_inicio
        }

        const campCompleto = { ...c, mesas_count, bloque_minutos, hora_inicio } as Campeonato

        const { data: ev } = await db.from('oficial_eventos')
          .select('id,nombre,categoria,genero,fase,formato_partido,campeon_inscrito_id')
          .eq('campeonato_id', id).order('creado_en')
        const eventosList = (ev || []) as Evento[]

        const eventoIds = eventosList.map(e => e.id)
        let programaRows: DatosCamp['programaRows'] = []
        if (eventoIds.length) {
          const { data: ins } = await db.from('oficial_inscritos').select('id,nombre,asociacion').in('evento_id', eventoIds)
          const nombreMap = new Map((ins || []).map((i: { id: string; nombre: string; asociacion: string | null }) =>
            [i.id, i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre]))
          const eventoMap = new Map(eventosList.map(e => [e.id, e.nombre]))

          const { data: par } = await db.from('oficial_partidos')
            .select('evento_id,fase,inscrito_a_id,inscrito_b_id,ganador_id,sets,mesa,programado_en')
            .in('evento_id', eventoIds).not('programado_en', 'is', null).order('programado_en')

          programaRows = (par || []).map((p: {
            evento_id: string; fase: string; inscrito_a_id: string; inscrito_b_id: string | null
            ganador_id: string | null; sets: SetMarcador[]; mesa: number; programado_en: string
          }) => ({
            hora: new Date(p.programado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
            mesa: p.mesa ?? 0,
            evento: eventoMap.get(p.evento_id) || '',
            fase: FASE_LABELS[p.fase] || p.fase,
            partido: `${nombreMap.get(p.inscrito_a_id) || '?'} vs ${p.inscrito_b_id ? nombreMap.get(p.inscrito_b_id) : 'BYE'}`,
            resultado: p.ganador_id ? formatearSets((p.sets || []) as SetMarcador[]) : undefined,
          }))
        }

        return { camp: campCompleto, eventos: eventosList, programaRows }
      },
      {
        tablas: ['oficial_campeonatos', 'oficial_eventos', 'oficial_partidos', 'oficial_inscritos'],
        silencioso,
        aplicar: aplicarDatos,
        setLoading,
        tieneDatos: () => cargadoRef.current,
      },
    )
  }, [id, clubId, aplicarDatos])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) void cargar()
  }, [authLoading, perfil, cargar, router])

  useEnVivo(
    ['oficial_campeonatos', 'oficial_eventos', 'oficial_partidos'],
    perfil?.club_id ?? null,
    () => { void cargar(true) },
    { conClub: ['oficial_campeonatos', 'oficial_eventos', 'oficial_partidos'] },
  )

  const resumen = useMemo(() => ({
    total: eventos.length,
    finalizados: eventos.filter(e => e.fase === 'finalizado').length,
    enLlaves: eventos.filter(e => e.fase === 'llaves').length,
    enGrupos: eventos.filter(e => e.fase === 'grupos').length,
  }), [eventos])

  async function crearEvento() {
    setErrorMsg(''); setGuardando(true)
    const res = await crearEventoOficial({
      campeonatoId: id,
      nombre: nombre || `${categoria} ${genero === 'varones' ? 'Varones' : genero === 'damas' ? 'Damas' : 'Mixto'}`,
      categoria, genero, formatoPartido: formato,
    })
    setGuardando(false)
    if (res.error) { setErrorMsg(res.error); return }
    setModal(false)
    if (res.id) router.push(`/torneo-oficial/evento/${res.id}`)
  }

  async function guardarConfig() {
    setErrorMsg('')
    const res = await actualizarConfigProgramacionOficial({
      campeonatoId: id,
      mesasCount: Number(mesas),
      bloqueMinutos: Number(bloque),
      horaInicio,
    })
    if (res.error) setErrorMsg(res.error)
    else void cargar()
  }

  async function programarTodo() {
    setErrorMsg(''); setProgramando(true)
    const cfg = await actualizarConfigProgramacionOficial({
      campeonatoId: id,
      mesasCount: Number(mesas),
      bloqueMinutos: Number(bloque),
      horaInicio,
    })
    if (cfg.error) { setErrorMsg(cfg.error); setProgramando(false); return }
    const res = await programarCampeonatoOficial({ campeonatoId: id })
    setProgramando(false)
    if (res.error) setErrorMsg(res.error)
    else void cargar()
  }

  async function exportarPrograma() {
    if (!camp) return
    await exportarProgramaOficialPdf({
      titulo: `Programa — ${camp.nombre}`,
      subtitulo: `${camp.fecha_inicio}${camp.sede ? ` · ${camp.sede}` : ''}`,
      club: camp.nombre,
      filas: programaRows,
      nombreArchivo: `${camp.nombre.replace(/\s+/g, '_')}_programa.pdf`,
    })
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 80px' }}>
        <button type="button" onClick={() => router.push('/torneo-oficial')} style={btnBack}>← Volver</button>
        {loading && !camp ? (
          <p style={{ color: '#94a3b8' }}>Cargando…</p>
        ) : !camp ? (
          <p style={{ color: '#94a3b8' }}>Campeonato no encontrado</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22 }}>{camp.nombre}</h1>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
                  {camp.fecha_inicio}{camp.fecha_fin ? ` → ${camp.fecha_fin}` : ''}
                  {camp.sede ? ` · ${camp.sede}` : ''}{camp.zona ? ` · ${camp.zona}` : ''} · {camp.estado}
                </p>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>
                  {resumen.total} evento(s) · {resumen.enGrupos} en grupos · {resumen.enLlaves} en llaves · {resumen.finalizados} finalizados
                </p>
              </div>
              <button type="button" onClick={() => setModal(true)} style={btnPrimary}>+ Evento / categoría</button>
            </div>

            {errorMsg && <div style={{ ...card, padding: 12, marginBottom: 14, color: '#e11d48', fontSize: 13 }}>{errorMsg}</div>}

            <div style={{ ...card, padding: 16, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Programación de mesas</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                <div><label style={labelStyle}>Mesas</label>
                  <input type="number" min={1} max={64} value={mesas} onChange={e => setMesas(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Min/bloque</label>
                  <input type="number" min={10} max={120} value={bloque} onChange={e => setBloque(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Hora inicio</label>
                  <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void guardarConfig()} style={btnGhost}>Guardar config</button>
                <button type="button" onClick={() => void programarTodo()} disabled={programando} style={btnPrimary}>
                  {programando ? 'Programando…' : 'Programar todos los eventos'}
                </button>
                {programaRows.length > 0 && (
                  <button type="button" onClick={() => void exportarPrograma()} style={btnGhost}>PDF programa completo</button>
                )}
              </div>
            </div>

            {programaRows.length > 0 && (
              <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Programa del día ({programaRows.length} partidos)</h2>
                <div style={{ maxHeight: 220, overflow: 'auto', fontSize: 13 }}>
                  {programaRows.slice(0, 12).map((r, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <strong>{r.hora}</strong> M{r.mesa} · {r.evento} · {r.partido}
                    </div>
                  ))}
                  {programaRows.length > 12 && <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>+{programaRows.length - 12} más…</p>}
                </div>
              </div>
            )}

            {eventos.length === 0 ? (
              <div style={{ ...card, padding: 24, color: '#64748b' }}>Agrega un evento (ej. Juvenil Varones, Adulto Damas).</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {eventos.map(e => (
                  <button key={e.id} type="button" onClick={() => router.push(`/torneo-oficial/evento/${e.id}`)}
                    style={{ ...card, padding: 14, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                    <strong>{e.nombre}</strong>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                      {e.categoria} · {e.genero} · {e.formato_partido.toUpperCase()} · fase {e.fase}
                      {e.fase === 'finalizado' ? ' · 🏆' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {modal && (
          <div style={overlayStyle}>
            <div style={{ ...card, width: '100%', maxWidth: 420, padding: 20 }}>
              <h2 style={{ margin: '0 0 12px' }}>Nuevo evento</h2>
              <label style={labelStyle}>Categoría</label>
              <input value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Género</label>
              <select value={genero} onChange={e => setGenero(e.target.value as typeof genero)} style={inputStyle}>
                <option value="varones">Varones</option><option value="damas">Damas</option><option value="mixto">Mixto</option>
              </select>
              <label style={labelStyle}>Formato</label>
              <select value={formato} onChange={e => setFormato(e.target.value as typeof formato)} style={inputStyle}>
                <option value="bo3">Al mejor de 3</option><option value="bo5">Al mejor de 5</option><option value="bo7">Al mejor de 7</option>
              </select>
              <label style={labelStyle}>Nombre visible (opc.)</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} />
              {errorMsg && <p style={{ color: '#e11d48', fontSize: 13 }}>{errorMsg}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setModal(false)} style={btnGhost}>Cancelar</button>
                <button type="button" onClick={() => void crearEvento()} disabled={guardando || !categoria} style={{ ...btnPrimary, flex: 1 }}>Crear evento</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, marginTop: 10 }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }
const btnGhost: CSSProperties = { background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }
const btnPrimary: CSSProperties = { background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer' }
const btnBack: CSSProperties = { background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', marginBottom: 14, cursor: 'pointer' }
const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
