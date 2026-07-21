'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { archivarTorneo, crearTorneo as crearTorneoAction, eliminarTorneoDefinitivo } from '@/app/actions/torneos'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const cache: Record<string, any[]> = {}

export default function TorneosInternosPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [torneos, setTorneos] = useState<any[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState('')
  const [cuota, setCuota] = useState('0')
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('')
  const [mostrarArchivados, setMostrarArchivados] = useState(false)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) {
      const cacheKey = `int:${perfil.club_id}:${mostrarArchivados}`
      if (cache[cacheKey]) { setTorneos(cache[cacheKey]); setLoading(false) }
      cargarTorneos(perfil.club_id).then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [authLoading, perfil, mostrarArchivados])

  async function cargarTorneos(cid?: string) {
    const id = cid || clubId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('torneos')
      .select('id,nombre,estado,fase,fecha_inicio,cuota_inscripcion,creado_en,categoria,campeon:campeon_id(nombre)')
      .eq('club_id', id)
      .eq('tipo', 'interno')
      .order('creado_en', { ascending: false })
    query = mostrarArchivados ? query.eq('estado', 'archivado') : query.neq('estado', 'archivado')
    const { data: torneosData } = await query
    if (!torneosData?.length) { setTorneos([]); }

    // Cargar categorías del club
    const { data: jugCats } = await supabase
      .from('jugadores')
      .select('categoria')
      .eq('club_id', id)
      .or('es_externo.is.null,es_externo.eq.false')
      .not('categoria', 'is', null)
    const cats = [...new Set((jugCats || []).map(j => j.categoria).filter((c): c is string => !!c))].sort()
    setCategorias(cats)

    if (!torneosData?.length) return

    const ids = (torneosData as { id: string }[]).map(t => t.id)
    const { data: todosGrupos } = await supabase.from('torneo_grupos').select('id, torneo_id').in('torneo_id', ids)
    const grupoIds = (todosGrupos || []).map(g => g.id)
    const { data: inscripciones } = grupoIds.length > 0
      ? await supabase.from('grupo_jugadores').select('grupo_id').in('grupo_id', grupoIds)
      : { data: [] }

    const grupoATorneo: Record<string, string> = {}
    for (const g of (todosGrupos || [])) grupoATorneo[g.id] = g.torneo_id
    const inscritosPorTorneo: Record<string, number> = {}
    for (const i of (inscripciones || [])) {
      const tid = grupoATorneo[i.grupo_id]
      if (tid) inscritosPorTorneo[tid] = (inscritosPorTorneo[tid] || 0) + 1
    }

    const lista = (torneosData as any[]).map(t => ({
      ...t,
      inscritos: inscritosPorTorneo[t.id] || 0,
      campeon: Array.isArray(t.campeon)
        ? (t.campeon[0] as { nombre?: string } | undefined)?.nombre
        : (t.campeon as { nombre?: string } | null)?.nombre,
    }))
    if (id) cache[`int:${id}:${mostrarArchivados}`] = lista
    setTorneos(lista)
  }

  async function crearTorneo() {
    if (!nombre || !fecha) return
    if (!categoriaSeleccionada) { alert('Selecciona la categoría del torneo'); return }
    const monto = Number(cuota)
    if (!Number.isSafeInteger(monto) || monto < 0) { alert('La cuota debe ser un monto igual o mayor a $0'); return }
    const res = await crearTorneoAction({ nombre, fecha, cuota: monto, tipo: 'interno', categoria: categoriaSeleccionada })
    if (res.error || !res.torneoId) { alert('Error: ' + (res.error || 'No se pudo crear')); return }
    setModalOpen(false)
    setNombre(''); setFecha(''); setCuota('0'); setCategoriaSeleccionada('')
    router.push(`/torneos/${res.torneoId}`)
  }

  const esAdmin = perfil?.rol === 'admin'

  const estadoConfig: Record<string, { color: string; bg: string; emoji: string }> = {
    en_curso: { color: '#16a34a', bg: '#f0fdf4', emoji: '🟢' },
    finalizado: { color: '#64748b', bg: '#f8fafc', emoji: '✅' },
    cancelado: { color: '#dc2626', bg: '#fef2f2', emoji: '❌' }
  }
  const faseLabel: Record<string, string> = {
    inscripcion: '📋 Inscripción', grupos: '👥 Fase de grupos',
    llaves: '🥊 Playoffs', semis: '🏅 Semifinal', final: '🏆 Final', finalizado: '🎉 Finalizado'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: text }}>Torneos Internos</h1>
          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Los resultados alimentan el Ranking del club</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {esAdmin && (
            <button
              onClick={() => { if (clubId) { delete cache[`int:${clubId}:true`]; delete cache[`int:${clubId}:false`] } setMostrarArchivados(v => !v) }}
              style={{ background: mostrarArchivados ? '#ede9fe' : '#ffffff', color: mostrarArchivados ? '#3730a3' : muted, border: '1px solid #c4b5fd', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {mostrarArchivados ? 'Ver activos' : 'Ver archivados'}
            </button>
          )}
          {esAdmin && !mostrarArchivados && (
            <button
              onClick={() => setModalOpen(true)}
              style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              🏠 Nuevo torneo interno
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {torneos.map(t => {
          const est = estadoConfig[t.estado] || { color: muted, bg: '#f4f7fa' }
          return (
            <div
              key={t.id}
              onClick={() => router.push(`/torneos/${t.id}`)}
              style={{ ...card, padding: 20, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: text }}>{t.nombre}</div>
                  {t.categoria && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: 0.3 }}>
                        {categoriaLabel(t.categoria)}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: muted }}>Ver detalle →</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ background: est.bg, color: est.color, padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                  {est.emoji} {t.estado === 'en_curso' ? 'En curso' : t.estado === 'finalizado' ? 'Finalizado' : 'Cancelado'}
                </span>
                <span style={{ background: '#f1f5f9', color: muted, padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                  {faseLabel[t.fase] || t.fase}
                </span>
                {t.fecha_inicio && <span style={{ fontSize: 12, color: muted }}>{t.fecha_inicio}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: muted }}>👥 <strong style={{ color: text }}>{t.inscritos || 0}</strong> inscritos</span>
                  {t.cuota_inscripcion > 0 && (
                    <span style={{ fontSize: 13, color: muted }}>Cuota: <strong style={{ color: '#16a34a' }}>${t.cuota_inscripcion?.toLocaleString('es-CL')}</strong></span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.campeon && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 20, padding: '4px 12px' }}>
                      <span style={{ fontSize: 14 }}>🏆</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706' }}>{t.campeon}</span>
                    </div>
                  )}
                  {esAdmin && !mostrarArchivados && (
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        if (!confirm(`¿Archivar "${t.nombre}"?`)) return
                        const res = await archivarTorneo({ torneoId: t.id })
                        if (res.error) { alert(res.error); return }
                        await cargarTorneos()
                      }}
                      style={{ background: 'transparent', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 10px', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
                    >
                      Archivar
                    </button>
                  )}
                  {esAdmin && mostrarArchivados && (
                    <>
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          const { error } = await supabase.from('torneos').update({ estado: 'en_curso' }).eq('id', t.id)
                          if (error) { alert('No se pudo desarchivar'); return }
                          if (clubId) { delete cache[`int:${clubId}:true`]; delete cache[`int:${clubId}:false`] }
                          await cargarTorneos()
                        }}
                        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '5px 10px', color: '#16a34a', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Desarchivar
                      </button>
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          if (!confirm(`¿Borrar definitivamente "${t.nombre}"?`)) return
                          const res = await eliminarTorneoDefinitivo({ torneoId: t.id })
                          if (res.error) { alert(res.error); return }
                          await cargarTorneos()
                        }}
                        style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 10px', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Borrar definitivo
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {torneos.length === 0 && (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
            {mostrarArchivados ? 'Sin torneos archivados' : 'Sin torneos internos registrados'}
          </div>
        )}
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: text, marginBottom: 6 }}>Nuevo torneo interno</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 20 }}>Los resultados se acumularán en el Ranking del club por categoría</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5 }}>Categoría <span style={{ color: '#dc2626' }}>*</span></label>
              <select
                value={categoriaSeleccionada}
                onChange={e => setCategoriaSeleccionada(e.target.value)}
                style={{ width: '100%', background: '#f4f7fa', border: `1px solid ${categoriaSeleccionada ? '#c4b5fd' : '#e2e8f0'}`, borderRadius: 8, padding: '10px 12px', color: categoriaSeleccionada ? text : hint, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="">Seleccionar categoría...</option>
                {categorias.map(c => <option key={c} value={c}>{categoriaLabel(c)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5 }}>Nombre del torneo</label>
              <input
                value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Torneo de Julio"
                style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5 }}>Fecha</label>
              <input
                type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5 }}>Cuota de inscripción ($)</label>
              <input
                type="number" value={cuota} onChange={e => setCuota(e.target.value)} min="0"
                style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setModalOpen(false); setNombre(''); setFecha(''); setCuota('0'); setCategoriaSeleccionada('') }}
                style={{ flex: 1, background: '#f4f7fa', color: muted, border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={crearTorneo} disabled={!nombre || !fecha || !categoriaSeleccionada}
                style={{ flex: 2, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!nombre || !fecha || !categoriaSeleccionada) ? 0.5 : 1 }}>
                Crear torneo
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
