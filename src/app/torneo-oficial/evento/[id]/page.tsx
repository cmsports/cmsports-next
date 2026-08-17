'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { CONFIG } from '@/lib/config'
import { determinarFaseInicial } from '@/lib/domain/torneos'
import {
  actualizarArbitroPartidoOficial,
  actualizarModoSorteoLlaveOficial,
  actualizarProgramaPartidoOficial,
  configurarCabezasOficial,
  corregirResultadoOficial,
  formarGruposOficial,
  inscribirJugadorOficial,
  inscribirLoteOficial,
  actualizarEventoOficial,
  intercambiarCuposOficial,
  listarConflictosProgramaOficial,
  programarEventoOficial,
  registrarResultadoOficial,
  registrarSancionOficial,
  reiniciarLlavesOficial,
  renumerarPartidosOficial,
  sincronizarLlavesOficial,
} from '@/app/actions/torneo-oficial'
import {
  clasificarGrupoIttf,
  etiquetaCierreOficial,
  formatearSets,
  type AlcanceSancionOficial,
  type PartidoOficialStats,
  type SetMarcador,
  type TipoCierreOficial,
} from '@/lib/domain/oficial-ittf'
import {
  MODO_SORTEO_LLAVE_LABEL,
  resumenSiembraCuadro,
  TAMANOS_CUADRO,
  planificarPreLlave,
  type ModoSorteoLlave,
  type TamanoCuadro,
} from '@/lib/domain/oficial-sorteo'
import BracketOficial from '@/components/torneo-oficial/BracketOficial'
import InscripcionOficialModal from '@/components/torneo-oficial/InscripcionOficialModal'
import PartidoOficialRow, { type GuardarResultadoOpts } from '@/components/torneo-oficial/PartidoOficialRow'
import ProgramaOficialTablero, {
  type CeldaProgramaOficial,
  type SinProgramarOficial,
} from '@/components/torneo-oficial/ProgramaOficialTablero'
import { descargarExcelOficialKoidan } from '@/lib/oficial-export-excel'
import { exportarGruposOficialPdf, exportarLlavesOficialPdf, exportarProgramaOficialPdf } from '@/lib/oficial-export-pdf'
import { cargarOficialConCache, invalidarCacheOficial } from '@/lib/torneo-oficial/carga-cliente'
import { btnOutlineIndigo, btnPrimaryIndigo, tabUnderline, torneoUi } from '@/lib/torneos/ui-tokens'
import Link from 'next/link'

const supabase = createClient()

type Tab = 'grupos' | 'llaves' | 'programa' | 'sanciones'

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
  modo_sorteo_llave?: ModoSorteoLlave
  fecha_juego?: string | null
  tamano_cuadro?: TamanoCuadro | null
}

type Campeonato = { id: string; nombre: string; mesas_count?: number }

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
  tipo_cierre?: TipoCierreOficial | null
  motivo_cierre?: string | null
  alcance_sancion?: AlcanceSancionOficial | null
  orden: number
  mesa: number | null
  programado_en: string | null
  numero_ittf?: number | null
  arbitro_nombre?: string | null
}

type Sancion = {
  id: string
  partido_id: string | null
  inscrito_id: string | null
  tipo: string
  detalle: string | null
  origen: string
  creado_en: string
}

const card = torneoUi.card
const text = torneoUi.text
const muted = torneoUi.muted
const hint = torneoUi.hint

const FASE_LABELS = CONFIG.FASE_LABELS as Record<string, string>

function resumenCuadroDelEvento(numGrupos: number, tamanoCuadro: TamanoCuadro | null | undefined) {
  if (tamanoCuadro && numGrupos >= 2) {
    const plan = planificarPreLlave(numGrupos, tamanoCuadro)
    if (plan && 'error' in plan) return { error: plan.error }
    if (plan) {
      return {
        clasificados: numGrupos * 2,
        tamanoLlave: plan.tamanoCuadro,
        byes: 0,
        faseInicial: determinarFaseInicial(plan.tamanoCuadro),
        preLlave: plan.partidosAvance,
      }
    }
  }
  return resumenSiembraCuadro(numGrupos * 2)
}

const FASE_LLAVE_CORTA: Record<string, string> = {
  avance: 'Avance',
  '32vos': '32vos',
  '16vos': '16vos',
  '8vos': '8vos',
  cuartos: 'Cuartos',
  semis: 'Semis',
  tercer_lugar: '3°',
  final: 'Final',
}

export default function EventoOficialPage() {
  const { id } = useParams<{ id: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const clubId = perfil?.club_id
  const syncLlavesRef = useRef<string | null>(null)

  const [evento, setEvento] = useState<Evento | null>(null)
  const [camp, setCamp] = useState<Campeonato | null>(null)
  const [inscritos, setInscritos] = useState<Inscrito[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [miembrosGrupo, setMiembrosGrupo] = useState<Array<{ grupo_id: string; inscrito_id: string }>>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [sanciones, setSanciones] = useState<Sancion[]>([])
  const [conflictosProg, setConflictosProg] = useState<Array<{ partidoId: string; motivo: string; tipo: string }>>([])
  const [editProgId, setEditProgId] = useState<string | null>(null)
  const [editMesa, setEditMesa] = useState('')
  const [editHora, setEditHora] = useState('')
  const [editArbitro, setEditArbitro] = useState('')
  const [guardandoProg, setGuardandoProg] = useState(false)
  const [modoSorteo, setModoSorteo] = useState<ModoSorteoLlave>('fijo')
  const [guardandoSorteo, setGuardandoSorteo] = useState(false)
  const [sancionForm, setSancionForm] = useState({ inscritoId: '', tipo: 'amarilla', detalle: '', partidoId: '' })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('grupos')
  const [faseLlave, setFaseLlave] = useState<string>('auto')

  const [modalInscripcion, setModalInscripcion] = useState(false)
  const [inscribiendo, setInscribiendo] = useState(false)
  const [formando, setFormando] = useState(false)
  const [syncLlaves, setSyncLlaves] = useState(false)
  const [programando, setProgramando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [importando, setImportando] = useState(false)
  const [fechaJuego, setFechaJuego] = useState('')
  const [tamanoCuadro, setTamanoCuadro] = useState<string>('')
  const [guardandoEvento, setGuardandoEvento] = useState(false)

  const [guardandoRes, setGuardandoRes] = useState<string | null>(null)
  const [reiniciando, setReiniciando] = useState(false)
  const cargadoRef = useRef(false)
  const cacheKey = useMemo(
    () => (perfil?.club_id ? `oficial:evento:${id}:${perfil.club_id}` : ''),
    [id, perfil?.club_id],
  )

  function recargarEvento() {
    if (cacheKey) invalidarCacheOficial(cacheKey)
    void cargar()
  }

  type DatosEvento = {
    evento: Evento | null
    camp: Campeonato | null
    inscritos: Inscrito[]
    grupos: Grupo[]
    miembrosGrupo: Array<{ grupo_id: string; inscrito_id: string }>
    partidos: Partido[]
    sanciones: Sancion[]
  }

  const aplicarDatos = useCallback((d: DatosEvento) => {
    setEvento(d.evento)
    setCamp(d.camp)
    setInscritos(d.inscritos)
    setGrupos(d.grupos)
    setMiembrosGrupo(d.miembrosGrupo)
    setPartidos(d.partidos)
    setSanciones(d.sanciones)
    if (d.evento?.modo_sorteo_llave) setModoSorteo(d.evento.modo_sorteo_llave)
    if (d.evento?.fecha_juego) setFechaJuego(d.evento.fecha_juego)
    setTamanoCuadro(d.evento?.tamano_cuadro ? String(d.evento.tamano_cuadro) : '')
    cargadoRef.current = true
  }, [])

  const cargar = useCallback(async (silencioso = false) => {
    if (!clubId) return

    await cargarOficialConCache(
      `oficial:evento:${id}:${clubId}`,
      async (): Promise<DatosEvento> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any

        const qEv = await db.from('oficial_eventos')
          .select('id,nombre,categoria,genero,fase,formato_partido,campeonato_id,campeon_inscrito_id,tercer_inscrito_id,modo_sorteo_llave,fecha_juego,tamano_cuadro')
          .eq('id', id).eq('club_id', clubId).maybeSingle()
        let ev = (qEv.data || null) as Evento | null
        if (qEv.error && (String(qEv.error.message || '').includes('fecha_juego') || String(qEv.error.message || '').includes('tamano_cuadro'))) {
          const q2 = await db.from('oficial_eventos')
            .select('id,nombre,categoria,genero,fase,formato_partido,campeonato_id,campeon_inscrito_id,tercer_inscrito_id,modo_sorteo_llave')
            .eq('id', id).eq('club_id', clubId).maybeSingle()
          ev = q2.data ? { ...q2.data, fecha_juego: null, tamano_cuadro: null } : null
          if (q2.error && String(q2.error.message || '').includes('modo_sorteo_llave')) {
            const { data: ev2 } = await db.from('oficial_eventos')
              .select('id,nombre,categoria,genero,fase,formato_partido,campeonato_id,campeon_inscrito_id,tercer_inscrito_id')
              .eq('id', id).eq('club_id', clubId).maybeSingle()
            ev = ev2 ? { ...ev2, modo_sorteo_llave: 'fijo' as ModoSorteoLlave, fecha_juego: null, tamano_cuadro: null } : null
          }
        } else if (qEv.error && String(qEv.error.message || '').includes('modo_sorteo_llave')) {
          const { data: ev2 } = await db.from('oficial_eventos')
            .select('id,nombre,categoria,genero,fase,formato_partido,campeonato_id,campeon_inscrito_id,tercer_inscrito_id')
            .eq('id', id).eq('club_id', clubId).maybeSingle()
          ev = ev2 ? { ...ev2, modo_sorteo_llave: 'fijo' as ModoSorteoLlave } : null
        }

        let camp: Campeonato | null = null
        if (ev?.campeonato_id) {
          const { data: c } = await db.from('oficial_campeonatos').select('id,nombre,mesas_count')
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
            .select('grupo_id,inscrito_id,orden').in('grupo_id', grupoIds).order('orden')
          miembrosGrupo = (mg || []).map((m: { grupo_id: string; inscrito_id: string }) => ({
            grupo_id: m.grupo_id,
            inscrito_id: m.inscrito_id,
          }))
        }

        let par: Partido[] = []
        const selFull = 'id,fase,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,tipo_cierre,motivo_cierre,alcance_sancion,orden,mesa,programado_en,numero_ittf,arbitro_nombre'
        const selMid = 'id,fase,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,tipo_cierre,motivo_cierre,alcance_sancion,orden,mesa,programado_en'
        const selBase = 'id,fase,grupo_id,inscrito_a_id,inscrito_b_id,ganador_id,sets,es_walkover,orden,mesa,programado_en'
        const q1 = await db.from('oficial_partidos').select(selFull).eq('evento_id', id).order('orden')
        if (q1.error && String(q1.error.message || '').includes('numero_ittf')) {
          const qMid = await db.from('oficial_partidos').select(selMid).eq('evento_id', id).order('orden')
          if (qMid.error && String(qMid.error.message || '').includes('tipo_cierre')) {
            const q2 = await db.from('oficial_partidos').select(selBase).eq('evento_id', id).order('orden')
            par = q2.data || []
          } else {
            par = qMid.data || []
          }
        } else if (q1.error && String(q1.error.message || '').includes('tipo_cierre')) {
          const q2 = await db.from('oficial_partidos').select(selBase).eq('evento_id', id).order('orden')
          par = q2.data || []
        } else {
          par = q1.data || []
        }

        let sanciones: Sancion[] = []
        const { data: san, error: sanErr } = await db.from('oficial_sanciones')
          .select('id,partido_id,inscrito_id,tipo,detalle,origen,creado_en')
          .eq('evento_id', id).order('creado_en', { ascending: false })
        if (!sanErr) sanciones = san || []

        return {
          evento: ev,
          camp,
          inscritos: ins || [],
          grupos: gr || [],
          miembrosGrupo,
          partidos: par.map((p: Partido & { sets: unknown }) => ({
            ...p,
            sets: Array.isArray(p.sets) ? p.sets as SetMarcador[] : [],
          })),
          sanciones,
        }
      },
      {
        tablas: [
          'oficial_eventos', 'oficial_inscritos', 'oficial_grupos',
          'oficial_grupo_inscritos', 'oficial_partidos', 'oficial_campeonatos', 'oficial_sanciones',
        ],
        silencioso,
        aplicar: aplicarDatos,
        setLoading,
        tieneDatos: () => cargadoRef.current,
      },
    )
  }, [clubId, id, aplicarDatos])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) void cargar()
  }, [authLoading, perfil, cargar, router])

  useEffect(() => { setFaseLlave('auto') }, [id])

  useEnVivo(
    ['oficial_eventos', 'oficial_inscritos', 'oficial_grupos', 'oficial_grupo_inscritos', 'oficial_partidos', 'oficial_sanciones'],
    perfil?.club_id ?? null,
    () => { void cargar(true) },
    { conClub: ['oficial_eventos', 'oficial_inscritos', 'oficial_grupos', 'oficial_grupo_inscritos', 'oficial_partidos', 'oficial_sanciones'] },
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
    () => CONFIG.FASES_ORDEN.find(f => f !== 'avance' && partidosPlayoff.some(p => p.fase === f)) ?? null,
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

  const faseLlaveEfectiva = useMemo(() => {
    if (faseLlave !== 'auto') return faseLlave
    const pendiente = fasesPlayoffOrdenadas.find(f =>
      (partidosPorFase.get(f) || []).some(p => p.inscrito_b_id && !p.ganador_id),
    )
    return pendiente || fasesPlayoffOrdenadas[0] || 'cuadro'
  }, [faseLlave, fasesPlayoffOrdenadas, partidosPorFase])

  const programaFilas = useMemo(() =>
    [...partidos]
      .filter(p => p.programado_en && p.inscrito_a_id)
      .sort((a, b) => {
        const na = a.numero_ittf ?? 9999
        const nb = b.numero_ittf ?? 9999
        if (na !== nb) return na - nb
        return new Date(a.programado_en!).getTime() - new Date(b.programado_en!).getTime()
      })
      .map(p => ({
        hora: new Date(p.programado_en!).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
        mesa: p.mesa ?? 0,
        evento: evento?.nombre || '',
        fase: FASE_LABELS[p.fase] || p.fase,
        partido: `${nombrePorId.get(p.inscrito_a_id!) || '?'} vs ${p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) : 'BYE'}`,
        resultado: p.ganador_id ? formatearSets(p.sets) : undefined,
        numeroIttf: p.numero_ittf,
        arbitro: p.arbitro_nombre,
      })),
  [partidos, evento, nombrePorId])

  const resumenCuadro = resumenCuadroDelEvento(grupos.length, evento?.tamano_cuadro)

  const { programaCeldas, programaSinUbicar } = useMemo(() => {
    const celdas: CeldaProgramaOficial[] = []
    const sin: SinProgramarOficial[] = []
    for (const p of partidos) {
      if (!p.inscrito_a_id) continue
      const faseLabel = FASE_LABELS[p.fase] || p.fase
      const jugadorA = nombrePorId.get(p.inscrito_a_id) || '?'
      const jugadorB = p.inscrito_b_id ? (nombrePorId.get(p.inscrito_b_id) || '?') : 'BYE'
      const estado: CeldaProgramaOficial['estado'] = p.tipo_cierre === 'retiro'
        ? 'retiro'
        : p.es_walkover || p.tipo_cierre === 'walkover'
          ? 'walkover'
          : p.ganador_id
            ? 'finalizado'
            : 'pendiente'
      const resultado = p.ganador_id
        ? `${formatearSets(p.sets)}${etiquetaCierreOficial(p.tipo_cierre, p.es_walkover) ? ` ${etiquetaCierreOficial(p.tipo_cierre, p.es_walkover)}` : ''}`
        : undefined
      if (p.programado_en && p.mesa) {
        celdas.push({
          id: p.id,
          mesa: p.mesa,
          hora: new Date(p.programado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
          faseLabel,
          jugadorA,
          jugadorB,
          resultado,
          estado,
        })
      } else {
        sin.push({ id: p.id, faseLabel, jugadorA, jugadorB })
      }
    }
    celdas.sort((a, b) => a.hora.localeCompare(b.hora) || a.mesa - b.mesa)
    return { programaCeldas: celdas, programaSinUbicar: sin }
  }, [partidos, nombrePorId])

  async function inscribirDesdeModal(nombre: string, asociacion?: string) {
    setInscribiendo(true)
    const res = await inscribirJugadorOficial({ eventoId: id, nombre, asociacion })
    setInscribiendo(false)
    if (!res.error) recargarEvento()
    return res
  }

  async function importarLoteModal(filas: Array<{ nombre: string; asociacion?: string; codigoFederativo?: string; ranking?: number }>, sugerirCabezas: boolean) {
    setImportando(true)
    const res = await inscribirLoteOficial({ eventoId: id, filas, sugerirCabezas })
    setImportando(false)
    if (!res.error) recargarEvento()
    return res
  }

  async function guardarMetaEvento() {
    setErrorMsg('')
    setGuardandoEvento(true)
    const tamano = tamanoCuadro === '' ? null : Number(tamanoCuadro) as TamanoCuadro
    const res = await actualizarEventoOficial({
      eventoId: id,
      fechaJuego: fechaJuego || undefined,
      tamanoCuadro: tamano,
    })
    setGuardandoEvento(false)
    if (res.error) setErrorMsg(res.error)
    else recargarEvento()
  }

  async function guardarCabezasModal(jugadorIds: string[]) {
    const cabezas = jugadorIds.map((inscritoId, i) => ({ inscritoId, numero: i + 1 }))
    const res = await configurarCabezasOficial({ eventoId: id, cabezas })
    if (!res.error) recargarEvento()
    return res
  }

  async function armarLlaves() {
    setErrorMsg(''); setSyncLlaves(true)
    const res = await sincronizarLlavesOficial({ eventoId: id })
    setSyncLlaves(false)
    if (res.error) setErrorMsg(res.error)
    else recargarEvento()
  }

  async function programar() {
    setErrorMsg(''); setProgramando(true)
    const res = await programarEventoOficial({ eventoId: id })
    setProgramando(false)
    if (res.error) setErrorMsg(res.error)
    else {
      const omitidos = typeof res.omitidos === 'number' ? res.omitidos : 0
      const programados = typeof res.programados === 'number' ? res.programados : 0
      if (omitidos > 0) {
        setErrorMsg(`Se programaron ${programados} partidos; ${omitidos} no cupieron (ajusta mesas/minutos en el campeonato).`)
      }
      recargarEvento()
    }
  }

  async function guardarResultado(partidoId: string, opts?: GuardarResultadoOpts) {
    const tipo = opts?.tipoCierre ?? (opts?.walkover ? 'walkover' : 'jugado')
    if (tipo === 'jugado' && !opts?.setsTexto?.trim()) return { error: 'Indica los sets' }
    if ((tipo === 'walkover' || tipo === 'retiro') && !opts?.motivoCierre?.trim()) {
      return { error: 'Indica el motivo' }
    }
    setGuardandoRes(partidoId)
    const res = await registrarResultadoOficial({
      partidoId,
      setsTexto: tipo === 'walkover' ? undefined : opts?.setsTexto,
      esWalkover: tipo === 'walkover',
      tipoCierre: tipo,
      ganadorId: opts?.ganadorId,
      motivoCierre: opts?.motivoCierre,
      alcanceSancion: opts?.alcanceSancion,
    })
    setGuardandoRes(null)
    if (res.error) { setErrorMsg(res.error); return res }
    recargarEvento()
    return res
  }

  async function corregir(partidoId: string, ganadorId: string, setsTexto?: string) {
    setGuardandoRes(partidoId)
    const res = await corregirResultadoOficial({
      partidoId,
      nuevoGanadorId: ganadorId,
      setsTexto,
    })
    setGuardandoRes(null)
    if (res.error) { setErrorMsg(res.error); return res }
    recargarEvento()
    return res
  }

  async function reiniciarLlaves() {
    if (!confirm('¿Borrar las llaves no jugadas y reconstruir desde los grupos?')) return
    setReiniciando(true)
    const res = await reiniciarLlavesOficial({ eventoId: id })
    setReiniciando(false)
    if (res.error) setErrorMsg(res.error)
    else recargarEvento()
  }

  async function intercambiarCupos(
    slotA: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' },
    slotB: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' },
  ) {
    const res = await intercambiarCuposOficial({ eventoId: id, slotA, slotB })
    if (res.error) setErrorMsg(res.error)
    else recargarEvento()
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
        tipoCierre: p.tipo_cierre,
      }))
    return clasificarGrupoIttf(ids, statsInput)
  }

  async function exportarExcel() {
    if (!evento || !camp) return
    const inscritosPorG = new Map<string, string[]>()
    for (const m of miembrosGrupo) {
      const lista = inscritosPorG.get(m.grupo_id) ?? []
      lista.push(m.inscrito_id)
      inscritosPorG.set(m.grupo_id, lista)
    }
    await descargarExcelOficialKoidan({
      eventoNombre: evento.nombre,
      campeonatoNombre: camp.nombre,
      inscritos: inscritos.map(i => ({
        id: i.id,
        nombre: i.nombre,
        asociacion: i.asociacion,
        cabezaNumero: i.cabeza_numero,
        ordenInscripcion: i.orden_inscripcion,
      })),
      grupos: grupos.map(g => ({
        id: g.id,
        nombre: g.nombre,
        orden: g.orden,
        inscritoIds: inscritosPorG.get(g.id) ?? [],
      })),
      partidos: partidos.map(p => ({
        id: p.id,
        fase: p.fase,
        orden: p.orden,
        grupoId: p.grupo_id,
        inscritoA: p.inscrito_a_id,
        inscritoB: p.inscrito_b_id,
        ganadorId: p.ganador_id,
        sets: p.sets,
        esWalkover: p.es_walkover,
        tipoCierre: p.tipo_cierre,
        mesa: p.mesa,
        programadoEn: p.programado_en,
        numeroIttf: p.numero_ittf,
        arbitroNombre: p.arbitro_nombre,
      })),
      statsPorGrupo: (grupoId) => statsGrupo(grupoId).map(s => ({
        inscritoId: s.inscritoId,
        pts: s.pts,
        pg: s.pg,
        pp: s.pp,
        juegosGanados: s.juegosGanados,
        juegosPerdidos: s.juegosPerdidos,
      })),
      nombreArchivo: `${evento.nombre.replace(/\s+/g, '_')}_oficial.xlsx`,
    })
  }

  async function refrescarConflictos() {
    const res = await listarConflictosProgramaOficial({ eventoId: id })
    if (res.error) return
    const lista = Array.isArray(res.conflictos) ? res.conflictos : []
    setConflictosProg(lista.map((c: { partidoId: string; motivo: string; tipo: string }) => ({
      partidoId: c.partidoId,
      motivo: c.motivo,
      tipo: c.tipo,
    })))
  }

  async function guardarEdicionPrograma(forzar = false) {
    if (!editProgId) return
    const mesa = editMesa.trim() ? Number(editMesa) : null
    let programadoEn: string | null = null
    if (editHora.trim()) {
      programadoEn = new Date(editHora).toISOString()
    }
    setGuardandoProg(true)
    const res = await actualizarProgramaPartidoOficial({
      partidoId: editProgId,
      mesa,
      programadoEn,
      forzar,
    })
    if (!res.error || forzar) {
      const arb = await actualizarArbitroPartidoOficial({
        partidoId: editProgId,
        arbitroNombre: editArbitro.trim() || null,
      })
      if (arb.error && String(arb.error).includes('181')) {
        // Columna aún no migrada: no bloquea mesa/hora
      } else if (arb.error) {
        setGuardandoProg(false)
        setErrorMsg(arb.error)
        return
      }
    }
    setGuardandoProg(false)
    const conflictosRes = Array.isArray(res.conflictos) ? res.conflictos as Array<{ tipo: string; motivo: string; otroId: string }> : []
    if (res.error && !forzar) {
      setErrorMsg(res.error)
      if (conflictosRes.length) {
        setConflictosProg(conflictosRes.map(c => ({
          partidoId: editProgId,
          motivo: c.motivo,
          tipo: c.tipo,
        })))
      }
      return
    }
    setEditProgId(null)
    setErrorMsg('')
    recargarEvento()
    void refrescarConflictos()
  }

  async function guardarModoSorteo() {
    setErrorMsg('')
    setGuardandoSorteo(true)
    const res = await actualizarModoSorteoLlaveOficial({ eventoId: id, modo: modoSorteo })
    setGuardandoSorteo(false)
    if (res.error) { setErrorMsg(res.error); return }
    const sync = await sincronizarLlavesOficial({ eventoId: id })
    if (sync.error) setErrorMsg(sync.error)
    else recargarEvento()
  }

  async function agregarSancionManual() {
    if (!sancionForm.inscritoId) {
      setErrorMsg('Elige el jugador sancionado')
      return
    }
    const res = await registrarSancionOficial({
      eventoId: id,
      inscritoId: sancionForm.inscritoId,
      tipo: sancionForm.tipo as 'blanca' | 'amarilla' | 'roja' | 'descalificacion' | 'otro',
      detalle: sancionForm.detalle || undefined,
      partidoId: sancionForm.partidoId || undefined,
    })
    if (res.error) { setErrorMsg(res.error); return }
    setSancionForm({ inscritoId: '', tipo: 'amarilla', detalle: '', partidoId: '' })
    recargarEvento()
  }

  function sancionesDePartido(partidoId: string): string {
    const lista = sanciones.filter(s => s.partido_id === partidoId)
    if (!lista.length) return ''
    return lista.map(s => {
      const nom = s.inscrito_id ? (nombrePorId.get(s.inscrito_id) || '') : ''
      return `${s.tipo}${nom ? ` · ${nom}` : ''}`
    }).join(' · ')
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
          <p style={{ color: hint }}>Cargando…</p>
        ) : !evento ? (
          <p style={{ color: hint }}>Evento no encontrado</p>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, color: text }}>{evento.nombre}</h1>
                <p style={{ margin: '6px 0 0', color: muted, fontSize: 13 }}>
                  {evento.categoria} · {evento.genero} · {evento.formato_partido.toUpperCase()} · fase {evento.fase}
                  {evento.fecha_juego ? ` · juega ${evento.fecha_juego}` : ''}
                  {evento.tamano_cuadro ? ` · cuadro ${evento.tamano_cuadro}` : ''}
                  {campeonNombre ? ` · 🏆 ${campeonNombre}` : ''}
                  {tercerNombre ? ` · 🥉 ${tercerNombre}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href="/torneo-oficial/manual" style={{ ...btnOutlineIndigo, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                  Manual
                </Link>
                {enInscripcion && esAdmin && (
                  <button type="button" onClick={() => setModalInscripcion(true)} style={btnPrimaryIndigo}>
                    🪑 Inscripción ({inscritos.length})
                  </button>
                )}
              </div>
            </div>

            {errorMsg && (
              <div style={{ ...card, padding: 12, marginBottom: 14, color: torneoUi.danger, fontSize: 13 }}>{errorMsg}</div>
            )}

            {esAdmin && evento.fase !== 'finalizado' && (
              <div style={{ ...card, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 8 }}>Día y cuadro</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: muted, marginBottom: 4 }}>Fecha de juego</label>
                    <input type="date" value={fechaJuego} onChange={e => setFechaJuego(e.target.value)}
                      style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: muted, marginBottom: 4 }}>Tamaño de cuadro</label>
                    <select value={tamanoCuadro} onChange={e => setTamanoCuadro(e.target.value)}
                      style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
                      <option value="">Automático (2×grupos)</option>
                      {TAMANOS_CUADRO.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <button type="button" disabled={guardandoEvento} onClick={() => void guardarMetaEvento()} style={btnOutlineIndigo}>
                    {guardandoEvento ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: hint }}>
                  Sábado vs domingo, y pre-llave (1/64) si 2×grupos no cabe en el cuadro.
                </p>
              </div>
            )}

            {enInscripcion && inscritos.length > 0 && (
              <div style={{ ...card, padding: 16, marginBottom: 16, textAlign: 'center', color: muted, fontSize: 13 }}>
                {inscritos.length} jugador{inscritos.length !== 1 ? 'es' : ''} inscrito{inscritos.length !== 1 ? 's' : ''}.
                {esAdmin ? ' Pulsa «Inscripción» para agregar jugadores, cabezas de serie y formar grupos.' : ''}
              </div>
            )}

            {/* Tabs */}
            {!enInscripcion && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
                {(['grupos', 'llaves', 'programa', 'sanciones'] as Tab[]).map(t => (
                  <button key={t} type="button" onClick={() => setTab(t)} style={tabUnderline(tab === t)}>
                    {t === 'grupos' ? 'Grupos' : t === 'llaves' ? 'Llaves' : t === 'programa' ? 'Programa' : 'Sanciones'}
                  </button>
                ))}
                {(tab === 'grupos' || tab === 'llaves' || tab === 'programa') && (
                  <button type="button" onClick={() => void exportarExcel()} style={btnOutlineIndigo}>Excel</button>
                )}
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
              importando={importando}
              onInscribir={inscribirDesdeModal}
              onImportarLote={importarLoteModal}
              onFormarGrupos={async () => {
                setFormando(true)
                const res = await formarGruposOficial({ eventoId: id })
                setFormando(false)
                if (!res.error) recargarEvento()
                return res
              }}
              onGuardarCabezas={guardarCabezasModal}
            />

            {/* Groups grid */}
            {(enInscripcion || tab === 'grupos') && grupos.length > 0 && (
              <>
                {esAdmin && evento.fase !== 'finalizado' && (
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: muted }}>
                    Resultado por partido: <strong style={{ color: text }}>🎯 En vivo</strong> (marcador tablet)
                    {' '}o <strong style={{ color: text }}>Sets</strong> a mano — ambos válidos.
                  </p>
                )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
                {grupos.map(g => {
                  const stats = statsGrupo(g.id)
                  const partidosG = partidosPorGrupo.get(g.id) ?? []
                  const todosCerrados = partidosG.length > 0 && partidosG.every(p => p.ganador_id)
                  return (
                    <div key={g.id} style={{ ...card, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: text }}>Grupo {g.nombre}</span>
                        {todosCerrados && (
                          <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 10, fontSize: 10 }}>✓ Cerrado</span>
                        )}
                      </div>
                      {stats.map((s, idx) => (
                        <div key={s.inscritoId} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          borderLeft: `3px solid ${idx === 0 ? '#d97706' : idx === 1 ? '#94a3b8' : 'transparent'}`,
                        }}>
                          <span style={{ fontSize: 14 }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '—'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: text }}>{nombrePorId.get(s.inscritoId)}</div>
                            <div style={{ fontSize: 10, color: muted }}>{s.pg}G {s.pp}P · {s.pts}pts</div>
                          </div>
                        </div>
                      ))}
                      <div style={{ padding: '8px 16px' }}>
                        {partidosG.map(p => {
                          const nombreA = p.inscrito_a_id ? nombrePorId.get(p.inscrito_a_id) || '?' : '?'
                          const esBye = !p.inscrito_b_id
                          const nombreB = esBye ? 'BYE' : (p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) || '?' : '?')
                          const ganadorNombre = p.ganador_id ? nombrePorId.get(p.ganador_id) || null : null

                          return (
                            <PartidoOficialRow
                              key={p.id}
                              partido={p}
                              eventoId={id}
                              nombreA={nombreA}
                              nombreB={nombreB}
                              esBye={esBye}
                              ganadorNombre={ganadorNombre}
                              puedeCorregir={esAdmin && evento.fase !== 'finalizado'}
                              guardando={guardandoRes === p.id}
                              sancionesResumen={sancionesDePartido(p.id)}
                              onGuardar={(opts) => guardarResultado(p.id, opts)}
                              onCorregir={(ganadorId, setsTexto) => corregir(p.id, ganadorId, setsTexto)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              </>
            )}

            {/* Llaves tab */}
            {tab === 'llaves' && (
              <>
                {esAdmin && evento.fase !== 'finalizado' && (
                  <details style={{ ...card, padding: 12, marginBottom: 12 }}>
                    <summary style={{ fontSize: 13, fontWeight: 600, color: text, cursor: 'pointer' }}>
                      Sorteo 2ª fase
                    </summary>
                    <p style={{ margin: '8px 0 10px', fontSize: 12, color: muted }}>
                      Alternativa al cruzamiento fijo 1°×2° (§3.7). Guardar re-sincroniza las llaves no jugadas.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={modoSorteo}
                        onChange={e => setModoSorteo(e.target.value as ModoSorteoLlave)}
                        style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, minWidth: 260 }}
                      >
                        {(Object.keys(MODO_SORTEO_LLAVE_LABEL) as ModoSorteoLlave[]).map(m => (
                          <option key={m} value={m}>{MODO_SORTEO_LLAVE_LABEL[m]}</option>
                        ))}
                      </select>
                      <button type="button" disabled={guardandoSorteo} onClick={() => void guardarModoSorteo()} style={btnPrimaryIndigo}>
                        {guardandoSorteo ? 'Aplicando…' : 'Aplicar sorteo'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void renumerarPartidosOficial({ eventoId: id }).then(r => {
                          if (r.error) setErrorMsg(r.error)
                          else recargarEvento()
                        })}
                        style={btnOutlineIndigo}
                      >
                        Renumerar ITTF
                      </button>
                    </div>
                    {resumenCuadro && 'error' in resumenCuadro && (
                      <p style={{ margin: '10px 0 0', fontSize: 12, color: torneoUi.danger }}>{resumenCuadro.error}</p>
                    )}
                    {resumenCuadro && !('error' in resumenCuadro) && (
                      <p style={{ margin: '10px 0 0', fontSize: 12, color: hint }}>
                        Cuadro: {resumenCuadro.clasificados} clasificados → llave de {resumenCuadro.tamanoLlave}
                        {resumenCuadro.byes > 0 ? ` · ${resumenCuadro.byes} BYE` : ''}
                        {'preLlave' in resumenCuadro && resumenCuadro.preLlave
                          ? ` · ${resumenCuadro.preLlave} partidos de avance (1/64)`
                          : ''}
                        {' · '}fase inicial {FASE_LABELS[resumenCuadro.faseInicial] || resumenCuadro.faseInicial}
                      </p>
                    )}
                  </details>
                )}
              {partidosPlayoff.length === 0 ? (
                <div style={{ ...card, padding: 24, color: muted, textAlign: 'center' }}>
                  Aún no hay llaves. Cierra al menos un grupo o pulsa «Sincronizar llaves».
                </div>
              ) : (
                <>
                  {evento.fase === 'finalizado' && campeonNombre && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 16 }}>
                      <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>¡Campeón!</div>
                      <div style={{ fontSize: 18, color: text, marginTop: 4 }}>{campeonNombre}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                    {fasesPlayoffOrdenadas.map(fase => {
                      const lista = partidosPorFase.get(fase) ?? []
                      const cerrados = lista.filter(p => p.ganador_id || !p.inscrito_b_id).length
                      const activa = faseLlaveEfectiva === fase
                      return (
                        <button
                          key={fase}
                          type="button"
                          onClick={() => setFaseLlave(fase)}
                          style={{
                            ...btnOutlineIndigo,
                            background: activa ? '#eef2ff' : '#fff',
                            borderColor: activa ? '#6366f1' : '#e2e8f0',
                            color: activa ? '#3730a3' : text,
                            fontWeight: activa ? 700 : 500,
                            padding: '6px 10px',
                            fontSize: 12,
                          }}
                        >
                          {FASE_LLAVE_CORTA[fase] || FASE_LABELS[fase] || fase}
                          <span style={{ marginLeft: 6, fontSize: 10, color: activa ? '#4338ca' : muted }}>
                            {cerrados}/{lista.length}
                          </span>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setFaseLlave('cuadro')}
                      style={{
                        ...btnOutlineIndigo,
                        background: faseLlaveEfectiva === 'cuadro' ? '#eef2ff' : '#fff',
                        borderColor: faseLlaveEfectiva === 'cuadro' ? '#6366f1' : '#e2e8f0',
                        color: faseLlaveEfectiva === 'cuadro' ? '#3730a3' : text,
                        fontWeight: faseLlaveEfectiva === 'cuadro' ? 700 : 500,
                        padding: '6px 10px',
                        fontSize: 12,
                      }}
                    >
                      Cuadro
                    </button>
                  </div>

                  {faseLlaveEfectiva === 'cuadro' ? (
                    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                      <h2 style={{ margin: '0 0 8px', fontSize: 15, color: text }}>Cuadro eliminatorio</h2>
                      <BracketOficial
                        partidos={partidosPlayoff.filter(p => p.fase !== 'avance')}
                        nombrePorId={nombrePorId}
                        esAdmin={esAdmin}
                        faseInicial={faseInicialLlaves}
                        onIntercambiar={esAdmin ? intercambiarCupos : undefined}
                      />
                    </div>
                  ) : (
                    (() => {
                      const fase = faseLlaveEfectiva
                      const lista = [...(partidosPorFase.get(fase) ?? [])].sort((a, b) => a.orden - b.orden)
                      const cerrados = lista.filter(p => p.ganador_id || !p.inscrito_b_id).length
                      return (
                        <div style={{ ...card, padding: 12, marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0, fontSize: 15, color: text }}>{FASE_LABELS[fase] || fase}</h2>
                            <span style={{ fontSize: 12, color: muted }}>{cerrados} de {lista.length} cerrados</span>
                          </div>
                          <div style={{ display: 'grid', gap: 2 }}>
                            {lista.map(p => {
                              const nombreA = p.inscrito_a_id ? nombrePorId.get(p.inscrito_a_id) || '?' : '?'
                              const esBye = !p.inscrito_b_id
                              const nombreB = esBye ? 'BYE' : (p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) || '?' : '?')
                              const ganadorNombre = p.ganador_id ? nombrePorId.get(p.ganador_id) || null : null
                              return (
                                <PartidoOficialRow
                                  key={p.id}
                                  partido={p}
                                  eventoId={id}
                                  nombreA={nombreA}
                                  nombreB={nombreB}
                                  esBye={esBye}
                                  ganadorNombre={ganadorNombre}
                                  puedeCorregir={esAdmin && evento.fase !== 'finalizado'}
                                  guardando={guardandoRes === p.id}
                                  sancionesResumen={sancionesDePartido(p.id)}
                                  onGuardar={(opts) => guardarResultado(p.id, opts)}
                                  onCorregir={(ganadorId, setsTexto) => corregir(p.id, ganadorId, setsTexto)}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()
                  )}
                </>
              )}
              </>
            )}

            {/* Programa tab */}
            {tab === 'programa' && (
              <div>
                {conflictosProg.length > 0 && (
                  <div style={{ ...card, padding: 12, marginBottom: 12, borderColor: '#fcd34d', background: '#fffbeb' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                      Conflictos de programa
                    </div>
                    {conflictosProg.map((c, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#a16207' }}>• {c.motivo}</div>
                    ))}
                  </div>
                )}

                {esAdmin && (
                  <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 10 }}>Editor de mesa / hora</div>
                    <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                      {partidos.filter(p => p.inscrito_a_id).map(p => {
                        const label = `${p.numero_ittf ? `#${p.numero_ittf} ` : ''}${nombrePorId.get(p.inscrito_a_id!) || '?'} vs ${p.inscrito_b_id ? nombrePorId.get(p.inscrito_b_id) : 'BYE'}`
                        const editing = editProgId === p.id
                        return (
                          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                            <span style={{ flex: 1, minWidth: 140, color: text }}>{label}</span>
                            <span style={{ color: muted, fontSize: 11 }}>{FASE_LABELS[p.fase] || p.fase}</span>
                            {editing ? (
                              <>
                                <input
                                  type="number"
                                  min={1}
                                  placeholder="Mesa"
                                  value={editMesa}
                                  onChange={e => setEditMesa(e.target.value)}
                                  style={{ width: 70, border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px' }}
                                />
                                <input
                                  type="datetime-local"
                                  value={editHora}
                                  onChange={e => setEditHora(e.target.value)}
                                  style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px' }}
                                />
                                <input
                                  type="text"
                                  placeholder="Árbitro"
                                  value={editArbitro}
                                  onChange={e => setEditArbitro(e.target.value)}
                                  style={{ width: 120, border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px' }}
                                />
                                <button type="button" disabled={guardandoProg} onClick={() => void guardarEdicionPrograma(false)} style={btnPrimaryIndigo}>
                                  Guardar
                                </button>
                                <button type="button" disabled={guardandoProg} onClick={() => void guardarEdicionPrograma(true)} style={btnOutlineIndigo} title="Guardar aunque haya conflicto">
                                  Forzar
                                </button>
                                <button type="button" onClick={() => setEditProgId(null)} style={btnOutlineIndigo}>Cancelar</button>
                              </>
                            ) : (
                              <>
                                <span style={{ color: muted }}>
                                  {p.mesa ? `M${p.mesa}` : 'Sin mesa'}
                                  {p.programado_en
                                    ? ` · ${new Date(p.programado_en).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                                    : ''}
                                  {p.arbitro_nombre ? ` · Árb. ${p.arbitro_nombre}` : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditProgId(p.id)
                                    setEditMesa(p.mesa ? String(p.mesa) : '')
                                    setEditArbitro(p.arbitro_nombre || '')
                                    if (p.programado_en) {
                                      const d = new Date(p.programado_en)
                                      const pad = (n: number) => String(n).padStart(2, '0')
                                      setEditHora(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
                                    } else {
                                      setEditHora('')
                                    }
                                    void refrescarConflictos()
                                  }}
                                  style={btnOutlineIndigo}
                                >
                                  Editar
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <ProgramaOficialTablero
                  celdas={programaCeldas}
                  sinProgramar={programaSinUbicar}
                  mesasCount={camp?.mesas_count}
                />
              </div>
            )}

            {/* Sanciones tab */}
            {tab === 'sanciones' && (
              <div>
                {esAdmin && (
                  <div style={{ ...card, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 10 }}>Registrar sanción</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={sancionForm.inscritoId}
                        onChange={e => setSancionForm(f => ({ ...f, inscritoId: e.target.value }))}
                        style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                      >
                        <option value="">Jugador…</option>
                        {inscritos.map(i => (
                          <option key={i.id} value={i.id}>{i.nombre}</option>
                        ))}
                      </select>
                      <select
                        value={sancionForm.tipo}
                        onChange={e => setSancionForm(f => ({ ...f, tipo: e.target.value }))}
                        style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                      >
                        <option value="blanca">Blanca</option>
                        <option value="amarilla">Amarilla</option>
                        <option value="roja">Roja</option>
                        <option value="descalificacion">Descalificación</option>
                        <option value="otro">Otro</option>
                      </select>
                      <input
                        value={sancionForm.detalle}
                        onChange={e => setSancionForm(f => ({ ...f, detalle: e.target.value }))}
                        placeholder="Detalle (opcional)"
                        style={{ flex: 1, minWidth: 160, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                      />
                      <button type="button" onClick={() => void agregarSancionManual()} style={btnPrimaryIndigo}>
                        Agregar
                      </button>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: hint }}>
                      Las tarjetas del marcador técnico se copian a esta bitácora al cerrar el partido.
                    </p>
                  </div>
                )}

                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  {sanciones.length === 0 ? (
                    <div style={{ padding: 24, color: muted, textAlign: 'center' }}>Sin sanciones registradas en este evento.</div>
                  ) : (
                    sanciones.map(s => (
                      <div key={s.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                          background: s.tipo === 'roja' ? '#fee2e2' : s.tipo === 'amarilla' ? '#fef9c3' : '#f1f5f9',
                          color: s.tipo === 'roja' ? '#b91c1c' : s.tipo === 'amarilla' ? '#a16207' : muted,
                        }}>
                          {s.tipo}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: text }}>
                            {s.inscrito_id ? (nombrePorId.get(s.inscrito_id) || 'Jugador') : '—'}
                          </div>
                          {s.detalle && <div style={{ fontSize: 12, color: muted }}>{s.detalle}</div>}
                          <div style={{ fontSize: 10, color: hint, marginTop: 2 }}>
                            {s.origen} · {new Date(s.creado_en).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </AppLayout>
  )
}

const btnBack: CSSProperties = { background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', marginBottom: 14, cursor: 'pointer' }
