'use client'

// Lo que los alumnos le escribieron al profesor.
//
// Se lee por `feedback_de_profesores()` y no por la tabla, y eso NO es un
// rodeo: la RLS de Postgres filtra filas, no columnas, así que darle la fila al
// profesor le daría también el `jugador_id` de los comentarios anónimos. La
// función es la que devuelve el autor en NULL. Ver la migración 228.
//
// El admin ve todo el club; el profesor, solo lo suyo. Eso lo decide la función
// según quién llama, no esta pantalla.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Trash2 } from 'lucide-react'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Recibido = {
  id: string
  profesor_id: string
  profesor_nombre: string
  fecha: string
  comentario: string
  anonimo: boolean
  autor: string | null
}

export default function PanelFeedbackRecibido({
  clubId, esAdmin,
}: { clubId: string; esAdmin: boolean }) {
  const [items, setItems]       = useState<Recibido[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')
  const [filtro, setFiltro]     = useState('')

  const cargar = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any).rpc('feedback_de_profesores', {
      p_desde: null, p_hasta: null,
    })
    if (err) { setError(err.message); setCargando(false); return }
    setItems((data ?? []) as Recibido[])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['feedback_profesores'], clubId, cargar, { conClub: ['feedback_profesores'] })

  // Solo al admin le sirve filtrar por profesor: el profe ya ve nada más que lo
  // suyo, así que el selector le mostraría una sola opción.
  const profesores = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) m.set(i.profesor_id, i.profesor_nombre)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [items])

  const visibles = filtro ? items.filter(i => i.profesor_id === filtro) : items

  async function borrar(id: string) {
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).rpc('borrar_feedback_profesor', { p_id: id })
    if (err) { setError(err.message); return }
    await cargar()
  }

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>

  return (
    <>
      <p style={{ fontSize: 12, color: hint, margin: '0 0 12px', lineHeight: 1.5 }}>
        {esAdmin
          ? 'Lo que los alumnos escribieron a cada profesor. Los anónimos no muestran autor, tampoco para vos.'
          : 'Lo que tus alumnos te escribieron. Los que eligieron el anonimato no muestran quién los escribió.'}
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {esAdmin && profesores.length > 1 && (
        <select value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: text, marginBottom: 14 }}>
          <option value="">Todos los profesores</option>
          {profesores.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
      )}

      {visibles.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
          Todavía no hay comentarios de los alumnos.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibles.map(f => (
            <div key={f.id} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
                  {f.autor ?? 'Alumno anónimo'}
                </span>
                {f.anonimo && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: muted }}>
                    anónimo
                  </span>
                )}
                <span style={{ fontSize: 11, color: hint }}>{f.fecha}</span>
                {esAdmin && (
                  <span style={{ fontSize: 11, color: muted }}>→ {f.profesor_nombre}</span>
                )}
                {esAdmin && (
                  <button onClick={() => void borrar(f.id)} title="Borrar"
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', padding: 2 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.comentario}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
