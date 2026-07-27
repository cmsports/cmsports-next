'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import { Pencil, Plus, Trash2, X, Clock, MapPin } from 'lucide-react'
import { crearBloque, editarBloque, eliminarBloque } from '@/app/actions/horario'
import { DIAS, franjasDe, hhmm, horasSemanales, rangoHorario, type BloqueHorario } from '@/lib/domain/horario'
import { SEDES, sedeLabel } from '@/lib/domain/sedeGrupo'
import PanelCupos from '@/components/PanelCupos'
import PanelReportes from '@/components/PanelReportes'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Profesor = { id: string; nombre: string }
type Bloque = BloqueHorario & { profesorIds: string[] }

const FORM_VACIO = {
  nombre: '', sede: 'buin', dia_semana: 'lun',
  hora_inicio: '', hora_fin: '',
  cupo_maximo: '12', cupo_libres: '5',
  profesorIds: [] as string[],
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const,
  background: '#f4f7fa', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', color: text,
}
const labelStyle = { fontSize: 11, color: muted, display: 'block' as const, marginBottom: 4, fontWeight: 600 }

// Un color por grupo para reconocer el bloque de un vistazo en la grilla.
const COLORES = ['#ede9fe', '#ecfdf5', '#eff6ff', '#fff7ed', '#fef2f2', '#f0fdfa']
const COLORES_TEXTO = ['#5b21b6', '#065f46', '#1d4ed8', '#c2410c', '#b91c1c', '#0f766e']

function colorDe(nombre: string) {
  let suma = 0
  for (const c of nombre) suma += c.charCodeAt(0)
  const i = suma % COLORES.length
  return { bg: COLORES[i], fg: COLORES_TEXTO[i] }
}

export default function HorarioPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [bloques, setBloques]       = useState<Bloque[]>([])
  const [profesores, setProfesores] = useState<Profesor[]>([])
  const [cargando, setCargando]     = useState(true)
  const [sedeActiva, setSedeActiva] = useState('buin')
  const [tab, setTab]               = useState<'grilla' | 'cupos' | 'profesores' | 'reportes'>('grilla')
  const [modal, setModal]           = useState<null | 'nuevo' | Bloque>(null)
  const [form, setForm]             = useState(FORM_VACIO)
  const [guardando, setGuardando]   = useState(false)
  const [errorForm, setErrorForm]   = useState('')
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const clubId = perfil?.club_id ?? null
  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'superadmin' || perfil?.rol === 'profesor'

  const cargar = useCallback(async (cid: string) => {
    const [{ data: bloquesData }, { data: profesoresData }, { data: rel }] = await Promise.all([
      supabase.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,cupo_libres,activo')
        .eq('club_id', cid).eq('activo', true)
        .order('hora_inicio'),
      supabase.from('profesores').select('id,nombre').eq('club_id', cid).eq('activo', true).order('nombre'),
      supabase.from('bloque_profesores').select('bloque_id,profesor_id'),
    ])

    const porBloque = new Map<string, string[]>()
    for (const r of rel ?? []) {
      porBloque.set(r.bloque_id, [...(porBloque.get(r.bloque_id) ?? []), r.profesor_id])
    }

    setBloques(((bloquesData ?? []) as BloqueHorario[]).map(b => ({ ...b, profesorIds: porBloque.get(b.id) ?? [] })))
    setProfesores((profesoresData ?? []) as Profesor[])
    setCargando(false)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) { setCargando(false); return }
    void cargar(perfil.club_id)
  }, [authLoading, perfil, router, cargar])

  function abrirNuevo(sede: string, dia?: string, hora?: string) {
    setForm({ ...FORM_VACIO, sede, dia_semana: dia ?? 'lun', hora_inicio: hora ?? '',
      cupo_maximo: sede === 'paine' ? '30' : '12' })
    setErrorForm('')
    setModal('nuevo')
  }

  function abrirEditar(b: Bloque) {
    setForm({
      nombre: b.nombre, sede: b.sede, dia_semana: b.dia_semana,
      hora_inicio: hhmm(b.hora_inicio), hora_fin: hhmm(b.hora_fin),
      cupo_maximo: String(b.cupo_maximo), cupo_libres: String(b.cupo_libres),
      profesorIds: b.profesorIds,
    })
    setErrorForm('')
    setModal(b)
  }

  async function guardar() {
    setGuardando(true)
    setErrorForm('')
    const datos = {
      nombre: form.nombre, sede: form.sede, dia_semana: form.dia_semana,
      hora_inicio: form.hora_inicio, hora_fin: form.hora_fin,
      cupo_maximo: parseInt(form.cupo_maximo) || 0,
      cupo_libres: parseInt(form.cupo_libres) || 0,
      profesorIds: form.profesorIds,
    }
    const res = modal === 'nuevo'
      ? await crearBloque(datos)
      : await editarBloque({ id: (modal as Bloque).id, ...datos })
    setGuardando(false)
    if (res?.error) { setErrorForm(String(res.error)); return }
    setModal(null)
    if (clubId) void cargar(clubId)
  }

  async function eliminar(b: Bloque) {
    if (!confirm(`¿Eliminar el bloque "${b.nombre}" del ${b.dia_semana}?\n\nLas clases ya generadas se conservan.`)) return
    setEliminandoId(b.id)
    const res = await eliminarBloque({ id: b.id })
    setEliminandoId(null)
    if (res?.error) { alert(res.error); return }
    if (clubId) void cargar(clubId)
  }

  const bloquesSede = bloques.filter(b => b.sede === sedeActiva)
  const franjas = franjasDe(bloquesSede)
  const nombreProfesor = (id: string) => profesores.find(p => p.id === id)?.nombre ?? ''

  if (authLoading || cargando) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!perfil) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: text, margin: 0 }}>Horario semanal</h1>
          <p style={{ fontSize: 12, color: hint, marginTop: 2 }}>
            La plantilla fija del club. Desde acá se generan las clases de cada semana.
          </p>
        </div>
        {esStaff && tab === 'grilla' && (
          <button onClick={() => abrirNuevo(sedeActiva)}
            style={{ background: '#f43f5e', color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nuevo bloque
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 10, padding: 4, margin: '16px 0' }}>
        {([['grilla', 'Grilla semanal'], ['cupos', 'Cupos'], ['profesores', 'Profesores'], ['reportes', 'Reportes']] as const).map(([key, label]) => (
          <div key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: 9, textAlign: 'center', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: tab === key ? '#fff' : 'transparent', color: tab === key ? '#3730a3' : muted,
              boxShadow: tab === key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {label}
          </div>
        ))}
      </div>

      {tab === 'grilla' && (
        <>
          {/* Sedes */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {SEDES.filter(s => s.value !== 'ambos').map(s => {
              const activa = sedeActiva === s.value
              const cuantos = bloques.filter(b => b.sede === s.value).length
              return (
                <button key={s.value} onClick={() => setSedeActiva(s.value)}
                  style={{ background: activa ? '#4f46e5' : '#f4f7fa', color: activa ? '#fff' : muted,
                    border: `1px solid ${activa ? '#4f46e5' : '#e2e8f0'}`, borderRadius: 8, padding: '8px 14px',
                    fontSize: 13, fontWeight: activa ? 600 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} /> {s.label}
                  <span style={{ background: activa ? 'rgba(255,255,255,0.22)' : '#e2e8f0', borderRadius: 20, padding: '1px 7px', fontSize: 11 }}>{cuantos}</span>
                </button>
              )
            })}
          </div>

          {/* Grilla */}
          {franjas.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
              Sin bloques en {sedeLabel(sedeActiva)}.
              {esStaff && <> Usá <strong>Nuevo bloque</strong> para crear el primero.</>}
            </div>
          ) : (
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', width: 92 }}>Hora</th>
                      {DIAS.map(d => (
                        <th key={d.value} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {franjas.map(franja => (
                      <tr key={franja} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: text, fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          {franja}
                        </td>
                        {DIAS.map(d => {
                          const b = bloquesSede.find(x => hhmm(x.hora_inicio) === franja && x.dia_semana === d.value)
                          if (!b) return (
                            <td key={d.value} style={{ padding: 6, verticalAlign: 'top' }}>
                              {esStaff && (
                                <button onClick={() => abrirNuevo(sedeActiva, d.value, franja)} title="Agregar bloque"
                                  style={{ width: '100%', minHeight: 58, background: 'transparent', border: '1px dashed #e2e8f0', borderRadius: 8, color: '#cbd5e1', fontSize: 18, cursor: 'pointer' }}>
                                  +
                                </button>
                              )}
                            </td>
                          )
                          const c = colorDe(b.nombre)
                          return (
                            <td key={d.value} style={{ padding: 6, verticalAlign: 'top' }}>
                              <div style={{ background: c.bg, borderRadius: 8, padding: '8px 10px', minHeight: 58, position: 'relative' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: c.fg, lineHeight: 1.3, paddingRight: esStaff ? 38 : 0 }}>
                                  {b.nombre}
                                </div>
                                <div style={{ fontSize: 10, color: muted, marginTop: 3 }}>{rangoHorario(b.hora_inicio, b.hora_fin)}</div>
                                {b.profesorIds.length > 0 && (
                                  <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                                    {b.profesorIds.map(nombreProfesor).filter(Boolean).join(' + ')}
                                  </div>
                                )}
                                <div style={{ fontSize: 10, color: hint, marginTop: 2 }}>
                                  {b.cupo_maximo} cupos{b.cupo_libres > 0 ? ` + ${b.cupo_libres} libres` : ''}
                                </div>
                                {esStaff && (
                                  <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 3 }}>
                                    <button onClick={() => abrirEditar(b)} title="Editar"
                                      style={{ background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 5, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                      <Pencil size={11} color={muted} />
                                    </button>
                                    <button onClick={() => eliminar(b)} disabled={eliminandoId === b.id} title="Eliminar"
                                      style={{ background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 5, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: eliminandoId === b.id ? 0.4 : 1 }}>
                                      <Trash2 size={11} color="#dc2626" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cupos */}
      {tab === 'cupos' && clubId && <PanelCupos clubId={clubId} esStaff={esStaff} />}

      {tab === 'reportes' && clubId && <PanelReportes clubId={clubId} />}

      {/* Profesores */}
      {tab === 'profesores' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {profesores.length === 0 && (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
              No hay profesores cargados. Se crean desde Configuración.
            </div>
          )}
          {profesores.map(p => {
            const suyos = bloques.filter(b => b.profesorIds.includes(p.id))
            const horas = horasSemanales(suyos)
            const sedes = [...new Set(suyos.map(b => b.sede))]
            return (
              <div key={p.id} style={{ ...card, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> {horas} h/semana
                    </span>
                    <span>{suyos.length} bloque{suyos.length !== 1 ? 's' : ''}</span>
                    {sedes.length > 0 && <span>{sedes.map(sedeLabel).join(' · ')}</span>}
                  </div>
                </div>
                {suyos.length === 0 ? (
                  <div style={{ padding: '18px', fontSize: 12, color: hint, textAlign: 'center' }}>Sin bloques asignados</div>
                ) : (
                  DIAS.filter(d => suyos.some(b => b.dia_semana === d.value)).map(d => (
                    <div key={d.value} style={{ padding: '9px 18px', borderBottom: '1px solid #f8fafc' }}>
                      <div style={{ fontSize: 10, color: hint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{d.label}</div>
                      {suyos.filter(b => b.dia_semana === d.value)
                        .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)))
                        .map(b => (
                          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: text, padding: '2px 0' }}>
                            <span>{b.nombre}</span>
                            <span style={{ color: muted, whiteSpace: 'nowrap' }}>
                              {rangoHorario(b.hora_inicio, b.hora_fin)} · {sedeLabel(b.sede).split(' ')[0]}
                            </span>
                          </div>
                        ))}
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal bloque */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0 }}>
                {modal === 'nuevo' ? 'Nuevo bloque' : 'Editar bloque'}
              </h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nombre del bloque *</label>
              <input style={inputStyle} value={form.nombre} placeholder="Ej: Menores Avanzado"
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Sede</label>
                <select style={inputStyle} value={form.sede} onChange={e => setForm(f => ({ ...f, sede: e.target.value }))}>
                  {SEDES.filter(s => s.value !== 'ambos').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Día</label>
                <select style={inputStyle} value={form.dia_semana} onChange={e => setForm(f => ({ ...f, dia_semana: e.target.value }))}>
                  {DIAS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Hora inicio *</label>
                <input type="time" style={inputStyle} value={form.hora_inicio}
                  onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Hora fin *</label>
                <input type="time" style={inputStyle} value={form.hora_fin}
                  onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Cupos</label>
                <input type="number" min={0} style={inputStyle} value={form.cupo_maximo}
                  onChange={e => setForm(f => ({ ...f, cupo_maximo: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Cupos libres</label>
                <input type="number" min={0} style={inputStyle} value={form.cupo_libres}
                  onChange={e => setForm(f => ({ ...f, cupo_libres: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Profesores (podés marcar más de uno)</label>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                {profesores.length === 0 && <div style={{ fontSize: 12, color: hint, padding: 4 }}>No hay profesores cargados</div>}
                {profesores.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', fontSize: 13, color: text, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.profesorIds.includes(p.id)}
                      onChange={() => setForm(f => ({
                        ...f,
                        profesorIds: f.profesorIds.includes(p.id)
                          ? f.profesorIds.filter(x => x !== p.id)
                          : [...f.profesorIds, p.id],
                      }))} />
                    {p.nombre}
                  </label>
                ))}
              </div>
            </div>

            {errorForm && (
              <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>
                {errorForm}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)}
                style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                style={{ flex: 1, padding: 10, background: guardando ? '#e2e8f0' : '#4f46e5', border: 'none', borderRadius: 8, color: guardando ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 700, cursor: guardando ? 'default' : 'pointer' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
