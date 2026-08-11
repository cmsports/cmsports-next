'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { alertasCumplimientoPlan } from '@/lib/tecnico/alertas-plan'

const supabase = createClient()

type Plan = {
  id: string
  nombre: string
  descripcion: string | null
  nivel: string | null
  objetivo_general: string | null
  duracion_min: number | null
  activo: boolean
}

type PlanStats = {
  ejercicios: number
  asignados: number
  atrasados: number
}

export default function PlanesTecnicoPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [planes, setPlanes] = useState<Plan[]>([])
  const [stats, setStats] = useState<Record<string, PlanStats>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [nivel, setNivel] = useState('inicial')
  const [objetivo, setObjetivo] = useState('')
  const [duracion, setDuracion] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data, error: loadError }, { data: ejercicios }, { data: asignaciones }, { data: sesiones }, { data: jugadores }] = await Promise.all([
      db.from('tecnico_planes')
        .select('id,nombre,descripcion,nivel,objetivo_general,duracion_min,activo')
        .eq('club_id', perfil.club_id)
        .order('activo', { ascending: false })
        .order('nombre'),
      db.from('tecnico_plan_ejercicios').select('id,plan_id').eq('club_id', perfil.club_id),
      db.from('tecnico_plan_jugadores').select('plan_id,jugador_id,estado,fecha_inicio').eq('club_id', perfil.club_id).in('estado', ['asignado', 'en_curso']),
      db.from('tecnico_sesiones').select('plan_id,jugador_id,ejercicio_id,fecha').eq('club_id', perfil.club_id).neq('estado', 'archivada'),
      db.from('jugadores').select('id,nombre').eq('club_id', perfil.club_id).or('es_externo.is.null,es_externo.eq.false'),
    ])
    if (loadError) setError('No se pudieron cargar los planes.')
    setPlanes(data ?? [])

    const alertas = alertasCumplimientoPlan({
      asignaciones: asignaciones ?? [],
      planes: (data ?? []).map((p: Plan) => ({ id: p.id, nombre: p.nombre })),
      jugadores: jugadores ?? [],
      ejercicios: ejercicios ?? [],
      sesiones: sesiones ?? [],
    })
    const atrasadosPorPlan = new Map<string, number>()
    for (const a of alertas) {
      atrasadosPorPlan.set(a.planId, (atrasadosPorPlan.get(a.planId) ?? 0) + 1)
    }

    const next: Record<string, PlanStats> = {}
    for (const plan of data ?? []) {
      next[plan.id] = {
        ejercicios: (ejercicios ?? []).filter((e: { plan_id: string }) => e.plan_id === plan.id).length,
        asignados: (asignaciones ?? []).filter((a: { plan_id: string }) => a.plan_id === plan.id).length,
        atrasados: atrasadosPorPlan.get(plan.id) ?? 0,
      }
    }
    setStats(next)
    setCargando(false)
  }, [perfil?.club_id])

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
    ['tecnico_planes', 'tecnico_plan_jugadores', 'tecnico_plan_ejercicios', 'tecnico_sesiones'],
    perfil?.club_id ?? null,
    () => { void cargar() },
    { conClub: ['tecnico_planes', 'tecnico_plan_jugadores', 'tecnico_plan_ejercicios', 'tecnico_sesiones'] },
  )

  async function crearPlan() {
    if (!perfil?.club_id || !perfil.id || !nombre.trim()) {
      setError('Ingresa un nombre para el plan.')
      return
    }
    setGuardando(true)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: insertError } = await db.from('tecnico_planes').insert({
      club_id: perfil.club_id,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      nivel,
      objetivo_general: objetivo.trim() || null,
      duracion_min: duracion ? Number(duracion) : null,
      creado_por: perfil.id,
    })
    if (insertError) {
      setError(`No se pudo crear el plan: ${insertError.message}`)
    } else {
      setNombre('')
      setDescripcion('')
      setNivel('inicial')
      setObjetivo('')
      setDuracion('')
      setFormOpen(false)
      await cargar()
    }
    setGuardando(false)
  }

  async function alternarPlan(plan: Plan) {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: updateError } = await db.from('tecnico_planes')
      .update({ activo: !plan.activo })
      .eq('id', plan.id)
      .eq('club_id', perfil.club_id)
    if (updateError) setError(`No se pudo actualizar el plan: ${updateError.message}`)
    else setPlanes(actuales => actuales.map(item => item.id === plan.id ? { ...item, activo: !item.activo } : item))
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando planes...</div>
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Link href="/tecnico" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver al perfil técnico</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', margin: '18px 0 20px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: 24 }}>Planes de entrenamiento</h1>
            <p style={{ color: '#64748b', fontSize: 13, margin: '5px 0 0' }}>Plantillas reutilizables para ordenar objetivos y ejercicios.</p>
          </div>
          <button onClick={() => { setError(''); setFormOpen(true) }} style={primaryButton}>+ Crear plan</button>
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 16 }}>{error}</div>}

        {planes.length === 0 ? (
          <div style={card}>Todavía no hay planes. Crea el primero para organizar el entrenamiento.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {planes.map(plan => {
              const st = stats[plan.id] ?? { ejercicios: 0, asignados: 0, atrasados: 0 }
              return (
                <div key={plan.id} style={{ ...card, opacity: plan.activo ? 1 : 0.62, borderColor: st.atrasados ? '#fcd34d' : '#e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ margin: 0, color: '#0f172a', fontSize: 16 }}>{plan.nombre}</h2>
                      <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>{plan.nivel || 'Sin nivel'}{plan.duracion_min ? ` · ${plan.duracion_min} min` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      <span style={{ background: plan.activo ? '#dcfce7' : '#f1f5f9', color: plan.activo ? '#166534' : '#64748b', borderRadius: 999, padding: '4px 7px', fontSize: 9, fontWeight: 700 }}>
                        {plan.activo ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                      {st.atrasados > 0 && (
                        <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 7px', fontSize: 9, fontWeight: 700 }}>
                          {st.atrasados} atrasado{st.atrasados === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                  {plan.descripcion && <p style={{ color: '#475569', fontSize: 12, lineHeight: 1.45, margin: '14px 0 8px' }}>{plan.descripcion}</p>}
                  {plan.objetivo_general && <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, color: '#475569', fontSize: 11, marginTop: 12 }}><strong>Objetivo:</strong> {plan.objetivo_general}</div>}
                  <div style={{ display: 'flex', gap: 14, marginTop: 14, color: '#64748b', fontSize: 11 }}>
                    <span><strong style={{ color: '#0f172a' }}>{st.ejercicios}</strong> ejercicios</span>
                    <span><strong style={{ color: '#0f172a' }}>{st.asignados}</strong> asignados</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <Link href={`/tecnico/planes/${plan.id}`} style={{ ...secondaryButton, textDecoration: 'none' }}>Abrir plan</Link>
                    <button onClick={() => void alternarPlan(plan)} style={secondaryButton}>{plan.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {formOpen && (
          <div style={overlay} onClick={() => !guardando && setFormOpen(false)}>
            <div style={{ ...card, width: 560, maxWidth: '100%' }} onClick={event => event.stopPropagation()}>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: 17 }}>Crear plan de entrenamiento</h2>
              <label style={label}>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Base de regularidad de derecho" style={input} />
              <label style={label}>Descripción</label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Qué se trabajará en este plan..." style={{ ...input, resize: 'vertical' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={label}>Nivel</label><select value={nivel} onChange={e => setNivel(e.target.value)} style={input}><option value="inicial">Inicial</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option></select></div>
                <div><label style={label}>Duración (minutos)</label><input type="number" min="1" value={duracion} onChange={e => setDuracion(e.target.value)} placeholder="60" style={input} /></div>
              </div>
              <label style={label}>Objetivo general</label>
              <textarea value={objetivo} onChange={e => setObjetivo(e.target.value)} rows={3} placeholder="Cómo se sabrá que el plan fue exitoso..." style={{ ...input, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button onClick={() => setFormOpen(false)} disabled={guardando} style={secondaryButton}>Cancelar</button>
                <button onClick={() => void crearPlan()} disabled={guardando} style={primaryButton}>{guardando ? 'Guardando...' : 'Crear plan'}</button>
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
const overlay = { position: 'fixed' as const, inset: 0, zIndex: 50, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 16 }
