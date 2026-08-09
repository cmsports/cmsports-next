'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { crearFeedback, editarFeedback, eliminarFeedback } from '@/app/actions/feedback'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'
import FiltroMultiSelect from '@/components/FiltroMultiSelect'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Jugador = { id: string; nombre: string; categoria: string | null }
type BloqueRef = { id: string; nombre: string }
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
  // Cuántos feedbacks tiene cada uno. Se trae en una consulta para todo el
  // club, no una por jugador: sin esto había que entrar a cada ficha para
  // descubrir quién estaba sin atender, que es justo lo que se quería ver.
  const [conteos, setConteos]     = useState<Record<string, number>>({})
  const [bloques, setBloques]     = useState<BloqueRef[]>([])
  // jugador → bloques a los que va, para poder filtrar por grupo.
  const [bloquesDe, setBloquesDe] = useState<Record<string, string[]>>({})
  const [filtroCat, setFiltroCat]       = useState<Set<string>>(new Set())
  const [filtroBloque, setFiltroBloque] = useState<Set<string>>(new Set())
  const [soloSinFeedback, setSoloSinFeedback] = useState(false)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const [{ data: jugs }, { data: fbs }, { data: bloqs }, { data: bjs }] = await Promise.all([
        supabase.from('jugadores')
          .select('id,nombre,categoria')
          .eq('club_id', clubId).eq('estado', 'activo')
          .or('es_externo.is.null,es_externo.eq.false')
          .order('nombre'),
        // Solo el jugador_id: alcanza para contar y evita traerse todos los
        // comentarios del club para nada.
        db.from('feedback_jugadores').select('jugador_id').eq('club_id', clubId),
        db.from('bloques_horario').select('id,nombre').eq('club_id', clubId).eq('activo', true),
        db.from('bloque_jugadores').select('bloque_id,jugador_id'),
      ])
      if (!vivo) return

      setJugadores((jugs ?? []) as Jugador[])

      const cuenta: Record<string, number> = {}
      for (const f of (fbs ?? []) as { jugador_id: string }[]) {
        cuenta[f.jugador_id] = (cuenta[f.jugador_id] ?? 0) + 1
      }
      setConteos(cuenta)

      // Un mismo grupo tiene un bloque por día ("Todo Público" lunes, miércoles
      // y viernes son tres filas). Para filtrar interesa el grupo, no el día,
      // así que se juntan por nombre.
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

  const categorias = [...new Set(jugadores.map(j => j.categoria).filter(Boolean))].sort() as string[]

  const filtrados = jugadores.filter(j => {
    if (busqueda && !j.nombre?.toLowerCase().includes(busqueda.toLowerCase())) return false
    if (filtroCat.size && !filtroCat.has(j.categoria ?? '')) return false
    if (filtroBloque.size && !(bloquesDe[j.id] ?? []).some(b => filtroBloque.has(b))) return false
    if (soloSinFeedback && (conteos[j.id] ?? 0) > 0) return false
    return true
  })

  const conFeedback = filtrados.filter(j => (conteos[j.id] ?? 0) > 0).length
  const sinFeedback = filtrados.length - conFeedback

  /** Verde si ya tiene varios, azul si recién arranca, gris apagado si ninguno. */
  function estiloConteo(n: number) {
    if (n === 0) return { bg: '#f1f5f9', fg: '#94a3b8' }
    if (n < 3)   return { bg: '#eff6ff', fg: '#2563eb' }
    return { bg: '#f0fdf4', fg: '#16a34a' }
  }

  function limpiarFiltros() {
    setFiltroCat(new Set())
    setFiltroBloque(new Set())
    setSoloSinFeedback(false)
    setBusqueda('')
  }

  const hayFiltros = filtroCat.size > 0 || filtroBloque.size > 0 || soloSinFeedback || !!busqueda

  // ── Lista de jugadores ──────────────────────────────────────────────────
  if (!elegido) {
    return (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 4 }}>💬 Elegí un alumno</div>
        <div style={{ fontSize: 12, color: hint, marginBottom: 12 }}>
          El número al lado del nombre es cuántos feedbacks tiene. Los que están en gris todavía no tienen ninguno.
        </div>

        {/* Resumen: lo primero que se quiere saber es a cuántos falta atender */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '9px 12px' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{conFeedback}</div>
            <div style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>✅ CON FEEDBACK</div>
          </div>
          <div style={{ flex: '1 1 120px', background: sinFeedback > 0 ? '#fff7ed' : '#f8fafc',
            border: `1px solid ${sinFeedback > 0 ? '#fed7aa' : '#e2e8f0'}`, borderRadius: 10, padding: '9px 12px' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: sinFeedback > 0 ? '#c2410c' : hint, fontVariantNumeric: 'tabular-nums' }}>{sinFeedback}</div>
            <div style={{ fontSize: 10, color: sinFeedback > 0 ? '#9a3412' : hint, fontWeight: 600 }}>⏳ SIN FEEDBACK</div>
          </div>
        </div>

        <input
          style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 10 }}
          placeholder="🔍 Buscar por nombre..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
        />

        {/* Filtros. Sin ninguno seleccionado se ve el club entero. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {categorias.length > 0 && (
            <FiltroMultiSelect label="🏷️ Categoría" options={categorias.map(c => ({ value: c, label: c }))}
              selected={filtroCat} onChange={setFiltroCat} />
          )}
          {bloques.length > 0 && (
            <FiltroMultiSelect label="🕐 Grupo" options={bloques.map(b => ({ value: b.id, label: b.nombre }))}
              selected={filtroBloque} onChange={setFiltroBloque} />
          )}
          <button onClick={() => setSoloSinFeedback(v => !v)}
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${soloSinFeedback ? '#fed7aa' : '#e2e8f0'}`,
              background: soloSinFeedback ? '#fff7ed' : '#fff',
              color: soloSinFeedback ? '#c2410c' : muted }}>
            ⏳ Solo sin feedback
          </button>
          {hayFiltros && (
            <button onClick={limpiarFiltros}
              style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 4px' }}>
              Limpiar
            </button>
          )}
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 520, overflowY: 'auto' }}>
          {filtrados.map((j, i) => {
            const n = conteos[j.id] ?? 0
            const c = estiloConteo(n)
            return (
              <div key={j.id} onClick={() => setElegido(j)}
                style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', cursor: 'pointer',
                  borderBottom: i < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ minWidth: 34, textAlign: 'center', background: c.bg, color: c.fg,
                  borderRadius: 20, padding: '3px 8px', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {n}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: n === 0 ? muted : text }}>{j.nombre}</span>
                <span style={{ fontSize: 11, color: hint, textAlign: 'right' }}>
                  {j.categoria ?? ''}
                  {(bloquesDe[j.id]?.length ?? 0) > 0 && (
                    <span style={{ display: 'block', fontSize: 10 }}>{bloquesDe[j.id].join(' · ')}</span>
                  )}
                </span>
              </div>
            )
          })}
          {filtrados.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: hint, fontSize: 13 }}>
              {hayFiltros ? '🔍 Ningún alumno con esos filtros' : 'Todavía no hay alumnos activos'}
            </div>
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
