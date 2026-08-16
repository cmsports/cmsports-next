'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import {
  crearCampeonatoOficial,
  archivarCampeonatoOficial,
  desarchivarCampeonatoOficial,
  eliminarCampeonatoOficialDefinitivo,
} from '@/app/actions/torneo-oficial'
import { fechaChile } from '@/lib/domain/fechaChile'
import { cargarOficialConCache, invalidarCacheOficial } from '@/lib/torneo-oficial/carga-cliente'
import { btnOutlineIndigo, btnPrimaryIndigo, modalOverlay, torneoUi } from '@/lib/torneos/ui-tokens'
import ManualOficialCuerpo, { type TabManualOficial } from '@/components/torneo-oficial/ManualOficialCuerpo'

const supabase = createClient()

type Campeonato = {
  id: string
  nombre: string
  sede: string | null
  zona: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado: string
  eventos_count?: number
}

const card = torneoUi.card

export default function TorneoOficialPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [lista, setLista] = useState<Campeonato[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [nombre, setNombre] = useState('')
  const [sede, setSede] = useState('')
  const [zona, setZona] = useState('')
  const [fechaInicio, setFechaInicio] = useState(fechaChile())
  const [fechaFin, setFechaFin] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [mostrarArchivados, setMostrarArchivados] = useState(false)
  const [vista, setVista] = useState<'lista' | TabManualOficial>('lista')
  const cargadoRef = useRef(false)
  const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'superadmin'

  const cacheKey = (clubId: string, archivados: boolean) =>
    `oficial:lista:${clubId}:${archivados ? 'arch' : 'act'}`

  const cargar = useCallback(async (clubId: string, silencioso = false, archivados = mostrarArchivados) => {
    await cargarOficialConCache(
      cacheKey(clubId, archivados),
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any
        let query = db.from('oficial_campeonatos')
          .select('id,nombre,sede,zona,fecha_inicio,fecha_fin,estado')
          .eq('club_id', clubId)
          .order('creado_en', { ascending: false })
        query = archivados ? query.eq('estado', 'archivado') : query.neq('estado', 'archivado')
        const { data } = await query

        const rows = (data || []) as Campeonato[]
        if (!rows.length) return []

        const ids = rows.map(r => r.id)
        const { data: eventos } = await db.from('oficial_eventos').select('id, campeonato_id').in('campeonato_id', ids)
        const count: Record<string, number> = {}
        for (const e of eventos || []) count[e.campeonato_id] = (count[e.campeonato_id] || 0) + 1
        return rows.map(r => ({ ...r, eventos_count: count[r.id] || 0 }))
      },
      {
        tablas: ['oficial_campeonatos', 'oficial_eventos'],
        silencioso,
        aplicar: (data) => { setLista(data); cargadoRef.current = true },
        setLoading,
        tieneDatos: () => cargadoRef.current,
      },
    )
  }, [mostrarArchivados])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargadoRef.current = false
    if (perfil.club_id) void cargar(perfil.club_id)
    else setLoading(false)
  }, [authLoading, perfil, cargar, router, mostrarArchivados])

  useEnVivo(
    ['oficial_campeonatos', 'oficial_eventos'],
    perfil?.club_id ?? null,
    () => { if (perfil?.club_id) void cargar(perfil.club_id, true) },
    { conClub: ['oficial_campeonatos', 'oficial_eventos'] },
  )

  function invalidarListas(clubId: string) {
    invalidarCacheOficial(cacheKey(clubId, true))
    invalidarCacheOficial(cacheKey(clubId, false))
  }

  async function crear() {
    setErrorMsg('')
    setGuardando(true)
    const res = await crearCampeonatoOficial({ nombre, sede, zona, fechaInicio, fechaFin: fechaFin || undefined })
    setGuardando(false)
    if (res.error) { setErrorMsg(res.error); return }
    setModal(false)
    setNombre(''); setSede(''); setZona('')
    if (res.id) {
      if (perfil?.club_id) {
        invalidarListas(perfil.club_id)
        await cargar(perfil.club_id, true)
      }
      router.push(`/torneo-oficial/${res.id}`)
    }
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: torneoUi.text }}>Torneo oficial</h1>
            <p style={{ margin: '6px 0 0', color: torneoUi.muted, fontSize: 14 }}>
              Reglas ITTF / Juez General. Separado de torneos de club.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {esAdmin && vista === 'lista' && (
              <button
                type="button"
                onClick={() => {
                  if (perfil?.club_id) invalidarListas(perfil.club_id)
                  setMostrarArchivados(v => !v)
                }}
                style={{
                  ...btnOutlineIndigo,
                  background: mostrarArchivados ? '#ede9fe' : '#ffffff',
                  color: mostrarArchivados ? '#3730a3' : torneoUi.muted,
                }}
              >
                {mostrarArchivados ? 'Ver activos' : 'Ver archivados'}
              </button>
            )}
            {esAdmin && !mostrarArchivados && (
              <button type="button" onClick={() => setModal(true)} style={btnPrimaryIndigo}>+ Nuevo campeonato</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          {([
            { id: 'lista' as const, label: 'Campeonatos' },
            { id: 'uso' as const, label: 'Cómo usar la app' },
            { id: 'reglas' as const, label: 'Reglas / bases' },
          ]).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setVista(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: vista === t.id ? '#4f46e5' : '#64748b',
                borderBottom: vista === t.id ? '2px solid #4f46e5' : '2px solid transparent',
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {vista !== 'lista' ? (
          <ManualOficialCuerpo tab={vista} onTab={t => setVista(t)} ocultarTabs />
        ) : loading && lista.length === 0 ? (
          <p style={{ color: torneoUi.hint }}>Cargando…</p>
        ) : lista.length === 0 ? (
          <div style={{ ...card, padding: 28, textAlign: 'center', color: torneoUi.muted }}>
            {mostrarArchivados
              ? 'Sin campeonatos archivados'
              : 'Crea el primer campeonato oficial para armar categorías, grupos y resultados con sets.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {lista.map(c => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/torneo-oficial/${c.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/torneo-oficial/${c.id}`) }}
                style={{ ...card, padding: 16, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 16, color: torneoUi.text }}>{c.nombre}</strong>
                    <div style={{ marginTop: 6, fontSize: 13, color: torneoUi.muted }}>
                      {c.fecha_inicio}{c.fecha_fin ? ` → ${c.fecha_fin}` : ''}
                      {c.sede ? ` · ${c.sede}` : ''}{c.zona ? ` · ${c.zona}` : ''}
                      {` · ${c.eventos_count || 0} evento(s)`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: torneoUi.muted, textTransform: 'uppercase' }}>{c.estado}</span>
                    {esAdmin && !mostrarArchivados && (
                      <button
                        type="button"
                        onClick={async e => {
                          e.stopPropagation()
                          if (!confirm(`¿Eliminar "${c.nombre}" definitivamente? Esta acción no se puede deshacer.`)) return
                          const res = await eliminarCampeonatoOficialDefinitivo({ campeonatoId: c.id })
                          if (res.error) { alert(res.error); return }
                          if (perfil?.club_id) {
                            invalidarListas(perfil.club_id)
                            await cargar(perfil.club_id, true)
                          }
                        }}
                        style={{ background: 'transparent', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 10px', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
                      >
                        Eliminar
                      </button>
                    )}
                    {esAdmin && mostrarArchivados && (
                      <>
                        <button
                          type="button"
                          onClick={async e => {
                            e.stopPropagation()
                            const res = await desarchivarCampeonatoOficial({ campeonatoId: c.id })
                            if (res.error) { alert(res.error); return }
                            if (perfil?.club_id) {
                              invalidarListas(perfil.club_id)
                              await cargar(perfil.club_id, true)
                            }
                          }}
                          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '5px 10px', color: '#16a34a', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                        >
                          Desarchivar
                        </button>
                        <button
                          type="button"
                          onClick={async e => {
                            e.stopPropagation()
                            if (!confirm(`¿Borrar definitivamente "${c.nombre}"? Se eliminarán eventos, inscritos, grupos y partidos.`)) return
                            const res = await eliminarCampeonatoOficialDefinitivo({ campeonatoId: c.id })
                            if (res.error) { alert(res.error); return }
                            if (perfil?.club_id) {
                              invalidarListas(perfil.club_id)
                              await cargar(perfil.club_id, true)
                            }
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
            ))}
          </div>
        )}

        {modal && (
          <div style={modalOverlay}>
            <div style={{ ...card, width: '100%', maxWidth: 440, padding: 20 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 18, color: torneoUi.text }}>Nuevo campeonato oficial</h2>
              <label style={labelStyle}>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} placeholder="2do Zonal Individual MET2" />
              <label style={labelStyle}>Sede</label>
              <input value={sede} onChange={e => setSede(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Zona</label>
              <input value={zona} onChange={e => setZona(e.target.value)} style={inputStyle} placeholder="Metropolitana 2 - Costa" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>Inicio</label>
                  <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Fin (opc.)</label>
                  <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={inputStyle} /></div>
              </div>
              {errorMsg && <p style={{ color: torneoUi.danger, fontSize: 13 }}>{errorMsg}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setModal(false)} style={{ ...btnOutlineIndigo, flex: 1 }}>Cancelar</button>
                <button type="button" onClick={crear} disabled={guardando || !nombre} style={{ ...btnPrimaryIndigo, flex: 1, opacity: guardando ? 0.6 : 1 }}>
                  {guardando ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: torneoUi.muted, marginBottom: 4, marginTop: 10 }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }
