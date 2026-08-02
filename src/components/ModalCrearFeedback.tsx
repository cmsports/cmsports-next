'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { crearFeedback } from '@/app/actions/feedback'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Jugador = { id: string; nombre: string; categoria: string | null }

export default function ModalCrearFeedback({ clubId, onClose, onGuardado }: {
  clubId: string
  onClose: () => void
  onGuardado?: () => void
}) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [busqueda, setBusqueda]   = useState('')
  const [elegido, setElegido]     = useState<Jugador | null>(null)
  const [fecha, setFecha]         = useState(() => fechaChile())
  const [hora, setHora]           = useState(() => horaChile())
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [listo, setListo]         = useState(false)

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

  async function guardar() {
    if (!elegido || !comentario.trim()) return
    setGuardando(true)
    setError('')
    const res = await crearFeedback({ jugadorId: elegido.id, fecha, hora, comentario })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setListo(true)
    onGuardado?.()
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22,
        width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>

        {listo ? (
          <>
            <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text, textAlign: 'center', marginBottom: 4 }}>
              Feedback guardado
            </div>
            <div style={{ fontSize: 12, color: muted, textAlign: 'center', marginBottom: 18 }}>
              Quedó registrado para {elegido?.nombre}.
            </div>
            <button onClick={onClose}
              style={{ width: '100%', padding: 11, background: '#4f46e5', border: 'none', borderRadius: 8,
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Listo
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 14 }}>Crear feedback</div>

            {!elegido ? (
              <>
                <input
                  style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 10 }}
                  placeholder="Buscar alumno por nombre..."
                  value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
                />
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                  {filtrados.map((j, i) => (
                    <div key={j.id} onClick={() => setElegido(j)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '10px 12px', cursor: 'pointer',
                        borderBottom: i < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{j.nombre}</span>
                      <span style={{ fontSize: 11, color: muted }}>{j.categoria ?? ''}</span>
                    </div>
                  ))}
                  {filtrados.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 13 }}>Sin resultados</div>
                  )}
                </div>
                <button onClick={onClose}
                  style={{ width: '100%', padding: 10, marginTop: 12, background: 'transparent', border: '1px solid #e2e8f0',
                    borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{elegido.nombre}</span>
                  <button onClick={() => setElegido(null)}
                    style={{ background: 'transparent', border: 'none', color: muted, fontSize: 12, cursor: 'pointer' }}>
                    Cambiar
                  </button>
                </div>

                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px',
                    marginBottom: 12, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
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

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 4 }}>Comentario</label>
                  <textarea
                    style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                      borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 90 }}
                    placeholder="Qué observaste, qué puede mejorar, qué destacó..."
                    value={comentario} onChange={e => setComentario(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={onClose}
                    style={{ flex: 1, padding: 11, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
                      color: muted, fontSize: 13, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={guardar} disabled={guardando || !comentario.trim()}
                    style={{ flex: 1, padding: 11, background: comentario.trim() ? '#4f46e5' : '#e2e8f0', border: 'none',
                      borderRadius: 8, color: comentario.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 600,
                      cursor: guardando || !comentario.trim() ? 'default' : 'pointer' }}>
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
