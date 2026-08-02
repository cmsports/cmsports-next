'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { crearFeedback, editarFeedback, eliminarFeedback } from '@/app/actions/feedback'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Jugador = { id: string; nombre: string; categoria: string | null }
type Feedback = {
  id: string
  jugador_id: string
  autor_id: string | null
  autor_nombre: string
  fecha: string
  hora: string | null
  comentario: string
  creado_en: string
  editado_en: string | null
}

export default function PanelFeedback({ clubId, userId, puedeTodo }: {
  clubId: string
  /** id de auth del usuario actual, para saber si puede editar/borrar lo suyo. */
  userId: string
  /** admin/superadmin: puede editar y borrar cualquier feedback, no solo el propio. */
  puedeTodo: boolean
}) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [busqueda, setBusqueda]   = useState('')
  const [elegido, setElegido]     = useState<Jugador | null>(null)
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [cargando, setCargando]   = useState(false)
  const [mensaje, setMensaje]     = useState('')

  const [fecha, setFecha]         = useState(() => fechaChile())
  const [hora, setHora]           = useState(() => horaChile())
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando]   = useState<Feedback | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.from('jugadores')
        .select('id,nombre,categoria')
        .eq('club_id', clubId).eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre')
      if (vivo) setJugadores((data ?? []) as Jugador[])
    })()
    return () => { vivo = false }
  }, [clubId])

  const cargarFeedbacks = useCallback(async (jugadorId: string) => {
    setCargando(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('feedback_jugadores')
      .select('id,jugador_id,autor_id,autor_nombre,fecha,hora,comentario,creado_en,editado_en')
      .eq('jugador_id', jugadorId)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
    setFeedbacks((data ?? []) as Feedback[])
    setCargando(false)
  }, [])

  useEffect(() => {
    if (elegido) void cargarFeedbacks(elegido.id)
  }, [elegido, cargarFeedbacks])

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
  }

  async function guardar() {
    if (!elegido || !comentario.trim()) return
    setGuardando(true)
    setMensaje('')
    const res = editando
      ? await editarFeedback({ feedbackId: editando.id, fecha, hora, comentario })
      : await crearFeedback({ jugadorId: elegido.id, fecha, hora, comentario })
    setGuardando(false)
    if (res.error) { setMensaje(res.error); return }
    limpiarForm()
    await cargarFeedbacks(elegido.id)
  }

  async function borrar(id: string) {
    if (!elegido) return
    if (!confirm('¿Borrar este feedback?')) return
    setMensaje('')
    const res = await eliminarFeedback({ feedbackId: id })
    if (res.error) { setMensaje(res.error); return }
    if (editando?.id === id) limpiarForm()
    await cargarFeedbacks(elegido.id)
  }

  function puedeEditar(f: Feedback) {
    return puedeTodo || f.autor_id === userId
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))

  // ── Lista de jugadores ──────────────────────────────────────────────────
  if (!elegido) {
    return (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 4 }}>Elegí un alumno</div>
        <div style={{ fontSize: 12, color: hint, marginBottom: 12 }}>
          Cada uno tiene su propio historial de feedback.
        </div>
        <input
          style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 10 }}
          placeholder="Buscar por nombre..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
        />
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 520, overflowY: 'auto' }}>
          {filtrados.map((j, i) => (
            <div key={j.id} onClick={() => setElegido(j)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '11px 14px', cursor: 'pointer',
                borderBottom: i < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{j.nombre}</span>
              <span style={{ fontSize: 11, color: muted }}>{j.categoria ?? ''}</span>
            </div>
          ))}
          {filtrados.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 13 }}>Sin resultados</div>
          )}
        </div>
      </div>
    )
  }

  // ── Historial del jugador ────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => { setElegido(null); setFeedbacks([]); limpiarForm() }}
          style={{ padding: '7px 13px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
            border: '1px solid #e2e8f0', background: '#fff', color: muted }}>
          ← Alumnos
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{elegido.nombre}</div>
      </div>

      {/* Formulario nuevo / edición */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 12 }}>
          {editando ? 'Editar feedback' : 'Nuevo feedback'}
        </div>

        {mensaje && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px',
            marginBottom: 12, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
            {mensaje}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 4 }}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '9px 11px', color: text, fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 4 }}>Hora</label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '9px 11px', color: text, fontSize: 13, outline: 'none' }} />
          </div>
        </div>

        <textarea
          style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none', resize: 'vertical',
            minHeight: 80, marginBottom: 12 }}
          placeholder="Qué observaste, qué puede mejorar, qué destacó..."
          value={comentario} onChange={e => setComentario(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          {editando && (
            <button onClick={limpiarForm}
              style={{ padding: '10px 14px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
                color: muted, fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
          )}
          <button onClick={guardar} disabled={guardando || !comentario.trim()}
            style={{ flex: 1, padding: '10px 14px', background: comentario.trim() ? '#4f46e5' : '#e2e8f0', border: 'none',
              borderRadius: 8, color: comentario.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 600,
              cursor: guardando || !comentario.trim() ? 'default' : 'pointer' }}>
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar feedback'}
          </button>
        </div>
      </div>

      {/* Historial */}
      {cargando ? (
        <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
      ) : feedbacks.length === 0 ? (
        <div style={{ ...card, padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>
          Todavía no hay feedback para {elegido.nombre}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {feedbacks.map(f => (
            <div key={f.id} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: muted, fontWeight: 600 }}>
                  {f.fecha}{f.hora ? ` · ${f.hora.slice(0, 5)}` : ''}
                  {f.editado_en && <span style={{ color: hint, fontWeight: 400 }}> · editado</span>}
                </div>
                <div style={{ fontSize: 11, color: hint }}>{f.autor_nombre}</div>
              </div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.comentario}</div>
              {puedeEditar(f) && (
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <button onClick={() => empezarEdicion(f)}
                    style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Editar
                  </button>
                  <button onClick={() => borrar(f.id)}
                    style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
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
