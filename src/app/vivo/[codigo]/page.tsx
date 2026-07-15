'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  firmaSnapshotTorneoVivo,
  normalizarSnapshotTorneoVivo,
  type GrupoVivo,
  type JugadorVivo,
  type PartidoVivo,
  type SnapshotTorneoVivo,
} from '@/lib/domain/torneo-vivo'

const supabase = createClient()

const FASE_LABELS: Record<string, string> = {
  grupos: 'Fase de grupos', avance: 'Llave de avance', '32vos': '32vos', '16vos': '16vos',
  '8vos': '8vos', cuartos: 'Cuartos', semis: 'Semifinal', final: 'Final', finalizado: 'Finalizado',
}

type Jugador = JugadorVivo
type Grupo = GrupoVivo
type Partido = PartidoVivo
type Snapshot = SnapshotTorneoVivo

const text = '#0f172a', muted = '#64748b', hint = '#94a3b8', purple = '#4f46e5', green = '#16a34a'
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.12)' } as const

export default function VivoTorneoPage() {
  const params = useParams()
  const codigo = String(params.codigo || '').toUpperCase()
  const storeKey = `vivo:${codigo}`

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const claveSnapshot = useMemo(() => snap ? firmaSnapshotTorneoVivo(snap) : '', [snap])
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-encontrado'>('cargando')
  // identidad del espectador: se guarda en localStorage por torneo
  const [yo, setYo] = useState<{ jugadorId: string | null; nombre: string } | null>(null)
  const [paso, setPaso] = useState<'gate' | 'correo' | 'ver'>('gate')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cargadoRef = useRef(false)
  const firmaRef = useRef('')
  const peticionEnCursoRef = useRef<string | null>(null)
  const activoRef = useRef(false)
  const codigoActualRef = useRef(codigo)

  const cargar = useCallback(async () => {
    if (!codigo || peticionEnCursoRef.current === codigo) return
    peticionEnCursoRef.current = codigo
    try {
      const leerSnapshot = async () => {
        const { data, error } = await supabase.rpc('torneo_publico', { p_codigo: codigo })
        if (error) return null
        return normalizarSnapshotTorneoVivo(data)
      }
      let snapshot = await leerSnapshot()
      if (!activoRef.current || codigoActualRef.current !== codigo) return
      if (!snapshot) {
        // Solo mostrar "no encontrado" en la carga inicial. Durante el polling
        // se conserva el último snapshot bueno ante cualquier error transitorio.
        if (!cargadoRef.current) setEstado('no-encontrado')
        return
      }

      let firma = firmaSnapshotTorneoVivo(snapshot)
      if (cargadoRef.current && firma !== firmaRef.current) {
        // Marcar un ganador realiza varias escrituras consecutivas. Esperamos
        // brevemente y confirmamos el snapshot para no pintar el instante
        // intermedio entre el partido resuelto y la llave siguiente.
        await new Promise(resolve => setTimeout(resolve, 350))
        if (!activoRef.current || codigoActualRef.current !== codigo) return
        const confirmado = await leerSnapshot()
        if (!confirmado) return
        snapshot = confirmado
        firma = firmaSnapshotTorneoVivo(confirmado)
      }

      cargadoRef.current = true
      if (firma !== firmaRef.current) {
        firmaRef.current = firma
        setSnap(snapshot)
      }
      setEstado('ok')
    } catch {
      if (activoRef.current && codigoActualRef.current === codigo && !cargadoRef.current) {
        setEstado('no-encontrado')
      }
    } finally {
      if (peticionEnCursoRef.current === codigo) peticionEnCursoRef.current = null
    }
  }, [codigo])

  useEffect(() => {
    activoRef.current = true
    return () => { activoRef.current = false }
  }, [])

  useEffect(() => {
    codigoActualRef.current = codigo
  }, [codigo])

  // Restaurar identidad guardada y primera carga
  useEffect(() => {
    cargadoRef.current = false
    firmaRef.current = ''
    setSnap(null)
    setEstado('cargando')
    setYo(null)
    setPaso('gate')
    try {
      const raw = localStorage.getItem(storeKey)
      if (raw) { setYo(JSON.parse(raw)); setPaso('ver') }
    } catch { /* noop */ }
    void cargar()
  }, [storeKey, cargar])

  // Polling secuencial: una consulta termina antes de programar la siguiente.
  // Así no se acumulan renders ni solicitudes cuando cambia una llave.
  useEffect(() => {
    if (paso !== 'ver') return
    let cancelado = false
    const actualizar = async () => {
      if (document.visibilityState !== 'hidden') await cargar()
      if (!cancelado) timer.current = setTimeout(actualizar, 5000)
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') void cargar()
    }
    timer.current = setTimeout(actualizar, 5000)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      cancelado = true
      if (timer.current) clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [paso, cargar])

  function guardarIdentidad(id: { jugadorId: string | null; nombre: string }) {
    setYo(id)
    try { localStorage.setItem(storeKey, JSON.stringify(id)) } catch { /* noop */ }
    setPaso('ver')
  }

  if (estado === 'cargando') return <Centro>Cargando…</Centro>
  if (estado === 'no-encontrado') return (
    <Centro>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: text }}>Torneo no encontrado</div>
      <div style={{ fontSize: 13, color: muted, marginTop: 6 }}>Revisa el código <b>{codigo}</b> con quien te lo compartió.</div>
    </Centro>
  )
  if (!snap) return null

  if (paso === 'gate') return <Gate jugadores={snap.jugadores} onListo={guardarIdentidad} irCorreo={() => setPaso('correo')} />
  if (paso === 'correo') return <Correo codigo={codigo} onListo={guardarIdentidad} volver={() => setPaso('gate')} />

  return <Vivo key={claveSnapshot} snap={snap} yo={yo} cambiar={() => { try { localStorage.removeItem(storeKey) } catch { /* noop */ }; setYo(null); setPaso('gate') }} />
}

// ── Paso 1: ¿quién eres? — elegir nombre para seguir tus partidos ──
function Gate({ jugadores, onListo, irCorreo }: {
  jugadores: Jugador[]
  onListo: (i: { jugadorId: string | null; nombre: string }) => void; irCorreo: () => void
}) {
  const [sel, setSel] = useState('')

  // nombres únicos de inscritos, ordenados alfabéticamente
  const inscritos = useMemo(() => {
    const m = new Map<string, string>()
    for (const j of jugadores) if (!m.has(j.id)) m.set(j.id, j.nombre)
    return Array.from(m, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [jugadores])

  const elegir = () => {
    const nom = inscritos.find(i => i.id === sel)?.nombre
    if (sel && nom) onListo({ jugadorId: sel, nombre: nom })
  }

  return (
    <Centro>
      <div style={{ ...card, padding: 28, width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🏓</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: text, margin: 0 }}>¿Quién eres?</h1>
        <p style={{ fontSize: 13, color: muted, marginTop: 6, marginBottom: 20 }}>Elige tu nombre y sigue de cerca contra quién te toca.</p>

        {inscritos.length > 0 ? (
          <>
            <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...inp, marginTop: 0, marginBottom: 14, textAlign: 'center' }}>
              <option value="">— Elige tu nombre —</option>
              {inscritos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
            <button onClick={elegir} disabled={!sel} style={{ ...btnPrimary, opacity: sel ? 1 : 0.5, cursor: sel ? 'pointer' : 'not-allowed' }}>Ver mis partidos →</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: hint, marginBottom: 14 }}>El torneo aún no arma los grupos.</p>
            <button onClick={() => onListo({ jugadorId: null, nombre: 'Espectador' })} style={btnGhost}>Ver el torneo</button>
          </>
        )}

        <button onClick={irCorreo} style={{ background: 'none', border: 'none', color: purple, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 14 }}>No aparezco en la lista →</button>
      </div>
    </Centro>
  )
}

// ── Paso 2: no aparezco → dejo mi nombre → aviso al club ──
// Solo el nombre: sirve para seguir el torneo con tu nombre y para avisarle al
// club. El club confirma la inscripción y reingresa al jugador con RUT y pago.
function Correo({ codigo, onListo, volver }: {
  codigo: string
  onListo: (i: { jugadorId: string | null; nombre: string }) => void; volver: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function enviar() {
    setError('')
    if (nombre.trim().length < 2) { setError('Ingresa tu nombre'); return }
    setEnviando(true)
    const { error: e } = await supabase.rpc('solicitar_inscripcion_torneo', {
      p_codigo: codigo, p_nombre: nombre.trim(),
    })
    setEnviando(false)
    if (e) { setError('No se pudo enviar. Intenta de nuevo.'); return }
    setEnviado(true)
  }

  if (enviado) return (
    <Centro>
      <div style={{ ...card, padding: 28, width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: text, margin: 0 }}>¡Listo, {nombre.trim().split(' ')[0]}!</h1>
        <p style={{ fontSize: 13, color: muted, marginTop: 8, marginBottom: 20 }}>Le avisamos al club. Mientras tanto puedes seguir el torneo con tu nombre; el club confirmará tu inscripción.</p>
        <button onClick={() => onListo({ jugadorId: null, nombre: nombre.trim() || 'Invitado' })} style={btnPrimary}>Ver el torneo →</button>
        <button onClick={volver} style={btnGhost}>← Volver</button>
      </div>
    </Centro>
  )

  return (
    <Centro>
      <div style={{ ...card, padding: 28, width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: text, margin: 0, textAlign: 'center' }}>No apareces en la lista</h1>
        <p style={{ fontSize: 12.5, color: muted, marginTop: 6, marginBottom: 18, textAlign: 'center' }}>
          Deja tu nombre para seguir el torneo. Le avisamos al club para que confirme tu inscripción.
        </p>

        <label style={lbl}>Nombre y apellido
          <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} placeholder="Ej: Juan Pérez" style={inp} />
        </label>

        {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4, marginBottom: 6 }}>{error}</div>}

        <button onClick={enviar} disabled={enviando} style={{ ...btnPrimary, marginTop: 12, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'Enviando…' : 'Avisar al club →'}
        </button>
        <button onClick={volver} style={btnGhost}>← Volver</button>
      </div>
    </Centro>
  )
}

// ── Paso 3: vista en vivo ───────────────────────────────────
function Vivo({ snap, yo, cambiar }: { snap: Snapshot; yo: { jugadorId: string | null; nombre: string } | null; cambiar: () => void }) {
  const torneo = snap.torneo
  const grupos = Array.isArray(snap.grupos) ? snap.grupos : []
  const jugadores = Array.isArray(snap.jugadores) ? snap.jugadores : []
  const partidos = Array.isArray(snap.partidos) ? snap.partidos : []
  const fase = torneo.fase ?? ''

  // mi próximo partido: pendiente (sin ganador) donde participo
  const miProximo = useMemo(() => {
    if (!yo?.jugadorId) return null
    return partidos.find(p => !p.ganador && p.jugador_b && (p.jugador_a === yo.jugadorId || p.jugador_b === yo.jugadorId)) ?? null
  }, [partidos, yo])

  const esMio = (p: Partido) => yo?.jugadorId && (p.jugador_a === yo.jugadorId || p.jugador_b === yo.jugadorId)

  // partidos "en vivo" = pendientes con ambos jugadores definidos, agrupados por grupo/fase
  const enJuego = useMemo(() => partidos.filter(p => !p.ganador && p.jugador_a && p.jugador_b), [partidos])
  const enJuegoSecc = useMemo(() => agruparPartidos(enJuego, grupos), [enJuego, grupos])
  const totalEnJuego = enJuego.length

  // clasificados = los 2 primeros de cada grupo (por partidos ganados)
  const clasificados = useMemo(
    () => fase === 'grupos' ? standingsPorGrupo(grupos, jugadores, partidos) : [],
    [fase, grupos, jugadores, partidos],
  )

  // campeón = ganador de la final (para el mensaje al finalizar)
  const campeon = useMemo(() => {
    const f = partidos.find(p => p.fase === 'final' && p.ganador)
    if (!f) return null
    return { id: f.ganador, nombre: f.ganador === f.jugador_a ? f.nombre_a : f.nombre_b }
  }, [partidos])

  // desarrollo del torneo: todas las llaves de playoff por fase (jugadas y por jugar).
  // Mientras el torneo sigue en fase de grupos el cuadro se está armando (cupos
  // aún por definir): en público recién se muestra al entrar de lleno a playoffs.
  const faseTorneo = torneo?.fase ?? ''
  const llavesPorFase = useMemo(() => {
    if (faseTorneo === 'grupos') return []
    const playoff = partidos.filter(p => !p.grupo_id && p.fase && FASE_LABELS[p.fase] && p.fase !== 'grupos')
    const secc: { fase: string; titulo: string; partidos: Partido[] }[] = []
    for (const fase of Object.keys(FASE_LABELS)) {
      const ps = playoff.filter(p => p.fase === fase).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      if (ps.length) secc.push({ fase, titulo: FASE_LABELS[fase], partidos: ps })
    }
    return secc
  }, [partidos, faseTorneo])

  return (
    <div style={{ minHeight: '100vh', background: '#a9bac8', padding: '16px 12px 40px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ ...card, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: text }}>{torneo.nombre}</div>
            <div style={{ fontSize: 12, color: muted }}>{FASE_LABELS[fase] || fase || 'En preparación'}</div>
          </div>
          <span style={{ background: '#f0fdf4', color: green, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: green, display: 'inline-block' }} /> EN VIVO
          </span>
          <button onClick={cambiar} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', color: muted, fontSize: 11, cursor: 'pointer' }}>
            {yo?.jugadorId ? yo.nombre : 'Soy…'} ▾
          </button>
        </div>

        {/* Campeón: mensaje al finalizar el torneo */}
        {fase === 'finalizado' && campeon && (
          <div style={{ ...card, padding: 20, marginBottom: 14, textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a' }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>🏆</div>
            {campeon.id === yo?.jugadorId ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#b45309' }}>¡Enhorabuena, {(campeon.nombre || '').split(' ')[0]}! 🎉</div>
                <div style={{ fontSize: 13.5, color: '#92400e', marginTop: 6 }}>Ganaste el torneo. ¡Gracias por participar y te esperamos en el próximo! 🏓</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: 1 }}>Campeón del torneo</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#b45309', marginTop: 4 }}>{campeon.nombre || 'Por definir'}</div>
              </>
            )}
          </div>
        )}

        {/* Mi próximo partido */}
        {yo?.jugadorId && (
          <div style={{ ...card, padding: 16, marginBottom: 14, borderLeft: `4px solid ${purple}` }}>
            <div style={{ fontSize: 11, color: purple, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tu próximo partido</div>
            {miProximo ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <Lado nombre={miProximo.nombre_a} destaca={miProximo.jugador_a === yo.jugadorId} />
                <span style={{ fontSize: 12, color: hint, fontWeight: 700 }}>VS</span>
                <Lado nombre={miProximo.nombre_b} destaca={miProximo.jugador_b === yo.jugadorId} />
              </div>
            ) : (
              <div style={{ fontSize: 13, color: muted, textAlign: 'center' }}>Sin partidos pendientes por ahora. ¡Buen trabajo! 🎉</div>
            )}
          </div>
        )}

        {/* En juego, separado por grupo/fase */}
        <Seccion titulo={`En juego (${totalEnJuego})`}>
          {totalEnJuego === 0 && <Vacio texto="No hay partidos en curso en este momento." />}
          {enJuegoSecc.map(sec => (
            <div key={sec.titulo}>
              <SubTitulo>{sec.titulo}</SubTitulo>
              {sec.partidos.map(p => <FilaPartido key={p.id} p={p} mio={!!esMio(p)} />)}
            </div>
          ))}
        </Seccion>

        {/* Desarrollo del torneo: llaves por fase con resultados */}
        {llavesPorFase.length > 0 && (
          <Seccion titulo="🏆 Llaves del torneo">
            {llavesPorFase.map(sec => (
              <div key={sec.fase}>
                <SubTitulo>{sec.titulo}</SubTitulo>
                {sec.partidos.map(p => (
                  <div key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ padding: '7px 14px 0', fontSize: 11, fontWeight: 700, color: purple }}>Llave {(p.orden ?? 0) + 1}</div>
                    <FilaPartido p={p} mio={!!esMio(p)} />
                  </div>
                ))}
              </div>
            ))}
          </Seccion>
        )}

        {/* Clasificados: los 2 primeros de cada grupo — solo en fase de grupos */}
        {fase === 'grupos' && clasificados.length > 0 && (
          <Seccion titulo="Clasificados por grupo">
            {clasificados.map(c => (
              <div key={c.grupoId}>
                <SubTitulo>Grupo {c.nombre}</SubTitulo>
                {c.top.map((s, i) => <FilaClasificado key={s.id} pos={i + 1} s={s} mio={s.id === yo?.jugadorId} />)}
              </div>
            ))}
          </Seccion>
        )}

        {jugadores.length === 0 && (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 8 }}>
            El torneo aún no arma los grupos. Esta vista se actualiza sola cuando empiece.
          </div>
        )}
      </div>
    </div>
  )
}

// ── agrupar partidos por grupo (en orden) y luego por fase de playoff ──
function agruparPartidos(lista: Partido[], grupos: Grupo[]): { titulo: string; partidos: Partido[] }[] {
  const secc: { titulo: string; partidos: Partido[] }[] = []
  for (const g of grupos) {
    const ps = lista.filter(p => p.grupo_id === g.id)
    if (ps.length) secc.push({ titulo: `Grupo ${g.nombre}`, partidos: ps })
  }
  // playoffs (sin grupo), agrupados por fase según el orden de FASE_LABELS
  const playoff = lista.filter(p => !p.grupo_id)
  for (const fase of Object.keys(FASE_LABELS)) {
    const ps = playoff.filter(p => (p.fase ?? '') === fase).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    if (ps.length) secc.push({ titulo: FASE_LABELS[fase], partidos: ps })
  }
  // fases desconocidas al final
  const otras = playoff.filter(p => !(p.fase ?? '') || !FASE_LABELS[p.fase ?? ''])
  if (otras.length) secc.push({ titulo: 'Playoffs', partidos: otras })
  return secc
}

type Clasificado = { id: string; nombre: string; pg: number; pp: number }

// ── standings por grupo: solo los 2 primeros (por partidos ganados) ──
function standingsPorGrupo(grupos: Grupo[], jugadores: Jugador[], partidos: Partido[]): { grupoId: string; nombre: string; top: Clasificado[] }[] {
  const res: { grupoId: string; nombre: string; top: Clasificado[] }[] = []
  for (const g of grupos) {
    const players = jugadores.filter(j => j.grupo_id === g.id)
    const ps = partidos.filter(p => p.grupo_id === g.id && p.ganador)
    if (ps.length === 0) continue // sin resultados aún → no mostramos clasificados provisorios
    const stat = new Map<string, Clasificado>(players.map(j => [j.id, { id: j.id, nombre: j.nombre, pg: 0, pp: 0 }]))
    for (const p of ps) {
      const w = p.ganador!, l = p.jugador_a === w ? p.jugador_b : p.jugador_a
      if (stat.has(w)) stat.get(w)!.pg++
      if (l && stat.has(l)) stat.get(l)!.pp++
    }
    // ponytail: sin sets en el snapshot, el desempate posible es solo por victorias
    const orden = [...stat.values()].sort((a, b) => b.pg - a.pg || a.nombre.localeCompare(b.nombre))
    res.push({ grupoId: g.id, nombre: g.nombre, top: orden.slice(0, 2) })
  }
  return res
}

// ── piezas visuales ─────────────────────────────────────────
function FilaPartido({ p, mio }: { p: Partido; mio: boolean }) {
  const tieneB = !!p.jugador_b
  const esBye = !!p.jugador_a && !tieneB && !!p.ganador
  const ganoA = !!p.ganador && p.ganador === p.jugador_a
  const ganoB = !!p.ganador && p.ganador === p.jugador_b
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: mio ? '#faf5ff' : 'transparent', fontSize: 13 }}>
      <span style={{ flex: 1, textAlign: 'right', color: ganoA ? green : text, fontWeight: ganoA ? 700 : 400 }}>
        {ganoA && '✓ '}{p.nombre_a || 'Por definir'}
      </span>
      <span style={{ fontSize: 10, color: hint, minWidth: 20, textAlign: 'center' }}>{p.ganador ? '·' : 'vs'}</span>
      <span style={{ flex: 1, color: ganoB ? green : esBye ? hint : text, fontWeight: ganoB ? 700 : 400, fontStyle: esBye ? 'italic' : 'normal' }}>
        {esBye ? 'BYE (pasa directo)' : <>{ganoB && '✓ '}{tieneB ? (p.nombre_b || 'Por definir') : 'Por definir'}</>}
      </span>
    </div>
  )
}

function FilaClasificado({ pos, s, mio }: { pos: number; s: Clasificado; mio: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: mio ? '#faf5ff' : 'transparent', fontSize: 13 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: green, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{pos}º</span>
      <span style={{ flex: 1, color: text, fontWeight: 600 }}>{s.nombre}</span>
      <span className="tabular-nums" style={{ fontSize: 12, color: muted, fontWeight: 600 }}>{s.pg}G · {s.pp}P</span>
    </div>
  )
}

function SubTitulo({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '7px 14px', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</div>
}

function Lado({ nombre, destaca }: { nombre: string | null; destaca: boolean | '' | null }) {
  return <span style={{ fontSize: 15, fontWeight: destaca ? 800 : 500, color: destaca ? purple : text, textAlign: 'center', flex: 1 }}>{nombre || 'Por definir'}</span>
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: text }}>{titulo}</div>
      {children}
    </div>
  )
}

const Vacio = ({ texto }: { texto: string }) => <div style={{ padding: '14px', fontSize: 12.5, color: hint, textAlign: 'center' }}>{texto}</div>

function Centro({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#a9bac8', padding: 20, textAlign: 'center', color: hint }}>{children}</div>
}

const btnPrimary: React.CSSProperties = { width: '100%', background: purple, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }
const btnGhost: React.CSSProperties = { width: '100%', background: 'transparent', color: muted, border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: muted, marginBottom: 12, fontWeight: 600 }
const inp: React.CSSProperties = { width: '100%', marginTop: 5, background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 10, padding: '11px 12px', color: text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontWeight: 400 }
