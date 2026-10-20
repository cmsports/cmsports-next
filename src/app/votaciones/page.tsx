'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { cachedFetch } from '@/lib/query-cache'
import { CATEGORIAS_BUIN } from '@/lib/domain/categoriaBuin'
import {
  idsDeSeleccion, resumenSeleccion, validarCreacion, porcentajeDeVotos, ganadores,
  seleccionVacia, type JugadorVotacion, type Seleccion, type ResultadoVotacion,
} from '@/lib/domain/votaciones'
import {
  crearVotacion, cambiarEstadoVotacion, eliminarVotacion, votar, resultadosDeVotacion,
} from '@/app/actions/votaciones'

// Los tipos generados todavía no conocen las tablas de la migración 303.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient() as any

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Votacion = {
  id: string; titulo: string; descripcion: string | null; tipo: 'jugadores' | 'opciones'
  estado: 'abierta' | 'cerrada'; votos_total: number; creado_en: string; cerrada_en: string | null
}
type Opcion = { id: string; votacion_id: string; jugador_id: string | null; texto: string; orden: number }

const boton = (fondo: string, color = '#fff', borde = 'none') => ({
  background: fondo, color, border: borde, borderRadius: 8, padding: '8px 14px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}) as const

export default function VotacionesPage() {
  const { perfil, loading } = usePerfil()
  const router = useRouter()
  const clubId = perfil?.club_id ?? null
  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'profesor' || perfil?.rol === 'superadmin'

  const [votaciones, setVotaciones] = useState<Votacion[]>([])
  const [opciones, setOpciones]     = useState<Opcion[]>([])
  const [misVotos, setMisVotos]     = useState<Record<string, string>>({})
  const [cargando, setCargando]     = useState(true)
  const [toast, setToast]           = useState('')
  const [crearAbierto, setCrearAbierto] = useState(false)
  // Para la cabecera del PDF.
  const [clubNombre, setClubNombre] = useState('')

  useEffect(() => {
    if (!clubId || !esStaff) return
    let vivo = true
    void db.from('clubes').select('nombre').eq('id', clubId).single()
      .then(({ data }: { data: { nombre: string } | null }) => { if (vivo && data) setClubNombre(data.nombre) })
    return () => { vivo = false }
  }, [clubId, esStaff])

  const avisar = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    if (loading) return
    if (!perfil) router.replace('/login')
  }, [loading, perfil, router])

  const cargar = useCallback(async () => {
    if (!clubId) return
    try {
      const { v, o } = await cachedFetch(`votaciones:${clubId}`, async () => {
        const [rv, ro] = await Promise.all([
          db.from('votaciones').select('id,titulo,descripcion,tipo,estado,votos_total,creado_en,cerrada_en').order('creado_en', { ascending: false }),
          db.from('votacion_opciones').select('id,votacion_id,jugador_id,texto,orden').order('orden'),
        ])
        if (rv.error) throw rv.error
        if (ro.error) throw ro.error
        return { v: (rv.data ?? []) as Votacion[], o: (ro.data ?? []) as Opcion[] }
      }, 60_000, ['votaciones', 'votacion_opciones'])
      setVotaciones(v); setOpciones(o)

      // Cada alumno lee solo su voto (RLS): no hace falta filtrar acá. Los
      // votos no están en realtime, así que se vuelven a pedir en cada carga.
      if (!esStaff) {
        const { data } = await db.from('votacion_votos').select('votacion_id,opcion_id')
        const mapa: Record<string, string> = {}
        for (const f of (data ?? []) as { votacion_id: string; opcion_id: string }[]) mapa[f.votacion_id] = f.opcion_id
        setMisVotos(mapa)
      }
    } catch {
      avisar('No se pudieron cargar las votaciones')
    } finally {
      setCargando(false)
    }
  }, [clubId, esStaff])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['votaciones', 'votacion_opciones'], clubId, () => { void cargar() }, { conClub: ['votaciones', 'votacion_opciones'] })

  const opcionesDe = useMemo(() => {
    const m: Record<string, Opcion[]> = {}
    for (const o of opciones) (m[o.votacion_id] ??= []).push(o)
    return m
  }, [opciones])

  if (loading || !perfil) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: text, margin: 0 }}>Votaciones</h1>
          <p style={{ fontSize: 12, color: hint, marginTop: 2 }}>
            {esStaff
              ? 'Tú decides quién vota y a quién se vota. El voto es secreto: ves los totales, no quién votó por quién.'
              : 'Las votaciones en las que tu profesor te invitó a participar. Solo puedes votar una vez.'}
          </p>
        </div>
        {esStaff && (
          <button onClick={() => setCrearAbierto(true)} style={boton('#4f46e5')}>+ Nueva votación</button>
        )}
      </div>

      {cargando ? (
        <p style={{ color: hint, fontSize: 13 }}>Cargando…</p>
      ) : votaciones.length === 0 ? (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: muted, fontSize: 13 }}>
          {esStaff ? 'Todavía no hay votaciones. Crea la primera con “Nueva votación”.' : 'Por ahora no tienes votaciones pendientes.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {votaciones.map(v => esStaff
            ? <TarjetaStaff key={v.id} v={v} opciones={opcionesDe[v.id] ?? []} clubNombre={clubNombre} avisar={avisar} alCambiar={cargar} />
            : <TarjetaAlumno key={v.id} v={v} opciones={opcionesDe[v.id] ?? []} miOpcion={misVotos[v.id]}
                miJugadorId={perfil.jugador_id ?? null} avisar={avisar} alCambiar={cargar} />
          )}
        </div>
      )}

      {crearAbierto && esStaff && clubId && (
        <ModalCrear clubId={clubId} alCerrar={() => setCrearAbierto(false)}
          alCrear={() => { setCrearAbierto(false); avisar('Votación creada'); void cargar() }} />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 18px', fontSize: 13, color: '#16a34a', zIndex: 200, boxShadow: '0 4px 12px rgba(15,23,42,0.12)' }}>
          {toast}
        </div>
      )}
    </AppLayout>
  )
}

function Etiqueta({ v }: { v: Votacion }) {
  const abierta = v.estado === 'abierta'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: abierta ? '#ecfdf5' : '#f1f5f9', color: abierta ? '#059669' : muted }}>
      {abierta ? 'Abierta' : 'Cerrada'}
    </span>
  )
}

// ── Vista del alumno ────────────────────────────────────────────────────────
function TarjetaAlumno({ v, opciones, miOpcion, miJugadorId, avisar, alCambiar }: {
  v: Votacion; opciones: Opcion[]; miOpcion: string | undefined; miJugadorId: string | null
  avisar: (m: string) => void; alCambiar: () => Promise<void>
}) {
  const [elegida, setElegida] = useState('')
  const [enviando, setEnviando] = useState(false)
  // No se ofrece votar por uno mismo: el servidor igual lo rechaza.
  const elegibles = opciones.filter(o => !miJugadorId || o.jugador_id !== miJugadorId)
  const votada = miOpcion ? opciones.find(o => o.id === miOpcion) : undefined

  async function enviar() {
    if (!elegida) return
    if (!confirm('Tu voto es definitivo: no podrás cambiarlo. ¿Votar?')) return
    setEnviando(true)
    const res = await votar({ votacionId: v.id, opcionId: elegida })
    setEnviando(false)
    if ('error' in res && res.error) { avisar(String(res.error)); return }
    avisar('Voto registrado. ¡Gracias!')
    await alCambiar()
  }

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: text, margin: 0 }}>{v.titulo}</h2>
        <Etiqueta v={v} />
      </div>
      {v.descripcion && <p style={{ fontSize: 13, color: muted, margin: '6px 0 0' }}>{v.descripcion}</p>}

      {votada ? (
        <p style={{ fontSize: 13, color: '#059669', margin: '12px 0 0' }}>✓ Ya votaste por <b>{votada.texto}</b></p>
      ) : miOpcion ? (
        <p style={{ fontSize: 13, color: '#059669', margin: '12px 0 0' }}>✓ Ya votaste</p>
      ) : v.estado === 'cerrada' ? (
        <p style={{ fontSize: 13, color: muted, margin: '12px 0 0' }}>Esta votación ya se cerró.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            {elegibles.map(o => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${elegida === o.id ? '#a5b4fc' : '#e2e8f0'}`, background: elegida === o.id ? '#eef2ff' : '#fff', fontSize: 14, color: text }}>
                <input type="radio" name={`voto-${v.id}`} checked={elegida === o.id} onChange={() => setElegida(o.id)} />
                {o.texto}
              </label>
            ))}
          </div>
          <button onClick={enviar} disabled={!elegida || enviando}
            style={{ ...boton(!elegida || enviando ? '#cbd5e1' : '#4f46e5'), marginTop: 12, cursor: !elegida || enviando ? 'not-allowed' : 'pointer' }}>
            {enviando ? 'Enviando…' : 'Votar'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Vista del profe ─────────────────────────────────────────────────────────
function TarjetaStaff({ v, opciones, clubNombre, avisar, alCambiar }: {
  v: Votacion; opciones: Opcion[]; clubNombre: string
  avisar: (m: string) => void; alCambiar: () => Promise<void>
}) {
  const [abierta, setAbierta] = useState(false)
  const [res, setRes] = useState<ResultadoVotacion | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargarResultados = useCallback(async () => {
    const r = await resultadosDeVotacion({ votacionId: v.id })
    if ('error' in r) { avisar(r.error); return }
    setRes(r.resultado)
  }, [v.id, avisar])

  // Cada voto sube `votos_total` y esa fila sí está en realtime: es lo que
  // vuelve a traer los totales sin publicar el contenido de los votos.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (abierta) void cargarResultados() }, [abierta, v.votos_total, v.estado, cargarResultados])

  async function cambiarEstado() {
    const nuevo = v.estado === 'abierta' ? 'cerrada' : 'abierta'
    if (nuevo === 'cerrada' && !confirm('¿Cerrar la votación? Nadie más podrá votar.')) return
    setOcupado(true)
    const r = await cambiarEstadoVotacion({ votacionId: v.id, estado: nuevo })
    setOcupado(false)
    if ('error' in r && r.error) { avisar(String(r.error)); return }
    await alCambiar()
  }

  async function borrar() {
    if (!confirm('¿Eliminar esta votación con todos sus votos? No se puede deshacer. Exporta el PDF antes si quieres conservar los resultados.')) return
    setOcupado(true)
    const r = await eliminarVotacion({ votacionId: v.id })
    setOcupado(false)
    if ('error' in r && r.error) { avisar(String(r.error)); return }
    avisar('Votación eliminada')
    await alCambiar()
  }

  async function exportar() {
    setOcupado(true)
    try {
      const r = await resultadosDeVotacion({ votacionId: v.id })
      if ('error' in r) { avisar(r.error); return }
      const { exportarVotacionPdf } = await import('@/lib/votaciones-pdf')
      await exportarVotacionPdf(r.resultado, { clubNombre })
    } catch {
      avisar('No se pudo generar el PDF')
    } finally {
      setOcupado(false)
    }
  }

  const lideres = res ? ganadores(res.opciones) : []

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: text, margin: 0 }}>{v.titulo}</h2>
          <p style={{ fontSize: 12, color: hint, margin: '2px 0 0' }}>
            {v.tipo === 'jugadores' ? 'Entre compañeros' : 'Opciones propias'} · {opciones.length} opciones · {v.votos_total} {v.votos_total === 1 ? 'voto' : 'votos'}
          </p>
        </div>
        <Etiqueta v={v} />
      </div>
      {v.descripcion && <p style={{ fontSize: 13, color: muted, margin: '8px 0 0' }}>{v.descripcion}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button onClick={() => setAbierta(a => !a)} style={boton('#eef2ff', '#3730a3', '1px solid #c7d2fe')}>
          {abierta ? 'Ocultar resultados' : 'Ver resultados'}
        </button>
        <button onClick={exportar} disabled={ocupado} style={boton('#fff', text, '1px solid #e2e8f0')}>Exportar PDF</button>
        <button onClick={cambiarEstado} disabled={ocupado} style={boton('#fff', text, '1px solid #e2e8f0')}>
          {v.estado === 'abierta' ? 'Cerrar votación' : 'Reabrir'}
        </button>
        <button onClick={borrar} disabled={ocupado} style={boton('#fff', '#dc2626', '1px solid #fecaca')}>Eliminar</button>
      </div>

      {abierta && (
        <div style={{ marginTop: 14 }}>
          {!res ? (
            <p style={{ fontSize: 13, color: hint }}>Cargando resultados…</p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: muted, margin: '0 0 8px' }}>
                Votaron {res.votos_total} de {res.habilitados} ({porcentajeDeVotos(res.votos_total, res.habilitados)}%)
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {res.opciones.map(o => {
                  const pct = porcentajeDeVotos(o.votos, res.votos_total)
                  const va = lideres.some(l => l.id === o.id)
                  return (
                    <div key={o.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: text }}>
                        <span style={{ fontWeight: va ? 700 : 400 }}>{o.texto}{va ? ' ★' : ''}</span>
                        <span style={{ color: muted }}>{o.votos} · {pct}%</span>
                      </div>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', marginTop: 3 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: va ? '#4f46e5' : '#a5b4fc' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {res.faltan.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: muted, cursor: 'pointer' }}>Aún no votan ({res.faltan.length})</summary>
                  <p style={{ fontSize: 12, color: muted, margin: '6px 0 0', lineHeight: 1.6 }}>{res.faltan.join(', ')}</p>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Crear una votación ──────────────────────────────────────────────────────
function SelectorDeJugadores({ titulo, jugadores, categorias, valor, onChange, unidad }: {
  titulo: string; jugadores: JugadorVotacion[]; categorias: string[]
  valor: Seleccion; onChange: (s: Seleccion) => void; unidad: 'votantes' | 'candidatos'
}) {
  const [busqueda, setBusqueda] = useState('')
  const cantidad = idsDeSeleccion(jugadores, valor).length
  const visibles = jugadores.filter(j => !busqueda || (j.nombre ?? '').toLowerCase().includes(busqueda.toLowerCase()))
  const modos: { v: Seleccion['modo']; l: string }[] = [
    { v: 'categorias', l: 'Por categoría' }, { v: 'jugadores', l: 'Jugadores específicos' }, { v: 'todos', l: 'Todos los activos' },
  ]
  const alternar = (campo: 'categorias' | 'jugadores', id: string) => {
    const s = new Set(valor[campo]); if (s.has(id)) s.delete(id); else s.add(id)
    onChange({ ...valor, [campo]: s })
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {modos.map(m => (
          <button key={m.v} type="button" onClick={() => onChange({ ...valor, modo: m.v })}
            style={{ ...boton(valor.modo === m.v ? '#eef2ff' : '#fff', valor.modo === m.v ? '#3730a3' : muted, `1px solid ${valor.modo === m.v ? '#c7d2fe' : '#e2e8f0'}`), padding: '5px 10px', fontSize: 12 }}>
            {m.l}
          </button>
        ))}
      </div>

      {valor.modo === 'categorias' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categorias.map(c => (
            <button key={c} type="button" onClick={() => alternar('categorias', c)}
              style={{ ...boton(valor.categorias.has(c) ? '#4f46e5' : '#f8fafc', valor.categorias.has(c) ? '#fff' : muted, `1px solid ${valor.categorias.has(c) ? '#4f46e5' : '#e2e8f0'}`), padding: '4px 10px', fontSize: 12, fontWeight: 500 }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {valor.modo === 'jugadores' && (
        <>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar jugador…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 6 }} />
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 8 }}>
            {visibles.map(j => (
              <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, color: text, cursor: 'pointer' }}>
                <input type="checkbox" checked={valor.jugadores.has(j.id)} onChange={() => alternar('jugadores', j.id)} />
                {j.nombre}
              </label>
            ))}
            {visibles.length === 0 && <div style={{ padding: 10, fontSize: 12, color: hint }}>Sin resultados</div>}
          </div>
        </>
      )}

      <div style={{ fontSize: 12, color: cantidad ? '#059669' : hint, marginTop: 8 }}>{resumenSeleccion(cantidad, unidad)}</div>
    </div>
  )
}

function ModalCrear({ clubId, alCerrar, alCrear }: { clubId: string; alCerrar: () => void; alCrear: () => void }) {
  const [jugadores, setJugadores] = useState<JugadorVotacion[]>([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState<'jugadores' | 'opciones'>('jugadores')
  const [quienVota, setQuienVota] = useState<Seleccion>(seleccionVacia)
  const [aQuien, setAQuien] = useState<Seleccion>(seleccionVacia)
  const [textoOpciones, setTextoOpciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    void (async () => {
      const lista = await cachedFetch(`votaciones:jugadores:${clubId}`, async () => {
        const { data } = await db.from('jugadores')
          .select('id,nombre,estado,categoria,categorias').eq('club_id', clubId)
          .or('es_externo.is.null,es_externo.eq.false').order('nombre')
        return (data ?? []) as JugadorVotacion[]
      }, 120_000, ['jugadores'])
      if (vivo) setJugadores(lista)
    })()
    return () => { vivo = false }
  }, [clubId])

  const categorias = useMemo(() => {
    const presentes = new Set<string>()
    for (const j of jugadores) {
      if (j.categorias?.length) j.categorias.forEach(c => presentes.add(c))
      else if (j.categoria) presentes.add(j.categoria)
    }
    const conocidas = (CATEGORIAS_BUIN as readonly string[]).filter(c => presentes.has(c))
    return [...conocidas, ...[...presentes].filter(c => !conocidas.includes(c)).sort()]
  }, [jugadores])

  const opciones = textoOpciones.split('\n').map(s => s.trim()).filter(Boolean)

  async function crear() {
    const votantes = idsDeSeleccion(jugadores, quienVota)
    const candidatos = idsDeSeleccion(jugadores, aQuien)
    const invalido = validarCreacion({ titulo, tipo, votantes, candidatos, opciones })
    if (invalido) { setError(invalido); return }
    setError(''); setGuardando(true)
    const r = await crearVotacion({ titulo, descripcion, tipo, votantes, candidatos, opciones })
    setGuardando(false)
    if ('error' in r && r.error) { setError(String(r.error)); return }
    alCrear()
  }

  const campo = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: text } as const

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560, margin: '24px 0', display: 'grid', gap: 14 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: text, margin: 0 }}>Nueva votación</h2>

        <div>
          <label style={{ fontSize: 12, color: muted }}>Nombre</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Ej.: Mejor compañero de octubre" style={campo} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: muted }}>Descripción (opcional)</label>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={500} rows={2} style={campo} />
        </div>

        <div>
          <label style={{ fontSize: 12, color: muted }}>¿Qué se vota?</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {([['jugadores', 'Un compañero'], ['opciones', 'Opciones que escribo yo']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTipo(v)}
                style={{ ...boton(tipo === v ? '#eef2ff' : '#fff', tipo === v ? '#3730a3' : muted, `1px solid ${tipo === v ? '#c7d2fe' : '#e2e8f0'}`), fontSize: 12 }}>{l}</button>
            ))}
          </div>
        </div>

        <SelectorDeJugadores titulo="¿Quién vota?" unidad="votantes" jugadores={jugadores} categorias={categorias} valor={quienVota} onChange={setQuienVota} />

        {tipo === 'jugadores' ? (
          <SelectorDeJugadores titulo="¿A quién se puede votar?" unidad="candidatos" jugadores={jugadores} categorias={categorias} valor={aQuien} onChange={setAQuien} />
        ) : (
          <div>
            <label style={{ fontSize: 12, color: muted }}>Opciones (una por línea, mínimo dos)</label>
            <textarea value={textoOpciones} onChange={e => setTextoOpciones(e.target.value)} rows={5}
              placeholder={'Sábado en la mañana\nSábado en la tarde\nDomingo'} style={campo} />
          </div>
        )}

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={alCerrar} style={boton('transparent', muted, '1px solid #e2e8f0')}>Cancelar</button>
          <button onClick={crear} disabled={guardando} style={boton(guardando ? '#cbd5e1' : '#4f46e5')}>{guardando ? 'Creando…' : 'Crear votación'}</button>
        </div>
      </div>
    </div>
  )
}
