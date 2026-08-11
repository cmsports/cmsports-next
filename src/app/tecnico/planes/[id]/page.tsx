'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { alertasCumplimientoPlan } from '@/lib/tecnico/alertas-plan'

const supabase = createClient()

type Plan = { id: string; nombre: string; descripcion: string | null; nivel: string | null; objetivo_general: string | null; duracion_min: number | null }
type Objetivo = { id: string; codigo: string; nombre: string; dimension: string }
type Ejercicio = { id: string; orden: number; nombre: string; descripcion: string | null; objetivo_id: string | null; duracion_min: number | null; repeticiones: number | null; dificultad: string | null; criterio_exito: string | null }
type Jugador = { id: string; nombre: string; categoria: string | null }
type Asignacion = {
  id: string
  jugador_id: string
  estado: string
  fecha_inicio: string
  fecha_fin: string | null
  notas: string | null
  jugadorNombre: string
}
type SesionPlan = { id: string; jugador_id: string; ejercicio_id: string | null; fecha: string; titulo: string }

const ESTADOS_ASIGNACION = [
  { value: 'asignado', label: 'Asignado' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'completado', label: 'Completado' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'archivado', label: 'Archivado' },
] as const

export default function PlanDetallePage() {
  const { perfil, loading: authLoading } = usePerfil()
  const params = useParams()
  const planId = params.id as string
  const [plan, setPlan] = useState<Plan | null>(null)
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [sesionesPlan, setSesionesPlan] = useState<SesionPlan[]>([])
  const [jugadorAsignar, setJugadorAsignar] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [objetivoId, setObjetivoId] = useState('')
  const [duracion, setDuracion] = useState('')
  const [repeticiones, setRepeticiones] = useState('')
  const [dificultad, setDificultad] = useState('media')
  const [criterio, setCriterio] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const router = useRouter()

  function resetFormulario() {
    setEditandoId(null)
    setNombre('')
    setDescripcion('')
    setObjetivoId('')
    setDuracion('')
    setRepeticiones('')
    setDificultad('media')
    setCriterio('')
  }

  function abrirNuevoEjercicio() {
    setError('')
    resetFormulario()
    setFormOpen(true)
  }

  function abrirEditarEjercicio(ejercicio: Ejercicio) {
    setError('')
    setEditandoId(ejercicio.id)
    setNombre(ejercicio.nombre)
    setDescripcion(ejercicio.descripcion ?? '')
    setObjetivoId(ejercicio.objetivo_id ?? '')
    setDuracion(ejercicio.duracion_min != null ? String(ejercicio.duracion_min) : '')
    setRepeticiones(ejercicio.repeticiones != null ? String(ejercicio.repeticiones) : '')
    setDificultad(ejercicio.dificultad || 'media')
    setCriterio(ejercicio.criterio_exito ?? '')
    setFormOpen(true)
  }

  const cargar = useCallback(async () => {
    if (!perfil?.club_id || !planId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: p, error: pError }, { data: os }, { data: es, error: eError }, { data: js }, { data: asigs }, { data: sesiones }] = await Promise.all([
      db.from('tecnico_planes').select('id,nombre,descripcion,nivel,objetivo_general,duracion_min').eq('id', planId).eq('club_id', perfil.club_id).single(),
      db.from('tecnico_objetivos').select('id,codigo,nombre,dimension').eq('club_id', perfil.club_id).eq('activo', true).order('dimension').order('nombre'),
      db.from('tecnico_plan_ejercicios').select('id,orden,nombre,descripcion,objetivo_id,duracion_min,repeticiones,dificultad,criterio_exito').eq('plan_id', planId).eq('club_id', perfil.club_id).order('orden'),
      db.from('jugadores')
        .select('id,nombre,categoria')
        .eq('club_id', perfil.club_id)
        .eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre'),
      db.from('tecnico_plan_jugadores')
        .select('id,jugador_id,estado,fecha_inicio,fecha_fin,notas')
        .eq('plan_id', planId)
        .eq('club_id', perfil.club_id)
        .order('fecha_inicio', { ascending: false }),
      db.from('tecnico_sesiones')
        .select('id,jugador_id,ejercicio_id,fecha,titulo')
        .eq('club_id', perfil.club_id)
        .eq('plan_id', planId)
        .neq('estado', 'archivada')
        .order('fecha', { ascending: false }),
    ])
    if (pError || eError || !p) {
      setError('No se pudo cargar el plan.')
      setCargando(false)
      return
    }
    setPlan(p)
    setObjetivos(os ?? [])
    setEjercicios(es ?? [])
    setJugadores(js ?? [])
    setSesionesPlan(sesiones ?? [])
    const nombres = new Map((js ?? []).map((j: Jugador) => [j.id, j.nombre]))
    setAsignaciones((asigs ?? []).map((a: Omit<Asignacion, 'jugadorNombre'>) => ({
      ...a,
      jugadorNombre: nombres.get(a.jugador_id) ?? 'Jugador',
    })))
    setCargando(false)
  }, [perfil?.club_id, planId])

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

  useEnVivo(
    ['tecnico_plan_ejercicios', 'tecnico_objetivos', 'tecnico_plan_jugadores', 'tecnico_sesiones'],
    perfil?.club_id ?? null,
    () => { void cargar() },
    { conClub: ['tecnico_plan_ejercicios', 'tecnico_objetivos', 'tecnico_plan_jugadores', 'tecnico_sesiones'] },
  )

  function cumplimientoJugador(jugadorId: string) {
    const total = ejercicios.length
    const hechos = new Set(
      sesionesPlan
        .filter(s => s.jugador_id === jugadorId && s.ejercicio_id)
        .map(s => s.ejercicio_id as string),
    )
    const hechosValidos = [...hechos].filter(id => ejercicios.some(e => e.id === id)).length
    const pct = total ? Math.round((hechosValidos / total) * 100) : 0
    return { hechos: hechosValidos, total, pct, sesiones: sesionesPlan.filter(s => s.jugador_id === jugadorId).length }
  }

  const alertasPlan = plan
    ? alertasCumplimientoPlan({
      asignaciones: asignaciones.map(a => ({
        plan_id: planId,
        jugador_id: a.jugador_id,
        estado: a.estado,
        fecha_inicio: a.fecha_inicio,
      })),
      planes: [{ id: planId, nombre: plan.nombre }],
      jugadores: jugadores.map(j => ({ id: j.id, nombre: j.nombre })),
      ejercicios: ejercicios.map(e => ({ id: e.id, plan_id: planId })),
      sesiones: sesionesPlan.map(s => ({
        plan_id: planId,
        jugador_id: s.jugador_id,
        ejercicio_id: s.ejercicio_id,
        fecha: s.fecha,
      })),
    })
    : []
  const alertaPorJugador = new Map(alertasPlan.map(a => [a.jugadorId, a]))

  async function guardarEjercicio() {
    if (!perfil?.club_id || !nombre.trim()) {
      setError('Ingresa un nombre para el ejercicio.')
      return
    }
    const eraEdicion = !!editandoId
    setGuardando(true)
    setError('')
    setOkMsg('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const payload = {
      objetivo_id: objetivoId || null,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      duracion_min: duracion ? Number(duracion) : null,
      repeticiones: repeticiones ? Number(repeticiones) : null,
      dificultad,
      criterio_exito: criterio.trim() || null,
    }
    const { error: saveError } = eraEdicion
      ? await db.from('tecnico_plan_ejercicios')
        .update(payload)
        .eq('id', editandoId)
        .eq('club_id', perfil.club_id)
        .eq('plan_id', planId)
      : await db.from('tecnico_plan_ejercicios').insert({
        ...payload,
        club_id: perfil.club_id,
        plan_id: planId,
        orden: ejercicios.length + 1,
      })
    if (saveError) {
      setError(`No se pudo ${eraEdicion ? 'guardar' : 'agregar'} el ejercicio: ${saveError.message}`)
    } else {
      resetFormulario()
      setFormOpen(false)
      setOkMsg(eraEdicion ? 'Ejercicio actualizado.' : 'Ejercicio agregado.')
      await cargar()
    }
    setGuardando(false)
  }

  async function borrarEjercicio(ejercicio: Ejercicio) {
    if (!perfil?.club_id) return
    if (!confirm(`¿Borrar el ejercicio "${ejercicio.nombre}"?`)) return
    setGuardando(true)
    setError('')
    setOkMsg('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: deleteError } = await db.from('tecnico_plan_ejercicios')
      .delete()
      .eq('id', ejercicio.id)
      .eq('club_id', perfil.club_id)
      .eq('plan_id', planId)
    if (deleteError) {
      setError(`No se pudo borrar el ejercicio: ${deleteError.message}`)
      setGuardando(false)
      return
    }
    const restantes = ejercicios
      .filter(e => e.id !== ejercicio.id)
      .sort((a, b) => a.orden - b.orden)
    // Dos pasadas para no chocar con UNIQUE (plan_id, orden).
    for (let i = 0; i < restantes.length; i++) {
      const { error: tmpError } = await db.from('tecnico_plan_ejercicios')
        .update({ orden: 1000 + i + 1 })
        .eq('id', restantes[i].id)
        .eq('club_id', perfil.club_id)
      if (tmpError) {
        setError(`Ejercicio borrado, pero no se pudo reordenar: ${tmpError.message}`)
        await cargar()
        setGuardando(false)
        return
      }
    }
    for (let i = 0; i < restantes.length; i++) {
      const { error: renumError } = await db.from('tecnico_plan_ejercicios')
        .update({ orden: i + 1 })
        .eq('id', restantes[i].id)
        .eq('club_id', perfil.club_id)
      if (renumError) {
        setError(`Ejercicio borrado, pero no se pudo reordenar: ${renumError.message}`)
        await cargar()
        setGuardando(false)
        return
      }
    }
    setOkMsg('Ejercicio borrado.')
    await cargar()
    setGuardando(false)
  }

  async function asignarJugador() {
    if (!perfil?.club_id || !jugadorAsignar) {
      setError('Selecciona un jugador para asignar al plan.')
      return
    }
    if (asignaciones.some(a => a.jugador_id === jugadorAsignar && a.estado !== 'archivado')) {
      setError('Ese jugador ya está asignado a este plan.')
      return
    }
    setGuardando(true)
    setError('')
    setOkMsg('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: insertError } = await db.from('tecnico_plan_jugadores').insert({
      club_id: perfil.club_id,
      plan_id: planId,
      jugador_id: jugadorAsignar,
      estado: 'asignado',
      asignado_por: perfil.id,
    })
    if (insertError) {
      setError(`No se pudo asignar el jugador: ${insertError.message}`)
    } else {
      setJugadorAsignar('')
      setOkMsg('Jugador asignado al plan.')
      await cargar()
    }
    setGuardando(false)
  }

  async function cambiarEstadoAsignacion(asignacionId: string, estado: string) {
    if (!perfil?.club_id) return
    setError('')
    setOkMsg('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const patch: Record<string, string | null> = { estado }
    if (estado === 'completado' || estado === 'archivado') {
      patch.fecha_fin = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
    } else {
      patch.fecha_fin = null
    }
    const { error: updateError } = await db.from('tecnico_plan_jugadores')
      .update(patch)
      .eq('id', asignacionId)
      .eq('club_id', perfil.club_id)
    if (updateError) {
      setError(`No se pudo actualizar la asignación: ${updateError.message}`)
    } else {
      await cargar()
    }
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando plan...</div>
  }

  const disponibles = jugadores.filter(j => !asignaciones.some(a => a.jugador_id === j.id && a.estado !== 'archivado'))

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link href="/tecnico/planes" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver a planes</Link>
        <div style={{ ...card, marginTop: 18, background: 'linear-gradient(135deg, #312e81, #4f46e5)', color: '#fff', border: 0 }}>
          <div style={{ fontSize: 10, opacity: .75, textTransform: 'uppercase', letterSpacing: 1 }}>Plan de entrenamiento</div>
          <h1 style={{ margin: '5px 0', fontSize: 24 }}>{plan?.nombre}</h1>
          <div style={{ fontSize: 12, opacity: .85 }}>{plan?.nivel || 'Sin nivel'}{plan?.duracion_min ? ` · ${plan.duracion_min} minutos` : ''}</div>
          {plan?.objetivo_general && <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.45, maxWidth: 680 }}>{plan.objetivo_general}</div>}
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: 10, fontSize: 12, margin: '14px 0' }}>{error}</div>}
        {okMsg && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: 10, fontSize: 12, margin: '14px 0' }}>{okMsg}</div>}

        <div style={{ ...card, marginTop: 16 }}>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: 17 }}>Jugadores asignados ({asignaciones.filter(a => a.estado !== 'archivado').length})</h2>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>Vincula el plan a jugadores para seguir cumplimiento y usarlo en sesiones de entrenamiento.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <select value={jugadorAsignar} onChange={e => setJugadorAsignar(e.target.value)} style={{ ...input, flex: 1, minWidth: 220 }}>
              <option value="">Seleccionar jugador...</option>
              {disponibles.map(j => (
                <option key={j.id} value={j.id}>{j.nombre}{j.categoria ? ` · ${j.categoria}` : ''}</option>
              ))}
            </select>
            <button onClick={() => void asignarJugador()} disabled={guardando || !jugadorAsignar} style={primaryButton}>
              Asignar
            </button>
          </div>
          {asignaciones.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 14 }}>Todavía no hay jugadores en este plan.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {asignaciones.map(asig => {
                const cumplimiento = cumplimientoJugador(asig.jugador_id)
                const alerta = alertaPorJugador.get(asig.jugador_id)
                return (
                  <div key={asig.id} style={{ background: alerta ? (alerta.severidad === 'alta' ? '#fef2f2' : '#fffbeb') : '#f8fafc', borderRadius: 10, padding: '10px 12px', border: alerta ? `1px solid ${alerta.severidad === 'alta' ? '#fecaca' : '#fcd34d'}` : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700 }}>
                          {asig.jugadorNombre}
                          {alerta && (
                            <span style={{
                              marginLeft: 8,
                              background: alerta.severidad === 'alta' ? '#fee2e2' : '#fef3c7',
                              color: alerta.severidad === 'alta' ? '#991b1b' : '#92400e',
                              borderRadius: 999,
                              padding: '2px 7px',
                              fontSize: 10,
                              fontWeight: 700,
                            }}>
                              ATRASADO
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                          Desde {asig.fecha_inicio}{asig.fecha_fin ? ` · hasta ${asig.fecha_fin}` : ''}
                          {' · '}{cumplimiento.sesiones} sesión{cumplimiento.sesiones === 1 ? '' : 'es'}
                          {alerta ? ` · ${alerta.motivo}` : ''}
                        </div>
                      </div>
                      <select
                        value={asig.estado}
                        onChange={e => void cambiarEstadoAsignacion(asig.id, e.target.value)}
                        style={{ ...input, width: 150, margin: 0 }}
                      >
                        {ESTADOS_ASIGNACION.map(estado => (
                          <option key={estado.value} value={estado.value}>{estado.label}</option>
                        ))}
                      </select>
                    </div>
                    {ejercicios.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                          <span>Cumplimiento de ejercicios</span>
                          <strong style={{ color: '#0f172a' }}>{cumplimiento.hechos}/{cumplimiento.total} · {cumplimiento.pct}%</strong>
                        </div>
                        <div style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${cumplimiento.pct}%`, background: cumplimiento.pct >= 100 ? '#16a34a' : '#4f46e5' }} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                          {ejercicios.map(ej => {
                            const hecho = sesionesPlan.some(s => s.jugador_id === asig.jugador_id && s.ejercicio_id === ej.id)
                            return (
                              <span key={ej.id} style={{
                                background: hecho ? '#dcfce7' : '#fff',
                                color: hecho ? '#166534' : '#94a3b8',
                                border: `1px solid ${hecho ? '#bbf7d0' : '#e2e8f0'}`,
                                borderRadius: 999,
                                padding: '3px 7px',
                                fontSize: 10,
                              }}>
                                {ej.orden}. {ej.nombre}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 12px', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: 17 }}>Ejercicios ({ejercicios.length})</h2>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>Ordena el trabajo y asocia cada ejercicio a un objetivo técnico.</div>
          </div>
          <button onClick={abrirNuevoEjercicio} style={primaryButton}>+ Agregar ejercicio</button>
        </div>

        {ejercicios.length === 0 ? (
          <div style={card}>Este plan aún no tiene ejercicios.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ejercicios.map(ejercicio => {
              const objetivo = objetivos.find(item => item.id === ejercicio.objetivo_id)
              return (
                <div key={ejercicio.id} style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', background: '#eef2ff', color: '#4338ca', borderRadius: 9, fontWeight: 900 }}>{ejercicio.orden}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <h3 style={{ margin: 0, color: '#0f172a', fontSize: 14 }}>{ejercicio.nombre}</h3>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#64748b', fontSize: 11 }}>{ejercicio.dificultad || 'Sin dificultad'}</span>
                        <button onClick={() => abrirEditarEjercicio(ejercicio)} disabled={guardando} style={secondaryButton}>Editar</button>
                        <button
                          onClick={() => void borrarEjercicio(ejercicio)}
                          disabled={guardando}
                          style={{ ...secondaryButton, color: '#b91c1c', borderColor: '#fecaca' }}
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                    {ejercicio.descripcion && <div style={{ color: '#475569', fontSize: 12, marginTop: 5 }}>{ejercicio.descripcion}</div>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                      {objetivo && <span style={tag}>{objetivo.codigo} · {objetivo.nombre}</span>}
                      {ejercicio.duracion_min && <span style={tag}>{ejercicio.duracion_min} min</span>}
                      {ejercicio.repeticiones && <span style={tag}>{ejercicio.repeticiones} repeticiones</span>}
                    </div>
                    {ejercicio.criterio_exito && <div style={{ color: '#64748b', fontSize: 11, marginTop: 9 }}><strong>Criterio:</strong> {ejercicio.criterio_exito}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {formOpen && (
          <div style={overlay} onClick={() => { if (!guardando) { setFormOpen(false); resetFormulario() } }}>
            <div style={{ ...card, width: 600, maxWidth: '100%' }} onClick={event => event.stopPropagation()}>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: 17 }}>{editandoId ? 'Editar ejercicio' : 'Agregar ejercicio'}</h2>
              <label style={label}>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Peloteo de derecho cruzado" style={input} />
              <label style={label}>Descripción</label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Cómo se realiza..." style={{ ...input, resize: 'vertical' }} />
              <label style={label}>Objetivo técnico</label>
              <select value={objetivoId} onChange={e => setObjetivoId(e.target.value)} style={input}>
                <option value="">Sin objetivo asociado</option>
                {objetivos.map(objetivo => <option key={objetivo.id} value={objetivo.id}>{objetivo.codigo} · {objetivo.nombre}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
                <div><label style={label}>Duración (min)</label><input type="number" min="1" value={duracion} onChange={e => setDuracion(e.target.value)} style={input} /></div>
                <div><label style={label}>Repeticiones</label><input type="number" min="1" value={repeticiones} onChange={e => setRepeticiones(e.target.value)} style={input} /></div>
                <div><label style={label}>Dificultad</label><select value={dificultad} onChange={e => setDificultad(e.target.value)} style={input}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></div>
              </div>
              <label style={label}>Criterio de éxito</label>
              <textarea value={criterio} onChange={e => setCriterio(e.target.value)} rows={3} placeholder="Ej: 8 de 10 golpes válidos..." style={{ ...input, resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button onClick={() => { setFormOpen(false); resetFormulario() }} disabled={guardando} style={secondaryButton}>Cancelar</button>
                <button onClick={() => void guardarEjercicio()} disabled={guardando} style={primaryButton}>
                  {guardando ? 'Guardando...' : (editandoId ? 'Guardar cambios' : 'Agregar ejercicio')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.08)' } as const
const primaryButton = { border: 0, borderRadius: 8, padding: '9px 13px', background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' } as const
const secondaryButton = { border: '1px solid #cbd5e1', borderRadius: 7, padding: '8px 10px', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' } as const
const label = { display: 'block', color: '#475569', fontSize: 12, margin: '15px 0 5px' } as const
const input = { width: '100%', boxSizing: 'border-box' as const, padding: '10px 11px', border: '1px solid #cbd5e1', borderRadius: 8, color: '#0f172a', background: '#fff', fontSize: 13 } as const
const tag = { background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '4px 7px', fontSize: 10 } as const
const overlay = { position: 'fixed' as const, inset: 0, zIndex: 50, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 16 }
