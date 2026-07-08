'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const FASE_LABELS: Record<string, string> = {
  grupos: 'Fase de grupos', avance: 'Llave de avance', '32vos': '32vos', '16vos': '16vos',
  '8vos': '8vos', cuartos: 'Cuartos', semis: 'Semifinal', final: 'Final', finalizado: 'Finalizado',
}

type Jugador = { id: string; nombre: string; grupo_id: string | null }
type Grupo = { id: string; nombre: string }
type Partido = {
  id: string; fase: string | null; grupo_id: string | null; orden: number | null
  jugador_a: string | null; jugador_b: string | null; ganador: string | null
  nombre_a: string | null; nombre_b: string | null
}
type Snapshot = {
  torneo: { id: string; nombre: string; fase: string | null; estado: string | null }
  grupos: Grupo[]; jugadores: Jugador[]; partidos: Partido[]
}

const text = '#0f172a', muted = '#64748b', hint = '#94a3b8', purple = '#4f46e5', green = '#16a34a'
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.12)' } as const

export default function VivoTorneoPage() {
  const params = useParams()
  const codigo = String(params.codigo || '').toUpperCase()
  const storeKey = `vivo:${codigo}`

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-encontrado'>('cargando')
  // identidad del espectador: se guarda en localStorage por torneo
  const [yo, setYo] = useState<{ jugadorId: string | null; nombre: string } | null>(null)
  const [paso, setPaso] = useState<'gate' | 'correo' | 'ver'>('gate')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('torneo_publico', { p_codigo: codigo })
    if (error || !data) { setEstado('no-encontrado'); return }
    setSnap(data as Snapshot)
    setEstado('ok')
  }, [codigo])

  // Restaurar identidad guardada y primera carga
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey)
      if (raw) { setYo(JSON.parse(raw)); setPaso('ver') }
    } catch { /* noop */ }
    cargar()
  }, [storeKey, cargar])

  // Polling en vivo mientras se están viendo los partidos (cada 5s)
  useEffect(() => {
    if (paso !== 'ver') return
    timer.current = setInterval(cargar, 5000)
    return () => { if (timer.current) clearInterval(timer.current) }
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
  if (paso === 'correo') return <Correo codigo={codigo} jugadores={snap.jugadores} onListo={guardarIdentidad} volver={() => setPaso('gate')} />

  return <Vivo snap={snap} yo={yo} cambiar={() => { try { localStorage.removeItem(storeKey) } catch { /* noop */ }; setYo(null); setPaso('gate') }} />
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
        <div style={{ fontSize: 34, marginBottom: 8 }}>🎾</div>
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
          <p style={{ fontSize: 12.5, color: hint, marginBottom: 14 }}>El torneo aún no arma los grupos.</p>
        )}

        <button onClick={() => onListo({ jugadorId: null, nombre: 'Espectador' })} style={btnGhost}>Solo estoy mirando</button>
        <button onClick={irCorreo} style={{ background: 'none', border: 'none', color: purple, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}>No aparezco en la lista →</button>
      </div>
    </Centro>
  )
}

// ── Paso 2 (solo club sin cuenta): nombre + correo → solicitud ──
function Correo({ codigo, jugadores, onListo, volver }: {
  codigo: string; jugadores: Jugador[]
  onListo: (i: { jugadorId: string | null; nombre: string }) => void; volver: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [jugadorId, setJugadorId] = useState<string>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  // nombres únicos de inscritos, para autocompletar quién eres
  const inscritos = useMemo(() => {
    const m = new Map<string, string>()
    for (const j of jugadores) if (!m.has(j.id)) m.set(j.id, j.nombre)
    return Array.from(m, ([id, nom]) => ({ id, nombre: nom })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [jugadores])

  async function enviar() {
    setError('')
    if (email.trim().indexOf('@') < 1) { setError('Ingresa un correo válido'); return }
    const nombreFinal = jugadorId ? (inscritos.find(i => i.id === jugadorId)?.nombre ?? nombre) : nombre
    setEnviando(true)
    const { error: e } = await supabase.rpc('solicitar_acceso_torneo', {
      p_codigo: codigo, p_nombre: nombreFinal.trim() || 'Sin nombre', p_email: email.trim(),
    })
    setEnviando(false)
    if (e) { setError('No se pudo registrar. Intenta de nuevo.'); return }
    onListo({ jugadorId: jugadorId || null, nombre: nombreFinal.trim() || 'Jugador' })
  }

  return (
    <Centro>
      <div style={{ ...card, padding: 28, width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: text, margin: 0, textAlign: 'center' }}>Deja tu correo</h1>
        <p style={{ fontSize: 12.5, color: muted, marginTop: 6, marginBottom: 18, textAlign: 'center' }}>
          Le avisamos al profe para crear tu cuenta. Mientras, ya puedes ver los partidos.
        </p>

        {inscritos.length > 0 && (
          <label style={lbl}>¿Cuál eres en la lista? (opcional)
            <select value={jugadorId} onChange={e => setJugadorId(e.target.value)} style={inp}>
              <option value="">— No estoy / no aparezco —</option>
              {inscritos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </label>
        )}

        {!jugadorId && (
          <label style={lbl}>Tu nombre
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellido" style={inp} />
          </label>
        )}

        <label style={lbl}>Tu correo
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.cl" type="email" style={inp} />
        </label>

        {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>}

        <button onClick={enviar} disabled={enviando} style={{ ...btnPrimary, marginTop: 16, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'Enviando…' : 'Enviar y ver partidos →'}
        </button>
        <button onClick={volver} style={btnGhost}>← Volver</button>
      </div>
    </Centro>
  )
}

// ── Paso 3: vista en vivo ───────────────────────────────────
function Vivo({ snap, yo, cambiar }: { snap: Snapshot; yo: { jugadorId: string | null; nombre: string } | null; cambiar: () => void }) {
  const { torneo, grupos, jugadores, partidos } = snap
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
  const clasificados = useMemo(() => standingsPorGrupo(grupos, jugadores, partidos), [grupos, jugadores, partidos])

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
    const ps = playoff.filter(p => (p.fase ?? '') === fase)
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
  const ganoA = p.ganador === p.jugador_a
  const ganoB = p.ganador === p.jugador_b
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: mio ? '#faf5ff' : 'transparent', fontSize: 13 }}>
      <span style={{ flex: 1, textAlign: 'right', color: ganoA ? green : text, fontWeight: ganoA ? 700 : 400 }}>{p.nombre_a || 'Por definir'}</span>
      <span style={{ fontSize: 10, color: hint, minWidth: 20, textAlign: 'center' }}>{p.ganador ? '·' : 'vs'}</span>
      <span style={{ flex: 1, color: ganoB ? green : text, fontWeight: ganoB ? 700 : 400 }}>{p.nombre_b || 'Por definir'}</span>
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
