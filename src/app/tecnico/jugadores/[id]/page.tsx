'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import AsesorTecnicoIA from '@/components/tecnico/AsesorTecnicoIA'
import AyudaHint from '@/components/tecnico/AyudaHint'
import { GLOSARIO_INDICADORES, glosarioPorLabel } from '@/lib/tecnico/manual-contenido'
import {
  etiquetaMes,
  FASE_LABEL,
  mesAnterior,
  mesDeFecha,
  metricasDe,
  serieMensual,
  textoDelta,
  TIPO_ERROR_LABEL,
  type EventoTecnico,
} from '@/lib/tecnico/metricas'
import { marcadorResumen } from '@/lib/tecnico/marcador'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend)

const supabase = createClient()

type Sesion = {
  id: string
  titulo: string
  tipo: string
  estado: string
  fecha: string
  rival_nombre: string | null
  competencia_nombre: string | null
  marcador: string | null
}

type Evaluacion = {
  id: string
  sesion_id: string
  estado: string
  resumen: string | null
  publicada_en: string | null
  creado_en: string
  items: { codigo: string; nombre: string; estado: string; valor: number | null; comentario: string | null }[]
}

type TipoFiltro = 'todos' | 'competencia' | 'entrenamiento' | 'analisis_video' | 'evaluacion'

type PartidoMarcador = {
  id: string
  titulo: string
  nombre_a: string
  nombre_b: string
  games_a: number
  games_b: number
  estado: string
  ganador_lado: 'a' | 'b' | null
  historial_sets: Array<[number, number]>
  creado_en: string
  jugador_a_id: string | null
  jugador_b_id: string | null
}

const TIPO_LABEL: Record<string, string> = {
  analisis_video: 'Video libre',
  entrenamiento: 'Entrenamiento',
  competencia: 'Partido',
  evaluacion: 'Evaluación',
}

export default function HistorialJugadorTecnicoPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const params = useParams()
  const jugadorId = params.id as string
  const [jugador, setJugador] = useState<{ id: string; nombre: string; categoria: string | null } | null>(null)
  const [clubNombre, setClubNombre] = useState('CmSports')
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [eventos, setEventos] = useState<EventoTecnico[]>([])
  const [partidosMarcador, setPartidosMarcador] = useState<PartidoMarcador[]>([])
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos')
  const [mostrarGlosario, setMostrarGlosario] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  const cargar = useCallback(async () => {
    if (!perfil?.club_id || !jugadorId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const esJugador = perfil.rol === 'jugador'
    let sesionesQuery = db.from('tecnico_sesiones')
      .select('id,titulo,tipo,estado,fecha,rival_nombre,competencia_nombre,marcador')
      .eq('club_id', perfil.club_id)
      .eq('jugador_id', jugadorId)
      .neq('estado', 'archivada')
      .order('fecha', { ascending: false })
    if (esJugador) sesionesQuery = sesionesQuery.eq('estado', 'publicada')

    let evalQuery = db.from('tecnico_evaluaciones')
      .select('id,sesion_id,estado,resumen,publicada_en,creado_en')
      .eq('club_id', perfil.club_id)
      .eq('jugador_id', jugadorId)
      .order('creado_en', { ascending: false })
    if (esJugador) evalQuery = evalQuery.eq('estado', 'publicada')

    const [{ data: j, error: jError }, { data: s }, { data: e }, { data: ev }, { data: club }, { data: partidos }] = await Promise.all([
      db.from('jugadores').select('id,nombre,categoria').eq('id', jugadorId).eq('club_id', perfil.club_id).single(),
      sesionesQuery,
      evalQuery,
      db.from('tecnico_eventos')
        .select('golpe_codigo,zona_mesa,resultado,sesion_id,fase,metadatos')
        .eq('club_id', perfil.club_id)
        .eq('jugador_id', jugadorId),
      db.from('clubes').select('nombre').eq('id', perfil.club_id).maybeSingle(),
      db.from('tecnico_partidos')
        .select('id,titulo,nombre_a,nombre_b,games_a,games_b,estado,ganador_lado,historial_sets,creado_en,jugador_a_id,jugador_b_id')
        .eq('club_id', perfil.club_id)
        .or(`jugador_a_id.eq.${jugadorId},jugador_b_id.eq.${jugadorId}`)
        .order('creado_en', { ascending: false })
        .limit(15),
    ])

    if (jError || !j) {
      setError('No se encontró el jugador.')
      setCargando(false)
      return
    }
    setClubNombre(club?.nombre ?? 'CmSports')

    const fechaPorSesion = new Map<string, string>((s ?? []).map((sesion: Sesion) => [sesion.id, sesion.fecha]))
    const eventosConFecha: EventoTecnico[] = (ev ?? []).map((evento: {
      golpe_codigo: string
      zona_mesa: number | null
      resultado: string
      sesion_id: string
      fase: string | null
      metadatos: { tipo_error?: string } | null
    }) => ({
      golpe_codigo: evento.golpe_codigo,
      zona_mesa: evento.zona_mesa,
      resultado: evento.resultado,
      sesion_id: evento.sesion_id,
      fecha: fechaPorSesion.get(evento.sesion_id) ?? null,
      fase: evento.fase,
      tipo_error: evento.metadatos?.tipo_error ?? null,
    }))

    const evalIds = (e ?? []).map((item: { id: string }) => item.id)
    let items: { evaluacion_id: string; codigo: string; nombre: string; estado: string; valor: number | null; comentario: string | null }[] = []
    if (evalIds.length) {
      const { data: itemsData } = await db.from('tecnico_evaluacion_items')
        .select('evaluacion_id,codigo,nombre,estado,valor,comentario')
        .in('evaluacion_id', evalIds)
      items = itemsData ?? []
    }

    setJugador(j)
    setSesiones(s ?? [])
    setPartidosMarcador((partidos ?? []).map((p: PartidoMarcador) => ({
      ...p,
      historial_sets: Array.isArray(p.historial_sets) ? p.historial_sets : [],
    })))
    setEventos(eventosConFecha)
    setEvaluaciones((e ?? []).map((eva: Omit<Evaluacion, 'items'>) => ({
      ...eva,
      items: items.filter(item => item.evaluacion_id === eva.id).map(({ codigo, nombre, estado, valor, comentario }) => ({
        codigo, nombre, estado, valor, comentario,
      })),
    })))
    setCargando(false)
  }, [jugadorId, perfil?.club_id, perfil?.rol])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) {
      router.replace('/login')
      return
    }
    if (perfil.rol === 'jugador' && perfil.jugador_id !== jugadorId) {
      router.replace('/tecnico')
      return
    }
    void cargar()
  }, [authLoading, cargar, jugadorId, perfil, router])

  useEnVivo(
    ['tecnico_sesiones', 'tecnico_evaluaciones', 'tecnico_eventos', 'tecnico_partidos'],
    perfil?.club_id ?? null,
    () => { void cargar() },
    { conClub: ['tecnico_sesiones', 'tecnico_evaluaciones', 'tecnico_eventos', 'tecnico_partidos'] },
  )

  const sesionesFiltradas = useMemo(
    () => (tipoFiltro === 'todos' ? sesiones : sesiones.filter(s => s.tipo === tipoFiltro)),
    [sesiones, tipoFiltro],
  )
  const idsSesionFiltro = useMemo(() => new Set(sesionesFiltradas.map(s => s.id)), [sesionesFiltradas])
  const eventosFiltrados = useMemo(
    () => (tipoFiltro === 'todos' ? eventos : eventos.filter(e => e.sesion_id && idsSesionFiltro.has(e.sesion_id))),
    [eventos, idsSesionFiltro, tipoFiltro],
  )

  const resumen = useMemo(() => metricasDe(eventosFiltrados, sesionesFiltradas.length), [eventosFiltrados, sesionesFiltradas.length])

  const mesActual = fechaChile().slice(0, 7)
  const mesPrev = mesAnterior(mesActual)
  const comparacion = useMemo(() => {
    const evA = eventosFiltrados.filter(e => mesDeFecha(e.fecha) === mesActual)
    const evB = eventosFiltrados.filter(e => mesDeFecha(e.fecha) === mesPrev)
    const sesA = sesionesFiltradas.filter(s => mesDeFecha(s.fecha) === mesActual)
    const sesB = sesionesFiltradas.filter(s => mesDeFecha(s.fecha) === mesPrev)
    return {
      actual: metricasDe(evA, sesA.length),
      anterior: metricasDe(evB, sesB.length),
    }
  }, [eventosFiltrados, mesActual, mesPrev, sesionesFiltradas])

  const serie = useMemo(() => serieMensual(eventosFiltrados, sesionesFiltradas, 6), [eventosFiltrados, sesionesFiltradas])

  const chartEvolucion = useMemo(() => ({
    labels: serie.map(p => p.etiqueta),
    datasets: [
      {
        label: 'Efectividad %',
        data: serie.map(p => p.efectividad),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79,70,229,0.12)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y',
      },
      {
        label: 'Eventos',
        data: serie.map(p => p.eventos),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.08)',
        fill: false,
        tension: 0.3,
        yAxisID: 'y1',
      },
    ],
  }), [serie])

  const chartGolpes = useMemo(() => {
    const codes = ['SER', 'DER', 'REV', 'BLQ', 'ERR']
    return {
      labels: codes,
      datasets: [{
        label: 'Cantidad',
        data: codes.map(code => eventosFiltrados.filter(e => e.golpe_codigo === code).length),
        backgroundColor: ['#0ea5e9', '#4f46e5', '#16a34a', '#f59e0b', '#dc2626'],
        borderRadius: 6,
      }],
    }
  }, [eventosFiltrados])

  const chartEfectividadGolpe = useMemo(() => ({
    labels: resumen.efectividadPorGolpe.map(g => g.codigo),
    datasets: [{
      label: 'Efectividad %',
      data: resumen.efectividadPorGolpe.map(g => g.efectividad),
      backgroundColor: ['#0ea5e9', '#4f46e5', '#16a34a', '#f59e0b'],
      borderRadius: 6,
    }],
  }), [resumen.efectividadPorGolpe])

  const objetivosAgg = useMemo(() => {
    const map = new Map<string, { codigo: string; nombre: string; logrado: number; total: number; sumaValor: number; conValor: number }>()
    for (const eva of evaluaciones) {
      for (const item of eva.items) {
        const actual = map.get(item.codigo) ?? { codigo: item.codigo, nombre: item.nombre, logrado: 0, total: 0, sumaValor: 0, conValor: 0 }
        actual.total++
        if (item.estado === 'logrado') actual.logrado++
        if (item.valor != null) {
          actual.sumaValor += Number(item.valor)
          actual.conValor++
        }
        map.set(item.codigo, actual)
      }
    }
    return [...map.values()].map(o => ({
      ...o,
      promedioValor: o.conValor ? Math.round(o.sumaValor / o.conValor) : null,
    })).sort((a, b) => b.total - a.total)
  }, [evaluaciones])

  const notaObjetivos = useMemo(() => {
    const valores = evaluaciones.flatMap(e => e.items.map(i => i.valor).filter((v): v is number => v != null))
    if (!valores.length) return null
    return Math.round(valores.reduce((a, b) => a + Number(b), 0) / valores.length)
  }, [evaluaciones])

  async function exportarPdf() {
    if (!jugador) return
    const { exportarProgresoTecnicoPdf } = await import('@/lib/tecnico-progreso-pdf')
    const objetivos = evaluaciones.flatMap(e => e.items)
    await exportarProgresoTecnicoPdf({
      clubNombre,
      jugadorNombre: jugador.nombre,
      categoria: jugador.categoria,
      stats: {
        sesiones: resumen.sesiones,
        eventos: resumen.eventos,
        efectividad: resumen.efectividad,
        evaluaciones: evaluaciones.filter(e => e.estado === 'publicada').length,
        objetivosLogrados: objetivos.filter(i => i.estado === 'logrado').length,
        objetivosTotal: objetivos.length,
      },
      sesiones: sesiones.map(s => ({
        fecha: s.fecha,
        titulo: s.titulo,
        tipo: s.tipo,
        estado: s.estado,
        rival_nombre: s.rival_nombre,
        marcador: s.marcador,
      })),
      evaluaciones: evaluaciones.map(eva => ({
        fecha: eva.publicada_en?.slice(0, 10) || eva.creado_en.slice(0, 10),
        estado: eva.estado,
        resumen: eva.resumen,
        items: eva.items.map(item => ({ codigo: item.codigo, nombre: item.nombre, estado: item.estado })),
      })),
    })
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando historial...</div>
  }

  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'profesor' || perfil?.rol === 'superadmin'
  const dEfe = comparacion.actual.efectividad - comparacion.anterior.efectividad
  const dErr = comparacion.actual.errorRate - comparacion.anterior.errorRate
  const dEv = comparacion.actual.eventos - comparacion.anterior.eventos

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/tecnico" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver al perfil técnico</Link>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {esStaff && (
              <Link href={`/tecnico/comparar?a=${jugadorId}`} style={{ border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', background: '#fffbeb', color: '#92400e', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                Cara a cara
              </Link>
            )}
            <button onClick={() => void exportarPdf()} style={secondaryBtn}>Exportar PDF</button>
          </div>
        </div>

        <div style={{ ...card, marginTop: 18, background: 'linear-gradient(135deg, #0f172a, #312e81)', color: '#fff', border: 0 }}>
          <div style={{ fontSize: 10, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 1 }}>Historial técnico</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 26 }}>{jugador?.nombre}</h1>
          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.85 }}>{jugador?.categoria || 'Sin categoría'}</div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: 10, fontSize: 12, marginTop: 14 }}>
            {error}
          </div>
        )}

        <div style={{ ...card, marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ color: '#475569', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            Tipo de sesión
            <select
              value={tipoFiltro}
              onChange={e => setTipoFiltro(e.target.value as TipoFiltro)}
              style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: '#fff' }}
            >
              <option value="todos">Todos</option>
              <option value="competencia">Solo partidos</option>
              <option value="entrenamiento">Solo entrenamiento</option>
              <option value="analisis_video">Solo video libre</option>
              <option value="evaluacion">Solo evaluación</option>
            </select>
          </label>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>
            Las métricas de arriba usan este filtro (entrenamientos y partidos no se mezclan si eliges uno).
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, margin: '16px 0' }}>
          {[
            ['Sesiones', resumen.sesiones],
            ['Eventos', resumen.eventos],
            ['Efectividad', `${resumen.efectividad}%`],
            ['% Error', `${resumen.errorRate}%`],
            ['En juego', `${resumen.enJuegoPct}%`],
            ['Puntos decisivos', `${resumen.puntosDecisivosPct}%`],
            ['Consistencia', `${resumen.consistencia}%`],
            ['Racha ERR', resumen.rachaErroresMax],
            ['Servicio', `${resumen.servicioEfectividad}%`],
            ['Rating', resumen.ratingPromedio],
            ['Muestra', resumen.calidadMuestra === 'alta' ? 'Alta' : resumen.calidadMuestra === 'media' ? 'Media' : 'Baja'],
            ['Nota objetivos', notaObjetivos != null ? String(notaObjetivos) : '—'],
          ].map(([label, value]) => {
            const ayuda = glosarioPorLabel(String(label))
            return (
              <div key={label} style={card}>
                <div style={{ color: '#64748b', fontSize: 10, display: 'flex', alignItems: 'center' }}>
                  {label}
                  {ayuda && (
                    <AyudaHint
                      titulo={ayuda.nombre}
                      significado={ayuda.significado}
                      comoSeCalcula={ayuda.comoSeCalcula}
                    />
                  )}
                </div>
                <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
              </div>
            )
          })}
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 700 }}>¿Qué significa cada parámetro?</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                Explicación corta de los indicadores de este historial.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setMostrarGlosario(v => !v)}
                style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {mostrarGlosario ? 'Ocultar' : 'Ver aquí'}
              </button>
              <Link
                href="/tecnico/manual#indicadores"
                style={{ border: 0, borderRadius: 8, padding: '8px 12px', background: '#312e81', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
              >
                Manual completo
              </Link>
            </div>
          </div>
          {mostrarGlosario && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {GLOSARIO_INDICADORES.map(item => (
                <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700 }}>{item.nombre}</div>
                  <div style={{ color: '#334155', fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>{item.significado}</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
                    <strong>Cómo se calcula:</strong> {item.comoSeCalcula}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
                    <strong>Cómo se llena:</strong> {item.comoSeLlena}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, .8fr)', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center' }}>
              Evolución en el tiempo
              <AyudaHint
                titulo="Evolución en el tiempo"
                significado="Serie mensual de efectividad y volumen de eventos en los últimos 6 meses."
                comoSeCalcula="Por cada mes: efectividad = ganados÷(ganados+perdidos); eventos = marcas de ese mes."
              />
            </h2>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 12 }}>Últimos 6 meses (efectividad y volumen de eventos).</p>
            {serie.every(p => p.eventos === 0) ? (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Todavía no hay suficientes datos mensuales.</div>
            ) : (
              <div style={{ height: 240 }}>
                <Line
                  data={chartEvolucion}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                    scales: {
                      y: { type: 'linear', position: 'left', min: 0, max: 100, ticks: { font: { size: 10 } }, title: { display: true, text: '%', font: { size: 10 } } },
                      y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Eventos', font: { size: 10 } } },
                      x: { ticks: { font: { size: 10 } } },
                    },
                  }}
                />
              </div>
            )}
          </div>

          <div style={card}>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center' }}>
              Mes actual vs anterior
              <AyudaHint
                titulo="Mes actual vs anterior"
                significado="Compara indicadores del mes en curso (Chile) con el mes previo."
                comoSeCalcula="Misma fórmula de cada indicador, filtrando eventos/sesiones por mes."
              />
            </h2>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 12 }}>
              {etiquetaMes(mesActual)} comparado con {etiquetaMes(mesPrev)}
            </p>
            {[
              ['Efectividad', `${comparacion.actual.efectividad}%`, textoDelta(dEfe, ' pts'), dEfe],
              ['% Error', `${comparacion.actual.errorRate}%`, textoDelta(dErr, ' pts'), -dErr],
              ['Eventos', String(comparacion.actual.eventos), textoDelta(dEv), dEv],
              ['Sesiones', String(comparacion.actual.sesiones), textoDelta(comparacion.actual.sesiones - comparacion.anterior.sesiones), comparacion.actual.sesiones - comparacion.anterior.sesiones],
              ['Servicio', `${comparacion.actual.servicioEfectividad}%`, textoDelta(comparacion.actual.servicioEfectividad - comparacion.anterior.servicioEfectividad, ' pts'), comparacion.actual.servicioEfectividad - comparacion.anterior.servicioEfectividad],
            ].map(([label, valor, delta, sentido]) => (
              <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 0', borderTop: '1px solid #f1f5f9', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>{label}</span>
                <span>
                  <strong style={{ color: '#0f172a' }}>{valor}</strong>
                  <span style={{ marginLeft: 8, color: Number(sentido) > 0 ? '#16a34a' : Number(sentido) < 0 ? '#dc2626' : '#94a3b8', fontWeight: 700 }}>
                    {delta}
                  </span>
                </span>
              </div>
            ))}
            <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 10 }}>
              En % error, bajar es mejorar (el color del delta ya lo interpreta así).
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center' }}>
              Distribución de golpes
              <AyudaHint
                titulo="Distribución de golpes"
                significado="Cuántas veces se marcó cada tipo de golpe (SER, DER, REV, BLQ, ERR)."
                comoSeCalcula="Conteo simple por código de golpe en el filtro activo."
              />
            </h2>
            <div style={{ height: 220 }}>
              <Bar
                data={chartGolpes}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, ticks: { font: { size: 10 }, precision: 0 } },
                    x: { ticks: { font: { size: 10 } } },
                  },
                }}
              />
            </div>
          </div>
          <div style={card}>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center' }}>
              Efectividad por golpe
              <AyudaHint
                titulo="Efectividad por golpe"
                significado="Qué tan efectivo es cada golpe cuando el punto se cierra."
                comoSeCalcula="Por golpe: ganados ÷ (ganados + perdidos) × 100. Solo eventos con resultado ganado/perdido."
              />
            </h2>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 12 }}>Solo cuenta eventos con resultado ganado/perdido.</p>
            <div style={{ height: 200 }}>
              <Bar
                data={chartEfectividadGolpe}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, max: 100, ticks: { font: { size: 10 } } },
                    x: { ticks: { font: { size: 10 } } },
                  },
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center' }}>
              Mapa de zonas
              <AyudaHint
                titulo="Mapa de zonas"
                significado="A qué casillas de la mesa (1–9) va más la pelota según lo marcado."
                comoSeCalcula="Conteo por zona. Bandas: corta 1–3, media 4–6, profunda 7–9 en porcentaje del total con zona."
              />
            </h2>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 12 }}>
              Corta (1–3) {resumen.zonasBandas.cortaPct}% · Media (4–6) {resumen.zonasBandas.mediaPct}% · Profunda (7–9) {resumen.zonasBandas.profundaPct}%
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxWidth: 240 }}>
              {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(z => {
                const item = resumen.zonas.find(x => x.zona === z)
                const total = item?.total ?? 0
                const max = Math.max(1, ...resumen.zonas.map(x => x.total))
                const intens = total / max
                return (
                  <div key={z} style={{
                    textAlign: 'center',
                    borderRadius: 8,
                    padding: '12px 6px',
                    background: total ? `rgba(3, 105, 161, ${0.25 + intens * 0.75})` : '#f1f5f9',
                    color: total ? '#0f172a' : '#94a3b8',
                    fontWeight: 800,
                    fontSize: 12,
                  }}>
                    Z{z}<div style={{ fontSize: 11, fontWeight: 600 }}>{total}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center' }}>
              Objetivos en el tiempo
              <AyudaHint
                titulo="Objetivos en el tiempo"
                significado="Avance de cada objetivo técnico en evaluaciones (% logrado) y nota promedio si hubo nota 0–100."
                comoSeCalcula="% = ítems en estado logrado ÷ ítems de ese código. Nota = promedio de valores numéricos."
              />
            </h2>
            {objetivosAgg.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Aún no hay ítems de evaluación.</div>
            ) : objetivosAgg.map(obj => {
              const pct = obj.total ? Math.round((obj.logrado / obj.total) * 100) : 0
              return (
                <div key={obj.codigo} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, gap: 8 }}>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{obj.codigo} · {obj.nombre}</span>
                    <span style={{ color: '#64748b' }}>
                      {obj.logrado}/{obj.total} · {pct}%
                      {obj.promedioValor != null ? ` · nota ${obj.promedioValor}` : ''}
                    </span>
                  </div>
                  <div style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 70 ? '#16a34a' : '#4f46e5' }} />
                  </div>
                </div>
              )
            })}
            {(resumen.tiposError.length > 0 || resumen.porFase.length > 0) && (
              <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                {resumen.tiposError.length > 0 && (
                  <>
                    <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Tipos de error</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                      {resumen.tiposError.map(item => (
                        <span key={item.tipo} style={{ background: '#7f1d1d', color: '#fff', borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 700 }}>
                          {TIPO_ERROR_LABEL[item.tipo] || item.tipo}: {item.total}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {resumen.porFase.length > 0 && (
                  <>
                    <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Por fase</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {resumen.porFase.map(item => (
                        <span key={item.fase} style={{ background: '#312e81', color: '#fff', borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 700 }}>
                          {FASE_LABEL[item.fase] || item.fase}: {item.total}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {jugador && (
          <div style={{ marginBottom: 14 }}>
            <AsesorTecnicoIA jugadorId={jugador.id} jugadorNombre={jugador.nombre} esStaff={!!esStaff} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, .9fr)', gap: 14, alignItems: 'start' }}>
          <div style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, color: '#0f172a' }}>Sesiones</h2>
            {sesionesFiltradas.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Todavía no hay sesiones para este filtro.</div>
            ) : sesionesFiltradas.map(sesion => (
              <Link
                key={sesion.id}
                href={`/tecnico/sesiones/${sesion.id}`}
                style={{ display: 'block', textDecoration: 'none', borderTop: '1px solid #f1f5f9', padding: '12px 0' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: '#0f172a', fontSize: 13 }}>{sesion.titulo}</strong>
                  <span style={{ color: '#64748b', fontSize: 11 }}>{sesion.fecha}</span>
                </div>
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                  {TIPO_LABEL[sesion.tipo] || sesion.tipo} · {sesion.estado}
                  {sesion.rival_nombre ? ` · vs ${sesion.rival_nombre}` : ''}
                  {sesion.marcador ? ` · ${sesion.marcador}` : ''}
                </div>
              </Link>
            ))}
          </div>

          <div style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, color: '#0f172a' }}>Evaluaciones</h2>
            {evaluaciones.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Todavía no hay evaluaciones registradas.</div>
            ) : evaluaciones.map(eva => (
              <div key={eva.id} style={{ borderTop: '1px solid #f1f5f9', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{
                    background: eva.estado === 'publicada' ? '#dcfce7' : '#eef2ff',
                    color: eva.estado === 'publicada' ? '#166534' : '#4338ca',
                    borderRadius: 999,
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    {eva.estado.toUpperCase()}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: 10 }}>{eva.publicada_en?.slice(0, 10) || eva.creado_en.slice(0, 10)}</span>
                </div>
                {eva.resumen && <div style={{ color: '#475569', fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>{eva.resumen}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {eva.items.map(item => (
                    <span key={`${eva.id}-${item.codigo}`} style={{
                      background: item.estado === 'logrado' ? '#dcfce7' : item.estado === 'no_logrado' ? '#fee2e2' : '#f1f5f9',
                      color: item.estado === 'logrado' ? '#166534' : item.estado === 'no_logrado' ? '#991b1b' : '#475569',
                      borderRadius: 999,
                      padding: '3px 7px',
                      fontSize: 10,
                    }}>
                      {item.codigo}: {item.estado.replaceAll('_', ' ')}{item.valor != null ? ` · ${item.valor}` : ''}
                    </span>
                  ))}
                </div>
                <Link href={`/tecnico/sesiones/${eva.sesion_id}`} style={{ display: 'inline-block', marginTop: 8, color: '#4f46e5', fontSize: 11, textDecoration: 'none' }}>
                  Abrir sesión →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
} as const

const secondaryBtn = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '8px 12px',
  background: '#fff',
  color: '#475569',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
} as const
