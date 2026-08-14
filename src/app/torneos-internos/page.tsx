'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { archivarTorneo, crearTorneo as crearTorneoAction, crearCategoriaPersonalizada, eliminarCategoriaPersonalizada, eliminarTorneoDefinitivo } from '@/app/actions/torneos'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useTextoMonto } from '@/components/Monto'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const cache: Record<string, any[]> = {}

/** Los géneros que puede tener un torneo interno, con cómo se pintan. */
const GENEROS_TORNEO = [
  { valor: 'varones' as const, label: 'Varones', simbolo: '♂', color: '#1e40af', fondo: '#eff6ff' },
  { valor: 'damas'   as const, label: 'Damas',   simbolo: '♀', color: '#9d174d', fondo: '#fdf2f8' },
  { valor: 'mixto'   as const, label: 'Mixto',   simbolo: '⚥', color: '#5b21b6', fondo: '#f5f3ff' },
]

/**
 * Junta categorías de distintas fuentes sin repetir, ignorando mayúsculas.
 *
 * Un `new Set` a secas deja pasar "Juvenil" y "JUVENIL" como dos, y en el
 * selector eso son dos opciones que arman dos rankings separados para lo que
 * el club considera una sola categoría. Gana la primera forma que aparece.
 */
function unirCategorias(nombres: (string | null | undefined)[]): string[] {
  const vistas = new Map<string, string>()
  for (const n of nombres) {
    const limpio = n?.trim()
    if (!limpio) continue
    const clave = limpio.toLowerCase()
    if (!vistas.has(clave)) vistas.set(clave, limpio)
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'es'))
}

export default function TorneosInternosPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [torneos, setTorneos] = useState<any[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [categoriasPropias, setCategoriasPropias] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState('')
  const [cuota, setCuota] = useState('0')
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('')
  const [generoSeleccionado, setGeneroSeleccionado] = useState<'varones' | 'damas' | 'mixto' | ''>('')
  const [formCategoriaAbierto, setFormCategoriaAbierto] = useState(false)
  const [textoCategoriaNueva, setTextoCategoriaNueva] = useState('')
  const [guardandoCategoriaNueva, setGuardandoCategoriaNueva] = useState(false)
  const [borrandoCategoria, setBorrandoCategoria] = useState<string | null>(null)
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
      .select('id,nombre,estado,fase,fecha_inicio,cuota_inscripcion,creado_en,categoria,genero,campeon:campeon_id(nombre)')
      .eq('club_id', id)
      .eq('tipo', 'interno')
      .order('creado_en', { ascending: false })
    query = mostrarArchivados ? query.eq('estado', 'archivado') : query.neq('estado', 'archivado')
    const { data: torneosData } = await query
    if (!torneosData?.length) { setTorneos([]); }

    // Cargar categorías del club: las que algún jugador ya tiene puestas, más
    // las que el club inventó para torneos. Las segundas existen aunque nadie
    // las tenga en su ficha, que es justamente para lo que se creó la tabla.
    const [{ data: jugCats }, { data: catsPropias }] = await Promise.all([
      supabase.from('jugadores')
        .select('categoria')
        .eq('club_id', id)
        .or('es_externo.is.null,es_externo.eq.false')
        .not('categoria', 'is', null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('categorias_personalizadas').select('nombre').eq('club_id', id),
    ])
    // Las inventadas van aparte porque son las únicas que se pueden borrar: las
    // otras salen de las fichas y desaparecen solas cuando nadie las tiene.
    const propias = unirCategorias((catsPropias || []).map((c: { nombre: string }) => c.nombre))
    setCategoriasPropias(propias)
    setCategorias(unirCategorias([...(jugCats || []).map(j => j.categoria), ...propias]))

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
    if (!generoSeleccionado) { alert('Selecciona Varones o Damas'); return }
    const monto = Number(cuota)
    if (!Number.isSafeInteger(monto) || monto < 0) { alert('La cuota debe ser un monto igual o mayor a $0'); return }
    const res = await crearTorneoAction({ nombre, fecha, cuota: monto, tipo: 'interno', categoria: categoriaSeleccionada, genero: generoSeleccionado })
    if (res.error || !res.torneoId) { alert('Error: ' + (res.error || 'No se pudo crear')); return }
    setModalOpen(false)
    setNombre(''); setFecha(''); setCuota('0'); setCategoriaSeleccionada(''); setGeneroSeleccionado('')
    router.push(`/torneos/${res.torneoId}`)
  }

  async function guardarCategoriaNueva() {
    const limpio = textoCategoriaNueva.trim()
    if (!limpio) return
    setGuardandoCategoriaNueva(true)
    const res = await crearCategoriaPersonalizada(limpio)
    setGuardandoCategoriaNueva(false)
    if (res.error) { alert(res.error); return }
    // Queda elegida al toque: se creó para usarla en este torneo.
    setCategorias(prev => unirCategorias([...prev, limpio]))
    setCategoriasPropias(prev => unirCategorias([...prev, limpio]))
    setCategoriaSeleccionada(limpio)
    setTextoCategoriaNueva('')
    setFormCategoriaAbierto(false)
  }

  async function borrarCategoria(nombreCat: string) {
    if (!confirm(`¿Sacar "${nombreCat}" del listado de categorías?\n\nLos torneos que ya la usan y su ranking no se tocan.`)) return
    setBorrandoCategoria(nombreCat)
    const res = await eliminarCategoriaPersonalizada(nombreCat)
    setBorrandoCategoria(null)
    if (res.error) { alert(res.error); return }
    setCategorias(prev => prev.filter(c => c !== nombreCat))
    setCategoriasPropias(prev => prev.filter(c => c !== nombreCat))
    // Si estaba elegida para este torneo, deja de estarlo: ya no es una opción.
    setCategoriaSeleccionada(prev => (prev === nombreCat ? '' : prev))
    if (res.torneosQueLaUsan) {
      alert(`Listo. Ojo: ${res.torneosQueLaUsan} torneo${res.torneosQueLaUsan === 1 ? '' : 's'} ya la usa${res.torneosQueLaUsan === 1 ? '' : 'n'}. Esos torneos y su ranking quedan como están; la categoría solo deja de aparecer para torneos nuevos.`)
    }
  }

  const esAdmin = perfil?.rol === 'admin'
  const fmtMonto = useTextoMonto()

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
                  {(t.categoria || t.genero) && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {t.categoria && (
                        <span style={{ background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: 0.3 }}>
                          {categoriaLabel(t.categoria)}
                        </span>
                      )}
                      {(() => {
                        const g = GENEROS_TORNEO.find(x => x.valor === t.genero)
                        if (!g) return null
                        return (
                          <span style={{ background: g.fondo, color: g.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                            {g.simbolo} {g.label}
                          </span>
                        )
                      })()}
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
                    <span style={{ fontSize: 13, color: muted }}>Cuota: <strong style={{ color: '#16a34a' }}>{fmtMonto(t.cuota_inscripcion ?? 0)}</strong></span>
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
                        if (!confirm(`¿Eliminar "${t.nombre}" definitivamente? Esta acción no se puede deshacer.`)) return
                        const res = await eliminarTorneoDefinitivo({ torneoId: t.id })
                        if (res.error) { alert(res.error); return }
                        await cargarTorneos()
                      }}
                      style={{ background: 'transparent', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 10px', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
                    >
                      Eliminar
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

              {/* Una categoría que no está en la tabla por edad —"MASTER Z", lo
                  que el club quiera—. Queda guardada y arma su propio ranking. */}
              {!formCategoriaAbierto ? (
                <button type="button" onClick={() => setFormCategoriaAbierto(true)}
                  style={{ background: 'none', border: 'none', padding: '7px 0 0', fontSize: 12, fontWeight: 600, color: '#7c3aed', cursor: 'pointer' }}>
                  ＋ Agregar categoría
                </button>
              ) : (
                <div style={{ marginTop: 8, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: '#5b21b6', marginBottom: 6 }}>
                    Queda disponible para siempre y tiene su propio ranking. No cambia la categoría de ningún jugador.
                  </div>
                  <input
                    autoFocus value={textoCategoriaNueva}
                    onChange={e => setTextoCategoriaNueva(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void guardarCategoriaNueva() } }}
                    placeholder="Ej: MASTER Z" maxLength={40}
                    style={{ width: '100%', background: '#fff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '9px 11px', color: text, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => { setFormCategoriaAbierto(false); setTextoCategoriaNueva('') }}
                      style={{ flex: 1, background: '#fff', color: muted, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button type="button" onClick={guardarCategoriaNueva} disabled={!textoCategoriaNueva.trim() || guardandoCategoriaNueva}
                      style={{ flex: 1, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!textoCategoriaNueva.trim() || guardandoCategoriaNueva) ? 0.5 : 1 }}>
                      {guardandoCategoriaNueva ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>

                  {/* Solo las inventadas se pueden sacar. Las que salen de las
                      fichas de los jugadores no: esas se van solas cuando nadie
                      las tiene puesta. */}
                  {categoriasPropias.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #ddd6fe', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, color: '#5b21b6', fontWeight: 600, marginBottom: 6 }}>
                        Categorías que creaste
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {categoriasPropias.map(c => (
                          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff',
                            border: '1px solid #ddd6fe', borderRadius: 20, padding: '4px 6px 4px 11px', fontSize: 12, color: text }}>
                            {c}
                            <button type="button" onClick={() => void borrarCategoria(c)} disabled={borrandoCategoria === c}
                              title={`Sacar ${c}`}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: borrandoCategoria === c ? 'wait' : 'pointer',
                                fontSize: 13, lineHeight: 1, padding: '0 3px', opacity: borrandoCategoria === c ? 0.4 : 1 }}>
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 8 }}>Género <span style={{ color: '#dc2626' }}>*</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                {GENEROS_TORNEO.map(g => {
                  const activo = generoSeleccionado === g.valor
                  return (
                    <button key={g.valor} type="button"
                      onClick={() => setGeneroSeleccionado(g.valor)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                        border: `2px solid ${activo ? g.color : '#e2e8f0'}`,
                        background: activo ? g.fondo : '#f4f7fa',
                        color: activo ? g.color : muted,
                        fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      {g.simbolo} {g.label}
                    </button>
                  )
                })}
              </div>
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
              <button onClick={() => { setModalOpen(false); setNombre(''); setFecha(''); setCuota('0'); setCategoriaSeleccionada(''); setGeneroSeleccionado(''); setFormCategoriaAbierto(false); setTextoCategoriaNueva('') }}
                style={{ flex: 1, background: '#f4f7fa', color: muted, border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={crearTorneo} disabled={!nombre || !fecha || !categoriaSeleccionada || !generoSeleccionado}
                style={{ flex: 2, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!nombre || !fecha || !categoriaSeleccionada || !generoSeleccionado) ? 0.5 : 1 }}>
                Crear torneo
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
