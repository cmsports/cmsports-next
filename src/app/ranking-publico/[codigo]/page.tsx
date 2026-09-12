'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'
import { enBonito } from '@/lib/domain/nombreJugador'
import { claveCategoria } from '@/lib/supabase/rankingClub'

// La página que abre el QR del ranking pegado en la sede. Sin cuenta, sin
// menú: la tabla de la categoría que viene en la URL y las pestañas para
// mirar las demás. Los datos los sirve /api/ranking-publico/<código>, que
// exige que el club tenga el módulo `qr_publico`.
//
// Se refresca sola cada minuto: el QR "siempre lleva al ranking actualizado"
// y el papá que lo dejó abierto en el celular no tiene por qué recargar.

type Fila = { rank: number; nombre: string; pts: number; victorias: number; derrotas: number; jugados: number; torneos: number }
type Categoria = { categoria: string; genero: string | null; filas: Fila[] }
type Respuesta = { club: string; reiniciadoEn: string | null; categorias: Categoria[] }

const text = '#0f172a', muted = '#64748b', hint = '#94a3b8', purple = '#4f46e5'
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.12)' } as const

const generoLabel = (g: string | null) => g === 'varones' ? 'Varones' : g === 'damas' ? 'Damas' : g === 'mixto' ? 'Mixto' : ''

export default function RankingPublicoPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <RankingPublico />
    </Suspense>
  )
}

function Cargando() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef2f7' }}>
      <div style={{ color: hint }}>Cargando ranking...</div>
    </div>
  )
}

function RankingPublico() {
  const params = useParams()
  const search = useSearchParams()
  const codigo = String(params.codigo || '').toUpperCase()
  const categoriaUrl = search.get('categoria')
  const generoUrl = search.get('genero')

  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-existe' | 'error'>('cargando')
  const [activa, setActiva] = useState<string | null>(null)
  const [actualizado, setActualizado] = useState<Date | null>(null)

  useEffect(() => {
    if (!codigo) return
    let vivo = true
    const cargar = async () => {
      try {
        const res = await fetch(`/api/ranking-publico/${encodeURIComponent(codigo)}`, { cache: 'no-store' })
        if (!vivo) return
        if (res.status === 404) { setEstado('no-existe'); return }
        if (!res.ok) { setEstado('error'); return }
        const json = (await res.json()) as Respuesta
        if (!vivo) return
        setDatos(json)
        setEstado('ok')
        setActualizado(new Date())
      } catch {
        if (vivo) setEstado(prev => (prev === 'ok' ? 'ok' : 'error'))
      }
    }
    void cargar()
    const timer = setInterval(cargar, 60_000)
    return () => { vivo = false; clearInterval(timer) }
  }, [codigo])

  // La pestaña que se ve: la que tocó la persona; si no tocó ninguna, la que
  // pide el QR; y si esa no existe (o no viene), la primera.
  const activaEfectiva = useMemo(() => {
    if (!datos) return null
    if (activa) return activa
    const pedida = categoriaUrl ? claveCategoria(categoriaUrl, generoUrl || null) : null
    if (pedida && datos.categorias.some(c => claveCategoria(c.categoria, c.genero) === pedida)) return pedida
    const primera = datos.categorias[0]
    return primera ? claveCategoria(primera.categoria, primera.genero) : null
  }, [datos, activa, categoriaUrl, generoUrl])

  const categoria = useMemo(
    () => datos?.categorias.find(c => claveCategoria(c.categoria, c.genero) === activaEfectiva) ?? null,
    [datos, activaEfectiva],
  )

  if (estado === 'cargando') return <Cargando />

  if (estado === 'no-existe' || estado === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef2f7', padding: 20 }}>
        <div style={{ ...card, padding: 28, maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: text, marginBottom: 6 }}>
            {estado === 'no-existe' ? 'Este ranking no está disponible' : 'No se pudo cargar el ranking'}
          </div>
          <div style={{ fontSize: 13, color: muted }}>
            {estado === 'no-existe'
              ? 'El código del QR no corresponde a ningún club, o el club ya no publica su ranking.'
              : 'Revisa la conexión y vuelve a intentar.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f7', paddingBottom: 40 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'linear-gradient(135deg, #312e81, #4f46e5)', color: '#fff', padding: '14px 16px', boxShadow: '0 2px 14px rgba(15,23,42,0.18)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 }}>{datos?.club}</div>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>🏆 Ranking</div>
          {actualizado && (
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>
              Actualizado a las {actualizado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              {datos?.reiniciadoEn && ` · desde el ${new Date(datos.reiniciadoEn).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}`}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 12px' }}>
        {datos && datos.categorias.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {datos.categorias.map(c => {
              const clave = claveCategoria(c.categoria, c.genero)
              const esActiva = clave === activaEfectiva
              return (
                <button key={clave} onClick={() => setActiva(clave)}
                  style={{ padding: '7px 12px', borderRadius: 20, border: esActiva ? `2px solid ${purple}` : '1px solid #e2e8f0', background: esActiva ? '#ede9fe' : '#fff', color: esActiva ? purple : muted, fontSize: 12, fontWeight: esActiva ? 700 : 500, cursor: 'pointer' }}>
                  {categoriaLabel(c.categoria)}{c.genero ? ` · ${generoLabel(c.genero)}` : ''}
                </button>
              )
            })}
          </div>
        )}

        {!categoria && (
          <div style={{ ...card, padding: 24, textAlign: 'center', color: muted, fontSize: 13 }}>
            Todavía no hay torneos cerrados: el ranking aparece cuando termine el primero.
          </div>
        )}

        {categoria && (
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: text }}>
                {categoriaLabel(categoria.categoria)}{categoria.genero ? ` · ${generoLabel(categoria.genero)}` : ''}
              </div>
              <div style={{ fontSize: 11, color: hint }}>{categoria.filas.length} jugadores</div>
            </div>
            {categoria.filas.length === 0 && (
              <div style={{ padding: 20, color: muted, fontSize: 13, textAlign: 'center' }}>Sin partidos registrados.</div>
            )}
            {categoria.filas.map((f, i) => {
              const podio = f.rank === 1 ? '🥇' : f.rank === 2 ? '🥈' : f.rank === 3 ? '🥉' : null
              return (
                <div key={`${f.nombre}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid #f1f5f9', background: f.rank <= 3 ? '#fffbeb' : '#fff' }}>
                  <div style={{ width: 34, textAlign: 'center', fontSize: podio ? 20 : 14, fontWeight: 700, color: muted }}>
                    {podio ?? `${f.rank}°`}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enBonito(f.nombre)}</div>
                    <div style={{ fontSize: 11, color: hint }}>
                      {f.torneos} {f.torneos === 1 ? 'torneo' : 'torneos'} · {f.victorias}G {f.derrotas}P
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: purple, fontVariantNumeric: 'tabular-nums' }}>{f.pts} <span style={{ fontSize: 10, fontWeight: 600, color: hint }}>pts</span></div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: hint, marginTop: 18 }}>
          CmSports · el ranking se actualiza solo al cerrar cada torneo
        </div>
      </div>
    </div>
  )
}
