'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { crearFeedback, editarFeedback, eliminarFeedback } from '@/app/actions/feedback'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Feedback = {
  id: string
  autor_id: string | null
  autor_nombre: string
  fecha: string
  hora: string | null
  comentario: string
}

// Tarjeta de feedback dentro de la ficha del jugador: mismo historial que
// /feedbacks pero acotado a este alumno, sin tener que salir a buscarlo en
// la lista general.
export default function FeedbackJugador({ jugadorId, userId, puedeAgregar, puedeTodo }: {
  jugadorId: string
  /** id de auth del usuario actual, para saber si puede editar/borrar lo suyo. */
  userId: string
  /** admin/profesor: puede escribir feedback nuevo. */
  puedeAgregar: boolean
  /** admin/superadmin: puede editar y borrar cualquier feedback, no solo el propio. */
  puedeTodo: boolean
}) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [cargando, setCargando]   = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [fecha, setFecha]         = useState(() => fechaChile())
  const [hora, setHora]           = useState(() => horaChile())
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState('')
  const [editando, setEditando]   = useState<Feedback | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('feedback_jugadores')
      .select('id,autor_id,autor_nombre,fecha,hora,comentario')
      .eq('jugador_id', jugadorId)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
    setFeedbacks((data ?? []) as Feedback[])
    setCargando(false)
  }, [jugadorId])

  useEffect(() => { void cargar() }, [cargar])

  function limpiarForm() {
    setFecha(fechaChile())
    setHora(horaChile())
    setComentario('')
    setEditando(null)
    setMensaje('')
  }

  function empezarEdicion(f: Feedback) {
    setEditando(f)
    setFecha(f.fecha)
    setHora(f.hora?.slice(0, 5) ?? '')
    setComentario(f.comentario)
    setMostrarForm(true)
  }

  async function guardar() {
    if (!comentario.trim()) return
    setGuardando(true)
    setMensaje('')
    const res = editando
      ? await editarFeedback({ feedbackId: editando.id, fecha, hora, comentario })
      : await crearFeedback({ jugadorId, fecha, hora, comentario })
    setGuardando(false)
    if (res.error) { setMensaje(res.error); return }
    limpiarForm()
    setMostrarForm(false)
    await cargar()
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este feedback?')) return
    const res = await eliminarFeedback({ feedbackId: id })
    if (res.error) { alert(res.error); return }
    if (editando?.id === id) { limpiarForm(); setMostrarForm(false) }
    await cargar()
  }

  function puedeEditar(f: Feedback) {
    return puedeTodo || f.autor_id === userId
  }

  return (
    <div style={{ padding: '4px 20px 16px' }}>
      {puedeAgregar && (
        <div style={{ marginBottom: 14 }}>
          {!mostrarForm ? (
            <button onClick={() => { limpiarForm(); setMostrarForm(true) }}
              style={{ width: '100%', padding: '9px 12px', background: '#eef2ff', border: '1px solid #c7d2fe',
                borderRadius: 8, color: '#4338ca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              + Agregar feedback
            </button>
          ) : (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              {mensaje && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px',
                  marginBottom: 10, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                  {mensaje}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  style={{ flex: 1, boxSizing: 'border-box', background: '#fff', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '8px 10px', color: text, fontSize: 12, outline: 'none' }} />
                <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                  style={{ flex: 1, boxSizing: 'border-box', background: '#fff', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '8px 10px', color: text, fontSize: 12, outline: 'none' }} />
              </div>
              <textarea
                style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '9px 10px', color: text, fontSize: 12, outline: 'none', resize: 'vertical',
                  minHeight: 64, marginBottom: 10 }}
                placeholder="Qué observaste, qué puede mejorar, qué destacó..."
                value={comentario} onChange={e => setComentario(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { limpiarForm(); setMostrarForm(false) }}
                  style={{ padding: '8px 12px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
                    color: muted, fontSize: 12, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={guardar} disabled={guardando || !comentario.trim()}
                  style={{ flex: 1, padding: '8px 12px', background: comentario.trim() ? '#4f46e5' : '#e2e8f0', border: 'none',
                    borderRadius: 8, color: comentario.trim() ? '#fff' : '#94a3b8', fontSize: 12, fontWeight: 600,
                    cursor: guardando || !comentario.trim() ? 'default' : 'pointer' }}>
                  {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {cargando ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: hint, fontSize: 12 }}>Cargando...</div>
      ) : feedbacks.length === 0 ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: hint, fontSize: 12 }}>
          Todavía no hay feedback para este alumno.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {feedbacks.map(f => (
            <div key={f.id} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: muted, fontWeight: 600 }}>
                  {f.fecha}{f.hora ? ` · ${f.hora.slice(0, 5)}` : ''}
                </div>
                <div style={{ fontSize: 10, color: hint }}>{f.autor_nombre}</div>
              </div>
              <div style={{ fontSize: 12, color: text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.comentario}</div>
              {puedeAgregar && puedeEditar(f) && (
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button onClick={() => empezarEdicion(f)}
                    style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Editar
                  </button>
                  <button onClick={() => borrar(f.id)}
                    style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Borrar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
