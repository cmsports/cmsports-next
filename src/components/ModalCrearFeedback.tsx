'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { crearFeedbackMasivo } from '@/app/actions/feedback'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'
import FiltroMultiSelect from '@/components/FiltroMultiSelect'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Jugador = { id: string; nombre: string; categoria: string | null }
type BloqueRef = { id: string; nombre: string }

export default function ModalCrearFeedback({ clubId, onClose, onGuardado }: {
  clubId: string
  onClose: () => void
  onGuardado?: () => void
}) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [busqueda, setBusqueda]   = useState('')
  const [bloques, setBloques]     = useState<BloqueRef[]>([])
  // jugador → nombres de grupo a los que va, para poder filtrar por bloque.
  const [bloquesDe, setBloquesDe] = useState<Record<string, string[]>>({})
  const [filtroCat, setFiltroCat]       = useState<Set<string>>(new Set())
  const [filtroBloque, setFiltroBloque] = useState<Set<string>>(new Set())
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [fecha, setFecha]         = useState(() => fechaChile())
  const [hora, setHora]           = useState(() => horaChile())
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [enviados, setEnviados]   = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const [{ data: jugs }, { data: bloqs }, { data: bjs }] = await Promise.all([
        supabase.from('jugadores')
          .select('id,nombre,categoria')
          .eq('club_id', clubId).eq('estado', 'activo')
          .or('es_externo.is.null,es_externo.eq.false')
          .order('nombre'),
        db.from('bloques_horario').select('id,nombre').eq('club_id', clubId).eq('activo', true),
        db.from('bloque_jugadores').select('bloque_id,jugador_id'),
      ])
      if (!vivo) return

      setJugadores((jugs ?? []) as Jugador[])

      // Un mismo grupo tiene un bloque por día ("Todo Público" lunes, miércoles
      // y viernes son tres filas). Para filtrar interesa el grupo, no el día.
      const porNombre = new Map<string, string[]>()
      for (const b of (bloqs ?? []) as BloqueRef[]) {
        porNombre.set(b.nombre, [...(porNombre.get(b.nombre) ?? []), b.id])
      }
      setBloques([...porNombre.keys()].sort().map(nombre => ({ id: nombre, nombre })))

      const idANombre = new Map<string, string>()
      for (const [nombre, ids] of porNombre) for (const id of ids) idANombre.set(id, nombre)

      const deJugador: Record<string, string[]> = {}
      for (const bj of (bjs ?? []) as { bloque_id: string; jugador_id: string }[]) {
        const nombre = idANombre.get(bj.bloque_id)
        if (!nombre) continue // bloque de otro club o inactivo
        const previos = deJugador[bj.jugador_id] ?? []
        if (!previos.includes(nombre)) deJugador[bj.jugador_id] = [...previos, nombre]
      }
      setBloquesDe(deJugador)
    })()
    return () => { vivo = false }
  }, [clubId])

  function toggle(id: string) {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function guardar() {
    if (seleccion.size === 0 || !comentario.trim()) return
    setGuardando(true)
    setError('')
    const res = await crearFeedbackMasivo({ jugadorIds: [...seleccion], fecha, hora, comentario })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setEnviados(res.enviados ?? seleccion.size)
    onGuardado?.()
  }

  const categorias = [...new Set(jugadores.map(j => j.categoria).filter(Boolean))].sort() as string[]

  const filtrados = jugadores.filter(j => {
    if (busqueda && !j.nombre?.toLowerCase().includes(busqueda.toLowerCase())) return false
    if (filtroCat.size && !filtroCat.has(j.categoria ?? '')) return false
    if (filtroBloque.size && !(bloquesDe[j.id] ?? []).some(b => filtroBloque.has(b))) return false
    return true
  })
  const todosFiltradosSeleccionados = filtrados.length > 0 && filtrados.every(j => seleccion.has(j.id))

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22,
        width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>

        {enviados !== null ? (
          <>
            <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text, textAlign: 'center', marginBottom: 4 }}>
              Feedback enviado
            </div>
            <div style={{ fontSize: 12, color: muted, textAlign: 'center', marginBottom: 18 }}>
              Quedó registrado para {enviados} alumno{enviados === 1 ? '' : 's'}.
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

            <input
              style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 8 }}
              placeholder="Buscar alumno por nombre..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
            />

            {(categorias.length > 0 || bloques.length > 0) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {categorias.length > 0 && (
                  <FiltroMultiSelect label="🏷️ Categoría" options={categorias.map(c => ({ value: c, label: c }))}
                    selected={filtroCat} onChange={setFiltroCat} />
                )}
                {bloques.length > 0 && (
                  <FiltroMultiSelect label="🕐 Grupo" options={bloques.map(b => ({ value: b.id, label: b.nombre }))}
                    selected={filtroBloque} onChange={setFiltroBloque} />
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button onClick={() => setSeleccion(prev => {
                if (todosFiltradosSeleccionados) {
                  const next = new Set(prev)
                  for (const j of filtrados) next.delete(j.id)
                  return next
                }
                return new Set([...prev, ...filtrados.map(j => j.id)])
              })} disabled={filtrados.length === 0}
                style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 12, fontWeight: 600,
                  cursor: filtrados.length ? 'pointer' : 'default', padding: 0 }}>
                {todosFiltradosSeleccionados ? 'Deseleccionar todos' : `Seleccionar todos (${filtrados.length})`}
              </button>
              <span style={{ fontSize: 12, color: muted }}>{seleccion.size} seleccionado{seleccion.size === 1 ? '' : 's'}</span>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
              {filtrados.map((j, i) => (
                <div key={j.id} onClick={() => toggle(j.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
                    padding: '10px 12px', cursor: 'pointer', background: seleccion.has(j.id) ? '#eef2ff' : 'transparent',
                    borderBottom: i < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={seleccion.has(j.id)}
                      onClick={e => e.stopPropagation()} onChange={() => toggle(j.id)}
                      style={{ width: 15, height: 15, cursor: 'pointer' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{j.nombre}</span>
                  </span>
                  <span style={{ fontSize: 11, color: muted }}>{j.categoria ?? ''}</span>
                </div>
              ))}
              {filtrados.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 13 }}>Sin resultados</div>
              )}
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
              <button onClick={guardar} disabled={guardando || seleccion.size === 0 || !comentario.trim()}
                style={{ flex: 1, padding: 11, background: (seleccion.size && comentario.trim()) ? '#4f46e5' : '#e2e8f0', border: 'none',
                  borderRadius: 8, color: (seleccion.size && comentario.trim()) ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 600,
                  cursor: guardando || seleccion.size === 0 || !comentario.trim() ? 'default' : 'pointer' }}>
                {guardando ? 'Guardando...' : `Enviar a ${seleccion.size || ''} alumno${seleccion.size === 1 ? '' : 's'}`.trim()}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
