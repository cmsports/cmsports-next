'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { reiniciarRanking } from '@/app/actions/ranking'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'
import { calcularRankingInterno, type ResultadoJugadorRanking, type TorneoConPartidos } from '@/lib/domain/rankingInterno'
import { TABLA_PUNTAJE } from '@/lib/domain/puntajeTorneo'
import { firmarUrls } from '@/lib/supabase/privado'
import { useEnVivo } from '@/lib/useEnVivo'

const supabase = createClient()
const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type CategoriaRanking = {
  categoria: string
  genero: string | null
  filas: ResultadoJugadorRanking[]
}

const medallas = ['🥇', '🥈', '🥉']

export default function RankingPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [rankingPorCategoria, setRankingPorCategoria] = useState<CategoriaRanking[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reiniciando, setReiniciando] = useState(false)
  const [reiniciadoEn, setReiniciadoEn] = useState<string | null>(null)
  const [fotoPorJugador, setFotoPorJugador] = useState<Record<string, string>>({})
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) { router.replace('/dashboard'); return }
    cargar()
  }, [authLoading, perfil])

  // Sin esto la tabla quedaba fija desde que se abría: cargar un resultado de
  // torneo o cambiar su categoría/género no se veía hasta recargar la página.
  //
  // `torneo_partidos` no tiene columna club_id propia (solo torneo_id, que
  // hay que cruzar con `torneos` para saber de qué club es), así que acá va
  // sin filtrar por club — con los ~4 clubes que hoy usan el sistema el costo
  // es una recarga de más cuando OTRO club anota un resultado, y es preferible
  // a no enterarse nunca de los propios. `torneos` sí tiene club_id y va
  // filtrado. El reinicio del ranking ya refresca solo, con su propio cargar()
  // en handleReiniciar, así que no hace falta escuchar clubes acá.
  useEnVivo(['torneo_partidos', 'torneos'], perfil?.club_id ?? null, () => { void cargar() }, { conClub: ['torneos'] })

  async function cargar() {
    if (!perfil?.club_id) return
    setLoading(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    // 1. Timestamp de reinicio del club
    const { data: club } = await sb
      .from('clubes')
      .select('ranking_reiniciado_en')
      .eq('id', perfil.club_id)
      .single()
    const reinicioTs = club?.ranking_reiniciado_en ?? null
    setReiniciadoEn(reinicioTs)

    // 2. Torneos internos del club, solo los que ya terminaron.
    //
    // Los puntos salen del puesto final, y un torneo en curso todavía no tiene
    // puestos: el que hoy va en semifinales puede terminar campeón o cuarto.
    // Se cuentan cuando se cierran. Los archivados también: archivar es
    // guardar un torneo terminado, no anularlo — si no, archivar le movería el
    // ranking a todo el mundo.
    let queryT = sb
      .from('torneos')
      .select('id,categoria,genero,fecha_fin,creado_en')
      .eq('club_id', perfil.club_id)
      .eq('tipo', 'interno')
      .in('estado', ['finalizado', 'archivado'])
    if (reinicioTs) queryT = queryT.gt('creado_en', reinicioTs)

    const { data: torneos } = await queryT

    // 2b. El ranking que el club traía en papel (migración 188). Se suma a lo
    // que se juegue en el sistema. Se descarta si el reinicio es posterior a la
    // carga: si no, "Reiniciar Ranking" dejaría todo en cero salvo el arrastre.
    const { data: saldos } = await sb
      .from('ranking_saldo_inicial')
      .select('jugador_id,categoria,genero,puntos,creado_en')
      .eq('club_id', perfil.club_id)

    type FilaSaldo = { jugador_id: string; categoria: string; genero: string | null; puntos: number; creado_en: string }
    const saldoPorClave = new Map<string, Map<string, number>>()
    for (const s of ((saldos ?? []) as FilaSaldo[])) {
      if (reinicioTs && s.creado_en <= reinicioTs) continue
      const clave = `${s.categoria}||${s.genero ?? ''}`
      const porJugador = saldoPorClave.get(clave) ?? new Map<string, number>()
      porJugador.set(s.jugador_id, (porJugador.get(s.jugador_id) ?? 0) + s.puntos)
      saldoPorClave.set(clave, porJugador)
    }

    if (!torneos?.length && saldoPorClave.size === 0) {
      setRankingPorCategoria([])
      setLoading(false)
      return
    }

    // 3. Mapear torneoId → { categoria, genero }
    const torneoMeta: Record<string, { categoria: string; genero: string | null }> = {}
    for (const t of ((torneos ?? []) as { id: string; categoria: string | null; genero: string | null }[])) {
      torneoMeta[t.id] = { categoria: t.categoria ?? 'Sin categoría', genero: t.genero ?? null }
    }
    const torneoIds = Object.keys(torneoMeta)

    // 4. Todos los partidos de esos torneos (1 sola query). `fase` es lo que
    // dice hasta dónde llegó cada jugador, y de ahí sale su puesto y sus
    // puntos — ver calcularRankingInterno.
    //
    // Los de la fase de grupos entran igual: son los que dicen quién participó
    // sin clasificar a la llave, que también suma.
    const { data: partidos } = torneoIds.length
      ? await supabase
          .from('torneo_partidos')
          .select('torneo_id,jugador_a,jugador_b,ganador,fase')
          .in('torneo_id', torneoIds)
          .not('jugador_b', 'is', null)
          .not('ganador', 'is', null)
      : { data: [] }

    if (!partidos?.length && saldoPorClave.size === 0) { setRankingPorCategoria([]); setLoading(false); return }

    // 5. Agrupar por categoria + genero, y adentro por torneo: el puesto solo
    // existe dentro de un torneo, así que no se pueden mezclar.
    const torneosPorClave: Record<string, Map<string, TorneoConPartidos>> = {}
    const jugadoresIds = new Set<string>()

    // Las categorías que solo tienen saldo también son categorías del ranking:
    // sin esto, una que todavía no jugó ningún torneo en el sistema no saldría.
    for (const [clave, porJugador] of saldoPorClave) {
      torneosPorClave[clave] ??= new Map()
      for (const jugadorId of porJugador.keys()) jugadoresIds.add(jugadorId)
    }

    for (const p of (partidos ?? [])) {
      const torneoId = p.torneo_id as string
      const meta = torneoMeta[torneoId]
      const clave = `${meta?.categoria ?? 'Sin categoría'}||${meta?.genero ?? ''}`
      const porTorneo = (torneosPorClave[clave] ??= new Map())
      const acc = porTorneo.get(torneoId) ?? { torneoId, partidos: [] }
      acc.partidos.push({
        jugador_a: p.jugador_a as string, jugador_b: p.jugador_b as string,
        ganador: p.ganador as string, fase: p.fase as string | null,
      })
      porTorneo.set(torneoId, acc)
      jugadoresIds.add(p.jugador_a as string)
      jugadoresIds.add(p.jugador_b as string)
    }

    // 6. Nombres y fotos, en una sola consulta. Las fotos se firman todas
    // juntas con `firmarUrls`: una petición por jugador dejaría la pantalla
    // inusable con treinta en la lista.
    const { data: jugadores } = await sb
      .from('jugadores')
      .select('id,nombre,foto_path')
      .in('id', [...jugadoresIds])

    const nombreMap: Record<string, string> = {}
    for (const j of (jugadores || [])) nombreMap[j.id] = j.nombre

    const firmadas = await firmarUrls((jugadores ?? []).map((j: { foto_path?: string | null }) => j.foto_path))
    const fotos: Record<string, string> = {}
    for (const j of ((jugadores ?? []) as { id: string; foto_path?: string | null }[])) {
      const url = j.foto_path ? firmadas[j.foto_path] : null
      if (url) fotos[j.id] = url
    }
    setFotoPorJugador(fotos)

    // 7. Construir ranking por categoria + genero
    const conDatos: Record<string, CategoriaRanking> = {}
    for (const [clave, porTorneo] of Object.entries(torneosPorClave)) {
      const [categoria, genero] = clave.split('||')
      const filas = calcularRankingInterno(
        [...porTorneo.values()],
        id => nombreMap[id] || 'Desconocido',
        saldoPorClave.get(clave),
      )
      conDatos[clave] = { categoria, genero: genero || null, filas }
    }

    const resultado: CategoriaRanking[] = Object.values(conDatos)
    resultado.sort((a, b) => {
      const catCmp = a.categoria.localeCompare(b.categoria, 'es')
      if (catCmp !== 0) return catCmp
      // varones, damas, mixto, y sin género al final
      const gOrder = (g: string | null) => g === 'varones' ? 0 : g === 'damas' ? 1 : g === 'mixto' ? 2 : 3
      return gOrder(a.genero) - gOrder(b.genero)
    })

    // El jugador solo ve la categoría donde compite. Se filtra por dónde
    // aparece él y no por su `categoria` de ficha: la del ranking sale del
    // torneo y las dos no siempre se escriben igual, así que compararlas por
    // texto lo dejaría sin ranking sin que nadie entendiera por qué.
    const soloSuyas = perfil?.rol === 'jugador' && perfil.jugador_id
      ? resultado.filter(r => r.filas.some(f => f.jugadorId === perfil.jugador_id))
      : resultado

    setRankingPorCategoria(soloSuyas)
    if (soloSuyas.length > 0 && !categoriaActiva) setCategoriaActiva(`${soloSuyas[0].categoria}||${soloSuyas[0].genero ?? ''}`)
    setLoading(false)
  }

  async function handleReiniciar() {
    // El reinicio no borra filas: guarda una fecha y el cálculo ignora todo lo
    // anterior. Pero para el club el efecto es el mismo que borrar, y arrastra
    // el ranking que se importó del papel —que costó dos rondas de preguntas a
    // la asociación—, así que el aviso lo dice con todas las letras.
    if (!confirm(
      '¿Reiniciar el ranking?\n\n'
      + 'Todos vuelven a cero: se dejan de contar los torneos ya jugados Y el ranking '
      + 'que se cargó desde la planilla del club.\n\n'
      + 'Cambia en el Ranking, en el perfil de cada jugador y en su ficha.\n\n'
      + 'Esto no se puede deshacer.',
    )) return
    setReiniciando(true)
    const res = await reiniciarRanking()
    setReiniciando(false)
    if (res.error) { alert(res.error); return }
    setCategoriaActiva(null)
    cargar()
  }

  const esAdmin = perfil?.rol === 'admin'
  const rankingActivo = rankingPorCategoria.find(r => `${r.categoria}||${r.genero ?? ''}` === categoriaActiva)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando ranking...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: text }}>Ranking</h1>
              {/* La explicación del puntaje ocupaba media pantalla arriba de
                  todo y se lee una vez en la vida. Ahora vive detrás del "?". */}
              <button onClick={() => setAyudaAbierta(a => !a)}
                aria-label="Cómo se calculan los puntos"
                style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `1px solid ${ayudaAbierta ? '#7c3aed' : '#cbd5e1'}`,
                  background: ayudaAbierta ? '#7c3aed' : 'transparent',
                  color: ayudaAbierta ? '#fff' : hint,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0 }}>
                ?
              </button>
            </div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Torneos internos · puntos según el puesto final</div>
            {reiniciadoEn && (
              <div style={{ fontSize: 11, color: hint, marginTop: 3 }}>
                Desde: {new Date(reiniciadoEn).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
          {esAdmin && (
            <button
              onClick={handleReiniciar}
              disabled={reiniciando}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              {reiniciando ? 'Reiniciando...' : '↺ Reiniciar'}
            </button>
          )}
        </div>

        {ayudaAbierta && (
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginBottom: 8 }}>
              ¿Cómo se calculan los puntos?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {TABLA_PUNTAJE.map(({ puesto, puntos }) => (
                <div key={puesto} style={{ background: '#ede9fe', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: '#3730a3', fontWeight: 600 }}>
                  {puesto} = <strong>{puntos} pts</strong>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#6d28d9', lineHeight: 1.6 }}>
              Cada torneo reparte puntos según <strong>dónde terminó</strong> cada jugador, no por cuántos partidos ganó.
              Los dos que caen en semifinales quedan 3-4 y se llevan lo mismo; los cuatro que caen en cuartos, 5-8.
              El que participa y no pasa de la fase de grupos igual suma. Perder no resta nada.
              Los puntos se <strong>acumulan entre todos los torneos</strong> de esa categoría, y se actualizan cuando el torneo termina.
              Dos jugadores con los mismos puntos comparten puesto.
            </div>
          </div>
        )}

        {rankingPorCategoria.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
            {perfil?.rol === 'jugador'
              ? 'Todavía no jugaste partidos en torneos internos'
              : 'No hay partidos registrados en torneos internos'}
          </div>
        ) : (
          <>
            {/* Tabs de categorías. Con una sola no hay nada que elegir, que es
                el caso del jugador: solo ve la suya. */}
            <div style={{ display: rankingPorCategoria.length > 1 ? 'flex' : 'none', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {rankingPorCategoria.map(r => (
                <button
                  key={`${r.categoria}||${r.genero ?? ''}`}
                  onClick={() => setCategoriaActiva(`${r.categoria}||${r.genero ?? ''}`)}
                  style={{
                    background: categoriaActiva === `${r.categoria}||${r.genero ?? ''}` ? '#7c3aed' : '#ffffff',
                    color: categoriaActiva === `${r.categoria}||${r.genero ?? ''}` ? '#ffffff' : muted,
                    border: `1px solid ${categoriaActiva === `${r.categoria}||${r.genero ?? ''}` ? '#7c3aed' : '#e2e8f0'}`,
                    borderRadius: 20,
                    padding: '6px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {categoriaLabel(r.categoria)}
                  {r.genero && (
                    <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.85 }}>
                      {r.genero === 'varones' ? '♂' : r.genero === 'damas' ? '♀' : '⚥'}
                    </span>
                  )}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>({r.filas.length})</span>
                </button>
              ))}
            </div>

            {/* Tabla del ranking activo */}
            {rankingActivo && rankingActivo.filas.length === 0 && (
              <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
                Sin partidos registrados en <strong style={{ color: muted }}>{categoriaLabel(rankingActivo.categoria)}{rankingActivo.genero ? ` · ${rankingActivo.genero === 'varones' ? 'Varones' : rankingActivo.genero === 'damas' ? 'Damas' : 'Mixto'}` : ''}</strong>
              </div>
            )}
            {rankingActivo && rankingActivo.filas.length > 0 && (() => {
              const filas = rankingActivo.filas
              // Todo se agrupa por PUESTO y no por posición en la lista: si tres
              // empatan primeros, los tres son primeros y no hay segundo.
              const lideres = filas.filter(f => f.rank === 1)
              const escoltas = filas.filter(f => f.rank === 2 || f.rank === 3)
              // Con muchos empatados arriba el podio deja de serlo —pasa cuando
              // casi todos se fueron en grupos con los mismos 9 puntos—, así que
              // ahí se muestra la lista pareja y nada más.
              const destacar = lideres.length <= 2 && lideres.length + escoltas.length <= 4
              const resto = destacar ? filas.filter(f => f.rank > 3) : filas
              const tope = filas[0]?.pts || 1
              // Cuánto le falta a cada uno para pasar al puesto de más arriba.
              const faltaPara = (pts: number) => {
                const arriba = filas.find(f => f.pts > pts)
                return arriba ? arriba.pts - pts : 0
              }

              return (
                <>
                  {destacar && lideres.map(lider => (
                    <div key={lider.jugadorId}
                      onClick={() => router.push(`/jugadores/${lider.jugadorId}`)}
                      style={{ background: '#422006', borderRadius: 16, padding: 20, marginBottom: 14,
                        display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer',
                        border: lider.jugadorId === perfil?.jugador_id ? '2px solid #fbbf24' : 'none' }}>
                      <Retrato url={fotoPorJugador[lider.jugadorId]} nombre={lider.nombre} tam={74} destacado />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#f59e0b', fontWeight: 700, marginBottom: 5 }}>
                          {lideres.length > 1 ? 'LIDERES DE LA CATEGORÍA' : 'LÍDER DE LA CATEGORÍA'}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#fef3c7', lineHeight: 1.25, marginBottom: 8 }}>
                          {lider.nombre}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 32, fontWeight: 800, color: '#fbbf24', lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums' }}>{lider.pts}</span>
                          <span style={{ fontSize: 12, color: '#f59e0b' }}>puntos</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 40, flexShrink: 0 }}>🏆</div>
                    </div>
                  ))}

                  {destacar && escoltas.length > 0 && (
                    <div style={{ display: 'grid', gap: 12, marginBottom: 18,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                      {escoltas.map(fila => (
                        <div key={fila.jugadorId}
                          onClick={() => router.push(`/jugadores/${fila.jugadorId}`)}
                          style={{ ...card, padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            border: fila.jugadorId === perfil?.jugador_id ? '2px solid #7c3aed' : '1px solid #e2e8f0' }}>
                          <Retrato url={fotoPorJugador[fila.jugadorId]} nombre={fila.nombre} tam={46} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 10, color: hint, fontWeight: 700, marginBottom: 2 }}>
                              {medallas[fila.rank - 1]} {fila.rank}° lugar
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: text, lineHeight: 1.25, marginBottom: 3,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {fila.nombre}
                            </div>
                            <div style={{ fontSize: 17, fontWeight: 800, color: text, fontVariantNumeric: 'tabular-nums' }}>
                              {fila.pts}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {resto.length > 0 && (
                    <div style={{ ...card, overflow: 'hidden' }}>
                      {destacar && (
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0',
                          fontSize: 10, letterSpacing: 1, color: hint, fontWeight: 700 }}>
                          PERSIGUEN
                        </div>
                      )}
                      {resto.map((fila, idx) => {
                        const soyYo = fila.jugadorId === perfil?.jugador_id
                        const falta = faltaPara(fila.pts)
                        return (
                          <div
                            key={fila.jugadorId}
                            onClick={() => router.push(`/jugadores/${fila.jugadorId}`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                              borderBottom: idx < resto.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer',
                              // Su propia fila, para no buscarse entre treinta.
                              background: soyYo ? '#f5f3ff' : undefined,
                              borderLeft: soyYo ? '3px solid #7c3aed' : '3px solid transparent' }}
                          >
                            <div style={{ width: 22, fontSize: 13, fontWeight: 600, flexShrink: 0, textAlign: 'center',
                              color: soyYo ? '#7c3aed' : hint, fontVariantNumeric: 'tabular-nums' }}>
                              {fila.rank}
                            </div>
                            <Retrato url={fotoPorJugador[fila.jugadorId]} nombre={fila.nombre} tam={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5,
                                color: soyYo ? '#5b21b6' : text,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {fila.nombre}
                                {soyYo && <span style={{ fontSize: 11, fontWeight: 500, color: '#7c3aed' }}> · vos</span>}
                              </div>
                              <div style={{ height: 5, background: soyYo ? '#ddd6fe' : '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round((fila.pts / tope) * 100)}%`, height: '100%',
                                  background: soyYo ? '#7c3aed' : '#a78bfa', borderRadius: 3 }} />
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1,
                                color: soyYo ? '#5b21b6' : '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>
                                {fila.pts}
                              </div>
                              {/* Lo que engancha: cuánto falta para subir. */}
                              {falta > 0 && (
                                <div style={{ fontSize: 10, color: hint, marginTop: 3 }}>a {falta}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}

          </>
        )}
      </div>
    </AppLayout>
  )
}

/**
 * La cara del jugador en el ranking, o sus iniciales si todavía no subió foto.
 *
 * La foto es la misma de su ficha: el jugador la sube desde su perfil y acá
 * solo se lee. No hay una segunda carga de fotos para el ranking.
 */
function Retrato({ url, nombre, tam, destacado = false }: {
  url?: string
  nombre: string
  tam: number
  destacado?: boolean
}) {
  const borde = destacado ? '2px solid #f59e0b' : '1px solid #e2e8f0'
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nombre}
      style={{ width: tam, height: tam, borderRadius: '50%', objectFit: 'cover',
        border: borde, flexShrink: 0, margin: '0 auto', display: 'block' }} />
  }
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase()
  return (
    <div style={{ width: tam, height: tam, borderRadius: '50%', flexShrink: 0, margin: '0 auto',
      background: destacado ? '#fef3c7' : '#ede9fe', border: borde,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(tam * 0.36), fontWeight: 700,
      color: destacado ? '#a16207' : '#5b21b6' }}>
      {iniciales}
    </div>
  )
}
