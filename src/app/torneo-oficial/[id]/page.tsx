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
  archivarCampeonatoOficial,
  crearEventoOficial,
  listarConflictosProgramaOficial,
  programarCampeonatoOficial,
  reemplazarBloquesEspecialesOficial,
} from '@/app/actions/torneo-oficial'
import { formatearSets, type SetMarcador } from '@/lib/domain/oficial-ittf'
import { armarCeldasMural, type CeldaMuralOficial, type PartidoParaMural } from '@/lib/domain/programar-oficial'
import { TAMANOS_CUADRO, type TamanoCuadro } from '@/lib/domain/oficial-sorteo'
import { exportarProgramaMuralPdf, exportarProgramaOficialPdf } from '@/lib/oficial-export-pdf'
import { cargarOficialConCache, invalidarCacheOficial } from '@/lib/torneo-oficial/carga-cliente'
import ProgramaOficialTablero, { type CeldaProgramaOficial } from '@/components/torneo-oficial/ProgramaOficialTablero'
import { btnOutlineIndigo, btnPrimaryIndigo, modalOverlay, torneoUi } from '@/lib/torneos/ui-tokens'

const supabase = createClient()

type Evento = {
  id: string
  nombre: string
  categoria: string
  genero: string
  fase: string
  formato_partido: string
  campeon_inscrito_id: string | null
  fecha_juego?: string | null
  tamano_cuadro?: number | null
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
  bloque_grupo_minutos: number
  hora_inicio: string
  codigo_publico?: string | null
}

type BloqueEspecial = {
  fecha: string
  hora: string
  duracionMin: number
  tipo: string
  etiqueta: string
}

const card = torneoUi.card
const FASE_LABELS = CONFIG.FASE_LABELS as Record<string, string>

export default function CampeonatoOficialDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const clubId = perfil?.club_id
  const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'superadmin'
  const [camp, setCamp] = useState<Campeonato | null>(null)
  const [archivando, setArchivando] = useState(false)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [programaRows, setProgramaRows] = useState<Array<{
    hora: string; mesa: number; evento: string; fase: string; partido: string
    resultado?: string; numeroIttf?: number | null; arbitro?: string | null
  }>>([])
  const [programaCeldas, setProgramaCeldas] = useState<CeldaProgramaOficial[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [categoria, setCategoria] = useState('Juvenil')
  const [genero, setGenero] = useState<'varones' | 'damas' | 'mixto'>('varones')
  const [formato, setFormato] = useState<'bo3' | 'bo5' | 'bo7'>('bo5')
  const [nombre, setNombre] = useState('')
  const [fechaJuegoNuevo, setFechaJuegoNuevo] = useState('')
  const [tamanoCuadroNuevo, setTamanoCuadroNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [programando, setProgramando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [mesas, setMesas] = useState('8')
  const [bloque, setBloque] = useState('25')
  const [bloqueGrupo, setBloqueGrupo] = useState('70')
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [diaSel, setDiaSel] = useState('')
  const [especiales, setEspeciales] = useState<BloqueEspecial[]>([])
  const [muralCeldas, setMuralCeldas] = useState<CeldaMuralOficial[]>([])
  const [conflictosCamp, setConflictosCamp] = useState<Array<{ motivo: string; labelA?: string; labelB?: string; tipo: string }>>([])
  const cargadoRef = useRef(false)

  type DatosCamp = {
    camp: Campeonato | null
    eventos: Evento[]
    programaRows: Array<{
      hora: string; mesa: number; evento: string; fase: string; partido: string
      resultado?: string; numeroIttf?: number | null; arbitro?: string | null
    }>
    programaCeldas: CeldaProgramaOficial[]
    muralCeldas: CeldaMuralOficial[]
    especiales: BloqueEspecial[]
    error?: string
  }

  const aplicarDatos = useCallback((d: DatosCamp) => {
    if (d.error) setErrorMsg(d.error)
    setCamp(d.camp)
    setEventos(d.eventos)
    setProgramaRows(d.programaRows)
    setProgramaCeldas(d.programaCeldas)
    setMuralCeldas(d.muralCeldas || [])
    setEspeciales(d.especiales || [])
    if (d.camp) {
      setMesas(String(d.camp.mesas_count))
      setBloque(String(d.camp.bloque_minutos))
      setBloqueGrupo(String(d.camp.bloque_grupo_minutos ?? 70))
      setHoraInicio(String(d.camp.hora_inicio).slice(0, 5))
      setDiaSel(prev => prev || d.camp!.fecha_inicio)
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

        if (errC) return { camp: null, eventos: [], programaRows: [], programaCeldas: [], muralCeldas: [], especiales: [], error: errC.message || 'Error al cargar el campeonato' }
        if (!c) return { camp: null, eventos: [], programaRows: [], programaCeldas: [], muralCeldas: [], especiales: [] }

        let mesas_count = 8
        let bloque_minutos = 25
        let bloque_grupo_minutos = 70
        let hora_inicio = '09:00:00'
        let codigo_publico: string | null = null
        const { data: cfg, error: errCfg } = await db.from('oficial_campeonatos')
          .select('mesas_count,bloque_minutos,bloque_grupo_minutos,hora_inicio,codigo_publico')
          .eq('id', id).maybeSingle()
        if (errCfg && String(errCfg.message || '').includes('bloque_grupo')) {
          const { data: cfg2 } = await db.from('oficial_campeonatos')
            .select('mesas_count,bloque_minutos,hora_inicio')
            .eq('id', id).maybeSingle()
          if (cfg2) {
            mesas_count = cfg2.mesas_count ?? mesas_count
            bloque_minutos = cfg2.bloque_minutos ?? bloque_minutos
            hora_inicio = cfg2.hora_inicio ?? hora_inicio
          }
        } else if (!errCfg && cfg) {
          mesas_count = cfg.mesas_count ?? mesas_count
          bloque_minutos = cfg.bloque_minutos ?? bloque_minutos
          bloque_grupo_minutos = cfg.bloque_grupo_minutos ?? bloque_grupo_minutos
          hora_inicio = cfg.hora_inicio ?? hora_inicio
          codigo_publico = cfg.codigo_publico ?? null
        }

        const campCompleto = { ...c, mesas_count, bloque_minutos, bloque_grupo_minutos, hora_inicio, codigo_publico } as Campeonato

        const qEv = await db.from('oficial_eventos')
          .select('id,nombre,categoria,genero,fase,formato_partido,campeon_inscrito_id,fecha_juego,tamano_cuadro')
          .eq('campeonato_id', id).order('creado_en')
        let eventosList = (qEv.data || []) as Evento[]
        if (qEv.error && (String(qEv.error.message || '').includes('fecha_juego') || String(qEv.error.message || '').includes('tamano_cuadro'))) {
          const { data: ev2 } = await db.from('oficial_eventos')
            .select('id,nombre,categoria,genero,fase,formato_partido,campeon_inscrito_id')
            .eq('campeonato_id', id).order('creado_en')
          eventosList = (ev2 || []) as Evento[]
        }

        const qEsp = await db.from('oficial_bloques_especiales')
          .select('fecha,hora,duracion_min,tipo,etiqueta')
          .eq('campeonato_id', id).order('fecha').order('hora')
        const especialesList: BloqueEspecial[] = qEsp.error ? [] : (qEsp.data || []).map((b: {
          fecha: string; hora: string; duracion_min: number; tipo: string; etiqueta: string
        }) => ({
          fecha: b.fecha,
          hora: String(b.hora).slice(0, 5),
          duracionMin: b.duracion_min,
          tipo: b.tipo,
          etiqueta: b.etiqueta,
        }))

        const eventoIds = eventosList.map(e => e.id)
        let programaRows: DatosCamp['programaRows'] = []
        let programaCeldas: CeldaProgramaOficial[] = []
        let muralCeldas: CeldaMuralOficial[] = []
        if (eventoIds.length) {
          const { data: ins } = await db.from('oficial_inscritos').select('id,nombre,asociacion').in('evento_id', eventoIds)
          const nombreMap = new Map((ins || []).map((i: { id: string; nombre: string; asociacion: string | null }) =>
            [i.id, i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre]))
          const eventoMap = new Map(eventosList.map(e => [e.id, e.nombre]))
          const { data: gruposRows } = await db.from('oficial_grupos').select('id,nombre,evento_id').in('evento_id', eventoIds)
          const grupoNombre = new Map((gruposRows || []).map((g: { id: string; nombre: string }) => [g.id, g.nombre]))

          const qPar = await db.from('oficial_partidos')
            .select('id,evento_id,fase,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,tipo_cierre,mesa,programado_en,numero_ittf,arbitro_nombre')
            .in('evento_id', eventoIds).not('programado_en', 'is', null).order('programado_en')
          let parRows = qPar.data || []
          if (qPar.error && (String(qPar.error.message || '').includes('numero_ittf') || String(qPar.error.message || '').includes('tipo_cierre'))) {
            const q2 = await db.from('oficial_partidos')
              .select('id,evento_id,fase,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,mesa,programado_en')
              .in('evento_id', eventoIds).not('programado_en', 'is', null).order('programado_en')
            parRows = q2.data || []
          }

          programaRows = parRows.map((p: {
            id: string; evento_id: string; fase: string; inscrito_a_id: string; inscrito_b_id: string | null
            ganador_id: string | null; sets: SetMarcador[]; es_walkover: boolean; mesa: number; programado_en: string
            numero_ittf?: number | null; arbitro_nombre?: string | null
          }) => ({
            hora: new Date(p.programado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' }),
            mesa: p.mesa ?? 0,
            evento: eventoMap.get(p.evento_id) || '',
            fase: FASE_LABELS[p.fase] || p.fase,
            partido: `${p.numero_ittf ? `#${p.numero_ittf} ` : ''}${nombreMap.get(p.inscrito_a_id) || '?'} vs ${p.inscrito_b_id ? nombreMap.get(p.inscrito_b_id) : 'BYE'}`,
            resultado: p.ganador_id ? formatearSets((p.sets || []) as SetMarcador[]) : undefined,
            numeroIttf: p.numero_ittf,
            arbitro: p.arbitro_nombre,
          }))

          const paraMural: PartidoParaMural[] = parRows.filter((p: { mesa: number | null }) => p.mesa).map((p: {
            id: string; evento_id: string; fase: string; grupo_id: string | null
            inscrito_a_id: string | null; inscrito_b_id: string | null
            ganador_id: string | null; tipo_cierre?: string | null; es_walkover: boolean
            mesa: number; programado_en: string
          }) => ({
            id: p.id,
            mesa: p.mesa,
            programadoEn: p.programado_en,
            fase: p.fase,
            grupoId: p.grupo_id,
            grupoNombre: p.grupo_id ? grupoNombre.get(p.grupo_id) ?? null : null,
            eventoNombre: eventoMap.get(p.evento_id) || null,
            eventoId: p.evento_id,
            jugadorA: p.inscrito_a_id ? (nombreMap.get(p.inscrito_a_id) || '?') : '?',
            jugadorB: p.inscrito_b_id ? (nombreMap.get(p.inscrito_b_id) || '?') : 'BYE',
            ganadorId: p.ganador_id,
            tipoCierre: p.tipo_cierre,
            esWalkover: p.es_walkover,
          }))
          muralCeldas = armarCeldasMural(paraMural, especialesList.map(e => ({
            fecha: e.fecha, hora: e.hora, etiqueta: e.etiqueta,
          })))

          programaCeldas = muralCeldas.map(m => ({
            id: m.partidoIds[0] || `esp-${m.fecha}-${m.hora}`,
            mesa: m.mesa,
            hora: m.hora,
            faseLabel: m.tipo === 'especial' ? m.etiqueta : m.tipo === 'grupo' ? 'Grupos' : m.etiqueta,
            jugadorA: m.tipo === 'partido' ? (m.detalle?.split(' vs ')[0] ?? m.etiqueta) : m.etiqueta,
            jugadorB: m.tipo === 'partido' ? (m.detalle?.split(' vs ')[1] ?? '') : (m.detalle || ''),
            eventoNombre: m.eventoNombre,
            eventoId: m.eventoId,
            estado: m.estado === 'especial' ? 'especial' as const : m.estado,
            etiqueta: m.etiqueta,
            tipo: m.tipo,
            detalle: m.detalle,
          }))
        }

        return { camp: campCompleto, eventos: eventosList, programaRows, programaCeldas, muralCeldas, especiales: especialesList }
      },
      {
        tablas: ['oficial_campeonatos', 'oficial_eventos', 'oficial_partidos', 'oficial_inscritos', 'oficial_bloques_especiales'],
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
    ['oficial_campeonatos', 'oficial_eventos', 'oficial_partidos', 'oficial_bloques_especiales'],
    perfil?.club_id ?? null,
    () => { void cargar(true) },
    { conClub: ['oficial_campeonatos', 'oficial_eventos', 'oficial_partidos', 'oficial_bloques_especiales'] },
  )

  const refrescarConflictosCamp = useCallback(async () => {
    const res = await listarConflictosProgramaOficial({ campeonatoId: id })
    if (res.error) {
      setConflictosCamp([])
      return
    }
    const lista = Array.isArray(res.conflictos) ? res.conflictos : []
    setConflictosCamp(lista.map(c => ({
      motivo: c.motivo,
      tipo: c.tipo,
      labelA: c.labelA,
      labelB: c.labelB,
    })))
  }, [id])

  useEffect(() => {
    if (cargadoRef.current && programaCeldas.length) void refrescarConflictosCamp()
  }, [programaCeldas.length, refrescarConflictosCamp])

  const dias = useMemo(() => {
    if (!camp) return []
    const set = new Set<string>()
    set.add(camp.fecha_inicio)
    if (camp.fecha_fin) set.add(camp.fecha_fin)
    for (const e of eventos) if (e.fecha_juego) set.add(e.fecha_juego)
    return [...set].sort()
  }, [camp, eventos])

  const celdasDelDia = useMemo(() => {
    const fecha = diaSel || camp?.fecha_inicio
    if (!fecha) return programaCeldas
    const ids = new Set(
      muralCeldas.filter(c => c.fecha === fecha).flatMap(c => c.partidoIds.length ? c.partidoIds : [c.etiqueta + c.hora]),
    )
    return programaCeldas.filter(c => {
      if (c.tipo === 'especial') {
        const m = muralCeldas.find(x => x.tipo === 'especial' && x.hora === c.hora && x.etiqueta === c.etiqueta)
        return !m || m.fecha === fecha
      }
      return c.id ? muralCeldas.some(m => m.fecha === fecha && m.partidoIds.includes(c.id)) : ids.has(c.id)
    })
  }, [programaCeldas, muralCeldas, diaSel, camp?.fecha_inicio])

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
      fechaJuego: fechaJuegoNuevo || undefined,
      tamanoCuadro: tamanoCuadroNuevo ? Number(tamanoCuadroNuevo) as TamanoCuadro : null,
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
      bloqueGrupoMinutos: Number(bloqueGrupo),
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
      bloqueGrupoMinutos: Number(bloqueGrupo),
      horaInicio,
    })
    if (cfg.error) { setErrorMsg(cfg.error); setProgramando(false); return }
    const res = await programarCampeonatoOficial({ campeonatoId: id, fecha: diaSel || undefined })
    setProgramando(false)
    if (res.error) setErrorMsg(res.error)
    else {
      const omitidos = typeof res.omitidos === 'number' ? res.omitidos : 0
      const programados = typeof res.programados === 'number' ? res.programados : 0
      if (omitidos > 0) {
        setErrorMsg(`Se programaron ${programados} partidos; ${omitidos} no cupieron (sube mesas o baja min/bloque).`)
      }
      void cargar()
      void refrescarConflictosCamp()
    }
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

  async function exportarMural() {
    if (!camp) return
    const fecha = diaSel || camp.fecha_inicio
    const celdas = muralCeldas.filter(c => c.fecha === fecha)
    await exportarProgramaMuralPdf({
      titulo: `Mural — ${camp.nombre}`,
      subtitulo: `${fecha}${camp.sede ? ` · ${camp.sede}` : ''}`,
      club: camp.nombre,
      mesasCount: camp.mesas_count,
      celdas: celdas.map(c => ({ mesa: c.mesa, hora: c.hora, etiqueta: c.etiqueta, tipo: c.tipo, detalle: c.detalle })),
      nombreArchivo: `${camp.nombre.replace(/\s+/g, '_')}_mural_${fecha}.pdf`,
    })
  }

  async function guardarEspeciales() {
    setErrorMsg('')
    const res = await reemplazarBloquesEspecialesOficial({ campeonatoId: id, bloques: especiales })
    if (res.error) setErrorMsg(res.error)
    else void cargar()
  }

  async function archivar() {
    if (!camp || !clubId) return
    if (!confirm(`¿Archivar "${camp.nombre}"? Quedará guardado, pero no aparecerá en la lista normal.`)) return
    setArchivando(true)
    const res = await archivarCampeonatoOficial({ campeonatoId: camp.id })
    setArchivando(false)
    if (res.error) { alert(res.error); return }
    invalidarCacheOficial(`oficial:lista:${clubId}:act`)
    invalidarCacheOficial(`oficial:lista:${clubId}:arch`)
    invalidarCacheOficial(`oficial:camp:${id}:${clubId}`)
    router.push('/torneo-oficial')
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 80px' }}>
        <button type="button" onClick={() => router.push('/torneo-oficial')} style={btnBack}>← Volver</button>
        {loading && !camp ? (
          <p style={{ color: torneoUi.hint }}>Cargando…</p>
        ) : !camp ? (
          <p style={{ color: torneoUi.hint }}>Campeonato no encontrado</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, color: torneoUi.text }}>{camp.nombre}</h1>
                <p style={{ margin: '6px 0 0', color: torneoUi.muted, fontSize: 13 }}>
                  {camp.fecha_inicio}{camp.fecha_fin ? ` → ${camp.fecha_fin}` : ''}
                  {camp.sede ? ` · ${camp.sede}` : ''}{camp.zona ? ` · ${camp.zona}` : ''} · {camp.estado}
                </p>
                <p style={{ margin: '4px 0 0', color: torneoUi.muted, fontSize: 12 }}>
                  {resumen.total} evento(s) · {resumen.enGrupos} en grupos · {resumen.enLlaves} en llaves · {resumen.finalizados} finalizados
                  {camp.codigo_publico ? (
                    <> · vivo: <a href={`/torneo-oficial/vivo/${camp.codigo_publico}`} style={{ color: '#4338ca' }}>{camp.codigo_publico}</a></>
                  ) : null}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {esAdmin && camp.estado !== 'archivado' && (
                  <button
                    type="button"
                    onClick={() => void archivar()}
                    disabled={archivando}
                    style={{ background: 'transparent', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 14px', color: '#dc2626', fontSize: 13, cursor: archivando ? 'wait' : 'pointer', opacity: archivando ? 0.6 : 1 }}
                  >
                    {archivando ? 'Archivando…' : 'Archivar'}
                  </button>
                )}
                {camp.estado !== 'archivado' && (
                  <button type="button" onClick={() => setModal(true)} style={btnPrimaryIndigo}>+ Evento / categoría</button>
                )}
              </div>
            </div>

            {errorMsg && <div style={{ ...card, padding: 12, marginBottom: 14, color: torneoUi.danger, fontSize: 13 }}>{errorMsg}</div>}

            {conflictosCamp.length > 0 && (
              <div style={{ ...card, padding: 14, marginBottom: 14, borderColor: '#fcd34d', background: '#fffbeb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>
                    Conflictos multi-evento ({conflictosCamp.length})
                  </div>
                  <button type="button" onClick={() => void refrescarConflictosCamp()} style={btnOutlineIndigo}>Actualizar</button>
                </div>
                <p style={{ margin: '6px 0 8px', fontSize: 12, color: '#a16207' }}>
                  Mismo jugador o misma mesa en dos partidos a la misma hora (§4.3).
                </p>
                {conflictosCamp.slice(0, 12).map((c, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#92400e', marginBottom: 4 }}>
                    • {c.motivo}
                    {c.labelA ? ` — ${c.labelA}` : ''}
                    {c.labelB ? ` ↔ ${c.labelB}` : ''}
                  </div>
                ))}
                {conflictosCamp.length > 12 && (
                  <div style={{ fontSize: 11, color: '#a16207' }}>…y {conflictosCamp.length - 12} más</div>
                )}
              </div>
            )}

            <div style={{ ...card, padding: 16, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16, color: torneoUi.text }}>Programación de mesas</h2>
              {dias.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {dias.map(d => (
                    <button key={d} type="button" onClick={() => setDiaSel(d)}
                      style={{
                        ...btnOutlineIndigo,
                        background: (diaSel || camp.fecha_inicio) === d ? '#eef2ff' : '#fff',
                        borderColor: (diaSel || camp.fecha_inicio) === d ? '#6366f1' : '#e2e8f0',
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                <div><label style={labelStyle}>Mesas</label>
                  <input type="number" min={1} max={64} value={mesas} onChange={e => setMesas(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Min/grupo</label>
                  <input type="number" min={20} max={180} value={bloqueGrupo} onChange={e => setBloqueGrupo(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Min/llave</label>
                  <input type="number" min={10} max={120} value={bloque} onChange={e => setBloque(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Hora inicio</label>
                  <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} style={inputStyle} /></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: torneoUi.text, marginBottom: 8 }}>Bloques especiales</div>
                {especiales.map((b, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                    <input type="date" value={b.fecha} onChange={e => {
                      const next = [...especiales]; next[i] = { ...b, fecha: e.target.value }; setEspeciales(next)
                    }} style={inputStyle} />
                    <input type="time" value={b.hora} onChange={e => {
                      const next = [...especiales]; next[i] = { ...b, hora: e.target.value }; setEspeciales(next)
                    }} style={inputStyle} />
                    <input type="number" min={5} max={180} value={b.duracionMin} onChange={e => {
                      const next = [...especiales]; next[i] = { ...b, duracionMin: Number(e.target.value) }; setEspeciales(next)
                    }} style={inputStyle} />
                    <select value={b.tipo} onChange={e => {
                      const next = [...especiales]; next[i] = { ...b, tipo: e.target.value }; setEspeciales(next)
                    }} style={inputStyle}>
                      <option value="apertura">Apertura</option>
                      <option value="receso">Receso</option>
                      <option value="premiacion">Premiación</option>
                      <option value="otro">Otro</option>
                    </select>
                    <input value={b.etiqueta} onChange={e => {
                      const next = [...especiales]; next[i] = { ...b, etiqueta: e.target.value }; setEspeciales(next)
                    }} placeholder="Etiqueta" style={inputStyle} />
                    <button type="button" onClick={() => setEspeciales(especiales.filter((_, j) => j !== i))} style={btnOutlineIndigo}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setEspeciales([...especiales, {
                  fecha: diaSel || camp.fecha_inicio, hora: '13:00', duracionMin: 40, tipo: 'receso', etiqueta: 'Receso',
                }])} style={{ ...btnOutlineIndigo, marginRight: 8 }}>+ Bloque</button>
                <button type="button" onClick={() => void guardarEspeciales()} style={btnOutlineIndigo}>Guardar bloques</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void guardarConfig()} style={btnOutlineIndigo}>Guardar config</button>
                <button type="button" onClick={() => void programarTodo()} disabled={programando} style={{ ...btnPrimaryIndigo, opacity: programando ? 0.6 : 1 }}>
                  {programando ? 'Programando…' : 'Auto-programar campeonato'}
                </button>
                {celdasDelDia.length > 0 && (
                  <button type="button" onClick={() => void exportarMural()} style={btnOutlineIndigo}>PDF mural</button>
                )}
                {programaRows.length > 0 && (
                  <button type="button" onClick={() => void exportarPrograma()} style={btnOutlineIndigo}>PDF lista</button>
                )}
              </div>
            </div>

            {celdasDelDia.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <ProgramaOficialTablero
                  celdas={celdasDelDia}
                  mesasCount={camp.mesas_count}
                  emptyMessage="Sin partidos programados. Guarda la config y pulsa «Auto-programar campeonato»."
                  onCelda={c => { if (c.eventoId) router.push(`/torneo-oficial/evento/${c.eventoId}`) }}
                />
              </div>
            )}

            {eventos.length === 0 ? (
              <div style={{ ...card, padding: 24, color: torneoUi.muted }}>Agrega un evento (ej. Juvenil Varones, Adulto Damas).</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {eventos.map(e => (
                  <button key={e.id} type="button" onClick={() => router.push(`/torneo-oficial/evento/${e.id}`)}
                    style={{ ...card, padding: 14, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                    <strong style={{ color: torneoUi.text }}>{e.nombre}</strong>
                    <div style={{ fontSize: 13, color: torneoUi.muted, marginTop: 4 }}>
                      {e.categoria} · {e.genero} · {e.formato_partido.toUpperCase()} · fase {e.fase}
                      {e.fecha_juego ? ` · ${e.fecha_juego}` : ''}
                      {e.tamano_cuadro ? ` · cuadro ${e.tamano_cuadro}` : ''}
                      {e.fase === 'finalizado' ? ' · 🏆' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {modal && (
          <div style={modalOverlay}>
            <div style={{ ...card, width: '100%', maxWidth: 420, padding: 20 }}>
              <h2 style={{ margin: '0 0 12px', color: torneoUi.text }}>Nuevo evento</h2>
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
              <label style={labelStyle}>Fecha de juego</label>
              <input type="date" value={fechaJuegoNuevo} onChange={e => setFechaJuegoNuevo(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Tamaño de cuadro (pre-llave si no caben)</label>
              <select value={tamanoCuadroNuevo} onChange={e => setTamanoCuadroNuevo(e.target.value)} style={inputStyle}>
                <option value="">Automático</option>
                {TAMANOS_CUADRO.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {errorMsg && <p style={{ color: torneoUi.danger, fontSize: 13 }}>{errorMsg}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setModal(false)} style={{ ...btnOutlineIndigo, flex: 1 }}>Cancelar</button>
                <button type="button" onClick={() => void crearEvento()} disabled={guardando || !categoria} style={{ ...btnPrimaryIndigo, flex: 1, opacity: guardando ? 0.6 : 1 }}>Crear evento</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: torneoUi.muted, marginBottom: 4, marginTop: 10 }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }
const btnBack: CSSProperties = { background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', marginBottom: 14, cursor: 'pointer', color: torneoUi.text }
