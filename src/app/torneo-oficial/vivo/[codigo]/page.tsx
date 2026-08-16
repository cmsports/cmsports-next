'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { armarCeldasMural, type PartidoParaMural } from '@/lib/domain/programar-oficial'
import ProgramaOficialTablero, { type CeldaProgramaOficial } from '@/components/torneo-oficial/ProgramaOficialTablero'
import { CONFIG } from '@/lib/config'

const supabase = createClient()
const FASE_LABELS = CONFIG.FASE_LABELS as Record<string, string>

type Snap = {
  campeonato: {
    id: string
    nombre: string
    sede: string | null
    fecha_inicio: string
    fecha_fin: string | null
    mesas_count: number
    codigo: string
  }
  eventos: Array<{ id: string; nombre: string; fecha_juego?: string | null; fase: string }>
  grupos: Array<{ id: string; evento_id: string; nombre: string }>
  inscritos: Array<{ id: string; nombre: string; asociacion: string | null }>
  partidos: Array<{
    id: string
    evento_id: string
    grupo_id: string | null
    fase: string
    inscrito_a_id: string | null
    inscrito_b_id: string | null
    ganador_id: string | null
    mesa: number | null
    programado_en: string | null
    numero_ittf: number | null
    es_walkover: boolean
    tipo_cierre: string | null
  }>
  especiales: Array<{ fecha: string; hora: string; etiqueta: string }>
}

export default function OficialVivoPage() {
  const params = useParams()
  const codigo = String(params.codigo || '').toUpperCase()
  const [snap, setSnap] = useState<Snap | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-encontrado'>('cargando')
  const [diaSel, setDiaSel] = useState('')

  const cargar = useCallback(async () => {
    if (!codigo) return
    const { data, error } = await supabase.rpc('oficial_campeonato_publico', { p_codigo: codigo })
    if (error || !data) {
      setEstado(prev => (prev === 'ok' ? prev : 'no-encontrado'))
      return
    }
    const parsed = data as Snap
    setSnap(parsed)
    setEstado('ok')
    setDiaSel(prev => prev || parsed.campeonato.fecha_inicio)
  }, [codigo])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => { void cargar() }, 15_000)
    return () => clearInterval(t)
  }, [cargar])

  const nombrePorId = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of snap?.inscritos || []) {
      m.set(i.id, i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre)
    }
    return m
  }, [snap])

  const eventoMap = useMemo(() => new Map((snap?.eventos || []).map(e => [e.id, e.nombre])), [snap])
  const grupoNombre = useMemo(() => new Map((snap?.grupos || []).map(g => [g.id, g.nombre])), [snap])

  const mural = useMemo(() => {
    if (!snap) return []
    const partidos: PartidoParaMural[] = snap.partidos.map(p => ({
      id: p.id,
      mesa: p.mesa,
      programadoEn: p.programado_en,
      fase: p.fase,
      grupoId: p.grupo_id,
      grupoNombre: p.grupo_id ? grupoNombre.get(p.grupo_id) ?? null : null,
      eventoNombre: eventoMap.get(p.evento_id) || null,
      eventoId: p.evento_id,
      jugadorA: p.inscrito_a_id ? (nombrePorId.get(p.inscrito_a_id) || '?') : '?',
      jugadorB: p.inscrito_b_id ? (nombrePorId.get(p.inscrito_b_id) || '?') : 'BYE',
      ganadorId: p.ganador_id,
      tipoCierre: p.tipo_cierre,
      esWalkover: p.es_walkover,
    }))
    return armarCeldasMural(partidos, snap.especiales || [])
  }, [snap, nombrePorId, eventoMap, grupoNombre])

  const dias = useMemo(() => {
    const set = new Set<string>()
    if (snap?.campeonato.fecha_inicio) set.add(snap.campeonato.fecha_inicio)
    if (snap?.campeonato.fecha_fin) set.add(snap.campeonato.fecha_fin)
    for (const c of mural) set.add(c.fecha)
    return [...set].sort()
  }, [snap, mural])

  const celdas: CeldaProgramaOficial[] = useMemo(() => {
    const fecha = diaSel || snap?.campeonato.fecha_inicio
    return mural.filter(m => !fecha || m.fecha === fecha).map(m => ({
      id: m.partidoIds[0] || `esp-${m.fecha}-${m.hora}`,
      mesa: m.mesa,
      hora: m.hora,
      faseLabel: m.tipo === 'especial' ? m.etiqueta : m.tipo === 'grupo' ? 'Grupos' : m.etiqueta,
      jugadorA: m.tipo === 'partido' ? (m.detalle?.split(' vs ')[0] ?? m.etiqueta) : m.etiqueta,
      jugadorB: m.tipo === 'partido' ? (m.detalle?.split(' vs ')[1] ?? '') : (m.detalle || ''),
      eventoNombre: m.eventoNombre,
      estado: m.estado === 'especial' ? 'especial' as const : m.estado,
      etiqueta: m.etiqueta,
      tipo: m.tipo,
      detalle: m.detalle,
    }))
  }, [mural, diaSel, snap])

  const proximo = useMemo(() => {
    const ahora = Date.now()
    const pend = (snap?.partidos || [])
      .filter(p => p.programado_en && !p.ganador_id && p.inscrito_a_id && p.inscrito_b_id)
      .sort((a, b) => new Date(a.programado_en!).getTime() - new Date(b.programado_en!).getTime())
    return pend.find(p => new Date(p.programado_en!).getTime() >= ahora - 20 * 60_000) || pend[0] || null
  }, [snap])

  if (estado === 'cargando') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Cargando programa…</div>
  }
  if (estado === 'no-encontrado' || !snap) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, color: '#0f172a' }}>Campeonato no encontrado</h1>
        <p style={{ color: '#64748b' }}>Revisá el código del mural ({codigo || '—'}).</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 14px 48px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 700, letterSpacing: 1 }}>PROGRAMA EN VIVO</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: '#0f172a' }}>{snap.campeonato.nombre}</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
          {snap.campeonato.fecha_inicio}{snap.campeonato.fecha_fin ? ` → ${snap.campeonato.fecha_fin}` : ''}
          {snap.campeonato.sede ? ` · ${snap.campeonato.sede}` : ''}
          {' · '}código {snap.campeonato.codigo}
        </p>
      </div>

      {proximo && (
        <div style={{
          background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12,
          padding: 14, marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', marginBottom: 4 }}>PRÓXIMO PARTIDO</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            Mesa {proximo.mesa} · {new Date(proximo.programado_en!).toLocaleTimeString('es-CL', {
              hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago',
            })}
            {proximo.numero_ittf ? ` · #${proximo.numero_ittf}` : ''}
          </div>
          <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
            {nombrePorId.get(proximo.inscrito_a_id!) || '?'} vs {nombrePorId.get(proximo.inscrito_b_id!) || '?'}
            {' · '}{eventoMap.get(proximo.evento_id)} · {FASE_LABELS[proximo.fase] || proximo.fase}
          </div>
        </div>
      )}

      {dias.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {dias.map(d => (
            <button key={d} type="button" onClick={() => setDiaSel(d)}
              style={{
                border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px',
                background: diaSel === d ? '#eef2ff' : '#fff', cursor: 'pointer',
              }}>
              {d}
            </button>
          ))}
        </div>
      )}

      <ProgramaOficialTablero
        celdas={celdas}
        mesasCount={snap.campeonato.mesas_count}
        emptyMessage="Todavía no hay partidos en el mural."
      />

      <p style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        Se actualiza solo cada 15 s. CMSports · torneo oficial
      </p>
    </div>
  )
}
