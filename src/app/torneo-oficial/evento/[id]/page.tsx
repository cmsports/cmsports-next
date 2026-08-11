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
  intercambiarCuposOficial,
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
import InscripcionOficialModal from '@/components/torneo-oficial/InscripcionOficialModal'
import PartidoOficialRow from '@/components/torneo-oficial/PartidoOficialRow'
import { exportarGruposOficialPdf, exportarLlavesOficialPdf, exportarProgramaOficialPdf } from '@/lib/oficial-export-pdf'
import { cargarOficialConCache } from '@/lib/torneo-oficial/carga-cliente'
import { btnOutlineIndigo, btnPrimaryIndigo, tabUnderline, torneoUi } from '@/lib/torneos/ui-tokens'

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
  tercer_inscrito_id: string | null
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

const card = torneoUi.card

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

  const [modalInscripcion, setModalInscripcion] = useState(false)
  const [inscribiendo, setInscribiendo] = useState(false)
  const [formando, setFormando] = useState(false)
  const [syncLlaves, setSyncLlaves] = useState(false)
  const [programando, setProgramando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [guardandoRes, setGuardandoRes] = useState<string | null>(null)
  const [reiniciando, setReiniciando] = useState(false)
  const cargadoRef = useRef(false)

  type DatosEvento = {
    evento: Evento | null
    camp: Campeonato | null
    inscritos: Inscrito[]
    grupos: Grupo[]
    miembrosGrupo: Array<{ grupo_id: string; inscrito_id: string }>
    partidos: Partido[]
  }

  const aplicarDatos = useCallback((d: DatosEvento) => {
    setEvento(d.evento)
    setCamp(d.camp)
    setInscritos(d.inscritos)
    setGrupos(d.grupos)
    setMiembrosGrupo(d.miembrosGrupo)
    setPartidos(d.partidos)
    cargadoRef.current = true
  }, [])

  const cargar = useCallback(async (silencioso = false) => {
    if (!perfil?.club_id) return

    await cargarOficialConCache(
      `oficial:evento:${id}:${perfil.club_id}`,
      async (): Promise<DatosEvento> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any

        const { data: ev } = await db.from('oficial_eventos')
          .select('id,nombre,categoria,genero,fase,formato_partido,campeonato_id,campeon_inscrito_id')
          .eq('id', id).eq('club_id', perfil.club_id).maybeSingle()

        let camp: Campeonato | null = null
        if (ev?.campeonato_id) {
          const { data: c } = await db.from('oficial_campeonatos').select('id,nombre')
            .eq('id', ev.campeonato_id).maybeSingle()
          camp = c
        }

        const { data: ins } = await db.from('oficial_inscritos')
          .select('id,nombre,asociacion,cabeza_numero,orden_inscripcion')
          .eq('evento_id', id).order('orden_inscripcion')

        const { data: gr } = await db.from('oficial_grupos')
          .select('id,nombre,orden').eq('evento_id', id).order('orden')

        const grupoIds = (gr || []).map((g: Grupo) => g.id)
        let miembrosGrupo: DatosEvento['miembrosGrupo'] = []
        if (grupoIds.length) {
          const { data: mg } = await db.from('oficial_grupo_inscritos')
            .select('grupo_id,inscrito_id').in('grupo_id', grupoIds)
          miembrosGrupo = mg || []
        }

        const { data: par } = await db.from('oficial_partidos')
          .select('id,fase,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,orden,mesa,programado_en')
          .eq('evento_id', id).order('orden')

        return {
          evento: ev,
          camp,
          inscritos: ins || [],
          grupos: gr || [],
          miembrosGrupo,
          partidos: (par || []).map((p: Partido) => ({ ...p, sets: (p.sets || []) as SetMarcador[] })),
        }
      },
      {
        tablas: ['oficial_eventos', 'oficial_inscritos', 'oficial_grupos', 'oficial_grupo_inscritos', 'oficial_partidos', 'oficial_campeonatos'],
        silencioso,
        aplicar: aplicarDatos,
        setLoading,
        tieneDatos: () => cargadoRef.current,
      },
    )
  }, [id, perfil?.club_id, aplicarDatos])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) void cargar()
  }, [authLoading, perfil, cargar, router])

  useEnVivo(
    ['oficial_eventos', 'oficial_inscritos', 'oficial_grupos', 'oficial_grupo_inscritos', 'oficial_partidos'],
    perfil?.club_id ?? null,
    () => { void cargar(true) },
    { conClub: ['oficial_eventos', 'oficial_inscritos', 'oficial_grupos', 'oficial_grupo_inscritos', 'oficial_partidos'] },
  )

  useEffect(() => {
    if (!evento || loading || authLoading) return
    if (evento.fase !== 'grupos' && evento.fase !== 'llaves') return
    if (!grupos.length) return

    const partidosGrupo = partidos.filter(p => p.fase === 'grupos')
    const todosGruposCerrados = grupos.every(g => {
      const delGrupo = partidosGrupo.filter(p => p.grupo_id === g.id)
      return delGrupo.length > 0 && delGrupo.every(p => p.ganador_id)
    })
    if (!todosGruposCerrados) return

    const firma = `${grupos.length}|${partidosGrupo.filter(p => p.ganador_id).length}`
    if (syncLlavesRef.current === firma) return
    syncLlavesRef.current = firma
    void sincronizarLlavesOficial({ eventoId: id }).then(res => {
      if (res.error) setErrorMsg(res.error)
      else void cargar()
    })
  }, [evento?.fase, grupos, partidos, loading, authLoading, id, cargar])

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
      const ordenFase = (f: string) => {
        if (f === 'tercer_lugar') {
          const i = CONFIG.FASES_ORDEN.indexOf('semis')
          return i >= 0 ? i + 0.5 : 98
        }
        const idx = CONFIG.FASES_ORDEN.indexOf(f as typeof CONFIG.FASES_ORDEN[number])
        return idx >= 0 ? idx : 99
      }
      return ordenFase(a.fase) - ordenFase(b.fase) || a.orden - b.orden
    }),
  [partidos])

  const faseInicialLlaves = useMemo(
    () => CONFIG.FASES_ORDEN.find(f => partidosPlayoff.some(p => p.fase === f)) ?? null,
    [partidosPlayoff],
  )

  const fasesPlayoffOrdenadas = useMemo(() => {
    const fases = [...new Set(partidosPlayoff.map(p => p.fase))]
    const ordenFase = (f: string) => {
      if (f === 'tercer_lugar') {
        const i = CONFIG.FASES_ORDEN.indexOf('semis')
        return i >= 0 ? i + 0.5 : 98
      }
      const idx = CONFIG.FASES_ORDEN.indexOf(f as typeof CONFIG.FASES_ORDEN[number])
      return idx >= 0 ? idx : 99
    }
    return fases.sort((a, b) => ordenFase(a) - ordenFase(b))
  }, [partidosPlayoff])

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

  async function inscribirDesdeModal(nombre: string, asociacion?: string) {
    setInscribiendo(true)
    const res = await inscribirJugadorOficial({ eventoId: id, nombre, asociacion })
    setInscribiendo(false)
    if (!res.error) void cargar()
    return res
  }

  async function guardarCabezasModal(jugadorIds: string[]) {
    const cabezas = jugadorIds.map((inscritoId, i) => ({ inscritoId, numero: i + 1 }))
    const res = await configurarCabezasOficial({ eventoId: id, cabezas })
    if (!res.error) void cargar()
    return res
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

  async function guardarResultado(partidoId: string, opts?: { walkover?: boolean; ganadorId?: string; setsTexto?: string }) {
    if (!opts?.walkover && !opts?.setsTexto?.trim()) return
    setGuardandoRes(partidoId)
    const res = await registrarResultadoOficial({
      partidoId,
      setsTexto: opts?.walkover ? undefined : opts?.setsTexto,
      esWalkover: opts?.walkover,
      ganadorId: opts?.ganadorId,
    })
    setGuardandoRes(null)
    if (res.error) { setErrorMsg(res.error); return }
    void cargar()
  }

  async function corregir(partidoId: string, ganadorId: string, setsTexto?: string) {
    setGuardandoRes(partidoId)
    const res = await corregirResultadoOficial({
      partidoId,
      nuevoGanadorId: ganadorId,
      setsTexto,
    })
    setGuardandoRes(null)
    if (res.error) { setErrorMsg(res.error); return }
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

  async function intercambiarCupos(
    slotA: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' },
    slotB: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' },
  ) {
    const res = await intercambiarCuposOficial({ eventoId: id, slotA, slotB })
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
    const a = p.inscrito_a_id ? nombrePorId.get(p.inscrito_a_id) || '?' : '?'
    const esBye = !p.inscrito_b_id
    const b = esBye ? 'BYE' : (p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) || '?' : '?')
    const ganadorNombre = p.ganador_id ? nombrePorId.get(p.ganador_id) : null

    return (
      <PartidoOficialRow
        key={p.id}
        partido={p}
        nombreA={a}
        nombreB={b}
        esBye={esBye}
        ganadorNombre={ganadorNombre ?? null}
        puedeCorregir={!esBye && evento?.fase !== 'finalizado'}
        guardando={guardandoRes === p.id}
        onGuardar={(opts) => void guardarResultado(p.id, opts)}
        onCorregir={(ganadorId, setsTexto) => void corregir(p.id, ganadorId, setsTexto)}
      />
    )
  }

  const enInscripcion = evento?.fase === 'inscripcion'
  const campeonNombre = evento?.campeon_inscrito_id ? nombrePorId.get(evento.campeon_inscrito_id) : null
  const tercerNombre = useMemo(() => {
    const p = partidos.find(x => x.fase === 'tercer_lugar' && x.ganador_id)
    return p?.ganador_id ? nombrePorId.get(p.ganador_id) : null
  }, [partidos, nombrePorId])
  const esAdmin = perfil?.rol === 'admin'

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 80px' }}>
        <button type="button" onClick={() => router.push(camp ? `/torneo-oficial/${camp.id}` : '/torneo-oficial')} style={btnBack}>
          ← {camp?.nombre || 'Volver'}
        </button>

        {loading && !evento ? (
          <p style={{ color: '#94a3b8' }}>Cargando…</p>
        ) : !evento ? (
          <p style={{ color: '#94a3b8' }}>Evento no encontrado</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, color: torneoUi.text }}>{evento.nombre}</h1>
                <p style={{ margin: '6px 0 0', color: torneoUi.muted, fontSize: 13 }}>
                  {evento.categoria} · {evento.genero} · {evento.formato_partido.toUpperCase()} · fase {evento.fase}
                  {campeonNombre ? ` · 🏆 ${campeonNombre}` : ''}
                  {tercerNombre ? ` · 🥉 ${tercerNombre}` : ''}
                </p>
              </div>
              {enInscripcion && esAdmin && (
                <button type="button" onClick={() => setModalInscripcion(true)} style={btnPrimaryIndigo}>
                  🪑 Inscripción ({inscritos.length})
                </button>
              )}
            </div>

            {errorMsg && (
              <div style={{ ...card, padding: 12, marginBottom: 14, color: torneoUi.danger, fontSize: 13 }}>{errorMsg}</div>
            )}

            {enInscripcion && inscritos.length > 0 && (
              <div style={{ ...card, padding: 16, marginBottom: 16, textAlign: 'center', color: torneoUi.muted, fontSize: 13 }}>
                {inscritos.length} jugador{inscritos.length !== 1 ? 'es' : ''} inscrito{inscritos.length !== 1 ? 's' : ''}.
                {esAdmin ? ' Pulsa «Inscripción» para agregar jugadores, cabezas de serie y formar grupos.' : ''}
              </div>
            )}

            {!enInscripcion && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
                {(['grupos', 'llaves', 'programa'] as Tab[]).map(t => (
                  <button key={t} type="button" onClick={() => setTab(t)} style={tabUnderline(tab === t)}>
                    {t === 'grupos' ? 'Grupos' : t === 'llaves' ? 'Llaves' : 'Programa'}
                  </button>
                ))}
                {tab === 'llaves' && (
                  <>
                    <button type="button" onClick={() => void armarLlaves()} disabled={syncLlaves} style={btnOutlineIndigo}>
                      {syncLlaves ? 'Sincronizando…' : '↻ Sincronizar llaves'}
                    </button>
                    <button type="button" onClick={() => void reiniciarLlaves()} disabled={reiniciando} style={btnOutlineIndigo}>
                      {reiniciando ? '…' : 'Reiniciar llaves'}
                    </button>
                    {partidosPlayoff.length > 0 && (
                      <button type="button" onClick={() => void exportarLlavesPdf()} style={btnOutlineIndigo}>PDF llaves</button>
                    )}
                  </>
                )}
                {tab === 'programa' && (
                  <>
                    <button type="button" onClick={() => void programar()} disabled={programando} style={btnOutlineIndigo}>
                      {programando ? 'Programando…' : 'Auto-programar'}
                    </button>
                    <button type="button" onClick={() => void exportarProgramaPdf()} style={btnOutlineIndigo}>PDF programa</button>
                  </>
                )}
                {tab === 'grupos' && grupos.length > 0 && (
                  <button type="button" onClick={() => void exportarGruposPdf()} style={btnOutlineIndigo}>PDF grupos</button>
                )}
              </div>
            )}

            <InscripcionOficialModal
              open={modalInscripcion}
              onClose={() => setModalInscripcion(false)}
              inscritos={inscritos}
              eventoNombre={evento.nombre}
              inscribiendo={inscribiendo}
              formando={formando}
              onInscribir={inscribirDesdeModal}
              onFormarGrupos={async () => {
                setFormando(true)
                const res = await formarGruposOficial({ eventoId: id })
                setFormando(false)
                if (!res.error) void cargar()
                return res
              }}
              onGuardarCabezas={guardarCabezasModal}
            />

            {(enInscripcion || tab === 'grupos') && grupos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
                {grupos.map(g => {
                  const stats = statsGrupo(g.id)
                  const partidosG = partidosPorGrupo.get(g.id) ?? []
                  return (
                    <div key={g.id} style={{ ...card, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: torneoUi.text }}>Grupo {g.nombre}</span>
                      </div>
                      {stats.map((s, idx) => (
                        <div key={s.inscritoId} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          borderLeft: `3px solid ${idx === 0 ? '#d97706' : idx === 1 ? '#94a3b8' : 'transparent'}`,
                        }}>
                          <span style={{ fontSize: 14 }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '—'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: torneoUi.text }}>{nombrePorId.get(s.inscritoId)}</div>
                            <div style={{ fontSize: 10, color: torneoUi.muted }}>{s.pg}G {s.pp}P · {s.pts}pts</div>
                          </div>
                        </div>
                      ))}
                      <div style={{ padding: '8px 16px' }}>
                        {partidosG.map(renderPartidoRow)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'llaves' && (
              partidosPlayoff.length === 0 ? (
                <div style={{ ...card, padding: 24, color: '#64748b', textAlign: 'center' }}>
                  Aún no hay llaves. Cierra al menos un grupo o pulsa «Sincronizar llaves».
                </div>
              ) : (
                <>
                  <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Cuadro eliminatorio</h2>
                    <BracketOficial
                      partidos={partidosPlayoff}
                      nombrePorId={nombrePorId}
                      esAdmin={esAdmin}
                      faseInicial={faseInicialLlaves}
                      onIntercambiar={esAdmin ? intercambiarCupos : undefined}
                    />
                  </div>
                  {fasesPlayoffOrdenadas.map(fase => {
                    const lista = partidosPorFase.get(fase) ?? []
                    if (!lista.length) return null
                    return (
                    <div key={fase} style={{ ...card, padding: 16, marginBottom: 16 }}>
                      <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>{FASE_LABELS[fase] || fase}</h2>
                      <div style={{ display: 'grid', gap: 0, padding: '0 16px 12px' }}>
                        {lista.sort((a, b) => a.orden - b.orden).map(renderPartidoRow)}
                      </div>
                    </div>
                    )
                  })}
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

const thStyle: CSSProperties = { padding: '8px 10px', fontWeight: 600 }
const tdStyle: CSSProperties = { padding: '8px 10px' }
const btnBack: CSSProperties = { background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', marginBottom: 14, cursor: 'pointer' }
