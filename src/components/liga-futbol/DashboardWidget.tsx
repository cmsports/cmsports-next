'use client'

// Resumen de la liga de fútbol activa para el Dashboard principal. Vive
// aparte del dashboard (900 líneas, producción real de TDM) a propósito:
// fetch, estado y renderizado propios, así una liga de fútbol nunca puede
// romper nada de lo que ya funciona para los clubes de tenis de mesa.
// Si el club no tiene ninguna liga en curso, no renderiza nada.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Trophy, Users, Calendar, Clock, MapPin, Target, Wallet, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcularTablaPosiciones, calcularGoleadores, type EquipoStats } from '@/lib/domain/liga-futbol'

const supabase = createClient()

const C = {
  card: '#ffffff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', hint: '#94a3b8',
  green: '#059669', greenD: '#047857', greenL: '#f0fdf4', indigo: '#6366f1', indigoL: '#eef2ff',
  amber: '#d97706', amberL: '#fffbeb', pitch1: '#0d7a4f', pitch2: '#0a5c3c',
}
const MEDALLA = ['🥇', '🥈', '🥉']

interface Liga {
  id: string; nombre: string; estado: string; max_equipos: number; monto_inscripcion: number; formato: string
  cancha: string | null; dia_juego: string | null
  puntos_victoria: number; puntos_empate: number; puntos_derrota: number; puntos_wo_perdedor: number
}
interface Equipo {
  id: string; nombre: string; color_principal: string | null; grupo_id: string | null
  monto_pagado: number; estado_inscripcion: string
}
interface Grupo { id: string; nombre: string; orden: number }
interface Partido {
  equipo_local_id: string; equipo_visita_id: string; goles_local: number | null; goles_visita: number | null
  estado: string; equipo_wo_id: string | null; fecha_id: string | null; grupo_id: string | null
  hora: string | null
}
interface Fecha { id: string; numero: number; nombre: string | null; fecha: string | null; estado: string }
interface Jugador { id: string; nombre: string; equipo_id: string; numero: number | null }

function EquipoDot({ color }: { color: string | null }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color || C.hint, flexShrink: 0 }} />
}

export default function LigaFutbolDashboardWidget({ clubId }: { clubId: string | null | undefined }) {
  const router = useRouter()
  const [liga, setLiga] = useState<Liga | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [goleadores, setGoleadores] = useState<ReturnType<typeof calcularGoleadores>>([])
  const [jugadorNombre, setJugadorNombre] = useState<Record<string, { nombre: string; numero: number | null }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clubId) { setLoading(false); return }
    let vigente = true

    supabase.from('lf_ligas')
      .select('id, nombre, estado, max_equipos, monto_inscripcion, formato, cancha, dia_juego, puntos_victoria, puntos_empate, puntos_derrota, puntos_wo_perdedor')
      .eq('club_id', clubId).in('estado', ['en_curso', 'playoffs'])
      .order('creado_en', { ascending: false }).limit(1).maybeSingle()
      .then(async ({ data: ligaRow }) => {
        if (!vigente) return
        if (!ligaRow) { setLoading(false); return }
        setLiga(ligaRow as any)

        const [eqRes, gruposRes, partRes, fechasRes] = await Promise.all([
          supabase.from('lf_equipos').select('id, nombre, color_principal, grupo_id, monto_pagado, estado_inscripcion').eq('liga_id', ligaRow.id),
          supabase.from('lf_grupos').select('id, nombre, orden').eq('liga_id', ligaRow.id).order('orden'),
          supabase.from('lf_partidos').select('equipo_local_id, equipo_visita_id, goles_local, goles_visita, estado, equipo_wo_id, fecha_id, grupo_id, hora').eq('liga_id', ligaRow.id),
          supabase.from('lf_fechas').select('id, numero, nombre, fecha, estado').eq('liga_id', ligaRow.id).order('numero'),
        ])
        if (!vigente) return

        const equiposData = (eqRes.data as any) || []
        setEquipos(equiposData)
        setGrupos((gruposRes.data as any) || [])
        setPartidos((partRes.data as any) || [])
        setFechas((fechasRes.data as any) || [])

        const equipoIds = equiposData.map((e: Equipo) => e.id)
        if (equipoIds.length > 0) {
          const [jugRes, golesRes] = await Promise.all([
            supabase.from('lf_jugadores').select('id, nombre, equipo_id, numero').in('equipo_id', equipoIds),
            supabase.from('lf_goles').select('jugador_id, equipo_id, tipo').in('equipo_id', equipoIds),
          ])
          if (!vigente) return
          setJugadorNombre(Object.fromEntries(((jugRes.data as any) || []).map((j: Jugador) => [j.id, { nombre: j.nombre, numero: j.numero }])))
          setGoleadores(calcularGoleadores((golesRes.data as any) || []))
        }

        setLoading(false)
      })

    return () => { vigente = false }
  }, [clubId])

  if (loading) return null

  if (!liga) {
    return (
      <div
        onClick={() => router.push('/liga-futbol')}
        style={{
          background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14, padding: 24,
          marginBottom: 16, cursor: 'pointer', textAlign: 'center',
        }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>⚽ Crea tu primera liga</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
          Todavía no hay ninguna liga en curso. Arma equipos, fixture y empieza a cargar resultados.
        </div>
        <span style={{
          display: 'inline-block', background: C.greenL, color: C.green, borderRadius: 8,
          padding: '6px 14px', fontSize: 12, fontWeight: 700,
        }}>Crear liga →</span>
      </div>
    )
  }

  const equipoPorId = new Map(equipos.map(e => [e.id, e]))
  const reglas = {
    puntosVictoria: liga.puntos_victoria, puntosEmpate: liga.puntos_empate,
    puntosDerrota: liga.puntos_derrota, puntosWoPerdedor: liga.puntos_wo_perdedor,
  }
  const partidosDominio = (lista: Partido[]) => lista.map(p => ({
    equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
    golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
    estado: p.estado, equipoWoId: p.equipo_wo_id,
  }))

  // Tabla: por división si la liga usa grupos, o una sola tabla si no.
  const tablas: { titulo: string; filas: EquipoStats[] }[] = grupos.length > 0
    ? grupos.map(g => ({
      titulo: g.nombre,
      filas: calcularTablaPosiciones(
        equipos.filter(e => e.grupo_id === g.id).map(e => e.id),
        partidosDominio(partidos.filter(p => p.grupo_id === g.id)),
        reglas,
      ),
    }))
    : [{ titulo: 'Tabla', filas: calcularTablaPosiciones(equipos.map(e => e.id), partidosDominio(partidos), reglas) }]

  const partidosJugados = partidos.filter(p => p.estado === 'finalizado' || p.estado === 'wo').length
  const pctPartidos = partidos.length > 0 ? Math.round((partidosJugados / partidos.length) * 100) : 0
  const totalEsperado = equipos.length * liga.monto_inscripcion
  const totalPagado = equipos.reduce((s, e) => s + (e.monto_pagado || 0), 0)
  const pctRecaudado = totalEsperado > 0 ? Math.round((totalPagado / totalEsperado) * 100) : null

  const fechaProxima = fechas.find(f => f.estado !== 'finalizada')
  const partidosDeLaFecha = fechaProxima ? partidos.filter(p => p.fecha_id === fechaProxima.id) : []

  const deudores = equipos
    .filter(e => e.estado_inscripcion !== 'pagado')
    .map(e => ({ ...e, deuda: Math.max(0, liga.monto_inscripcion - (e.monto_pagado || 0)) }))
    .sort((a, b) => b.deuda - a.deuda)

  const kpis = [
    { icon: Users, label: 'Equipos', valor: `${equipos.length}/${liga.max_equipos}` },
    { icon: TrendingUp, label: 'Partidos jugados', valor: `${partidosJugados}/${partidos.length}${partidos.length > 0 ? ` · ${pctPartidos}%` : ''}` },
    { icon: Wallet, label: 'Inscripción recaudada', valor: pctRecaudado !== null ? `${pctRecaudado}%` : '—' },
    { icon: Calendar, label: 'Próxima fecha', valor: fechaProxima ? (fechaProxima.nombre || `Fecha ${fechaProxima.numero}`) : '—' },
  ]

  const cardStyle: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
  }
  const cardTitulo: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: C.hint, textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      onClick={() => router.push(`/liga-futbol/${liga.id}`)}
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(15,23,42,0.12)', marginBottom: 16, cursor: 'pointer',
      }}>
      {/* Cabecera estilo cancha */}
      <div style={{
        background: `linear-gradient(120deg, ${C.pitch1}, ${C.pitch2})`, padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trophy size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{liga.nombre}</div>
            <div style={{ fontSize: 11, opacity: 0.85, display: 'flex', gap: 10, marginTop: 2 }}>
              {liga.cancha && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{liga.cancha}</span>}
              {liga.dia_juego && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} />{liga.dia_juego}</span>}
            </div>
          </div>
        </div>
        <span style={{
          background: 'rgba(255,255,255,0.18)', padding: '4px 10px', borderRadius: 20,
          fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
        }}>{liga.estado === 'en_curso' ? '🟢 En curso' : liga.estado}</span>
      </div>

      <div style={{ padding: 18 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 18 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: C.greenL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <k.icon size={15} color={C.green} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.valor}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {/* Próxima fecha: todos los encuentros */}
          <div style={cardStyle}>
            <div style={cardTitulo}><Calendar size={12} />{fechaProxima ? (fechaProxima.nombre || `Fecha ${fechaProxima.numero}`) : 'Próxima fecha'}</div>
            {partidosDeLaFecha.length === 0 ? (
              <p style={{ fontSize: 12, color: C.hint, margin: 0 }}>No hay partidos programados.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {partidosDeLaFecha.map((p, i) => {
                  const local = equipoPorId.get(p.equipo_local_id)
                  const visita = equipoPorId.get(p.equipo_visita_id)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      {p.hora && <span style={{ color: C.hint, fontVariantNumeric: 'tabular-nums', width: 34, flexShrink: 0 }}>{p.hora}</span>}
                      <EquipoDot color={local?.color_principal ?? null} />
                      <span style={{ color: C.text, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{local?.nombre || '—'}</span>
                      <span style={{ color: C.hint, fontSize: 10 }}>vs</span>
                      <span style={{ color: C.text, fontWeight: 600, flex: 1, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{visita?.nombre || '—'}</span>
                      <EquipoDot color={visita?.color_principal ?? null} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Goleadores */}
          <div style={cardStyle}>
            <div style={cardTitulo}><Target size={12} />Goleadores</div>
            {goleadores.length === 0 ? (
              <p style={{ fontSize: 12, color: C.hint, margin: 0 }}>Todavía sin goles cargados.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {goleadores.slice(0, 5).map((g, i) => {
                  const eq = equipoPorId.get(g.equipoId)
                  const jug = jugadorNombre[g.jugadorId]
                  return (
                    <div key={g.jugadorId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ width: 16, flexShrink: 0 }}>{MEDALLA[i] || `${i + 1}.`}</span>
                      <EquipoDot color={eq?.color_principal ?? null} />
                      <span style={{ flex: 1, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {jug?.nombre || '—'}
                      </span>
                      <span style={{ color: C.muted, fontSize: 11 }}>{eq?.nombre}</span>
                      <span style={{ background: C.indigoL, color: C.indigo, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{g.goles}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tabla(s) de posiciones — por división si aplica, top 4 c/u */}
          {tablas.map(t => (
            <div key={t.titulo} style={cardStyle}>
              <div style={cardTitulo}><Trophy size={12} />{t.titulo}</div>
              {t.filas.length === 0 ? (
                <p style={{ fontSize: 12, color: C.hint, margin: 0 }}>Sin resultados todavía.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {t.filas.slice(0, 4).map((row, i) => (
                    <div key={row.equipoId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ width: 16, flexShrink: 0, textAlign: 'center' }}>{MEDALLA[i] || `${i + 1}.`}</span>
                      <EquipoDot color={equipoPorId.get(row.equipoId)?.color_principal ?? null} />
                      <span style={{ flex: 1, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {equipoPorId.get(row.equipoId)?.nombre || '—'}
                      </span>
                      <span style={{ color: C.muted, fontSize: 11 }}>{row.pj} PJ</span>
                      <span style={{ background: C.indigoL, color: C.indigo, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 800, minWidth: 26, textAlign: 'center' }}>{row.pts} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Pagos pendientes */}
          <div style={cardStyle}>
            <div style={cardTitulo}><Wallet size={12} />Pagos pendientes</div>
            {deudores.length === 0 ? (
              <p style={{ fontSize: 12, color: C.green, margin: 0, fontWeight: 600 }}>Todos los equipos están al día ✓</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {deudores.slice(0, 5).map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <EquipoDot color={e.color_principal} />
                    <span style={{ flex: 1, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nombre}</span>
                    <span style={{
                      background: e.estado_inscripcion === 'abonado' ? C.amberL : '#fef2f2',
                      color: e.estado_inscripcion === 'abonado' ? C.amber : '#dc2626',
                      borderRadius: 6, padding: '2px 7px', fontSize: 10.5, fontWeight: 700,
                    }}>{e.estado_inscripcion === 'abonado' ? 'Parcial' : 'Pendiente'}</span>
                  </div>
                ))}
                {deudores.length > 5 && (
                  <div style={{ fontSize: 11, color: C.hint }}>+{deudores.length - 5} más</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
