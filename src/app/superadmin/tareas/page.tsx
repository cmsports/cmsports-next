'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, CircleDashed, MessageSquare, Plus, Trash2, User } from 'lucide-react'
import { asignarTarea, borrarTarea, cambiarEstadoTarea, cambiarPorcentajeTarea, crearTarea, editarTextoTarea, listarTareas, type Tarea } from '@/app/actions/tareas'
import { borrarNota, crearNota, listarNotas, type Nota } from '@/app/actions/notas'
import { ESTADOS_TAREA, HORAS_VISIBLE_TRAS_HECHA, PERSONAS, horasHastaOcultar, type AsignadoA, type EstadoTarea } from '@/lib/domain/tareas'

const ESTILO_ESTADO: Record<EstadoTarea, { icono: typeof Circle; color: string; fondo: string }> = {
  sin_realizar: { icono: Circle, color: '#94a3b8', fondo: '#f8fafc' },
  parcial: { icono: CircleDashed, color: '#d97706', fondo: '#fffbeb' },
  hecho: { icono: CheckCircle2, color: '#16a34a', fondo: '#f0fdf4' },
}

const COLORES_PERSONA: Record<AsignadoA, string> = {
  luis: '#4f46e5',
  benjamin: '#0891b2',
}

export default function TareasPage() {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [cargando, setCargando] = useState(true)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null)
  const [filtroPersona, setFiltroPersona] = useState<AsignadoA | 'todos'>('todos')
  const [notas, setNotas] = useState<Nota[]>([])
  const [textoNota, setTextoNota] = useState('')
  const [autorNota, setAutorNota] = useState<AsignadoA>('luis')

  const cargar = useCallback(async () => {
    const [resTareas, resNotas] = await Promise.all([listarTareas(), listarNotas()])
    if (resTareas.error) setError(resTareas.error)
    else setTareas(resTareas.tareas ?? [])
    if (resNotas.error) setError(resNotas.error)
    else setNotas(resNotas.notas ?? [])
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
    setTareas(prev => prev.map(t => t.id === id ? { ...t, estado } : t))
    const res = await cambiarEstadoTarea({ id, estado })
    if (res.error) setError(res.error)
    await cargar()
  }

  async function cambiarPorcentaje(id: string, porcentaje: number) {
    setTareas(prev => prev.map(t => t.id === id ? { ...t, porcentaje } : t))
    const res = await cambiarPorcentajeTarea({ id, porcentaje })
    if (res.error) setError(res.error)
    await cargar()
  }

  async function cambiarAsignacion(id: string, valor: string) {
    const asignado = valor === '' ? null : valor
    setTareas(prev => prev.map(t => t.id === id ? { ...t, asignadoA: asignado as AsignadoA | null } : t))
    const res = await asignarTarea({ id, asignado_a: asignado })
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

  async function agregarNota() {
    const limpio = textoNota.trim()
    if (!limpio || guardando) return
    setGuardando(true)
    setError('')
    const res = await crearNota({ texto: limpio, autor: autorNota })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setTextoNota('')
    await cargar()
  }

  async function eliminarNota(id: string) {
    setNotas(prev => prev.filter(n => n.id !== id))
    const res = await borrarNota(id)
    if (res.error) setError(res.error)
    await cargar()
  }

  const tareasFiltradas = filtroPersona === 'todos'
    ? tareas
    : tareas.filter(t => t.asignadoA === filtroPersona)
  const pendientes = tareasFiltradas.filter(t => t.estado !== 'hecho').length

  return (
    <div style={{ maxWidth: 780 }}>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Tareas</h1>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>
          Lo que hay que hacer en CmSports. Lista compartida entre los superadmin. Al marcar una como hecha se queda {HORAS_VISIBLE_TRAS_HECHA} horas y después sale sola.
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

      {/* Filtro por persona */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button
          onClick={() => setFiltroPersona('todos')}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            border: '1px solid #e2e8f0',
            background: filtroPersona === 'todos' ? '#4f46e5' : '#fff',
            color: filtroPersona === 'todos' ? '#fff' : '#64748b',
          }}
        >
          Todos
        </button>
        {PERSONAS.map(p => (
          <button
            key={p.key}
            onClick={() => setFiltroPersona(p.key)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid #e2e8f0',
              background: filtroPersona === p.key ? COLORES_PERSONA[p.key] : '#fff',
              color: filtroPersona === p.key ? '#fff' : '#64748b',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {cargando && <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8', fontSize: 14 }}>Cargando tareas...</div>}

      {!cargando && tareasFiltradas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, border: '1px dashed #e2e8f0', borderRadius: 12 }}>
          <p style={{ fontSize: 15, color: '#64748b', margin: 0 }}>
            {filtroPersona === 'todos' ? 'No hay nada anotado todavía.' : `No hay tareas asignadas a ${PERSONAS.find(p => p.key === filtroPersona)?.label}.`}
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 0' }}>Escribe arriba lo primero que haya que hacer.</p>
        </div>
      )}

      {!cargando && tareasFiltradas.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
            {pendientes} pendiente{pendientes === 1 ? '' : 's'} de {tareasFiltradas.length} en la lista
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tareasFiltradas.map(t => {
              const estilo = ESTILO_ESTADO[t.estado]
              const Icono = estilo.icono
              const restan = horasHastaOcultar({ estado: t.estado, completada_en: t.completadaEn })
              const enEdicion = editando?.id === t.id

              return (
                <div key={t.id} style={{
                  padding: '10px 12px', background: estilo.fondo,
                  border: '1px solid #e2e8f0', borderRadius: 10,
                }}>
                  {/* Fila principal */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

                    {/* Asignar */}
                    <select
                      value={t.asignadoA ?? ''}
                      onChange={e => void cambiarAsignacion(t.id, e.target.value)}
                      aria-label={`Asignar: ${t.texto}`}
                      style={{
                        padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: 7,
                        fontSize: 11, color: t.asignadoA ? COLORES_PERSONA[t.asignadoA] : '#94a3b8',
                        background: '#fff', cursor: 'pointer', flexShrink: 0, maxWidth: 90,
                      }}
                    >
                      <option value="">Sin asignar</option>
                      {PERSONAS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>

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

                  {/* Barra de progreso */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <div style={{
                      flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${t.porcentaje}%`, height: '100%', borderRadius: 3,
                        background: t.porcentaje === 100 ? '#16a34a' : t.porcentaje > 0 ? '#d97706' : '#e2e8f0',
                        transition: 'width 0.2s',
                      }} />
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={t.porcentaje}
                      onChange={e => {
                        const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                        setTareas(prev => prev.map(x => x.id === t.id ? { ...x, porcentaje: v } : x))
                      }}
                      onBlur={() => void cambiarPorcentaje(t.id, t.porcentaje)}
                      onKeyDown={e => { if (e.key === 'Enter') void cambiarPorcentaje(t.id, t.porcentaje) }}
                      aria-label={`Porcentaje de: ${t.texto}`}
                      style={{
                        width: 48, padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 5,
                        fontSize: 11, textAlign: 'center', color: '#64748b', background: '#fff',
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Notas ── */}
      <div style={{ marginTop: 40, borderTop: '1px solid #e2e8f0', paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <MessageSquare size={18} color="#64748b" />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', margin: 0 }}>Notas</h2>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
          Avisos rápidos entre los dos. Se pegan, se leen, se borran.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select
            value={autorNota}
            onChange={e => setAutorNota(e.target.value as AsignadoA)}
            style={{
              padding: '10px 8px', border: '1px solid #e2e8f0', borderRadius: 9,
              fontSize: 13, color: COLORES_PERSONA[autorNota], background: '#fff', cursor: 'pointer',
            }}
          >
            {PERSONAS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <input
            value={textoNota}
            onChange={e => setTextoNota(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void agregarNota() }}
            placeholder="Deja una nota…"
            maxLength={500}
            style={{
              flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid #e2e8f0',
              borderRadius: 9, fontSize: 14, color: '#0f172a', background: '#fff',
            }}
          />
          <button
            onClick={() => void agregarNota()}
            disabled={!textoNota.trim() || guardando}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              background: !textoNota.trim() || guardando ? '#e2e8f0' : '#4f46e5',
              color: !textoNota.trim() || guardando ? '#94a3b8' : '#fff',
              border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600,
              cursor: !textoNota.trim() || guardando ? 'default' : 'pointer', flexShrink: 0,
            }}
          >
            <Plus size={16} /> Pegar
          </button>
        </div>

        {!cargando && notas.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, border: '1px dashed #e2e8f0', borderRadius: 12 }}>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Sin notas por ahora.</p>
          </div>
        )}

        {notas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notas.map(n => (
              <div key={n.id} style={{
                padding: '10px 12px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 10,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: COLORES_PERSONA[n.autor],
                  padding: '2px 8px', background: '#fff', border: `1px solid ${COLORES_PERSONA[n.autor]}30`,
                  borderRadius: 5, flexShrink: 0, marginTop: 1,
                }}>
                  {PERSONAS.find(p => p.key === n.autor)?.label}
                </span>
                <span style={{ flex: 1, fontSize: 14, color: '#0f172a', whiteSpace: 'pre-wrap' }}>
                  {n.texto}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, marginTop: 3 }}>
                  {new Date(n.creadaEn).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => void eliminarNota(n.id)}
                  aria-label={`Borrar nota de ${n.autor}`}
                  title="Borrar nota"
                  style={{
                    display: 'flex', alignItems: 'center', padding: 6, background: 'none',
                    border: 'none', color: '#cbd5e1', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
