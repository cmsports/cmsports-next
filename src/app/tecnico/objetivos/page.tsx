'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'

const supabase = createClient()

type Objetivo = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  dimension: string
  nivel: string | null
  criterio: string | null
  activo: boolean
}

const DIMENSIONES = ['tecnica', 'tactica', 'fisica', 'mental', 'general'] as const

export default function ObjetivosTecnicosPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [dimension, setDimension] = useState('tecnica')
  const [nivel, setNivel] = useState('')
  const [criterio, setCriterio] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data, error: loadError } = await db.from('tecnico_objetivos')
      .select('id,codigo,nombre,descripcion,dimension,nivel,criterio,activo')
      .eq('club_id', perfil.club_id)
      .order('activo', { ascending: false })
      .order('dimension')
      .order('codigo')
    if (loadError) setError('No se pudieron cargar los objetivos.')
    setObjetivos(data ?? [])
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

  useEnVivo(['tecnico_objetivos'], perfil?.club_id ?? null, () => { void cargar() }, { conClub: ['tecnico_objetivos'] })

  async function crearObjetivo() {
    if (!perfil?.club_id || !codigo.trim() || !nombre.trim()) {
      setError('Código y nombre son obligatorios.')
      return
    }
    setGuardando(true)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: insertError } = await db.from('tecnico_objetivos').insert({
      club_id: perfil.club_id,
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      dimension,
      nivel: nivel.trim() || null,
      criterio: criterio.trim() || null,
    })
    if (insertError) {
      setError(`No se pudo crear el objetivo: ${insertError.message}`)
    } else {
      setCodigo('')
      setNombre('')
      setDescripcion('')
      setDimension('tecnica')
      setNivel('')
      setCriterio('')
      setFormOpen(false)
      await cargar()
    }
    setGuardando(false)
  }

  async function alternarActivo(objetivo: Objetivo) {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: updateError } = await db.from('tecnico_objetivos')
      .update({ activo: !objetivo.activo })
      .eq('id', objetivo.id)
      .eq('club_id', perfil.club_id)
    if (updateError) setError(`No se pudo actualizar: ${updateError.message}`)
    else setObjetivos(actuales => actuales.map(item => item.id === objetivo.id ? { ...item, activo: !item.activo } : item))
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando objetivos...</div>
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link href="/tecnico" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver al perfil técnico</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', margin: '18px 0 20px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: 24 }}>Objetivos técnicos</h1>
            <p style={{ color: '#64748b', margin: '5px 0 0', fontSize: 13 }}>Catálogo del club usado en evaluaciones y ejercicios de plan.</p>
          </div>
          <button onClick={() => { setError(''); setFormOpen(true) }} style={primaryButton}>+ Nuevo objetivo</button>
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 14 }}>{error}</div>}

        {objetivos.length === 0 ? (
          <div style={card}>Todavía no hay objetivos. Crea el primero o ejecuta la migración seed de Spinhouse.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {objetivos.map(objetivo => (
              <div key={objetivo.id} style={{ ...card, opacity: objetivo.activo ? 1 : 0.65 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#0f172a', fontWeight: 800, fontSize: 14 }}>{objetivo.codigo} · {objetivo.nombre}</div>
                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                      {objetivo.dimension}{objetivo.nivel ? ` · ${objetivo.nivel}` : ''} · {objetivo.activo ? 'Activo' : 'Inactivo'}
                    </div>
                    {objetivo.descripcion && <div style={{ color: '#475569', fontSize: 12, marginTop: 8 }}>{objetivo.descripcion}</div>}
                    {objetivo.criterio && <div style={{ color: '#64748b', fontSize: 11, marginTop: 6 }}><strong>Criterio:</strong> {objetivo.criterio}</div>}
                  </div>
                  <button onClick={() => void alternarActivo(objetivo)} style={secondaryButton}>
                    {objetivo.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {formOpen && (
          <div style={overlay} onClick={() => !guardando && setFormOpen(false)}>
            <div style={{ ...card, width: 560, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: 17 }}>Nuevo objetivo</h2>
              <label style={label}>Código</label>
              <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej: DER-01" style={input} />
              <label style={label}>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Consistencia de derecho" style={input} />
              <label style={label}>Dimensión</label>
              <select value={dimension} onChange={e => setDimension(e.target.value)} style={input}>
                {DIMENSIONES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <label style={label}>Nivel (opcional)</label>
              <input value={nivel} onChange={e => setNivel(e.target.value)} placeholder="inicial / intermedio / avanzado" style={input} />
              <label style={label}>Descripción</label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
              <label style={label}>Criterio de éxito</label>
              <textarea value={criterio} onChange={e => setCriterio(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button onClick={() => setFormOpen(false)} disabled={guardando} style={secondaryButton}>Cancelar</button>
                <button onClick={() => void crearObjetivo()} disabled={guardando} style={primaryButton}>{guardando ? 'Guardando...' : 'Crear objetivo'}</button>
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
