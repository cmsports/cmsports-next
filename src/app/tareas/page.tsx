'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, CircleDashed, Plus, Trash2 } from 'lucide-react'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { borrarTarea, cambiarEstadoTarea, crearTarea, editarTextoTarea, listarTareas, type Tarea } from '@/app/actions/tareas'
import { ESTADOS_TAREA, HORAS_VISIBLE_TRAS_HECHA, horasHastaOcultar, type EstadoTarea } from '@/lib/domain/tareas'

// El ícono y el color dicen el estado de un vistazo; el selector de al lado lo
// cambia. Los tres colores son los del tema (--text-muted, --yellow, --green).
const ESTILO_ESTADO: Record<EstadoTarea, { icono: typeof Circle; color: string; fondo: string }> = {
  sin_realizar: { icono: Circle, color: '#94a3b8', fondo: '#f8fafc' },
  parcial: { icono: CircleDashed, color: '#d97706', fondo: '#fffbeb' },
  hecho: { icono: CheckCircle2, color: '#16a34a', fondo: '#f0fdf4' },
}

export default function TareasPage() {
  const { perfil } = usePerfil()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [cargando, setCargando] = useState(true)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const res = await listarTareas()
    if (res.error) setError(res.error)
    else setTareas(res.tareas ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function agregar() {
    const limpio = texto.trim()
    if (!limpio || guardando) return
    setGuardando(true)
    setError('')
    const res = await crearTarea(limpio)
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setTexto('')
    await cargar()
  }

  async function cambiarEstado(id: string, estado: EstadoTarea) {
    // Optimista: el selector responde al tiro y la fila se recolorea sola.
    // Si el servidor rechaza, `cargar()` devuelve la lista real.
    setTareas(prev => prev.map(t => t.id === id ? { ...t, estado } : t))
    const res = await cambiarEstadoTarea({ id, estado })
    if (res.error) setError(res.error)
    await cargar()
  }

  async function guardarTexto() {
    if (!editando) return
    const limpio = editando.texto.trim()
    const original = tareas.find(t => t.id === editando.id)?.texto
    setEditando(null)
    if (!limpio || limpio === original) return
    const res = await editarTextoTarea({ id: editando.id, texto: limpio })
    if (res.error) setError(res.error)
    await cargar()
  }

  async function borrar(id: string) {
    setTareas(prev => prev.filter(t => t.id !== id))
    const res = await borrarTarea(id)
    if (res.error) setError(res.error)
    await cargar()
  }

  const pendientes = tareas.filter(t => t.estado !== 'hecho').length

  return (
    <AppLayout perfil={perfil ?? null}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Tareas</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Lo que hay que hacer en el club. Al marcar una como hecha se queda {HORAS_VISIBLE_TRAS_HECHA} horas y después sale sola de la lista.
          </p>
        </div>

        {/* Agregar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void agregar() }}
            placeholder="Anota algo por hacer…"
            maxLength={300}
            style={{
              flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid #e2e8f0',
              borderRadius: 9, fontSize: 14, color: '#0f172a', background: '#fff',
            }}
          />
          <button
            onClick={() => void agregar()}
            disabled={!texto.trim() || guardando}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              background: !texto.trim() || guardando ? '#e2e8f0' : '#4f46e5',
              color: !texto.trim() || guardando ? '#94a3b8' : '#fff',
              border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600,
              cursor: !texto.trim() || guardando ? 'default' : 'pointer', flexShrink: 0,
            }}
          >
            <Plus size={16} /> Agregar
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        {cargando && <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8', fontSize: 14 }}>Cargando tareas...</div>}

        {!cargando && tareas.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, border: '1px dashed #e2e8f0', borderRadius: 12 }}>
            <p style={{ fontSize: 15, color: '#64748b', margin: 0 }}>No hay nada anotado todavía.</p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 0' }}>Escribe arriba lo primero que haya que hacer.</p>
          </div>
        )}

        {!cargando && tareas.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              {pendientes} pendiente{pendientes === 1 ? '' : 's'} de {tareas.length} en la lista
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tareas.map(t => {
                const estilo = ESTILO_ESTADO[t.estado]
                const Icono = estilo.icono
                const restan = horasHastaOcultar({ estado: t.estado, completada_en: t.completadaEn })
                const enEdicion = editando?.id === t.id

                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: estilo.fondo, border: '1px solid #e2e8f0', borderRadius: 10,
                  }}>
                    <Icono size={18} color={estilo.color} style={{ flexShrink: 0 }} />

                    {enEdicion ? (
                      <input
                        autoFocus
                        value={editando.texto}
                        onChange={e => setEditando({ id: t.id, texto: e.target.value })}
                        onBlur={() => void guardarTexto()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') void guardarTexto()
                          if (e.key === 'Escape') setEditando(null)
                        }}
                        maxLength={300}
                        style={{ flex: 1, minWidth: 0, padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 }}
                      />
                    ) : (
                      <button
                        onClick={() => setEditando({ id: t.id, texto: t.texto })}
                        title="Editar"
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                          padding: 0, cursor: 'text', fontSize: 14, fontFamily: 'inherit',
                          color: t.estado === 'hecho' ? '#94a3b8' : '#0f172a',
                          textDecoration: t.estado === 'hecho' ? 'line-through' : 'none',
                        }}
                      >
                        {t.texto}
                      </button>
                    )}

                    {restan !== null && (
                      <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }} title="Después sale sola de la lista">
                        sale en {restan} h
                      </span>
                    )}

                    <select
                      value={t.estado}
                      onChange={e => void cambiarEstado(t.id, e.target.value as EstadoTarea)}
                      aria-label={`Estado de: ${t.texto}`}
                      style={{
                        padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: 7,
                        fontSize: 12, color: estilo.color, background: '#fff', cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      {ESTADOS_TAREA.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                    </select>

                    <button
                      onClick={() => void borrar(t.id)}
                      aria-label={`Borrar: ${t.texto}`}
                      title="Borrar"
                      style={{
                        display: 'flex', alignItems: 'center', padding: 6, background: 'none',
                        border: 'none', color: '#cbd5e1', cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
