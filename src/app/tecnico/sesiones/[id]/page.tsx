'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { faseAuto, FASE_LABEL, metricasDe, TIPO_ERROR_LABEL } from '@/lib/tecnico/metricas'
import AyudaHint from '@/components/tecnico/AyudaHint'
import { glosarioPorLabel } from '@/lib/tecnico/manual-contenido'

const supabase = createClient()
const GOLPES = [
  { codigo: 'SER', nombre: 'Servicio' },
  { codigo: 'DER', nombre: 'Derecho' },
  { codigo: 'REV', nombre: 'Revés' },
  { codigo: 'BLQ', nombre: 'Bloqueo' },
  { codigo: 'ERR', nombre: 'Error' },
]

const FASES = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'peloteo', label: 'Peloteo' },
  { value: 'punto_decisivo', label: 'Punto decisivo' },
] as const

const TIPOS_ERROR = [
  { value: 'red', label: 'Red' },
  { value: 'largo', label: 'Largo' },
  { value: 'fuera', label: 'Fuera' },
  { value: 'otro', label: 'Otro' },
] as const

const ESTADOS_OBJETIVO = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'logrado', label: 'Logrado' },
  { value: 'no_logrado', label: 'No logrado' },
] as const

type Evento = {
  id: string
  timestamp_ms: number
  golpe_codigo: string
  zona_mesa: number | null
  resultado: string
  fase: string | null
  notas: string | null
  metadatos: { tipo_error?: string } | null
}

type Objetivo = {
  id: string
  codigo: string
  nombre: string
  dimension: string
  criterio: string | null
}

type ItemEval = {
  objetivo_id: string
  codigo: string
  nombre: string
  estado: string
  valor: string
  comentario: string
}

type SesionInfo = {
  titulo: string
  fecha: string
  estado: string
  tipo: string
  jugadorId: string
  jugadorNombre: string
  rival: string | null
  competencia: string | null
  marcador: string | null
}

export default function SesionTecnicaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const params = useParams()
  const sesionId = params.id as string
  const videoRef = useRef<HTMLVideoElement>(null)
  const [sesion, setSesion] = useState<SesionInfo | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [estadoProcesamiento, setEstadoProcesamiento] = useState<string | null>(null)
  const [tieneAnalisis, setTieneAnalisis] = useState(false)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [evaluacionId, setEvaluacionId] = useState<string | null>(null)
  const [resumen, setResumen] = useState('')
  const [items, setItems] = useState<ItemEval[]>([])
  const [golpe, setGolpe] = useState('DER')
  const [zona, setZona] = useState<number | null>(null)
  const [resultado, setResultado] = useState('en_juego')
  const [fase, setFase] = useState('peloteo')
  const [tipoError, setTipoError] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editGolpe, setEditGolpe] = useState('DER')
  const [editZona, setEditZona] = useState<number | null>(null)
  const [editResultado, setEditResultado] = useState('en_juego')
  const [editFase, setEditFase] = useState('peloteo')
  const [editTipoError, setEditTipoError] = useState('')
  const [editNotas, setEditNotas] = useState('')
  const [editTimestamp, setEditTimestamp] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardandoEval, setGuardandoEval] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [okEval, setOkEval] = useState('')
  const [clubNombre, setClubNombre] = useState('CmSports')
  const [procesandoVideo, setProcesandoVideo] = useState(false)
  const router = useRouter()

  const estadisticas = useMemo(
    () => metricasDe(
      eventos.map(e => ({
        golpe_codigo: e.golpe_codigo,
        zona_mesa: e.zona_mesa,
        resultado: e.resultado,
        fase: e.fase,
        tipo_error: e.metadatos?.tipo_error ?? null,
      })),
      1,
    ),
    [eventos],
  )

  const cargar = useCallback(async () => {
    if (!perfil?.club_id || !sesionId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: s, error: sError }, { data: v }, { data: ev, error: evError }, { data: objs }, { data: eva }, { data: club }] = await Promise.all([
      db.from('tecnico_sesiones')
        .select('id,titulo,fecha,estado,tipo,jugador_id,rival_nombre,competencia_nombre,marcador')
        .eq('id', sesionId)
        .eq('club_id', perfil.club_id)
        .single(),
      db.from('tecnico_videos')
        .select('id,archivo_path,analisis_path,estado_procesamiento')
        .eq('sesion_id', sesionId)
        .eq('club_id', perfil.club_id)
        .eq('estado', 'activo')
        .maybeSingle(),
      db.from('tecnico_eventos')
        .select('id,timestamp_ms,golpe_codigo,zona_mesa,resultado,fase,notas,metadatos')
        .eq('sesion_id', sesionId)
        .eq('club_id', perfil.club_id)
        .order('timestamp_ms'),
      db.from('tecnico_objetivos')
        .select('id,codigo,nombre,dimension,criterio')
        .eq('club_id', perfil.club_id)
        .eq('activo', true)
        .order('dimension')
        .order('nombre'),
      db.from('tecnico_evaluaciones')
        .select('id,resumen,estado')
        .eq('sesion_id', sesionId)
        .eq('club_id', perfil.club_id)
        .maybeSingle(),
      db.from('clubes').select('nombre').eq('id', perfil.club_id).maybeSingle(),
    ])

    if (sError || evError || !s) {
      setError('No se pudo cargar la sesión técnica.')
      setCargando(false)
      return
    }

    const { data: jugador } = await db.from('jugadores').select('nombre').eq('id', s.jugador_id).single()
    setClubNombre(club?.nombre ?? 'CmSports')
    setSesion({
      titulo: s.titulo,
      fecha: s.fecha,
      estado: s.estado,
      tipo: s.tipo,
      jugadorId: s.jugador_id,
      jugadorNombre: jugador?.nombre ?? 'Jugador',
      rival: s.rival_nombre,
      competencia: s.competencia_nombre,
      marcador: s.marcador,
    })
    setEventos(ev ?? [])
    setObjetivos(objs ?? [])

    if (eva) {
      setEvaluacionId(eva.id)
      setResumen(eva.resumen ?? '')
      const { data: itemsData } = await db.from('tecnico_evaluacion_items')
        .select('objetivo_id,codigo,nombre,estado,valor,comentario')
        .eq('evaluacion_id', eva.id)
      const porObjetivo = new Map<string, { estado: string; valor: number | null; comentario: string | null }>(
        (itemsData ?? []).map((item: { objetivo_id: string; estado: string; valor: number | null; comentario: string | null }) => [
          item.objetivo_id,
          { estado: item.estado, valor: item.valor, comentario: item.comentario },
        ]),
      )
      setItems((objs ?? []).map((obj: Objetivo) => {
        const previo = porObjetivo.get(obj.id)
        return {
          objetivo_id: obj.id,
          codigo: obj.codigo,
          nombre: obj.nombre,
          estado: previo?.estado ?? 'pendiente',
          valor: previo?.valor != null ? String(previo.valor) : '',
          comentario: previo?.comentario ?? '',
        }
      }))
    } else {
      setEvaluacionId(null)
      setResumen('')
      setItems((objs ?? []).map((obj: Objetivo) => ({
        objetivo_id: obj.id,
        codigo: obj.codigo,
        nombre: obj.nombre,
        estado: 'pendiente',
        valor: '',
        comentario: '',
      })))
    }

    setVideoId(v?.id ?? null)
    setEstadoProcesamiento(v?.estado_procesamiento ?? null)
    setTieneAnalisis(Boolean(v?.analisis_path))
    const rutaReproduccion = v?.analisis_path || v?.archivo_path
    if (rutaReproduccion) {
      const { data: signed } = await supabase.storage.from('tecnico-videos').createSignedUrl(rutaReproduccion, 3600)
      setVideoUrl(signed?.signedUrl ?? null)
    } else {
      setVideoUrl(null)
    }
    setCargando(false)
  }, [perfil?.club_id, sesionId])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) {
      router.replace('/login')
      return
    }
    void cargar()
  }, [authLoading, cargar, perfil, router])

  const cargarEventos = useCallback(async () => {
    if (!perfil?.club_id || !sesionId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db.from('tecnico_eventos')
      .select('id,timestamp_ms,golpe_codigo,zona_mesa,resultado,fase,notas,metadatos')
      .eq('sesion_id', sesionId)
      .eq('club_id', perfil.club_id)
      .order('timestamp_ms')
    setEventos(data ?? [])
  }, [perfil?.club_id, sesionId])

  useEnVivo(['tecnico_eventos'], perfil?.club_id ?? null, () => { void cargarEventos() }, { conClub: ['tecnico_eventos'] })
  useEnVivo(['tecnico_videos'], perfil?.club_id ?? null, () => { void cargar() }, { conClub: ['tecnico_videos'] })

  async function guardarEvento(zonaElegida: number) {
    if (!perfil?.club_id || !videoRef.current || !sesion) return
    const timestampMs = Math.round(videoRef.current.currentTime * 1000)
    const faseFinal = fase || faseAuto(golpe, resultado)
    const metadatos = golpe === 'ERR' && tipoError ? { tipo_error: tipoError } : {}
    setGuardando(true)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: nuevoEvento, error: insertError } = await db.from('tecnico_eventos').insert({
      club_id: perfil.club_id,
      sesion_id: sesionId,
      jugador_id: sesion.jugadorId,
      timestamp_ms: timestampMs,
      golpe_codigo: golpe,
      zona_mesa: zonaElegida,
      resultado,
      fase: faseFinal,
      metadatos,
      creado_por: perfil.id,
    }).select('id,timestamp_ms,golpe_codigo,zona_mesa,resultado,fase,notas,metadatos').single()
    if (insertError || !nuevoEvento) {
      setError(`No se pudo guardar el evento: ${insertError?.message ?? 'respuesta vacía'}`)
    } else {
      setZona(null)
      setEventos(actuales => [...actuales, nuevoEvento].sort((a, b) => a.timestamp_ms - b.timestamp_ms))
    }
    setGuardando(false)
  }

  async function borrarEvento(eventoId: string) {
    if (!perfil?.club_id || !window.confirm('¿Borrar este evento?')) return
    setBorrando(eventoId)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: deleteError } = await db.from('tecnico_eventos')
      .delete()
      .eq('id', eventoId)
      .eq('club_id', perfil.club_id)
    if (deleteError) setError(`No se pudo borrar el evento: ${deleteError.message}`)
    else {
      setEventos(actuales => actuales.filter(evento => evento.id !== eventoId))
      if (editandoId === eventoId) setEditandoId(null)
    }
    setBorrando(null)
  }

  function empezarEdicion(evento: Evento) {
    setEditandoId(evento.id)
    setEditGolpe(evento.golpe_codigo)
    setEditZona(evento.zona_mesa)
    setEditResultado(evento.resultado)
    setEditFase(evento.fase || faseAuto(evento.golpe_codigo, evento.resultado))
    setEditTipoError(evento.metadatos?.tipo_error ?? '')
    setEditNotas(evento.notas ?? '')
    setEditTimestamp(evento.timestamp_ms)
    setError('')
  }

  function usarTiempoActual() {
    if (!videoRef.current) return
    setEditTimestamp(Math.round(videoRef.current.currentTime * 1000))
  }

  async function guardarEdicion() {
    if (!perfil?.club_id || !editandoId) return
    setGuardando(true)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const metadatos = editGolpe === 'ERR' && editTipoError ? { tipo_error: editTipoError } : {}
    const { data: actualizado, error: updateError } = await db.from('tecnico_eventos')
      .update({
        golpe_codigo: editGolpe,
        zona_mesa: editZona,
        resultado: editResultado,
        fase: editFase || faseAuto(editGolpe, editResultado),
        metadatos,
        notas: editNotas.trim() || null,
        timestamp_ms: editTimestamp,
      })
      .eq('id', editandoId)
      .eq('club_id', perfil.club_id)
      .select('id,timestamp_ms,golpe_codigo,zona_mesa,resultado,fase,notas,metadatos')
      .single()
    if (updateError || !actualizado) {
      setError(`No se pudo actualizar el evento: ${updateError?.message ?? 'respuesta vacía'}`)
    } else {
      setEventos(actuales => actuales
        .map(evento => evento.id === editandoId ? actualizado : evento)
        .sort((a, b) => a.timestamp_ms - b.timestamp_ms))
      setEditandoId(null)
    }
    setGuardando(false)
  }

  function exportarCsv() {
    if (!sesion || eventos.length === 0) return
    const filas = [
      ['timestamp_ms', 'tiempo', 'golpe', 'zona', 'resultado', 'notas'],
      ...eventos.map(evento => [
        String(evento.timestamp_ms),
        formatoTiempo(evento.timestamp_ms),
        evento.golpe_codigo,
        evento.zona_mesa == null ? '' : String(evento.zona_mesa),
        evento.resultado,
        evento.notas ?? '',
      ]),
    ]
    const csv = filas.map(fila => fila.map(escaparCsv).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sesion_${sesion.jugadorNombre.replace(/\s+/g, '_')}_${sesion.fecha}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportarPdf() {
    if (!sesion) return
    const { exportarSesionTecnicaPdf } = await import('@/lib/tecnico-sesion-pdf')
    await exportarSesionTecnicaPdf({
      clubNombre,
      sesion: {
        titulo: sesion.titulo,
        fecha: sesion.fecha,
        tipo: sesion.tipo,
        estado: sesion.estado,
        jugadorNombre: sesion.jugadorNombre,
        rival: sesion.rival,
        competencia: sesion.competencia,
        marcador: sesion.marcador,
      },
      resumen,
      items: items.map(item => ({
        codigo: item.codigo,
        nombre: item.nombre,
        estado: item.estado,
        comentario: item.comentario,
      })),
      eventos,
      stats: {
        total: estadisticas.eventos,
        ganados: estadisticas.ganados,
        perdidos: estadisticas.perdidos,
        efectividad: estadisticas.efectividad,
      },
    })
  }

  async function optimizarVideo() {
    if (!videoId) return
    setProcesandoVideo(true)
    setError('')
    setOkEval('')
    try {
      const res = await fetch('/api/tecnico/procesar-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo iniciar la optimización.')
      } else {
        setEstadoProcesamiento('procesando')
        setOkEval(data.mensaje || 'Optimización iniciada.')
      }
    } catch {
      setError('No se pudo contactar al servidor para optimizar el video.')
    }
    setProcesandoVideo(false)
  }

  async function guardarEvaluacion(publicar: boolean) {
    if (!perfil?.club_id || !perfil.id || !sesion) return
    if (perfil.rol === 'jugador') return
    setGuardandoEval(true)
    setError('')
    setOkEval('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const ahora = new Date().toISOString()
    let idEval = evaluacionId

    if (!idEval) {
      const { data: creada, error: createError } = await db.from('tecnico_evaluaciones').insert({
        club_id: perfil.club_id,
        sesion_id: sesionId,
        jugador_id: sesion.jugadorId,
        evaluador_id: perfil.id,
        resumen: resumen.trim() || null,
        estado: publicar ? 'publicada' : 'borrador',
        publicada_en: publicar ? ahora : null,
        actualizado_en: ahora,
      }).select('id').single()
      if (createError || !creada) {
        setError(`No se pudo guardar la evaluación: ${createError?.message ?? 'respuesta vacía'}`)
        setGuardandoEval(false)
        return
      }
      idEval = creada.id
      setEvaluacionId(creada.id)
    } else {
      const { error: updateError } = await db.from('tecnico_evaluaciones').update({
        resumen: resumen.trim() || null,
        estado: publicar ? 'publicada' : 'borrador',
        publicada_en: publicar ? ahora : null,
        actualizado_en: ahora,
        evaluador_id: perfil.id,
      }).eq('id', idEval).eq('club_id', perfil.club_id)
      if (updateError) {
        setError(`No se pudo actualizar la evaluación: ${updateError.message}`)
        setGuardandoEval(false)
        return
      }
    }

    await db.from('tecnico_evaluacion_items').delete().eq('evaluacion_id', idEval)
    if (items.length) {
      const { error: itemsError } = await db.from('tecnico_evaluacion_items').insert(
        items.map(item => ({
          evaluacion_id: idEval,
          objetivo_id: item.objetivo_id,
          codigo: item.codigo,
          nombre: item.nombre,
          estado: item.estado,
          valor: item.valor.trim() === '' || !Number.isFinite(Number(item.valor)) ? null : Number(item.valor),
          comentario: item.comentario.trim() || null,
        })),
      )
      if (itemsError) {
        setError(`La evaluación se guardó, pero fallaron los objetivos: ${itemsError.message}`)
        setGuardandoEval(false)
        return
      }
    }

    if (publicar) {
      await db.from('tecnico_sesiones')
        .update({ estado: 'publicada', publicada_en: ahora, publicada_por: perfil.id, actualizado_en: ahora })
        .eq('id', sesionId)
        .eq('club_id', perfil.club_id)
      setSesion(prev => prev ? { ...prev, estado: 'publicada' } : prev)
    }

    setOkEval(publicar ? 'Evaluación publicada.' : 'Borrador guardado.')
    setGuardandoEval(false)
  }

  function irAlEvento(timestampMs: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampMs / 1000
      videoRef.current.play().catch(() => {})
    }
  }

  function actualizarItem(objetivoId: string, cambios: Partial<ItemEval>) {
    setItems(actuales => actuales.map(item => item.objetivo_id === objetivoId ? { ...item, ...cambios } : item))
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando sesión...</div>
  }

  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'profesor' || perfil?.rol === 'superadmin'
  const badge = sesion?.estado === 'publicada'
    ? { bg: '#dcfce7', fg: '#166534', text: 'PUBLICADA' }
    : { bg: '#eef2ff', fg: '#4338ca', text: 'BORRADOR' }
  const badgeVideo = (() => {
    if (tieneAnalisis || estadoProcesamiento === 'listo') {
      return { bg: '#dcfce7', fg: '#166534', text: 'VIDEO OPTIMIZADO' }
    }
    if (estadoProcesamiento === 'procesando') {
      return { bg: '#fef9c3', fg: '#854d0e', text: 'OPTIMIZANDO VIDEO' }
    }
    if (estadoProcesamiento === 'error') {
      return { bg: '#fef2f2', fg: '#b91c1c', text: 'ERROR DE PROCESO' }
    }
    if (estadoProcesamiento === 'pendiente') {
      return { bg: '#e0f2fe', fg: '#075985', text: 'ORIGINAL · PENDIENTE OPTIMIZAR' }
    }
    return null
  })()

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/tecnico" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver al perfil técnico</Link>
          {sesion && (
            <Link href={`/tecnico/jugadores/${sesion.jugadorId}`} style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>
              Historial del jugador →
            </Link>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: 24 }}>{sesion?.titulo || 'Sesión técnica'}</h1>
            <div style={{ marginTop: 5, color: '#64748b', fontSize: 13 }}>
              {sesion?.jugadorNombre} · {sesion?.fecha}
              {sesion?.rival ? ` · vs ${sesion.rival}` : ''}
              {sesion?.marcador ? ` · ${sesion.marcador}` : ''}
              {sesion?.competencia ? ` · ${sesion.competencia}` : ''}
            </div>
            {esStaff && videoId && (estadoProcesamiento === 'pendiente' || estadoProcesamiento === 'error') && (
              <div style={{ marginTop: 8, color: '#64748b', fontSize: 11 }}>
                El original ya se puede marcar. La optimización corre en este equipo con FFmpeg instalado.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {esStaff && videoId && estadoProcesamiento !== 'procesando' && estadoProcesamiento !== 'listo' && !tieneAnalisis && (
              <button onClick={() => void optimizarVideo()} disabled={procesandoVideo} style={primaryButton}>
                {procesandoVideo ? 'Iniciando...' : estadoProcesamiento === 'error' ? 'Reintentar optimización' : 'Optimizar video'}
              </button>
            )}
            <button onClick={() => void exportarPdf()} style={secondaryButton}>Exportar PDF</button>
            {eventos.length > 0 && (
              <button onClick={exportarCsv} style={secondaryButton}>Exportar CSV</button>
            )}
            {badgeVideo && (
              <span style={{ background: badgeVideo.bg, color: badgeVideo.fg, borderRadius: 999, padding: '7px 12px', fontSize: 11, fontWeight: 700 }}>{badgeVideo.text}</span>
            )}
            <span style={{ background: badge.bg, color: badge.fg, borderRadius: 999, padding: '7px 12px', fontSize: 11, fontWeight: 700 }}>{badge.text}</span>
          </div>
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 14 }}>{error}</div>}
        {okEval && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 14 }}>{okEval}</div>}

        <style jsx>{`
          @media (max-width: 760px) {
            .tecnico-captura { grid-template-columns: 1fr !important; }
            .tecnico-captura > div:nth-child(2) { border-left: 0 !important; border-top: 1px solid #e2e8f0; }
            .tecnico-layout { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div className="tecnico-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(310px, .65fr)', gap: 16, alignItems: 'start' }}>
          <div style={card}>
            <div className="tecnico-captura" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 250px', alignItems: 'stretch' }}>
              <div>
                {videoUrl ? (
                  <video ref={videoRef} src={videoUrl} controls preload="metadata" style={{ display: 'block', width: '100%', height: 'min(62vh, 520px)', objectFit: 'contain', background: '#0f172a', borderRadius: '14px 0 0 0' }} />
                ) : (
                  <div style={{ minHeight: 300, display: 'grid', placeItems: 'center', color: '#64748b' }}>No se encontró el video.</div>
                )}
              </div>
              <div style={{ padding: 14, borderLeft: '1px solid #e2e8f0', background: '#fff' }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 9 }}>Golpe que quieres registrar</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {GOLPES.map(item => (
                    <button
                      key={item.codigo}
                      onClick={() => {
                        setGolpe(item.codigo)
                        setFase(faseAuto(item.codigo, resultado))
                        if (item.codigo !== 'ERR') setTipoError('')
                      }}
                      style={{ border: 0, borderRadius: 7, padding: '8px 10px', background: golpe === item.codigo ? '#ea580c' : '#0c4a6e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {item.codigo}
                    </button>
                  ))}
                </div>
                {golpe === 'ERR' && (
                  <>
                    <div style={{ fontSize: 12, color: '#64748b', margin: '14px 0 8px' }}>Tipo de error</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {TIPOS_ERROR.map(item => (
                        <button key={item.value} onClick={() => setTipoError(item.value)} style={{ border: 0, borderRadius: 7, padding: '6px 8px', background: tipoError === item.value ? '#dc2626' : '#7f1d1d', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 12, color: '#64748b', margin: '14px 0 8px' }}>Fase</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {FASES.map(item => (
                    <button key={item.value} onClick={() => setFase(item.value)} style={{ border: 0, borderRadius: 7, padding: '6px 8px', background: fase === item.value ? '#4f46e5' : '#312e81', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', margin: '16px 0 8px' }}>Toca una posición para registrar</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 42px)', gap: 5 }}>
                  {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => (
                    <button key={n} onClick={() => { setZona(n); void guardarEvento(n) }} disabled={guardando || !videoUrl || !esStaff} style={{ height: 36, border: '1px solid #075985', borderRadius: 7, background: zona === n ? '#0284c7' : '#0c4a6e', color: '#fff', fontWeight: 800, cursor: guardando ? 'wait' : 'pointer', opacity: guardando ? 0.7 : 1 }}>{n}</button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', margin: '16px 0 8px' }}>Resultado</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[
                    ['punto_ganado', 'Ganado'],
                    ['punto_perdido', 'Perdido'],
                    ['en_juego', 'En juego'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => {
                        setResultado(value)
                        setFase(faseAuto(golpe, value))
                      }}
                      style={{ border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 8px', background: resultado === value ? '#1e293b' : '#fff', color: resultado === value ? '#fff' : '#475569', fontSize: 10, cursor: 'pointer' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 14 }}>Al tocar una zona se guarda el timestamp exacto.</div>
              </div>
            </div>
          </div>

          <div style={{ ...card, maxHeight: 700, overflow: 'auto' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ color: '#0f172a', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Estadística en vivo</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
                {[
                  ['Eventos', estadisticas.eventos, '#4f46e5'],
                  ['Ganados', estadisticas.ganados, '#16a34a'],
                  ['Perdidos', estadisticas.perdidos, '#dc2626'],
                ].map(([label, valor, color]) => {
                  const ayuda = glosarioPorLabel(String(label))
                  return (
                    <div key={String(label)} style={{ background: '#f8fafc', borderRadius: 7, padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ color: '#64748b', fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {label}
                        {ayuda && (
                          <AyudaHint titulo={ayuda.nombre} significado={ayuda.significado} comoSeCalcula={ayuda.comoSeCalcula} />
                        )}
                      </div>
                      <div style={{ color: color as string, fontSize: 18, fontWeight: 800, marginTop: 2 }}>{valor}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                <MiniStat label="Efectividad" value={`${estadisticas.efectividad}%`} />
                <MiniStat label="% Error" value={`${estadisticas.errorRate}%`} />
                <MiniStat label="En juego" value={`${estadisticas.enJuegoPct}%`} />
                <MiniStat label="Puntos decisivos" value={`${estadisticas.puntosDecisivosPct}%`} />
                <MiniStat label="Racha ERR" value={String(estadisticas.rachaErroresMax)} />
                <MiniStat label="Muestra" value={estadisticas.calidadMuestra === 'alta' ? 'Alta' : estadisticas.calidadMuestra === 'media' ? 'Media' : 'Baja'} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, marginBottom: 6, alignItems: 'center' }}>
                <TituloAyuda label="Efectividad de puntos" />
                <strong style={{ color: '#0f172a' }}>{estadisticas.efectividad}%</strong>
              </div>
              <div style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ height: '100%', width: `${estadisticas.efectividad}%`, background: '#16a34a', borderRadius: 99, transition: 'width 180ms ease' }} />
              </div>
              <div style={{ marginBottom: 6 }}><TituloAyuda label="Efectividad por golpe" /></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {estadisticas.efectividadPorGolpe.filter(item => item.total > 0).map(item => (
                  <span key={item.codigo} style={{ background: '#312e81', color: '#fff', borderRadius: 99, padding: '4px 7px', fontSize: 10, fontWeight: 700 }}>
                    {item.codigo}: {item.efectividad}% ({item.total})
                  </span>
                ))}
                {estadisticas.eventos === 0 && <span style={{ color: '#94a3b8', fontSize: 10 }}>Todavía no hay datos</span>}
              </div>
              {estadisticas.eventos > 0 && (
                <>
                  <div style={{ margin: '8px 0 6px' }}><TituloAyuda label="Zonas de la mesa" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 3 }}>
                    {estadisticas.zonas.map(item => (
                      <div key={item.zona} title={`${item.total} evento${item.total === 1 ? '' : 's'}`} style={{ textAlign: 'center', background: item.total ? '#0369a1' : '#334155', color: '#fff', borderRadius: 4, padding: '4px 1px', fontSize: 9, fontWeight: 700 }}>
                        {item.zona}<br />{item.total}
                      </div>
                    ))}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 10, marginTop: 8 }}>
                    Bandas: corta {estadisticas.zonasBandas.cortaPct}% · media {estadisticas.zonasBandas.mediaPct}% · profunda {estadisticas.zonasBandas.profundaPct}%
                  </div>
                </>
              )}
              {estadisticas.tiposError.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ marginBottom: 5 }}><TituloAyuda label="Tipos de error" /></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {estadisticas.tiposError.map(item => (
                      <span key={item.tipo} style={{ background: '#7f1d1d', color: '#fff', borderRadius: 99, padding: '3px 7px', fontSize: 10, fontWeight: 700 }}>
                        {TIPO_ERROR_LABEL[item.tipo] || item.tipo}: {item.total}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {estadisticas.porFase.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ marginBottom: 5 }}><TituloAyuda label="Por fase" /></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {estadisticas.porFase.map(item => (
                      <span key={item.fase} style={{ background: '#312e81', color: '#fff', borderRadius: 99, padding: '3px 7px', fontSize: 10, fontWeight: 700 }}>
                        {FASE_LABEL[item.fase] || item.fase}: {item.total}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: '15px 16px', borderBottom: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 700, fontSize: 14 }}>Registro de eventos ({eventos.length})</div>
            {eventos.length === 0 ? (
              <div style={{ padding: 24, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>Reproduce el video y registra el primer evento.</div>
            ) : eventos.map(evento => (
              <div key={evento.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '10px 12px 10px 16px' }}>
                {editandoId === evento.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <strong style={{ color: '#0f172a', fontSize: 12 }}>Editar evento</strong>
                      <span style={{ color: '#4f46e5', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatoTiempo(editTimestamp)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {GOLPES.map(item => (
                        <button key={item.codigo} onClick={() => { setEditGolpe(item.codigo); if (item.codigo !== 'ERR') setEditTipoError('') }} style={{ border: 0, borderRadius: 6, padding: '6px 8px', background: editGolpe === item.codigo ? '#ea580c' : '#0c4a6e', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {item.codigo}
                        </button>
                      ))}
                    </div>
                    {editGolpe === 'ERR' && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {TIPOS_ERROR.map(item => (
                          <button key={item.value} onClick={() => setEditTipoError(item.value)} style={{ border: 0, borderRadius: 6, padding: '5px 7px', background: editTipoError === item.value ? '#dc2626' : '#7f1d1d', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {FASES.map(item => (
                        <button key={item.value} onClick={() => setEditFase(item.value)} style={{ border: 0, borderRadius: 6, padding: '5px 7px', background: editFase === item.value ? '#4f46e5' : '#312e81', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                      {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => (
                        <button key={n} onClick={() => setEditZona(n)} style={{ height: 28, border: '1px solid #075985', borderRadius: 6, background: editZona === n ? '#0284c7' : '#0c4a6e', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>{n}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {[
                        ['punto_ganado', 'Ganado'],
                        ['punto_perdido', 'Perdido'],
                        ['en_juego', 'En juego'],
                      ].map(([value, label]) => (
                        <button key={value} onClick={() => setEditResultado(value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 7px', background: editResultado === value ? '#1e293b' : '#fff', color: editResultado === value ? '#fff' : '#475569', fontSize: 10, cursor: 'pointer' }}>{label}</button>
                      ))}
                    </div>
                    <input value={editNotas} onChange={e => setEditNotas(e.target.value)} placeholder="Notas (opcional)" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 8px', fontSize: 11 }} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={usarTiempoActual} style={secondaryButton}>Usar tiempo actual</button>
                      <button onClick={() => setEditandoId(null)} disabled={guardando} style={secondaryButton}>Cancelar</button>
                      <button onClick={() => void guardarEdicion()} disabled={guardando} style={primaryButton}>{guardando ? '...' : 'Guardar'}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => irAlEvento(evento.timestamp_ms)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 0, background: '#fff', padding: 0, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ color: '#0f172a', fontSize: 13 }}>
                          {evento.golpe_codigo}
                          {evento.zona_mesa ? ` · Zona ${evento.zona_mesa}` : ''}
                          {evento.fase ? ` · ${FASE_LABEL[evento.fase] || evento.fase}` : ''}
                          {evento.metadatos?.tipo_error ? ` · ${TIPO_ERROR_LABEL[evento.metadatos.tipo_error] || evento.metadatos.tipo_error}` : ''}
                        </strong>
                        <span style={{ color: '#4f46e5', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatoTiempo(evento.timestamp_ms)}</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>{evento.resultado.replaceAll('_', ' ')}{evento.notas ? ` · ${evento.notas}` : ''}</div>
                    </button>
                    {esStaff && (
                      <>
                        <button onClick={() => empezarEdicion(evento)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#475569', padding: '5px 7px', cursor: 'pointer', fontSize: 11 }}>
                          Editar
                        </button>
                        <button onClick={() => void borrarEvento(evento.id)} disabled={borrando === evento.id} title="Borrar evento" style={{ border: '1px solid #fecaca', borderRadius: 6, background: '#fff1f2', color: '#dc2626', padding: '5px 7px', cursor: borrando === evento.id ? 'wait' : 'pointer', fontSize: 11 }}>
                          {borrando === evento.id ? '...' : 'Borrar'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {esStaff && (
          <div style={{ ...card, marginTop: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, color: '#0f172a', fontSize: 17 }}>Evaluación técnica</h2>
                <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 12 }}>
                  Evalúa objetivos del club y publica el informe. Publicar también deja la sesión visible para el jugador.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => void guardarEvaluacion(false)} disabled={guardandoEval} style={secondaryButton}>
                  {guardandoEval ? 'Guardando...' : 'Guardar borrador'}
                </button>
                <button onClick={() => void guardarEvaluacion(true)} disabled={guardandoEval} style={primaryButton}>
                  {guardandoEval ? 'Publicando...' : 'Publicar evaluación'}
                </button>
              </div>
            </div>

            <label style={{ display: 'block', color: '#475569', fontSize: 12, marginBottom: 5 }}>Resumen del profesor</label>
            <textarea
              value={resumen}
              onChange={e => setResumen(e.target.value)}
              rows={3}
              placeholder="Observaciones generales, próximos focos de trabajo, acuerdos con el jugador..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', border: '1px solid #cbd5e1', borderRadius: 8, color: '#0f172a', fontSize: 13, resize: 'vertical' }}
            />

            {objetivos.length === 0 ? (
              <div style={{ marginTop: 14, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, fontSize: 12 }}>
                No hay objetivos activos. Ejecuta la migración `146_objetivos_tecnicos_spinhouse.sql` para cargar el catálogo inicial.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {items.map(item => {
                  const objetivo = objetivos.find(o => o.id === item.objetivo_id)
                  return (
                    <div key={item.objetivo_id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ color: '#0f172a', fontWeight: 700, fontSize: 13 }}>{item.codigo} · {item.nombre}</div>
                          {objetivo?.criterio && <div style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>{objetivo.criterio}</div>}
                        </div>
                        <select
                          value={item.estado}
                          onChange={e => actualizarItem(item.objetivo_id, { estado: e.target.value })}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 9px', fontSize: 12, background: '#fff' }}
                        >
                          {ESTADOS_OBJETIVO.map(estado => (
                            <option key={estado.value} value={estado.value}>{estado.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginTop: 9 }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={item.valor}
                          onChange={e => actualizarItem(item.objetivo_id, { valor: e.target.value })}
                          placeholder="Nota 0-100"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12 }}
                        />
                        <input
                          value={item.comentario}
                          onChange={e => actualizarItem(item.objetivo_id, { comentario: e.target.value })}
                          placeholder="Comentario del objetivo (opcional)"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function formatoTiempo(ms: number) {
  const total = Math.floor(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const ayuda = glosarioPorLabel(label)
  return (
    <div style={{ background: '#f8fafc', borderRadius: 7, padding: '7px 8px' }}>
      <div style={{ color: '#64748b', fontSize: 9, display: 'inline-flex', alignItems: 'center' }}>
        {label}
        {ayuda && <AyudaHint titulo={ayuda.nombre} significado={ayuda.significado} comoSeCalcula={ayuda.comoSeCalcula} />}
      </div>
      <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function TituloAyuda({ label }: { label: string }) {
  const ayuda = glosarioPorLabel(label)
  return (
    <span style={{ color: '#64748b', fontSize: 10, display: 'inline-flex', alignItems: 'center' }}>
      {label}
      {ayuda && <AyudaHint titulo={ayuda.nombre} significado={ayuda.significado} comoSeCalcula={ayuda.comoSeCalcula} />}
    </span>
  )
}

function escaparCsv(valor: string) {
  if (/[",\n\r]/.test(valor)) return `"${valor.replaceAll('"', '""')}"`
  return valor
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,23,42,0.08)', overflow: 'hidden' as const }
const primaryButton = { border: 0, borderRadius: 8, padding: '9px 13px', background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' } as const
const secondaryButton = { border: '1px solid #cbd5e1', borderRadius: 7, padding: '8px 10px', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' } as const
