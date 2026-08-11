'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

type Jugador = { id: string; nombre: string; categoria: string | null }
type Plan = { id: string; nombre: string; nivel: string | null }
type Ejercicio = { id: string; nombre: string; orden: number }

export default function NuevaSesionTecnicaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [planes, setPlanes] = useState<Plan[]>([])
  const [planesAsignados, setPlanesAsignados] = useState<string[]>([])
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
  const [jugadorId, setJugadorId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState('analisis_video')
  const [planId, setPlanId] = useState('')
  const [ejercicioId, setEjercicioId] = useState('')
  const [rival, setRival] = useState('')
  const [competencia, setCompetencia] = useState('')
  const [marcador, setMarcador] = useState('')
  const [notas, setNotas] = useState('')
  const [video, setVideo] = useState<File | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [fase, setFase] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function subirVideoConProgreso(path: string, file: File) {
    const { data, error: signedError } = await supabase.storage
      .from('tecnico-videos')
      .createSignedUploadUrl(path)

    if (!signedError && data?.signedUrl) {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', data.signedUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = event => {
          if (!event.lengthComputable) return
          setProgreso(Math.max(1, Math.round((event.loaded / event.total) * 100)))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Fallo al subir el video (HTTP ${xhr.status}).`))
        }
        xhr.onerror = () => reject(new Error('Error de red al subir el video.'))
        xhr.send(file)
      })
      return
    }

    setProgreso(15)
    const { error: uploadError } = await supabase.storage
      .from('tecnico-videos')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw new Error(uploadError.message)
    setProgreso(95)
  }

  const cargarJugadores = useCallback(async () => {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: dataJugadores }, { data: dataPlanes }] = await Promise.all([
      db.from('jugadores')
        .select('id,nombre,categoria')
        .eq('club_id', perfil.club_id)
        .eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre'),
      db.from('tecnico_planes')
        .select('id,nombre,nivel')
        .eq('club_id', perfil.club_id)
        .eq('activo', true)
        .order('nombre'),
    ])
    setJugadores(dataJugadores ?? [])
    setPlanes(dataPlanes ?? [])
    setCargando(false)
  }, [perfil?.club_id])

  useEffect(() => {
    if (!perfil?.club_id || !planId) {
      setEjercicios([])
      setEjercicioId('')
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    void db.from('tecnico_plan_ejercicios')
      .select('id,nombre,orden')
      .eq('club_id', perfil.club_id)
      .eq('plan_id', planId)
      .order('orden')
      .then(({ data }: { data: Ejercicio[] | null }) => setEjercicios(data ?? []))
  }, [perfil?.club_id, planId])

  useEffect(() => {
    if (!perfil?.club_id || !jugadorId) {
      setPlanesAsignados([])
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    void db.from('tecnico_plan_jugadores')
      .select('plan_id')
      .eq('club_id', perfil.club_id)
      .eq('jugador_id', jugadorId)
      .in('estado', ['asignado', 'en_curso'])
      .then(({ data }: { data: { plan_id: string }[] | null }) => {
        const ids = (data ?? []).map(item => item.plan_id)
        setPlanesAsignados(ids)
        if (tipo === 'entrenamiento' && ids.length === 1) setPlanId(ids[0])
      })
  }, [perfil?.club_id, jugadorId, tipo])

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
    void cargarJugadores()
  }, [authLoading, cargarJugadores, perfil, router])

  function seleccionarVideo(file: File | null) {
    setError('')
    if (!file) {
      setVideo(null)
      return
    }
    if (!file.type.startsWith('video/')) {
      setError('Selecciona un archivo de video válido.')
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError('El video supera el límite de 2 GB.')
      return
    }
    setVideo(file)
  }

  async function guardar() {
    if (!perfil?.club_id || !perfil.id) return
    if (!jugadorId || !titulo.trim()) {
      setError('Selecciona un jugador e ingresa un título.')
      return
    }
    if (!video) {
      setError('Selecciona un video para crear la sesión.')
      return
    }

    setGuardando(true)
    setError('')
    setProgreso(0)
    setFase('Creando sesión...')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: sesion, error: sesionError } = await db.from('tecnico_sesiones')
      .insert({
        club_id: perfil.club_id,
        jugador_id: jugadorId,
        profesor_id: perfil.id,
        titulo: titulo.trim(),
        tipo,
        notas: notas.trim() || null,
        plan_id: tipo === 'entrenamiento' ? planId || null : null,
        ejercicio_id: tipo === 'entrenamiento' ? ejercicioId || null : null,
        rival_nombre: tipo === 'competencia' ? rival.trim() || null : null,
        competencia_nombre: tipo === 'competencia' ? competencia.trim() || null : null,
        marcador: tipo === 'competencia' ? marcador.trim() || null : null,
      })
      .select('id')
      .single()

    if (sesionError || !sesion) {
      setError('No se pudo crear la sesión técnica.')
      setGuardando(false)
      setFase('')
      return
    }

    const ext = video.name.includes('.') ? video.name.split('.').pop()?.toLowerCase() : 'mp4'
    const path = `videos/${perfil.club_id}/${jugadorId}/${sesion.id}.${ext || 'mp4'}`
    setFase('Subiendo video...')
    try {
      await subirVideoConProgreso(path, video)
    } catch (uploadError) {
      await db.from('tecnico_sesiones').delete().eq('id', sesion.id)
      setError(`No se pudo subir el video: ${uploadError instanceof Error ? uploadError.message : 'error desconocido'}`)
      setGuardando(false)
      setFase('')
      return
    }

    setFase('Guardando registro...')
    setProgreso(100)
    const { error: videoError } = await db.from('tecnico_videos').insert({
      club_id: perfil.club_id,
      sesion_id: sesion.id,
      jugador_id: jugadorId,
      archivo_path: path,
      nombre: video.name,
      mime_type: video.type,
      tamano_bytes: video.size,
      estado_procesamiento: 'pendiente',
    })

    if (videoError) {
      await supabase.storage.from('tecnico-videos').remove([path])
      await db.from('tecnico_sesiones').delete().eq('id', sesion.id)
      setError('El video se subió, pero no se pudo guardar su registro.')
      setGuardando(false)
      setFase('')
      return
    }

    router.push(`/tecnico/sesiones/${sesion.id}`)
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando...</div>
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href="/tecnico" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver al perfil técnico</Link>
        <h1 style={{ color: '#0f172a', fontSize: 24, margin: '18px 0 5px' }}>Nueva sesión técnica</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>Asocia un video a un jugador para comenzar su análisis.</p>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
          <label style={{ display: 'block', color: '#475569', fontSize: 12, marginBottom: 5 }}>Jugador</label>
          <select value={jugadorId} onChange={e => setJugadorId(e.target.value)} style={inputStyle}>
            <option value="">Seleccionar jugador...</option>
            {jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre}{j.categoria ? ` · ${j.categoria}` : ''}</option>)}
          </select>

          <label style={labelStyle}>Título de la sesión</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Análisis de partido del domingo" style={inputStyle} />

          <label style={labelStyle}>Tipo de sesión</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
            <option value="analisis_video">Análisis de video</option>
            <option value="entrenamiento">Entrenamiento</option>
            <option value="competencia">Competencia</option>
            <option value="evaluacion">Evaluación técnica</option>
          </select>

          {tipo === 'entrenamiento' && (
            <>
              <label style={labelStyle}>Plan de entrenamiento</label>
              <select value={planId} onChange={e => setPlanId(e.target.value)} style={inputStyle}>
                <option value="">Seleccionar plan...</option>
                {[...planes]
                  .sort((a, b) => Number(planesAsignados.includes(b.id)) - Number(planesAsignados.includes(a.id)))
                  .map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {planesAsignados.includes(plan.id) ? '★ ' : ''}{plan.nombre}{plan.nivel ? ` · ${plan.nivel}` : ''}
                    </option>
                  ))}
              </select>
              {jugadorId && planesAsignados.length > 0 && (
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 5 }}>★ = plan asignado a este jugador</div>
              )}
              {planId && (
                <>
                  <label style={labelStyle}>Ejercicio</label>
                  <select value={ejercicioId} onChange={e => setEjercicioId(e.target.value)} style={inputStyle}>
                    <option value="">Seleccionar ejercicio...</option>
                    {ejercicios.map(ejercicio => <option key={ejercicio.id} value={ejercicio.id}>{ejercicio.orden}. {ejercicio.nombre}</option>)}
                  </select>
                </>
              )}
            </>
          )}

          {tipo === 'competencia' && (
            <>
              <label style={labelStyle}>Rival</label>
              <input value={rival} onChange={e => setRival(e.target.value)} placeholder="Nombre del rival" style={inputStyle} />
              <label style={labelStyle}>Torneo o competencia</label>
              <input value={competencia} onChange={e => setCompetencia(e.target.value)} placeholder="Ej: Liga Spinhouse 2026" style={inputStyle} />
              <label style={labelStyle}>Marcador</label>
              <input value={marcador} onChange={e => setMarcador(e.target.value)} placeholder="Ej: 3-2" style={inputStyle} />
            </>
          )}

          <label style={labelStyle}>Notas iniciales (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Qué se quiere observar en este video..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />

          <label style={labelStyle}>Video</label>
          <input type="file" accept="video/*" onChange={e => seleccionarVideo(e.target.files?.[0] ?? null)} style={{ width: '100%', color: '#475569', fontSize: 13 }} />
          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 5 }}>Se conserva el original · máximo 2 GB. Para videos largos de iPhone recomendamos Wi-Fi.</div>
          {video && <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, color: '#334155', fontSize: 12, marginTop: 12 }}>{video.name} · {(video.size / 1024 / 1024).toFixed(1)} MB</div>}

          {guardando && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12, marginBottom: 6 }}>
                <span>{fase || 'Procesando...'}</span>
                <strong style={{ color: '#0f172a' }}>{progreso}%</strong>
              </div>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progreso}%`, background: '#4f46e5', transition: 'width 120ms ease' }} />
              </div>
            </div>
          )}

          {error && <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, fontSize: 12, marginTop: 16 }}>{error}</div>}

          <button onClick={() => void guardar()} disabled={guardando} style={{ width: '100%', marginTop: 20, padding: 11, border: 0, borderRadius: 8, background: guardando ? '#a5b4fc' : '#4f46e5', color: '#fff', fontWeight: 700, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Subiendo sesión...' : 'Crear sesión técnica'}
          </button>
        </div>
      </div>
    </AppLayout>
  )
}

const labelStyle = { display: 'block', color: '#475569', fontSize: 12, margin: '16px 0 5px' } as const
const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '10px 11px', border: '1px solid #cbd5e1', borderRadius: 8, color: '#0f172a', background: '#fff', fontSize: 13 } as const
