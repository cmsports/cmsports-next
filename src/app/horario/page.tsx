'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import { Pencil, Plus, Trash2, X, Clock, MapPin } from 'lucide-react'
import { diasSinClase, eliminarBloque, estadoDiaSinClase, guardarGrupo, marcarDiaSinClase } from '@/app/actions/horario'
import { DIAS, franjasDe, hhmm, horasSemanales, rangoHorario, type BloqueHorario } from '@/lib/domain/horario'
import { SEDES, sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { soloVigentes } from '@/lib/supabase/vigentes'
import { useEnVivo } from '@/lib/useEnVivo'
import PanelCupos from '@/components/PanelCupos'
import PanelRecuperaciones from '@/components/PanelRecuperaciones'
import PanelReportes from '@/components/PanelReportes'
import { useModulos } from '@/lib/hooks/useModulos'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Profesor = { id: string; nombre: string }
type Bloque = BloqueHorario & { profesorIds: string[]; grupo_id: string }

type HorarioDia = { hora_inicio: string; hora_fin: string }

const FORM_VACIO = {
  nombre: '', sede: 'buin',
  // Un grupo tiene varios días y cada uno su horario propio.
  dias: {} as Record<string, HorarioDia>,
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
  const { tiene } = useModulos()
  const router = useRouter()
  const [bloques, setBloques]       = useState<Bloque[]>([])
  const [profesores, setProfesores] = useState<Profesor[]>([])
  const [cargando, setCargando]     = useState(true)
  const [sedeActiva, setSedeActiva] = useState('buin')
  const [tab, setTab]               = useState<'grilla' | 'cupos' | 'recuperaciones' | 'profesores' | 'reportes'>('grilla')
  const [modal, setModal]           = useState<null | 'nuevo' | Bloque>(null)
  const [form, setForm]             = useState(FORM_VACIO)
  const [guardando, setGuardando]   = useState(false)
  const [errorForm, setErrorForm]   = useState('')
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [modalFeriado, setModalFeriado] = useState(false)
  const [feriado, setFeriado] = useState({ fecha: '', motivo: '' })
  const [feriadoMsg, setFeriadoMsg] = useState('')
  // Cómo está la fecha elegida antes de tocar nada: cuántos grupos se dictan y
  // cuántos ya están suspendidos.
  const [feriadoEstado, setFeriadoEstado] = useState<
    { grupos: number; suspendidos: number; motivo: string | null } | null
  >(null)
  // Los días ya marcados, para poder devolver el que se marcó por error sin
  // tener que acordarse de la fecha exacta.
  const [marcados, setMarcados] = useState<
    { fecha: string; dia: string; motivo: string | null; grupos: number }[] | null
  >(null)
  const [restaurando, setRestaurando] = useState<string | null>(null)

  const clubId = perfil?.club_id ?? null
  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'superadmin' || perfil?.rol === 'profesor'

  const cargar = useCallback(async (cid: string) => {
    const [{ data: bloquesData }, { data: profesoresData }, { data: rel }] = await Promise.all([
      // `activo` no alcanza: dar de baja un grupo le cierra la vigencia y deja
      // `activo` en true. Sin este filtro, el grupo que borrabas seguía acá.
      soloVigentes(supabase.from('bloques_horario')
        .select('id,grupo_id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,cupo_libres,activo')
        .eq('club_id', cid).eq('activo', true), fechaChile())
        .order('hora_inicio'),
      supabase.from('profesores').select('id,nombre').eq('club_id', cid).eq('activo', true).order('nombre'),
      supabase.from('bloque_profesores').select('bloque_id,profesor_id').is('vigente_hasta', null),
    ])

    const porBloque = new Map<string, string[]>()
    for (const r of rel ?? []) {
      porBloque.set(r.bloque_id, [...(porBloque.get(r.bloque_id) ?? []), r.profesor_id])
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setBloques(((bloquesData ?? []) as any[]).map(b => ({ ...b, profesorIds: porBloque.get(b.id) ?? [] })) as Bloque[])
    setProfesores((profesoresData ?? []) as Profesor[])
    setCargando(false)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) { setCargando(false); return }
    void cargar(perfil.club_id)
  }, [authLoading, perfil, router, cargar])

  // El horario lo editan entre varios —los dos admin-entrenadores y el profe—,
  // muchas veces con la pantalla abierta en paralelo. Sin esto, el que llegaba
  // segundo guardaba encima de un horario que ya no era el que estaba viendo.
  // `bloque_jugadores` va incluido porque la cuenta de inscritos de cada bloque
  // se muestra acá y cambia desde la ficha del jugador.
  useEnVivo(['bloques_horario', 'bloque_profesores', 'bloque_jugadores'], perfil?.club_id ?? null,
    () => { if (perfil?.club_id) void cargar(perfil.club_id) },
    { conClub: ['bloques_horario'] })

  function toggleDia(dia: string) {
    setForm(f => {
      const dias = { ...f.dias }
      if (dias[dia]) { delete dias[dia]; return { ...f, dias } }
      // Se copia el horario de otro día ya marcado: casi siempre coinciden y
      // el que no, se corrige a mano.
      const modelo = Object.values(f.dias)[0]
      dias[dia] = { hora_inicio: modelo?.hora_inicio ?? '', hora_fin: modelo?.hora_fin ?? '' }
      return { ...f, dias }
    })
  }

  function setHoraDia(dia: string, campo: 'hora_inicio' | 'hora_fin', valor: string) {
    setForm(f => ({ ...f, dias: { ...f.dias, [dia]: { ...f.dias[dia], [campo]: valor } } }))
  }

  function abrirNuevo(sede: string, dia?: string, hora?: string) {
    setForm({
      ...FORM_VACIO, sede,
      dias: dia ? { [dia]: { hora_inicio: hora ?? '', hora_fin: '' } } : {},
      cupo_maximo: sede === 'paine' ? '30' : '12',
    })
    setErrorForm('')
    setModal('nuevo')
  }

  function abrirEditar(b: Bloque) {
    // Se edita el grupo entero, así que se juntan todos sus días.
    const hermanos = bloques.filter(x => x.grupo_id === b.grupo_id)
    const dias: Record<string, HorarioDia> = {}
    for (const h of hermanos) {
      dias[h.dia_semana] = { hora_inicio: hhmm(h.hora_inicio), hora_fin: hhmm(h.hora_fin) }
    }
    setForm({
      nombre: b.nombre, sede: b.sede, dias,
      cupo_maximo: String(b.cupo_maximo), cupo_libres: String(b.cupo_libres),
      profesorIds: b.profesorIds,
    })
    setErrorForm('')
    setModal(b)
  }

  async function guardar() {
    setGuardando(true)
    setErrorForm('')
    const res = await guardarGrupo({
      grupoId: modal === 'nuevo' ? undefined : (modal as Bloque).grupo_id,
      nombre: form.nombre,
      sede: form.sede,
      cupoMaximo: parseInt(form.cupo_maximo) || 0,
      cupoLibres: parseInt(form.cupo_libres) || 0,
      profesorIds: form.profesorIds,
      dias: Object.entries(form.dias).map(([dia_semana, h]) => ({ dia_semana, ...h })),
    })
    setGuardando(false)
    if (res?.error) { setErrorForm(String(res.error)); return }
    setModal(null)
    if (clubId) void cargar(clubId)
  }

  // Al elegir la fecha se consulta cómo está, para saber si toca marcar o
  // deshacer antes de apretar.
  useEffect(() => {
    if (!modalFeriado || !feriado.fecha) { setFeriadoEstado(null); return }
    let vigente = true
    setFeriadoEstado(null)
    void (async () => {
      const res = await estadoDiaSinClase({ fecha: feriado.fecha })
      if (!vigente) return
      if ('error' in res && res.error) { setFeriadoMsg(res.error); return }
      setFeriadoMsg('')
      setFeriadoEstado({
        grupos: (res as { grupos: number }).grupos,
        suspendidos: (res as { suspendidos: number }).suspendidos,
        motivo: (res as { motivo: string | null }).motivo,
      })
    })()
    return () => { vigente = false }
  }, [modalFeriado, feriado.fecha])

  const cargarMarcados = useCallback(async () => {
    const res = await diasSinClase()
    setMarcados('error' in res && res.error ? [] : ((res as { dias: typeof marcados }).dias ?? []))
  }, [])

  useEffect(() => {
    if (modalFeriado) void cargarMarcados()
  }, [modalFeriado, cargarMarcados])

  /** Devolver un día de la lista. No pide confirmación: se puede volver a marcar. */
  async function restaurarFecha(fecha: string) {
    setRestaurando(fecha)
    setFeriadoMsg('')
    const res = await marcarDiaSinClase({ fecha, deshacer: true })
    setRestaurando(null)
    if (res?.error) { setFeriadoMsg(res.error); return }
    setFeriadoMsg(`Listo: el ${fecha} vuelve a contar como día de entrenamiento.`)
    await cargarMarcados()
    // Si es justo la fecha del campo, el cartel de arriba también tiene que
    // reflejar lo que quedó.
    if (fecha === feriado.fecha) {
      const ahora = await estadoDiaSinClase({ fecha })
      if (!('error' in ahora && ahora.error)) {
        setFeriadoEstado({
          grupos: (ahora as { grupos: number }).grupos,
          suspendidos: (ahora as { suspendidos: number }).suspendidos,
          motivo: (ahora as { motivo: string | null }).motivo,
        })
      }
    }
  }

  async function guardarFeriado(deshacer: boolean) {
    setGuardando(true)
    setFeriadoMsg('')
    const res = await marcarDiaSinClase({ fecha: feriado.fecha, motivo: feriado.motivo, deshacer })
    setGuardando(false)
    if (res?.error) { setFeriadoMsg(res.error); return }
    setFeriadoMsg(deshacer
      ? `Listo: el ${feriado.fecha} vuelve a contar como día de entrenamiento.`
      : `Listo: el ${feriado.fecha} no cuenta para ${res.grupos} grupo${res.grupos === 1 ? '' : 's'}.`)
    // Volver a leer el estado deja el modal mostrando lo que quedó, no lo que
    // había cuando se abrió.
    const ahora = await estadoDiaSinClase({ fecha: feriado.fecha })
    if (!('error' in ahora && ahora.error)) {
      setFeriadoEstado({
        grupos: (ahora as { grupos: number }).grupos,
        suspendidos: (ahora as { suspendidos: number }).suspendidos,
        motivo: (ahora as { motivo: string | null }).motivo,
      })
    }
    await cargarMarcados()
  }

  async function eliminar(b: Bloque) {
    // El aviso decía solo que las clases se conservan. Lo que no decía es que a
    // todos los inscritos se les cierra la inscripción, y como los días de
    // entrenamiento salen de ahí, esa gente queda sin días.
    const { count } = await supabase.from('bloque_jugadores')
      .select('jugador_id', { count: 'exact', head: true })
      .eq('bloque_id', b.id).is('vigente_hasta', null)
    const cuantos = count ?? 0
    const aviso = cuantos > 0
      ? `\n\nSe le cierra la inscripción a ${cuantos} jugador${cuantos === 1 ? '' : 'es'}: ese grupo deja de ser uno de sus días de entrenamiento.`
      : ''
    if (!confirm(`¿Dar de baja el grupo "${b.nombre}" del ${b.dia_semana}?${aviso}\n\nLas clases ya generadas y el historial se conservan.`)) return
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
          <h1 style={{ fontSize: 20, fontWeight: 600, color: text, margin: 0 }}>Cupos/bloques</h1>
          <p style={{ fontSize: 12, color: hint, marginTop: 2 }}>
            La plantilla fija del club. Desde acá se generan las clases de cada semana.
          </p>
        </div>
        {esStaff && tab === 'grilla' && (
          <button onClick={() => { setFeriado({ fecha: '', motivo: '' }); setFeriadoMsg(''); setModalFeriado(true) }}
            style={{ background: '#fff', color: muted, border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>
            Día sin clase
          </button>
        )}
        {esStaff && tab === 'grilla' && (
          <button onClick={() => abrirNuevo(sedeActiva)}
            style={{ background: '#f43f5e', color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nuevo bloque
          </button>
        )}
      </div>

      {/* Tabs. El jugador solo ve la grilla: cupos, profesores y reportes son
          datos de gestión del club, no suyos. */}
      <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 10, padding: 4, margin: '16px 0' }}>
        {(esStaff
          ? [
              ['grilla', 'Grilla semanal'] as const,
              ['cupos', 'Cupos'] as const,
              // Solo donde el alumno puede avisar que no va: sin eso la pestaña
              // no tendría nada que mostrar.
              ...(tiene('recuperar_clases') ? [['recuperaciones', 'Recuperaciones'] as const] : []),
              ['profesores', 'Profesores'] as const,
              ['reportes', 'Reportes'] as const,
            ]
          : [['grilla', 'Grilla semanal'] as const]
        ).map(([key, label]) => (
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
      {tab === 'cupos' && clubId && esStaff && <PanelCupos clubId={clubId} esStaff={esStaff} />}

      {tab === 'recuperaciones' && clubId && esStaff && <PanelRecuperaciones clubId={clubId} />}

      {tab === 'reportes' && clubId && esStaff && <PanelReportes clubId={clubId} />}

      {/* Profesores */}
      {tab === 'profesores' && esStaff && (
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
        <div className="anim-fondo" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="anim-modal" style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0 }}>
                {modal === 'nuevo' ? 'Nuevo grupo' : 'Editar grupo'}
              </h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nombre del grupo *</label>
              <input style={inputStyle} value={form.nombre} placeholder="Ej: Menores Avanzado"
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Sede</label>
              <select style={inputStyle} value={form.sede} onChange={e => setForm(f => ({ ...f, sede: e.target.value }))}>
                {SEDES.filter(s => s.value !== 'ambos').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Los días del grupo, cada uno con su horario: el mismo grupo
                arranca 16:30 los lunes y 17:00 los martes. */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Días del grupo *</label>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                {DIAS.map(d => {
                  const marcado = !!form.dias[d.value]
                  return (
                    <div key={d.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px' }}>
                      <input type="checkbox" checked={marcado} onChange={() => toggleDia(d.value)} id={'dia-' + d.value} />
                      <label htmlFor={'dia-' + d.value} style={{ fontSize: 13, color: marcado ? text : muted, width: 84, cursor: 'pointer' }}>
                        {d.label}
                      </label>
                      {marcado && (
                        <>
                          <input type="time" style={{ ...inputStyle, width: 108, padding: '6px 8px' }}
                            value={form.dias[d.value].hora_inicio}
                            onChange={e => setHoraDia(d.value, 'hora_inicio', e.target.value)} />
                          <span style={{ color: hint, fontSize: 12 }}>a</span>
                          <input type="time" style={{ ...inputStyle, width: 108, padding: '6px 8px' }}
                            value={form.dias[d.value].hora_fin}
                            onChange={e => setHoraDia(d.value, 'hora_fin', e.target.value)} />
                        </>
                      )}
                    </div>
                  )
                })}
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
              <label style={labelStyle}>Profesores (puedes marcar más de uno)</label>
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
      {/* Día sin clase: feriados y suspensiones */}
      {modalFeriado && (
        <div className="anim-fondo" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModalFeriado(false) }}>
          <div className="anim-modal" style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(15,23,42,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0 }}>Día sin clase</h2>
              <button onClick={() => setModalFeriado(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: hint, marginBottom: 16 }}>
              Deja de contar como entrenamiento para todos los grupos que funcionan ese día.
              Sin esto, un feriado aparece como clase pendiente de registrar.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Fecha *</label>
              <input type="date" style={inputStyle} value={feriado.fecha}
                onChange={e => setFeriado(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Motivo</label>
              <input style={inputStyle} value={feriado.motivo} placeholder="Ej: feriado, gimnasio ocupado"
                onChange={e => setFeriado(f => ({ ...f, motivo: e.target.value }))} />
            </div>

            {/* Cómo está esa fecha ahora mismo. Sin esto los dos botones hacen
                lo contrario entre sí y no hay forma de saber cuál corresponde. */}
            {feriado.fecha && feriadoEstado && (
              feriadoEstado.grupos === 0 ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: muted, marginBottom: 14 }}>
                  Ese día no funciona ningún grupo. No hay nada que suspender.
                </div>
              ) : feriadoEstado.suspendidos > 0 ? (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#c2410c', marginBottom: 14, fontWeight: 600 }}>
                  Ya está marcado sin clase para {feriadoEstado.suspendidos} de {feriadoEstado.grupos} grupo{feriadoEstado.grupos === 1 ? '' : 's'}
                  {feriadoEstado.motivo ? ` — ${feriadoEstado.motivo}` : ''}.
                </div>
              ) : (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#16a34a', marginBottom: 14, fontWeight: 600 }}>
                  Ese día funcionan {feriadoEstado.grupos} grupo{feriadoEstado.grupos === 1 ? '' : 's'} con normalidad.
                </div>
              )
            )}

            {feriadoMsg && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: muted, marginBottom: 14 }}>
                {feriadoMsg}
              </div>
            )}

            {/* El botón destacado es el que corresponde al estado actual. */}
            {(() => {
              const suspendido = (feriadoEstado?.suspendidos ?? 0) > 0
              // Marcar necesita saber que ese día hay grupos. Deshacer no: si
              // no se pudo leer el estado, o el horario cambió y ya no hay
              // grupos ese día, igual tiene que poder devolverse el día. Atarlo
              // al estado dejaba los dos botones muertos y el día suspendido
              // para siempre.
              const listo = !!feriado.fecha && !guardando && (feriadoEstado?.grupos ?? 0) > 0
              const puedeDeshacer = !!feriado.fecha && !guardando
              const principal = (activo: boolean) => ({ flex: 1, padding: 10, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: activo ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0',
                color: activo ? '#fff' : '#94a3b8', cursor: activo ? 'pointer' : 'default' }) as const
              const secundario = (activo: boolean) => ({ flex: 1, padding: 10, background: 'transparent', border: '1px solid #e2e8f0',
                borderRadius: 8, color: muted, fontSize: 13, cursor: activo ? 'pointer' : 'default' }) as const
              return (
                <div style={{ display: 'flex', gap: 10 }}>
                  {suspendido ? (
                    <>
                      <button onClick={() => guardarFeriado(false)} disabled={!listo} style={secundario(listo)}>
                        Volver a marcar
                      </button>
                      <button onClick={() => guardarFeriado(true)} disabled={!puedeDeshacer} style={principal(puedeDeshacer)}>
                        {guardando ? 'Guardando...' : 'Restaurar: sí hay clases'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => guardarFeriado(true)} disabled={!puedeDeshacer} style={secundario(puedeDeshacer)}>
                        Restaurar día
                      </button>
                      <button onClick={() => guardarFeriado(false)} disabled={!listo} style={principal(listo)}>
                        {guardando ? 'Guardando...' : 'Marcar sin clase'}
                      </button>
                    </>
                  )}
                </div>
              )
            })()}

            {/* Los días ya marcados. Si te equivocaste de fecha, acá lo ves y
                lo devolvés; sin esto había que adivinar cuál marcaste. */}
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 18, paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 8 }}>
                Días marcados sin clase
              </div>

              {marcados === null ? (
                <div style={{ fontSize: 12, color: hint }}>Buscando...</div>
              ) : marcados.length === 0 ? (
                <div style={{ fontSize: 12, color: hint }}>No hay ninguno marcado.</div>
              ) : (
                <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {marcados.map(d => (
                    <div key={d.fecha}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c' }}>
                          {d.dia ? `${d.dia} ` : ''}{d.fecha}
                        </div>
                        <div style={{ fontSize: 11, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.motivo || 'sin motivo'} · {d.grupos} grupo{d.grupos === 1 ? '' : 's'}
                        </div>
                      </div>
                      <button onClick={() => restaurarFecha(d.fecha)} disabled={restaurando === d.fecha}
                        style={{ flexShrink: 0, padding: '6px 11px', fontSize: 12, fontWeight: 600, borderRadius: 7,
                          border: '1px solid #e2e8f0', background: '#fff', color: muted,
                          cursor: restaurando === d.fecha ? 'default' : 'pointer' }}>
                        {restaurando === d.fecha ? 'Restaurando...' : 'Sí hubo clase'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
