'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import {
  FASE_LABEL,
  mesAnterior,
  metricasDe,
  TIPO_ERROR_LABEL,
  type EventoTecnico,
  type MetricasTecnicas,
} from '@/lib/tecnico/metricas'
import AyudaHint from '@/components/tecnico/AyudaHint'
import { glosarioPorLabel } from '@/lib/tecnico/manual-contenido'

const supabase = createClient()

type Jugador = { id: string; nombre: string; categoria: string | null }
type Sesion = { id: string; jugador_id: string | null; fecha: string; tipo: string }
type EvalItem = { jugador_id: string; codigo: string; nombre: string; estado: string }

type Periodo = 'todo' | 'mes_actual' | 'mes_anterior' | '90d'
type TipoFiltro = 'todos' | 'competencia' | 'entrenamiento' | 'analisis_video' | 'evaluacion'

export default function CompararJugadoresPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando comparación...</div>}>
      <CompararJugadoresContent />
    </Suspense>
  )
}

function CompararJugadoresContent() {
  const { perfil, loading: authLoading } = usePerfil()
  const search = useSearchParams()
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [eventos, setEventos] = useState<EventoTecnico[]>([])
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [evalItems, setEvalItems] = useState<EvalItem[]>([])
  const [jugadorA, setJugadorA] = useState('')
  const [jugadorB, setJugadorB] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('todo')
  const [tipo, setTipo] = useState<TipoFiltro>('todos')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: j, error: jError }, { data: e, error: eError }, { data: s, error: sError }, { data: eva }] = await Promise.all([
      db.from('jugadores').select('id,nombre,categoria').eq('club_id', perfil.club_id).eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false').order('nombre'),
      db.from('tecnico_eventos').select('jugador_id,golpe_codigo,zona_mesa,resultado,sesion_id,fase,metadatos').eq('club_id', perfil.club_id),
      db.from('tecnico_sesiones').select('id,jugador_id,fecha,tipo').eq('club_id', perfil.club_id).neq('estado', 'archivada'),
      db.from('tecnico_evaluaciones').select('id,jugador_id,estado').eq('club_id', perfil.club_id).eq('estado', 'publicada'),
    ])
    if (jError || eError || sError) {
      setError('No se pudieron cargar las métricas técnicas.')
      setCargando(false)
      return
    }

    const fechaPorSesion = new Map<string, string>((s ?? []).map((sesion: Sesion) => [sesion.id, sesion.fecha]))
    const eventosConFecha: EventoTecnico[] = (e ?? []).map((evento: EventoTecnico & { sesion_id: string; metadatos?: { tipo_error?: string } | null }) => ({
      ...evento,
      fecha: fechaPorSesion.get(evento.sesion_id) ?? null,
      tipo_error: evento.metadatos?.tipo_error ?? evento.tipo_error ?? null,
    }))

    const evalIds = (eva ?? []).map((item: { id: string }) => item.id)
    let items: EvalItem[] = []
    if (evalIds.length) {
      const { data: itemsData } = await db.from('tecnico_evaluacion_items')
        .select('evaluacion_id,codigo,nombre,estado')
        .in('evaluacion_id', evalIds)
      const jugadorPorEval = new Map<string, string>((eva ?? []).map((item: { id: string; jugador_id: string }) => [item.id, item.jugador_id]))
      items = (itemsData ?? []).map((item: { evaluacion_id: string; codigo: string; nombre: string; estado: string }) => ({
        jugador_id: jugadorPorEval.get(item.evaluacion_id) ?? '',
        codigo: item.codigo,
        nombre: item.nombre,
        estado: item.estado,
      })).filter((item: EvalItem) => item.jugador_id)
    }

    setJugadores(j ?? [])
    setEventos(eventosConFecha)
    setSesiones(s ?? [])
    setEvalItems(items)

    const preA = search.get('a')
    const preB = search.get('b')
    if (!jugadorA) {
      if (preA && (j ?? []).some((x: Jugador) => x.id === preA)) setJugadorA(preA)
      else if (j?.[0]) setJugadorA(j[0].id)
    }
    if (!jugadorB) {
      if (preB && (j ?? []).some((x: Jugador) => x.id === preB)) setJugadorB(preB)
      else if (j?.[1]) setJugadorB(j[1].id)
      else if (j?.[0] && j[0].id !== preA) setJugadorB(j[0].id)
    }
    setCargando(false)
  }, [jugadorA, jugadorB, perfil?.club_id, search])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) {
      router.replace('/login')
      return
    }
    if (!['admin', 'profesor', 'superadmin'].includes(perfil.rol ?? '')) {
      router.replace('/tecnico')
      return
    }
    void cargar()
  }, [authLoading, cargar, perfil, router])

  useEnVivo(['tecnico_eventos', 'tecnico_sesiones', 'tecnico_evaluaciones'], perfil?.club_id ?? null, () => { void cargar() }, { conClub: ['tecnico_eventos', 'tecnico_sesiones', 'tecnico_evaluaciones'] })

  const { desde, hasta, etiquetaPeriodo } = useMemo(() => rangoPeriodo(periodo), [periodo])

  const sesionesFiltradas = useMemo(() => {
    return sesiones.filter(s => {
      if (tipo !== 'todos' && s.tipo !== tipo) return false
      if (desde && s.fecha < desde) return false
      if (hasta && s.fecha > hasta) return false
      return true
    })
  }, [desde, hasta, sesiones, tipo])

  const idsSesion = useMemo(() => new Set(sesionesFiltradas.map(s => s.id)), [sesionesFiltradas])

  const eventosFiltrados = useMemo(() => {
    return eventos.filter(e => {
      if (e.sesion_id && !idsSesion.has(e.sesion_id)) return false
      if (!e.sesion_id) {
        if (desde && (e.fecha ?? '') < desde) return false
        if (hasta && (e.fecha ?? '') > hasta) return false
      }
      return true
    })
  }, [desde, eventos, hasta, idsSesion])

  const metricasA = useMemo(
    () => metricasDe(
      eventosFiltrados.filter(e => e.jugador_id === jugadorA),
      sesionesFiltradas.filter(s => s.jugador_id === jugadorA).length,
    ),
    [eventosFiltrados, jugadorA, sesionesFiltradas],
  )
  const metricasB = useMemo(
    () => metricasDe(
      eventosFiltrados.filter(e => e.jugador_id === jugadorB),
      sesionesFiltradas.filter(s => s.jugador_id === jugadorB).length,
    ),
    [eventosFiltrados, jugadorB, sesionesFiltradas],
  )

  const objetivosA = useMemo(() => resumenObjetivos(evalItems.filter(i => i.jugador_id === jugadorA)), [evalItems, jugadorA])
  const objetivosB = useMemo(() => resumenObjetivos(evalItems.filter(i => i.jugador_id === jugadorB)), [evalItems, jugadorB])

  const nombreA = jugadores.find(j => j.id === jugadorA)
  const nombreB = jugadores.find(j => j.id === jugadorB)

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando comparador...</div>
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Link href="/tecnico" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver al perfil técnico</Link>
        <div style={{ margin: '18px 0 20px' }}>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: 24 }}>Comparación cara a cara</h1>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 13 }}>
            Ratings, volumen, servicio, errores y objetivos publicados. Filtra por período y tipo de sesión.
          </p>
        </div>

        {error && <div style={{ ...card, color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca', marginBottom: 16 }}>{error}</div>}

        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Selector label="Jugador 1" value={jugadorA} onChange={setJugadorA} jugadores={jugadores} />
          <Selector label="Jugador 2" value={jugadorB} onChange={setJugadorB} jugadores={jugadores} />
          <label style={{ color: '#475569', fontSize: 12 }}>
            Período
            <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} style={input}>
              <option value="todo">Todo el historial</option>
              <option value="mes_actual">Mes actual</option>
              <option value="mes_anterior">Mes anterior</option>
              <option value="90d">Últimos 90 días</option>
            </select>
          </label>
          <label style={{ color: '#475569', fontSize: 12 }}>
            Tipo de sesión
            <select value={tipo} onChange={e => setTipo(e.target.value as TipoFiltro)} style={input}>
              <option value="todos">Todos</option>
              <option value="competencia">Solo partidos</option>
              <option value="entrenamiento">Solo entrenamiento</option>
              <option value="analisis_video">Solo video libre</option>
              <option value="evaluacion">Solo evaluación</option>
            </select>
          </label>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 16 }}>Filtro activo: {etiquetaPeriodo}</div>

        {nombreA && nombreB ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <CartaJugador jugador={nombreA} metricas={metricasA} objetivos={objetivosA} color="#4f46e5" />
              <CartaJugador jugador={nombreB} metricas={metricasB} objetivos={objetivosB} color="#e11d48" />
            </div>

            <div style={{ ...card, marginTop: 16 }}>
              <h2 style={{ margin: '0 0 16px', color: '#0f172a', fontSize: 16 }}>Comparación por rating</h2>
              {([
                ['Control', 'control'],
                ['Ataque', 'ataque'],
                ['Servicio', 'servicio'],
                ['Regularidad', 'regularidad'],
                ['Eficacia', 'eficacia'],
              ] as const).map(([label, key]) => (
                <MetricRow key={key} label={label} a={metricasA.ratings[key]} b={metricasB.ratings[key]} colorA="#4f46e5" colorB="#e11d48" />
              ))}
            </div>

            <div style={{ ...card, marginTop: 16 }}>
              <h2 style={{ margin: '0 0 16px', color: '#0f172a', fontSize: 16 }}>Indicadores directos</h2>
              {([
                ['Efectividad %', metricasA.efectividad, metricasB.efectividad],
                ['% Error', metricasA.errorRate, metricasB.errorRate],
                ['% En juego', metricasA.enJuegoPct, metricasB.enJuegoPct],
                ['% Puntos decisivos', metricasA.puntosDecisivosPct, metricasB.puntosDecisivosPct],
                ['Consistencia', metricasA.consistencia, metricasB.consistencia],
                ['Racha ERR máx', metricasA.rachaErroresMax, metricasB.rachaErroresMax],
                ['Servicio efectivo %', metricasA.servicioEfectividad, metricasB.servicioEfectividad],
                ['Eventos', metricasA.eventos, metricasB.eventos],
                ['Sesiones', metricasA.sesiones, metricasB.sesiones],
                ['Objetivos logrados %', objetivosA.pct, objetivosB.pct],
              ] as const).map(([label, a, b]) => (
                <MetricRow key={label} label={label} a={a} b={b} colorA="#4f46e5" colorB="#e11d48" />
              ))}
              <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 16 }}>
                Ratings heurísticos a partir de eventos etiquetados. Objetivos solo de evaluaciones publicadas. No mezclan automáticamente partido y entrenamiento salvo que elijas “Todos”.
              </div>
            </div>

            <div style={{ ...card, marginTop: 16 }}>
              <h2 style={{ margin: '0 0 16px', color: '#0f172a', fontSize: 16 }}>Efectividad por golpe</h2>
              {(['SER', 'DER', 'REV', 'BLQ'] as const).map(codigo => {
                const a = metricasA.efectividadPorGolpe.find(g => g.codigo === codigo)
                const b = metricasB.efectividadPorGolpe.find(g => g.codigo === codigo)
                return (
                  <MetricRow
                    key={codigo}
                    label={`${codigo} % (n=${a?.total ?? 0}/${b?.total ?? 0})`}
                    a={a?.efectividad ?? 0}
                    b={b?.efectividad ?? 0}
                    colorA="#4f46e5"
                    colorB="#e11d48"
                  />
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <BandasZona titulo={nombreA.nombre} metricas={metricasA} />
              <BandasZona titulo={nombreB.nombre} metricas={metricasB} />
            </div>
          </>
        ) : (
          <div style={card}>Selecciona dos jugadores con datos disponibles.</div>
        )}
      </div>
    </AppLayout>
  )
}

function rangoPeriodo(periodo: Periodo) {
  const hoy = fechaChile()
  if (periodo === 'todo') return { desde: null as string | null, hasta: null as string | null, etiquetaPeriodo: 'todo el historial' }
  if (periodo === 'mes_actual') {
    const mes = hoy.slice(0, 7)
    return { desde: `${mes}-01`, hasta: hoy, etiquetaPeriodo: `mes actual (${mes})` }
  }
  if (periodo === 'mes_anterior') {
    const prev = mesAnterior(hoy.slice(0, 7))
    const [y, m] = prev.split('-').map(Number)
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { desde: `${prev}-01`, hasta: `${prev}-${String(ultimo).padStart(2, '0')}`, etiquetaPeriodo: `mes anterior (${prev})` }
  }
  const d = new Date(`${hoy}T12:00:00`)
  d.setDate(d.getDate() - 90)
  const desde = d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  return { desde, hasta: hoy, etiquetaPeriodo: `últimos 90 días (${desde} → ${hoy})` }
}

function resumenObjetivos(items: EvalItem[]) {
  const total = items.length
  const logrados = items.filter(i => i.estado === 'logrado').length
  const noLogrados = items.filter(i => i.estado === 'no_logrado').length
  return {
    total,
    logrados,
    noLogrados,
    pct: total ? Math.round((logrados / total) * 100) : 0,
  }
}

function Selector({ label, value, onChange, jugadores }: { label: string; value: string; onChange: (value: string) => void; jugadores: Jugador[] }) {
  return (
    <label style={{ color: '#475569', fontSize: 12 }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)} style={input}>
        <option value="">Seleccionar...</option>
        {jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
      </select>
    </label>
  )
}

function CartaJugador({
  jugador,
  metricas,
  objetivos,
  color,
}: {
  jugador: Jugador
  metricas: MetricasTecnicas
  objetivos: { total: number; logrados: number; pct: number }
  color: string
}) {
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', borderTop: `5px solid ${color}` }}>
      <div style={{ background: `linear-gradient(135deg, ${color}, #0f172a)`, color: '#fff', padding: 20 }}>
        <div style={{ fontSize: 10, opacity: .8, textTransform: 'uppercase', letterSpacing: 1 }}>Perfil técnico</div>
        <div style={{ fontSize: 23, fontWeight: 900, marginTop: 4 }}>{jugador.nombre}</div>
        <div style={{ fontSize: 11, opacity: .8, marginTop: 3 }}>{jugador.categoria || 'Sin categoría'}</div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 15 }}>
          <Mini label="Rating" value={metricas.ratingPromedio} />
          <Mini label="Eventos" value={metricas.eventos} />
          <Mini label="Sesiones" value={metricas.sesiones} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, color: '#475569', fontSize: 11 }}>
          <Dato label="Efectividad" value={`${metricas.efectividad}%`} />
          <Dato label="Error" value={`${metricas.errorRate}%`} />
          <Dato label="En juego" value={`${metricas.enJuegoPct}%`} />
          <Dato label="Decisivos" value={`${metricas.puntosDecisivosPct}%`} />
          <Dato label="Consistencia" value={`${metricas.consistencia}%`} />
          <Dato label="Racha ERR" value={String(metricas.rachaErroresMax)} />
          <Dato label="Servicio usado" value={`${metricas.servicio} veces`} />
          <Dato label="Servicio efectivo" value={`${metricas.servicioEfectividad}%`} />
          <Dato label="Golpe principal" value={metricas.golpeMasUsado} />
          <Dato label="Zona principal" value={metricas.zonaMasUsada ? `Zona ${metricas.zonaMasUsada}` : '—'} />
          <Dato label="Muestra" value={metricas.calidadMuestra === 'alta' ? 'Alta' : metricas.calidadMuestra === 'media' ? 'Media' : 'Baja'} />
          <Dato label="Objetivos logrados" value={`${objetivos.logrados}/${objetivos.total}`} />
          <Dato label="% objetivos" value={`${objetivos.pct}%`} />
          <Dato
            label="Error tipificado"
            value={metricas.tiposError[0] ? `${TIPO_ERROR_LABEL[metricas.tiposError[0].tipo] || metricas.tiposError[0].tipo} (${metricas.tiposError[0].total})` : '—'}
          />
          <Dato
            label="Fase principal"
            value={metricas.porFase[0] ? `${FASE_LABEL[metricas.porFase[0].fase] || metricas.porFase[0].fase}` : '—'}
          />
        </div>
      </div>
    </div>
  )
}

function BandasZona({ titulo, metricas }: { titulo: string; metricas: MetricasTecnicas }) {
  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: 14 }}>{titulo} · bandas de mesa</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {[
          ['Corta (1–3)', metricas.zonasBandas.cortaPct, metricas.zonasBandas.corta],
          ['Media (4–6)', metricas.zonasBandas.mediaPct, metricas.zonasBandas.media],
          ['Profunda (7–9)', metricas.zonasBandas.profundaPct, metricas.zonasBandas.profunda],
        ].map(([label, pct, n]) => (
          <div key={String(label)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>{label}</span>
              <span style={{ color: '#0f172a', fontWeight: 700 }}>{pct}% · {n}</span>
            </div>
            <div style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#0284c7' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricRow({ label, a, b, colorA, colorB }: { label: string; a: number; b: number; colorA: string; colorB: string }) {
  const max = Math.max(a, b, 1)
  const ayuda = glosarioPorLabel(label.replace(/ %.*/, '').replace(/ \(n=.*/, ''))
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, marginBottom: 5, alignItems: 'center' }}>
        <strong style={{ color: a >= b ? colorA : '#94a3b8' }}>{a}</strong>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {label}
          {ayuda && (
            <AyudaHint titulo={ayuda.nombre} significado={ayuda.significado} comoSeCalcula={ayuda.comoSeCalcula} />
          )}
        </span>
        <strong style={{ color: b >= a ? colorB : '#94a3b8' }}>{b}</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <div style={{ height: 8, background: '#e2e8f0', borderRadius: '5px 0 0 5px', overflow: 'hidden', direction: 'rtl' }}><div style={{ height: '100%', width: `${(a / max) * 100}%`, background: colorA }} /></div>
        <div style={{ height: 8, background: '#e2e8f0', borderRadius: '0 5px 5px 0', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(b / max) * 100}%`, background: colorB }} /></div>
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  const ayuda = glosarioPorLabel(label)
  return (
    <div style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: 9 }}>
      <div style={{ color: '#64748b', fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {label}
        {ayuda && <AyudaHint titulo={ayuda.nombre} significado={ayuda.significado} comoSeCalcula={ayuda.comoSeCalcula} />}
      </div>
      <div style={{ color: '#0f172a', fontSize: 19, fontWeight: 900, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Dato({ label, value }: { label: string; value: string }) {
  const ayuda = glosarioPorLabel(label)
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 10, display: 'inline-flex', alignItems: 'center' }}>
        {label}
        {ayuda && <AyudaHint titulo={ayuda.nombre} significado={ayuda.significado} comoSeCalcula={ayuda.comoSeCalcula} />}
      </div>
      <div style={{ color: '#0f172a', fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  )
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.08)' } as const
const input = { display: 'block', width: '100%', boxSizing: 'border-box' as const, marginTop: 6, padding: '10px 11px', border: '1px solid #cbd5e1', borderRadius: 8, color: '#0f172a', background: '#fff', fontSize: 13 } as const
