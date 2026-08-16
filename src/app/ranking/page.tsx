'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { reiniciarRanking } from '@/app/actions/ranking'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'
import { calcularRankingInterno, faltaParaSubir, type ResultadoJugadorRanking, type TorneoConPartidos } from '@/lib/domain/rankingInterno'
import { TABLA_PUNTAJE } from '@/lib/domain/puntajeTorneo'
import { enBonito } from '@/lib/domain/nombreJugador'
import { exportarRankingPdf } from '@/lib/ranking-pdf'
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

/**
 * Los papelitos que caen detrás del podio.
 *
 * Fijos y no al azar: con Math.random() el servidor y el navegador dibujarían
 * posiciones distintas y React se quejaría de que el HTML no coincide.
 */
const SERPENTINA = [
  { left: '6%',  color: '#fbbf24', delay: '0s',    dur: '3.1s' },
  { left: '14%', color: '#f472b6', delay: '0.7s',  dur: '3.6s' },
  { left: '23%', color: '#34d399', delay: '1.4s',  dur: '3.2s' },
  { left: '31%', color: '#60a5fa', delay: '0.3s',  dur: '3.9s' },
  { left: '40%', color: '#fbbf24', delay: '2.1s',  dur: '3.3s' },
  { left: '48%', color: '#f472b6', delay: '1.1s',  dur: '3.7s' },
  { left: '57%', color: '#34d399', delay: '2.6s',  dur: '3.1s' },
  { left: '65%', color: '#60a5fa', delay: '0.5s',  dur: '3.5s' },
  { left: '74%', color: '#fbbf24', delay: '1.8s',  dur: '3.8s' },
  { left: '82%', color: '#f472b6', delay: '2.9s',  dur: '3.2s' },
  { left: '90%', color: '#34d399', delay: '0.9s',  dur: '3.6s' },
  { left: '96%', color: '#60a5fa', delay: '2.3s',  dur: '3.4s' },
]

export default function RankingPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [rankingPorCategoria, setRankingPorCategoria] = useState<CategoriaRanking[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reiniciando, setReiniciando] = useState(false)
  const [reiniciadoEn, setReiniciadoEn] = useState<string | null>(null)
  const [clubNombre, setClubNombre] = useState('')
  const [exportando, setExportando] = useState(false)
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

    // 1. Timestamp de reinicio del club. El nombre viene en la misma consulta:
    // lo necesita el encabezado del PDF.
    const { data: club } = await sb
      .from('clubes')
      .select('nombre,ranking_reiniciado_en')
      .eq('id', perfil.club_id)
      .single()
    const reinicioTs = club?.ranking_reiniciado_en ?? null
    setReiniciadoEn(reinicioTs)
    setClubNombre(club?.nombre ?? '')

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
      '¿ESTÁS SEGURO DE LO QUE QUIERES HACER?\n\n'
      + '¿Reiniciar el ranking?\n\n'
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

  // Exporta la categoría que se está mirando, no todas: el ranking se muestra
  // y se imprime de a una, y un PDF con las cinco juntas no es lo que se pega
  // en el mural. Lo puede bajar cualquiera —el jugador incluido—, porque es la
  // misma tabla que ya tiene delante; el jugador solo ve la suya.
  async function handlePdf() {
    if (!rankingActivo) return
    setExportando(true)
    try {
      await exportarRankingPdf(rankingActivo, { clubNombre, reiniciadoEn })
    } catch (e) {
      alert(`No se pudo generar el PDF: ${e instanceof Error ? e.message : e}`)
    } finally {
      setExportando(false)
    }
  }

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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {rankingActivo && rankingActivo.filas.length > 0 && (
              <button
                onClick={handlePdf}
                disabled={exportando}
                style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: exportando ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
              >
                {exportando ? 'Generando...' : '↓ PDF'}
              </button>
            )}
            {esAdmin && (
              <button
                onClick={handleReiniciar}
                disabled={reiniciando}
                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {reiniciando ? 'Reiniciando...' : '↺ Reiniciar'}
              </button>
            )}
          </div>
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
            <div style={{ display: rankingPorCategoria.length > 1 ? 'flex' : 'none', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {rankingPorCategoria.map(r => {
                const activa = categoriaActiva === `${r.categoria}||${r.genero ?? ''}`
                return (
                  <button
                    key={`${r.categoria}||${r.genero ?? ''}`}
                    onClick={() => setCategoriaActiva(`${r.categoria}||${r.genero ?? ''}`)}
                    style={{
                      background: activa ? 'linear-gradient(135deg,#4c1d95,#7c3aed)' : '#ffffff',
                      color: activa ? '#ffffff' : muted,
                      border: `1px solid ${activa ? 'transparent' : '#e2e8f0'}`,
                      borderRadius: 22,
                      padding: '8px 17px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.18s var(--curva)',
                      boxShadow: activa ? '0 6px 16px rgba(76,29,149,0.32)' : 'none',
                    }}
                  >
                    {categoriaLabel(r.categoria)}
                    {r.genero && (
                      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.85 }}>
                        {r.genero === 'varones' ? '♂' : r.genero === 'damas' ? '♀' : '⚥'}
                      </span>
                    )}
                    <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 600,
                      background: activa ? 'rgba(255,255,255,0.22)' : '#f1f5f9',
                      color: activa ? '#fff' : hint,
                      borderRadius: 10, padding: '1px 7px' }}>
                      {r.filas.length}
                    </span>
                  </button>
                )
              })}
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
              const oro = filas.filter(f => f.rank === 1)
              const plata = filas.filter(f => f.rank === 2)
              const bronce = filas.filter(f => f.rank === 3)
              // El podio solo tiene sentido con un ganador claro. Si empatan
              // varios arriba —pasa cuando casi todos se fueron en grupos con
              // los mismos 9 puntos— se muestra la lista pareja y nada más.
              const hayPodio = oro.length === 1 && plata.length <= 1 && bronce.length <= 1
              const resto = hayPodio ? filas.filter(f => f.rank > 3) : filas
              const tope = filas[0]?.pts || 1
              const faltaPara = (pts: number) => faltaParaSubir(filas, pts)

              return (
                <>
                  {hayPodio && (
                    <div key={categoriaActiva} className="portada-ranking" style={{ position: 'relative', overflow: 'hidden',
                      borderRadius: 22, marginBottom: 18, padding: '22px 18px 0',
                      background: 'linear-gradient(160deg,#1e1b4b 0%,#312e81 55%,#5b21b6 100%)',
                      boxShadow: '0 20px 44px rgba(49,46,129,0.38)' }}>

                      {/* Serpentina: doce papelitos cayendo. Solo adorno. */}
                      {SERPENTINA.map((s, i) => (
                        <span key={i} aria-hidden className="serpentina"
                          style={{ left: s.left, background: s.color,
                            animationDelay: s.delay, animationDuration: s.dur }} />
                      ))}

                      <div style={{ position: 'relative', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(196,181,253,0.85)',
                          fontWeight: 800, marginBottom: 16 }}>
                          🏓 PODIO
                        </div>

                        {/* Podio de verdad: tres columnas al ras del piso, con
                            alturas distintas. El campeón al medio y más alto —se
                            entiende quién ganó sin leer un número. */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
                          {[
                            { fila: plata[0], alto: 74, medalla: '🥈', tono: '#cbd5e1', fondo: 'linear-gradient(180deg,#e2e8f0,#94a3b8)', clase: 'plata', foto: 54 },
                            { fila: oro[0], alto: 108, medalla: '🥇', tono: '#fde68a', fondo: 'linear-gradient(180deg,#fcd34d,#f59e0b)', clase: 'oro', foto: 72 },
                            { fila: bronce[0], alto: 56, medalla: '🥉', tono: '#fdba74', fondo: 'linear-gradient(180deg,#fdba74,#c2703a)', clase: 'bronce', foto: 54 },
                          ].map(col => {
                            if (!col.fila) return <div key={col.clase} style={{ flex: 1, maxWidth: 150 }} />
                            const f = col.fila
                            const esCampeon = col.clase === 'oro'
                            const soyYo = f.jugadorId === perfil?.jugador_id
                            return (
                              <div key={col.clase} onClick={() => router.push(`/jugadores/${f.jugadorId}`)}
                                style={{ flex: 1, maxWidth: 150, cursor: 'pointer' }}>
                                <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
                                  <Retrato url={fotoPorJugador[f.jugadorId]} nombre={f.nombre}
                                    tam={col.foto} destacado={esCampeon} />
                                  <span className={esCampeon ? 'medalla-campeon' : undefined}
                                    style={{ position: 'absolute', bottom: -6, right: -6,
                                      fontSize: esCampeon ? 26 : 20, lineHeight: 1,
                                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
                                    {col.medalla}
                                  </span>
                                </div>
                                {/* Dos líneas y corta: "Agustín Edison Leonel
                                    Calderón Vera" son 35 caracteres y en una
                                    columna de 150px se comía cuatro renglones,
                                    dejando las tres cabezas a distinta altura. */}
                                <div style={{ fontSize: esCampeon ? 13 : 11.5, fontWeight: 700, color: '#fff',
                                  lineHeight: 1.25, marginBottom: 3, height: 32, overflow: 'hidden',
                                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                  textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}>
                                  {enBonito(f.nombre)}
                                </div>
                                {soyYo && (
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#c4b5fd', marginBottom: 3 }}>· vos ·</div>
                                )}
                                {/* La columna del podio */}
                                <div className={`columna-podio ${col.clase}`}
                                  style={{ height: col.alto, background: col.fondo,
                                    borderRadius: '10px 10px 0 0', display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: 2,
                                    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.45)' }}>
                                  {esCampeon
                                    ? <Contador hasta={f.pts} style={{ fontSize: 34, fontWeight: 900,
                                        color: '#422006', lineHeight: 1, letterSpacing: -1,
                                        fontVariantNumeric: 'tabular-nums' }} />
                                    : <span style={{ fontSize: 22, fontWeight: 900, lineHeight: 1,
                                        color: col.clase === 'plata' ? '#1e293b' : '#4a1b0c',
                                        fontVariantNumeric: 'tabular-nums' }}>{f.pts}</span>}
                                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                                    color: col.clase === 'plata' ? '#475569' : esCampeon ? '#78350f' : '#6b3410' }}>
                                    {f.rank}° LUGAR
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Los que persiguen ─────────────────────────────── */}
                  {resto.length > 0 && (
                    <div style={{ ...card, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0',
                        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10.5, letterSpacing: 1.4, color: muted, fontWeight: 800 }}>
                          {hayPodio ? '🏓 EN CARRERA' : '🏓 TABLA'}
                        </span>
                        <span style={{ fontSize: 11, color: hint }}>{filas.length} compiten</span>
                      </div>
                      <div key={categoriaActiva} className="lista-ranking">
                        {resto.map((fila, idx) => {
                          const soyYo = fila.jugadorId === perfil?.jugador_id
                          const falta = faltaPara(fila.pts)
                          return (
                            <div
                              key={fila.jugadorId}
                              onClick={() => router.push(`/jugadores/${fila.jugadorId}`)}
                              style={{ display: 'flex', alignItems: 'center', gap: 13,
                                padding: '13px 18px', cursor: 'pointer',
                                borderBottom: idx < resto.length - 1 ? '1px solid #f1f5f9' : 'none',
                                background: soyYo ? 'linear-gradient(90deg,#f5f3ff,#fdfbff)' : undefined,
                                borderLeft: soyYo ? '3px solid #7c3aed' : '3px solid transparent' }}
                            >
                              {/* El puesto en su medallón, que es lo que hace
                                  que la lista se lea de un vistazo. */}
                              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                                background: soyYo ? '#7c3aed' : '#f1f5f9',
                                color: soyYo ? '#fff' : muted }}>
                                {fila.rank}
                              </div>
                              <Retrato url={fotoPorJugador[fila.jugadorId]} nombre={fila.nombre} tam={40} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6,
                                  color: soyYo ? '#5b21b6' : text,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {enBonito(fila.nombre)}
                                  {soyYo && <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed' }}> · vos</span>}
                                </div>
                                <div style={{ height: 7, background: '#eef2f7', borderRadius: 4, overflow: 'hidden' }}>
                                  <div className="barra-ranking" style={{
                                    width: `${Math.max(Math.round((fila.pts / tope) * 100), 4)}%`, height: '100%',
                                    borderRadius: 4,
                                    background: soyYo
                                      ? 'linear-gradient(90deg,#6d28d9,#a78bfa)'
                                      : 'linear-gradient(90deg,#8b5cf6,#c4b5fd)' }} />
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 46 }}>
                                <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5,
                                  color: soyYo ? '#5b21b6' : text, fontVariantNumeric: 'tabular-nums' }}>
                                  {fila.pts}
                                </div>
                                {/* Lo que engancha: cuánto falta para subir. */}
                                {falta > 0 && (
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', marginTop: 3 }}>
                                    ▲ {falta}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
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
  /** El líder: anillo dorado en vez del borde de siempre. */
  destacado?: boolean
}) {
  const anillo = destacado
    ? { border: '3px solid #fbbf24', boxShadow: '0 0 0 4px rgba(251,191,36,0.22), 0 4px 14px rgba(0,0,0,0.25)' }
    : { border: '2px solid rgba(255,255,255,0.55)', boxShadow: '0 2px 8px rgba(15,23,42,0.12)' }

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nombre}
      style={{ width: tam, height: tam, borderRadius: '50%', objectFit: 'cover',
        flexShrink: 0, display: 'block', ...anillo }} />
  }
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase()
  return (
    <div style={{ width: tam, height: tam, borderRadius: '50%', flexShrink: 0,
      background: destacado
        ? 'linear-gradient(135deg,#fbbf24,#f59e0b)'
        : 'linear-gradient(135deg,#a78bfa,#7c3aed)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(tam * 0.36), fontWeight: 800,
      color: destacado ? '#422006' : '#fff', ...anillo }}>
      {iniciales}
    </div>
  )
}

/**
 * Un número que sube hasta su valor al aparecer.
 *
 * Solo para el puntaje del líder: el ojo lo sigue mientras crece y eso hace que
 * el número se mire, en vez de estar ahí desde siempre. Dura poco a propósito
 * —600ms— porque más que eso deja de ser un detalle y pasa a hacer esperar.
 */
function Contador({ hasta, style }: { hasta: number; style?: React.CSSProperties }) {
  const [valor, setValor] = useState(0)

  useEffect(() => {
    // Quien pide no tener animaciones ve el número final y listo. Va dentro de
    // un frame igual que la animación: escribir el estado de forma síncrona acá
    // encadena un render de más por cada vez que se dibuja la pantalla.
    const quieto = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (quieto || hasta <= 0) {
      const directo = requestAnimationFrame(() => setValor(hasta))
      return () => cancelAnimationFrame(directo)
    }

    const DURACION = 600
    const arranque = performance.now()
    let vivo = true
    const tick = (ahora: number) => {
      if (!vivo) return
      const avance = Math.min((ahora - arranque) / DURACION, 1)
      // Desacelera al final: llegar de golpe se ve mecánico.
      const suave = 1 - Math.pow(1 - avance, 3)
      setValor(Math.round(hasta * suave))
      if (avance < 1) requestAnimationFrame(tick)
    }
    const id = requestAnimationFrame(tick)
    return () => { vivo = false; cancelAnimationFrame(id) }
  }, [hasta])

  return <span style={style}>{valor}</span>
}
