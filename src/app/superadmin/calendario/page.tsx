'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calendar, Check, Edit3, Plus, Trash2, X } from 'lucide-react'
import {
  borrarActividad, crearActividad, editarActividad, listarActividades,
  toggleActividad, type Actividad,
} from '@/app/actions/actividades-superadmin'
import { fechaChile } from '@/lib/domain/fechaChile'

const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// ponytail: fechaChile() ya resuelve la zona; el mes/año salen del mismo string
const hoy = fechaChile

function mesAnioDeHoy() {
  const [a, m] = hoy().split('-').map(Number)
  return { mes: m - 1, anio: a }
}

export default function CalendarioSuperadminPage() {
  const ahora = mesAnioDeHoy()
  const [mes, setMes] = useState(ahora.mes)
  const [anio, setAnio] = useState(ahora.anio)
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(hoy())
  const [modal, setModal] = useState<'crear' | 'editar' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ titulo: '', nota: '', fecha: '', hora: '' })

  const cargar = useCallback(async () => {
    const desde = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
    const ultimoDia = new Date(anio, mes + 1, 0).getDate()
    const hasta = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
    const res = await listarActividades({ desde, hasta })
    if (res.error) setError(res.error)
    else setActividades(res.actividades ?? [])
    setCargando(false)
  }, [anio, mes])

  useEffect(() => { void cargar() }, [cargar])

  function cambiarMes(dir: number) {
    let m = mes + dir, a = anio
    if (m > 11) { m = 0; a++ }
    if (m < 0) { m = 11; a-- }
    setMes(m)
    setAnio(a)
  }

  function abrirCrear() {
    setForm({ titulo: '', nota: '', fecha: diaSeleccionado || hoy(), hora: '' })
    setEditId(null)
    setModal('crear')
  }

  function abrirEditar(a: Actividad) {
    setForm({ titulo: a.titulo, nota: a.nota || '', fecha: a.fecha, hora: a.hora || '' })
    setEditId(a.id)
    setModal('editar')
  }

  async function guardar() {
    setError('')
    if (modal === 'crear') {
      const res = await crearActividad({
        titulo: form.titulo, nota: form.nota || null,
        fecha: form.fecha, hora: form.hora || null,
      })
      if (res.error) { setError(res.error); return }
    } else if (modal === 'editar' && editId) {
      const res = await editarActividad({
        id: editId, titulo: form.titulo, nota: form.nota || null,
        fecha: form.fecha, hora: form.hora || null,
      })
      if (res.error) { setError(res.error); return }
    }
    setModal(null)
    await cargar()
  }

  async function borrar(id: string) {
    setActividades(prev => prev.filter(a => a.id !== id))
    const res = await borrarActividad(id)
    if (res.error) setError(res.error)
    await cargar()
  }

  async function toggleCheck(id: string, completada: boolean) {
    setActividades(prev => prev.map(a => a.id === id ? { ...a, completada } : a))
    const res = await toggleActividad(id, completada)
    if (res.error) setError(res.error)
    await cargar()
  }

  // Calendario: lunes = primer día
  const primerDiaJS = new Date(anio, mes, 1).getDay() // 0=dom
  const primerDia = primerDiaJS === 0 ? 6 : primerDiaJS - 1 // 0=lun
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const hoyStr = hoy()

  const actividadesPorDia: Record<string, Actividad[]> = {}
  actividades.forEach(a => {
    if (!actividadesPorDia[a.fecha]) actividadesPorDia[a.fecha] = []
    actividadesPorDia[a.fecha].push(a)
  })

  const itemsDelDia = diaSeleccionado ? (actividadesPorDia[diaSeleccionado] || []) : []

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Calendario</h1>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>
          Reuniones, actividades y recordatorios del equipo CmSports.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Navegación mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => cambiarMes(-1)} style={{
          padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
          background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 16,
        }}>◀</button>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', minWidth: 180, textAlign: 'center' }}>
          {meses[mes]} {anio}
        </span>
        <button onClick={() => cambiarMes(1)} style={{
          padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
          background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 16,
        }}>▶</button>
        <button onClick={() => { const h = mesAnioDeHoy(); setMes(h.mes); setAnio(h.anio); setDiaSeleccionado(hoy()) }} style={{
          padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
          background: '#fff', color: '#4f46e5', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginLeft: 'auto',
        }}>
          Hoy
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: diaSeleccionado ? '1fr 320px' : '1fr', gap: 16 }}>
        {/* Grilla del calendario */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e2e8f0' }}>
            {diasSemana.map(d => (
              <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, color: '#64748b', fontWeight: 600 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: primerDia }).map((_, i) => (
              <div key={`e-${i}`} style={{ minHeight: 64, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }} />
            ))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia = i + 1
              const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
              const esHoy = fecha === hoyStr
              const items = actividadesPorDia[fecha] || []
              const sel = diaSeleccionado === fecha
              const completadas = items.filter(a => a.completada).length
              return (
                <div key={dia} onClick={() => setDiaSeleccionado(sel ? null : fecha)} style={{
                  minHeight: 64, padding: 4, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer', background: sel ? '#ede9fe' : 'transparent',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: esHoy ? 700 : 400,
                    background: esHoy ? '#4f46e5' : 'transparent', color: esHoy ? '#fff' : sel ? '#3730a3' : '#0f172a',
                    marginBottom: 2,
                  }}>
                    {dia}
                  </div>
                  {items.length > 0 && (
                    <div style={{ fontSize: 9, color: completadas === items.length ? '#16a34a' : '#4f46e5', fontWeight: 500 }}>
                      {items.length} {items.length === 1 ? 'act.' : 'acts.'}
                      {completadas > 0 && ` (${completadas}✓)`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Panel lateral */}
        {diaSeleccionado && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                {new Date(diaSeleccionado + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <button onClick={() => setDiaSeleccionado(null)} style={{
                background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16,
              }}>
                <X size={16} />
              </button>
            </div>

            {cargando && <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>Cargando...</div>}

            {!cargando && itemsDelDia.length === 0 && (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Sin actividades este día</p>
            )}

            {itemsDelDia.map(a => (
              <div key={a.id} style={{
                background: a.completada ? '#f0fdf4' : '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8,
                borderLeft: `3px solid ${a.completada ? '#16a34a' : '#4f46e5'}`,
                opacity: a.completada ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <button
                    onClick={() => void toggleCheck(a.id, !a.completada)}
                    title={a.completada ? 'Desmarcar' : 'Marcar como hecha'}
                    style={{
                      display: 'flex', alignItems: 'center', padding: 2, background: 'none', border: 'none',
                      color: a.completada ? '#16a34a' : '#cbd5e1', cursor: 'pointer', flexShrink: 0, marginTop: 1,
                    }}
                  >
                    <Check size={16} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: '#0f172a',
                      textDecoration: a.completada ? 'line-through' : 'none',
                    }}>
                      {a.titulo}
                    </div>
                    {a.hora && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{a.hora.slice(0, 5)}</div>}
                    {a.nota && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.nota}</div>}
                  </div>
                  <button onClick={() => abrirEditar(a)} title="Editar" style={{
                    display: 'flex', alignItems: 'center', padding: 4, background: 'none',
                    border: 'none', color: '#94a3b8', cursor: 'pointer', flexShrink: 0,
                  }}>
                    <Edit3 size={13} />
                  </button>
                  <button onClick={() => void borrar(a.id)} title="Borrar" style={{
                    display: 'flex', alignItems: 'center', padding: 4, background: 'none',
                    border: 'none', color: '#cbd5e1', cursor: 'pointer', flexShrink: 0,
                  }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            <button onClick={abrirCrear} style={{
              width: '100%', padding: 10, background: '#4f46e5', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Plus size={14} /> Agregar actividad
            </button>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 18 }}>
              {modal === 'crear' ? 'Nueva actividad' : 'Editar actividad'}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Título</label>
              <input
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Reunión, tarea, recordatorio…"
                maxLength={200}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a', background: '#f8fafc' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Fecha</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a', background: '#f8fafc' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Hora (opc.)</label>
                <input
                  type="time"
                  value={form.hora}
                  onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a', background: '#f8fafc' }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Nota (opcional)</label>
              <textarea
                value={form.nota}
                onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
                placeholder="Detalles, links, lo que sea…"
                rows={3}
                maxLength={1000}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a', background: '#f8fafc', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{
                flex: 1, padding: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                color: '#64748b', fontSize: 14, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={() => void guardar()} disabled={!form.titulo.trim() || !form.fecha} style={{
                flex: 1, padding: 10, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: !form.titulo.trim() || !form.fecha ? '#e2e8f0' : '#4f46e5',
                color: !form.titulo.trim() || !form.fecha ? '#94a3b8' : '#fff',
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
