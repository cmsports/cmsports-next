'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import {
  aplicarPunto,
  calcularSaqueActual,
  construirSorteo,
  formatearTimer,
  FORMATO_LABEL,
  intercambiarLadosMesa,
  jugadorEnPosicion,
  labelEvento,
  parsePosicionMesa,
  parseSorteo,
  parseTarjetas,
  quitarPunto,
  resumenSorteo,
  saqueInicialDelJuego,
  segundosTranscurridos,
  segundosVisibles,
  textoAvisoCambioLado,
  timerAgotado,
  type Lado,
  type PartidoEvento,
  type PartidoTecnico,
  type PosicionMesa,
  type SorteoEleccion,
  type TarjetasLado,
  type TimerModo,
} from '@/lib/tecnico/marcador'
import { sincronizarResultadoDesdeMarcador } from '@/app/actions/torneo-oficial'
import styles from '../marcador.module.css'

const supabase = createClient()

function horaEvento(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

export default function MarcadorPartidoPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#94a3b8', background: '#0f172a' }}>Cargando marcador...</div>}>
      <MarcadorPartidoContent />
    </Suspense>
  )
}

function MarcadorPartidoContent() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const vuelta = searchParams.get('vuelta')
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [partido, setPartido] = useState<PartidoTecnico | null>(null)
  const [eventos, setEventos] = useState<PartidoEvento[]>([])
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  const esStaff = ['admin', 'profesor', 'superadmin'].includes(perfil?.rol ?? '')
  const linkVolver = vuelta || '/tecnico/marcador'

  const mapPartido = useCallback((row: Record<string, unknown>): PartidoTecnico => ({
    ...(row as unknown as PartidoTecnico),
    tarjetas_a: parseTarjetas(row.tarjetas_a),
    tarjetas_b: parseTarjetas(row.tarjetas_b),
    timer_modo: (row.timer_modo === 'cuenta_atras' ? 'cuenta_atras' : 'cronometro') as TimerModo,
    timer_limite_segundos: row.timer_limite_segundos != null ? Number(row.timer_limite_segundos) : null,
    historial_sets: Array.isArray(row.historial_sets) ? row.historial_sets as Array<[number, number]> : [],
    sorteo: parseSorteo(row.sorteo),
    sorteo_completo: Boolean(row.sorteo_completo),
    lado_mesa_a: parsePosicionMesa(row.lado_mesa_a, 'izquierda'),
    lado_mesa_b: parsePosicionMesa(row.lado_mesa_b, 'derecha'),
    saque_inicial_lado: row.saque_inicial_lado === 'a' || row.saque_inicial_lado === 'b' ? row.saque_inicial_lado : null,
    cambio_lado_deciding_hecho: Boolean(row.cambio_lado_deciding_hecho),
  }), [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 9000)
    return () => clearTimeout(t)
  }, [aviso])

  async function sincronizarConTorneoOficial(historial: Array<[number, number]>, ganadorLado: Lado | null) {
    if (!ganadorLado || !id) return
    const res = await sincronizarResultadoDesdeMarcador({ marcadorId: id, sets: historial, ganadorLado })
    if (res.error) { setError(res.error); return }
    // Ninguno de estos dos es un error, pero tampoco se guardó: sin avisarlo, el
    // árbitro cierra el partido, no ve nada y se va pensando que quedó cargado.
    if (res.yaTeniaResultado) {
      setAviso('Este partido ya tenía resultado cargado en el torneo. El marcador no lo cambió.')
    } else if (res.sinPartidoOficial) {
      setAviso('Marcador guardado. No está asociado a un partido del torneo oficial, así que no se envió resultado.')
    }
  }

  const cargarEventos = useCallback(async () => {
    if (!perfil?.club_id || !id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db.from('tecnico_partido_eventos')
      .select('id, tipo, lado, detalle, creado_en')
      .eq('club_id', perfil.club_id).eq('partido_id', id)
      .order('creado_en', { ascending: false }).limit(80)
    setEventos((data ?? []) as PartidoEvento[])
  }, [id, perfil?.club_id])

  const cargar = useCallback(async () => {
    if (!perfil?.club_id || !id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data, error: err } = await db.from('tecnico_partidos').select('*').eq('id', id).eq('club_id', perfil.club_id).maybeSingle()
    if (err || !data) {
      const raw = err?.message || ''
      setError(raw.includes('sorteo') || raw.includes('lado_mesa')
        ? 'Falta aplicar la migración 177_marcador_sorteo_lados en Supabase.'
        : (raw || 'No se encontró el partido.'))
      setPartido(null)
      return
    }
    setError('')
    setPartido(mapPartido(data))
    void cargarEventos()
  }, [cargarEventos, id, mapPartido, perfil?.club_id])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.replace('/login'); return }
    void cargar()
  }, [authLoading, cargar, perfil, router])

  useEnVivo(
    ['tecnico_partidos', 'tecnico_partido_eventos'],
    perfil?.club_id ?? null,
    () => { void cargar(); void cargarEventos() },
    { conClub: ['tecnico_partidos', 'tecnico_partido_eventos'] },
  )

  useEffect(() => {
    if (!partido?.timer_corriendo) return
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [partido?.timer_corriendo])

  async function insertarEvento(evento: { tipo: string; lado?: Lado; detalle?: Record<string, unknown> }) {
    if (!partido || !perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('tecnico_partido_eventos').insert({
      club_id: perfil.club_id,
      partido_id: partido.id,
      tipo: evento.tipo,
      lado: evento.lado ?? null,
      detalle: evento.detalle ?? {},
      creado_por: perfil.id ?? null,
    })
    // El puntaje ya se guardó en tecnico_partidos (persistir revisa ese
    // error aparte) — esto es el historial de tarjetas/cambios de lado/
    // challenges. Si falla, antes se perdía sin que nadie se enterara.
    if (error) setError('No se pudo guardar el evento (tarjeta/cambio de lado): ' + error.message)
    void cargarEventos()
  }

  async function persistir(
    patch: Partial<PartidoTecnico>,
    evento?: { tipo: string; lado?: Lado; detalle?: Record<string, unknown> },
  ) {
    if (!partido || !perfil?.club_id || !esStaff) return
    setGuardando(true)
    setPartido({ ...partido, ...patch, actualizado_en: new Date().toISOString() } as PartidoTecnico)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: upErr } = await db.from('tecnico_partidos').update({ ...patch, actualizado_en: new Date().toISOString() })
      .eq('id', partido.id).eq('club_id', perfil.club_id)
    if (evento && !upErr) await insertarEvento(evento)
    setGuardando(false)
    if (upErr) { setError(upErr.message); void cargar() }
  }

  useEffect(() => {
    if (!partido || !esStaff || !timerAgotado(partido)) return
    void persistir(
      { timer_corriendo: false, timer_segundos: segundosTranscurridos(partido), timer_inicio: null, estado: 'pausado' },
      { tipo: 'pause', detalle: { motivo: 'tiempo_agotado' } },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, partido?.timer_corriendo])

  async function sumarPunto(lado: Lado) {
    if (!partido || !esStaff || partido.estado === 'finalizado') return
    if (!partido.sorteo_completo) {
      setError('Registra el sorteo antes de marcar puntos.')
      return
    }
    const r = aplicarPunto(partido, lado)
    const historial = [...(partido.historial_sets ?? [])]
    if (r.setCompletado) historial.push(r.setCompletado)

    const patch: Partial<PartidoTecnico> = {
      puntos_a: r.puntos_a,
      puntos_b: r.puntos_b,
      games_a: r.games_a,
      games_b: r.games_b,
      juego_actual: r.juego_actual,
      estado: r.estado,
      ganador_lado: r.ganador_lado,
      historial_sets: historial,
      timer_corriendo: r.finPartido ? false : (partido.timer_corriendo || true),
      timer_inicio: partido.timer_corriendo || partido.estado === 'preparacion'
        ? (partido.timer_inicio || new Date().toISOString()) : partido.timer_inicio,
    }

    if (r.cambioLado) {
      Object.assign(patch, intercambiarLadosMesa(partido))
      patch.cambio_lado_deciding_hecho = r.cambioLado.motivo === 'punto_5_set_decisivo'
      if (r.finJuego && !r.finPartido) patch.cambio_lado_deciding_hecho = false
      setAviso(textoAvisoCambioLado(r.cambioLado.motivo))
    }

    await persistir(patch, {
      tipo: r.finPartido ? 'fin_partido' : r.finJuego ? 'fin_juego' : 'punto',
      lado: r.finPartido || r.finJuego ? (r.ladoJuego ?? lado) : lado,
      detalle: { finJuego: r.finJuego, finPartido: r.finPartido, setCompletado: r.setCompletado },
    })

    if (r.cambioLado) {
      await insertarEvento({ tipo: 'cambio_lado', detalle: { motivo: r.cambioLado.motivo } })
    }

    if (r.finPartido) await sincronizarConTorneoOficial(historial, r.ganador_lado)
  }

  async function restarPunto(lado: Lado) {
    if (!partido || !esStaff) return
    const patch = quitarPunto(partido, lado)
    if (!patch) return
    await persistir(patch, { tipo: 'deshacer_punto', lado })
  }

  async function toggleTimer() {
    if (!partido || !esStaff || partido.estado === 'finalizado') return
    if (!partido.sorteo_completo) { setError('Completa el sorteo antes de iniciar.'); return }
    if (partido.timer_corriendo) {
      await persistir(
        { timer_corriendo: false, timer_segundos: segundosTranscurridos(partido), timer_inicio: null, estado: partido.estado === 'en_curso' ? 'pausado' : partido.estado },
        { tipo: 'pause' },
      )
    } else {
      await persistir(
        { timer_corriendo: true, timer_inicio: new Date().toISOString(), estado: partido.estado === 'preparacion' || partido.estado === 'pausado' ? 'en_curso' : partido.estado },
        { tipo: partido.estado === 'preparacion' ? 'inicio' : 'resume' },
      )
    }
  }

  async function guardarConfigTiempo(modo: TimerModo, minutos: number | null) {
    if (!partido || !esStaff || partido.estado !== 'preparacion') return
    await persistir(
      { timer_modo: modo, timer_limite_segundos: modo === 'cuenta_atras' && minutos != null ? Math.max(1, minutos) * 60 : null, timer_segundos: 0, timer_corriendo: false, timer_inicio: null },
      { tipo: 'ajuste', detalle: { timer_modo: modo, minutos } },
    )
  }

  async function guardarSorteo(params: Parameters<typeof construirSorteo>[0]) {
    if (!partido || !esStaff) return
    const built = construirSorteo(params)
    await persistir(
      { sorteo: built.sorteo, sorteo_completo: true, lado_mesa_a: built.lado_mesa_a, lado_mesa_b: built.lado_mesa_b, saque_inicial_lado: built.saque_inicial_lado },
      { tipo: 'sorteo', detalle: built.sorteo as unknown as Record<string, unknown> },
    )
    setError('')
  }

  async function setTarjeta(lado: Lado, campo: keyof TarjetasLado, valor: boolean | number) {
    if (!partido || !esStaff) return
    const key = lado === 'a' ? 'tarjetas_a' : 'tarjetas_b'
    const actual = lado === 'a' ? partido.tarjetas_a : partido.tarjetas_b
    await persistir({ [key]: { ...actual, [campo]: valor } } as Partial<PartidoTecnico>, { tipo: 'tarjeta', lado, detalle: { campo, valor } })
  }

  async function usarChallenge(lado: Lado) {
    if (!partido || !esStaff) return
    const usados = lado === 'a' ? partido.challenge_a : partido.challenge_b
    if (usados >= partido.challenge_max) return
    const key = lado === 'a' ? 'challenge_a' : 'challenge_b'
    await persistir({ [key]: usados + 1 } as Partial<PartidoTecnico>, { tipo: 'challenge', lado })
  }

  if (authLoading || (!partido && !error)) {
    return <div className={styles.shell} style={{ display: 'grid', placeItems: 'center', color: '#94a3b8' }}>Cargando marcador…</div>
  }

  if (!partido) {
    return (
      <div className={styles.shell} style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className={styles.panel} style={{ maxWidth: 420, textAlign: 'center' }}>
          <div className={styles.alert}>{error || 'Partido no encontrado'}</div>
          <Link href={linkVolver} className={styles.backLink} style={{ display: 'inline-block', marginTop: 12 }}>Volver</Link>
        </div>
      </div>
    )
  }

  const timerTxt = formatearTimer(segundosVisibles(partido))
  const esCuentaAtras = partido.timer_modo === 'cuenta_atras' && partido.timer_limite_segundos != null
  void tick

  const izq = jugadorEnPosicion(partido, 'izquierda')
  const der = jugadorEnPosicion(partido, 'derecha')
  const saqueInicialJuego = saqueInicialDelJuego(partido.saque_inicial_lado, partido.juego_actual)
  const saque = calcularSaqueActual(partido.puntos_a, partido.puntos_b, saqueInicialJuego)
  const resSorteo = resumenSorteo(partido)
  const historial = partido.historial_sets ?? []

  return (
    <div className={styles.shell}>
      <div className={styles.topBar}>
        <Link href={linkVolver} className={styles.backLink}>← {vuelta ? 'Torneo oficial' : 'Marcador'}</Link>
        <div className={styles.titleBlock}>
          <div className={styles.title}>{partido.titulo}{partido.ronda ? ` | ${partido.ronda}` : ''}</div>
          <div className={styles.subtitle}>{FORMATO_LABEL[partido.formato]} · Juego {partido.juego_actual}</div>
        </div>
        <span className={`${styles.liveBadge} ${guardando ? styles.liveBusy : styles.liveOk}`}>{guardando ? '…' : 'Live'}</span>
      </div>

      {error && <div className={styles.alert}>{error}</div>}
      {aviso && <div className={styles.avisoCambio} role="alert">{aviso}</div>}

      {!partido.sorteo_completo && (
        <div className={`${styles.panel} ${styles.preMatch}`}>
          <div className={styles.preMatchTitle}>1. Registrar sorteo antes de comenzar</div>
          <div className={styles.preMatchHelp}>
            Indica quién ganó el sorteo, qué eligió y la elección del otro jugador. Después se habilitan los botones de puntos.
          </div>
          {esStaff ? (
            <PanelSorteo partido={partido} onGuardar={p => void guardarSorteo(p)} />
          ) : (
            <div className={styles.emptySets}>Esperando que el administrador o profesor registre el sorteo.</div>
          )}
        </div>
      )}

      <div className={styles.arena}>
        <div className={styles.arenaFloor}>
          <div className={styles.spotlight} aria-hidden />
          <div className={styles.tableRow}>
            <ControlesLado lado={izq.lado} onPlus={() => void sumarPunto(izq.lado)} onMinus={() => void restarPunto(izq.lado)} disabled={!esStaff || partido.estado === 'finalizado' || !partido.sorteo_completo} plusClass={izq.lado === 'a' ? styles.btnPlusA : styles.btnPlusB} />
            <div className={styles.table3d}>
              <div className={styles.tableTop}>
                <div className={styles.net3d} aria-hidden />
                <div className={styles.tableEdge} aria-hidden />
                <MesaHalf jugador={izq} saque={saque} plateClass={izq.lado === 'a' ? styles.plateA : styles.plateB} endLineClass={styles.endLineLeft} />
                <div className={styles.centerLine} aria-hidden />
                <MesaHalf jugador={der} saque={saque} plateClass={der.lado === 'a' ? styles.plateA : styles.plateB} endLineClass={styles.endLineRight} />
              </div>
            </div>
            <ControlesLado lado={der.lado} onPlus={() => void sumarPunto(der.lado)} onMinus={() => void restarPunto(der.lado)} disabled={!esStaff || partido.estado === 'finalizado' || !partido.sorteo_completo} plusClass={der.lado === 'a' ? styles.btnPlusA : styles.btnPlusB} />
          </div>
          {partido.estado === 'finalizado' && partido.ganador_lado && (
            <div className={styles.overlayWin}>
              <div className={styles.winBanner}>Gana {partido.ganador_lado === 'a' ? partido.nombre_a : partido.nombre_b}</div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelTitle}>Marcador</div>
          <div className={styles.timerRow}>
            <span className={`${styles.timer} ${esCuentaAtras ? styles.timerCountdown : ''}`}>{timerTxt}</span>
            {esStaff && partido.estado !== 'finalizado' && (
              <button type="button" onClick={() => void toggleTimer()} className={partido.timer_corriendo ? styles.timerBtnRunning : styles.timerBtn}>
                {partido.timer_corriendo ? '❚❚' : '▶'}
              </button>
            )}
          </div>
        </div>

        {resSorteo && (
          <div className={styles.sorteoResumen} style={{ marginBottom: 12 }}>
            <strong>Sorteo:</strong> {resSorteo.a} · {resSorteo.b}
          </div>
        )}

        {saque && partido.sorteo_completo && partido.estado !== 'finalizado' && (
          <div className={styles.saqueIndicador}>
            Saque: <strong>{saque === 'a' ? partido.nombre_a : partido.nombre_b}</strong>
          </div>
        )}

        {esStaff && partido.estado === 'preparacion' && (
          <ConfigTiempo modo={partido.timer_modo} minutos={partido.timer_limite_segundos ? Math.round(partido.timer_limite_segundos / 60) : 10} onGuardar={(m, min) => void guardarConfigTiempo(m, min)} />
        )}

        <div className={styles.scoreRow}>
          <div className={`${styles.playerName} ${styles.playerNameLeft}`}>{partido.nombre_a}</div>
          <div className={styles.bigScore}>
            <div className={styles.scoreDigits}>{String(partido.puntos_a).padStart(2, '0')} - {String(partido.puntos_b).padStart(2, '0')}</div>
            <div className={styles.gamesRow}>
              <span className={styles.gameBadgeA}>{partido.games_a}</span>
              <span className={styles.gameLabel}>Juego {partido.juego_actual}</span>
              <span className={styles.gameBadgeB}>{partido.games_b}</span>
            </div>
          </div>
          <div className={`${styles.playerName} ${styles.playerNameRight}`}>{partido.nombre_b}</div>
        </div>

        <div className={styles.disciplineGrid}>
          <PanelDisciplina nombre={partido.nombre_a} tarjetas={partido.tarjetas_a} challenge={partido.challenge_a} challengeMax={partido.challenge_max} esStaff={esStaff && partido.estado !== 'finalizado'} onTarjeta={(c, v) => void setTarjeta('a', c, v)} onChallenge={() => void usarChallenge('a')} />
          <PanelDisciplina nombre={partido.nombre_b} tarjetas={partido.tarjetas_b} challenge={partido.challenge_b} challengeMax={partido.challenge_max} esStaff={esStaff && partido.estado !== 'finalizado'} onTarjeta={(c, v) => void setTarjeta('b', c, v)} onChallenge={() => void usarChallenge('b')} />
        </div>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.panel}>
          <div className={styles.panelTitle} style={{ marginBottom: 8 }}>Sets jugados</div>
          {historial.length === 0 ? (
            <div className={styles.emptySets}>Al cerrar un juego (11+, dif. 2) aparece aquí.</div>
          ) : (
            <table className={styles.setsTable}>
              <thead><tr><th>Set</th><th>{partido.nombre_a.split(' ')[0]}</th><th>{partido.nombre_b.split(' ')[0]}</th></tr></thead>
              <tbody>
                {historial.map(([pa, pb], idx) => {
                  const ganaA = pa > pb
                  return (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td className={ganaA ? styles.setWinner : undefined}>{pa}</td>
                      <td className={!ganaA ? styles.setWinner : undefined}>{pb}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle} style={{ marginBottom: 8 }}>Registro</div>
          {eventos.length === 0 ? (
            <div className={styles.emptySets}>Puntos, tarjetas y cambios de lado.</div>
          ) : (
            <div className={styles.eventList}>
              {eventos.map(ev => (
                <div key={ev.id} className={styles.eventRow}>
                  <span className={styles.eventText}>{labelEvento(ev, partido)}</span>
                  <span className={styles.eventTime}>{horaEvento(ev.creado_en)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!esStaff && <div className={styles.readOnlyNote}>Vista de seguimiento. Solo admin/profesor pueden marcar puntos.</div>}
    </div>
  )
}

function ControlesLado({ onPlus, onMinus, disabled, plusClass }: { lado: Lado; onPlus: () => void; onMinus: () => void; disabled?: boolean; plusClass: string }) {
  return (
    <div className={styles.sideControls}>
      <button type="button" className={styles.btnCircle} onClick={onMinus} disabled={disabled}>−</button>
      <button type="button" className={`${styles.btnCirclePlus} ${plusClass}`} onClick={onPlus} disabled={disabled}>+</button>
    </div>
  )
}

function MesaHalf({ jugador, saque, plateClass, endLineClass }: {
  jugador: ReturnType<typeof jugadorEnPosicion>
  saque: Lado | null
  plateClass: string
  endLineClass: string
}) {
  return (
    <div className={styles.half}>
      <div className={`${styles.endLine} ${endLineClass}`} aria-hidden />
      {saque === jugador.lado && <span className={styles.servicioBadge}>Saque</span>}
      <div className={`${styles.playerPlate} ${plateClass}`}>{jugador.nombre}</div>
      <div className={styles.sideScore}>{jugador.puntos}</div>
      <div className={styles.cardDots}>
        {jugador.tarjetas.amarilla > 0 && Array.from({ length: jugador.tarjetas.amarilla }).map((_, i) => (
          <span key={`y-${i}`} className={`${styles.cardDot} ${styles.cardYellow}`} />
        ))}
        {jugador.tarjetas.roja > 0 && Array.from({ length: jugador.tarjetas.roja }).map((_, i) => (
          <span key={`r-${i}`} className={`${styles.cardDot} ${styles.cardRed}`} />
        ))}
      </div>
    </div>
  )
}

function PanelSorteo({ partido, onGuardar }: {
  partido: PartidoTecnico
  onGuardar: (p: Parameters<typeof construirSorteo>[0]) => void
}) {
  const [ganador, setGanador] = useState<Lado | null>(null)
  const [elige, setElige] = useState<SorteoEleccion | null>(null)
  const [ladoG, setLadoG] = useState<PosicionMesa>('izquierda')
  const [ladoP, setLadoP] = useState<PosicionMesa>('derecha')
  const [perdedorSaque, setPerdedorSaque] = useState<'saque' | 'recepcion'>('saque')

  const listo = ganador && elige && (elige === 'servicio' || (elige === 'lado' && ladoG))

  function confirmar() {
    if (!ganador || !elige) return
    if (elige === 'servicio') {
      onGuardar({ ganador, ganador_elige: 'servicio', lado_perdedor: ladoP })
    } else {
      onGuardar({ ganador, ganador_elige: 'lado', lado_ganador: ladoG, perdedor_saque: perdedorSaque })
    }
  }

  return (
    <div className={styles.sorteoBox}>
      <div className={styles.sorteoTitle}>Sorteo inicial (ITTF)</div>
      <div className={styles.configHint} style={{ marginBottom: 10 }}>Ganador elige servicio o lado; el otro jugador recibe la opción restante.</div>
      <div className={styles.sorteoGrid}>
        <button type="button" className={`${styles.sorteoBtn} ${ganador === 'a' ? styles.sorteoBtnActive : ''}`} onClick={() => setGanador('a')}>Ganó sorteo: {partido.nombre_a.split(' ')[0]}</button>
        <button type="button" className={`${styles.sorteoBtn} ${ganador === 'b' ? styles.sorteoBtnActive : ''}`} onClick={() => setGanador('b')}>Ganó sorteo: {partido.nombre_b.split(' ')[0]}</button>
      </div>
      {ganador && (
        <div className={styles.sorteoGrid}>
          <button type="button" className={`${styles.sorteoBtn} ${elige === 'servicio' ? styles.sorteoBtnActive : ''}`} onClick={() => setElige('servicio')}>Elige servicio</button>
          <button type="button" className={`${styles.sorteoBtn} ${elige === 'lado' ? styles.sorteoBtnActive : ''}`} onClick={() => setElige('lado')}>Elige lado de mesa</button>
        </div>
      )}
      {ganador && elige === 'servicio' && (
        <div className={styles.sorteoGrid}>
          <span className={styles.configHint} style={{ gridColumn: '1 / -1' }}>El perdedor elige su lado:</span>
          <button type="button" className={`${styles.sorteoBtn} ${ladoP === 'izquierda' ? styles.sorteoBtnActive : ''}`} onClick={() => setLadoP('izquierda')}>Perdedor → izquierda</button>
          <button type="button" className={`${styles.sorteoBtn} ${ladoP === 'derecha' ? styles.sorteoBtnActive : ''}`} onClick={() => setLadoP('derecha')}>Perdedor → derecha</button>
        </div>
      )}
      {ganador && elige === 'lado' && (
        <>
          <div className={styles.sorteoGrid}>
            <span className={styles.configHint} style={{ gridColumn: '1 / -1' }}>Lado del ganador:</span>
            <button type="button" className={`${styles.sorteoBtn} ${ladoG === 'izquierda' ? styles.sorteoBtnActive : ''}`} onClick={() => setLadoG('izquierda')}>Ganador → izquierda</button>
            <button type="button" className={`${styles.sorteoBtn} ${ladoG === 'derecha' ? styles.sorteoBtnActive : ''}`} onClick={() => setLadoG('derecha')}>Ganador → derecha</button>
          </div>
          <div className={styles.sorteoGrid}>
            <span className={styles.configHint} style={{ gridColumn: '1 / -1' }}>El perdedor elige:</span>
            <button type="button" className={`${styles.sorteoBtn} ${perdedorSaque === 'saque' ? styles.sorteoBtnActive : ''}`} onClick={() => setPerdedorSaque('saque')}>Perdedor saca</button>
            <button type="button" className={`${styles.sorteoBtn} ${perdedorSaque === 'recepcion' ? styles.sorteoBtnActive : ''}`} onClick={() => setPerdedorSaque('recepcion')}>Perdedor recibe</button>
          </div>
        </>
      )}
      {listo && (
        <button type="button" onClick={confirmar} className={styles.challengeBtn} style={{ marginTop: 10, background: '#0f172a', color: '#fff', border: 0 }}>
          Confirmar sorteo e iniciar mesa
        </button>
      )}
    </div>
  )
}

function ConfigTiempo({ modo, minutos, onGuardar }: { modo: TimerModo; minutos: number; onGuardar: (modo: TimerModo, minutos: number | null) => void }) {
  const [modoLocal, setModoLocal] = useState(modo)
  const [minLocal, setMinLocal] = useState(String(minutos))
  useEffect(() => { setModoLocal(modo); setMinLocal(String(minutos)) }, [modo, minutos])
  return (
    <div className={styles.configBox}>
      <div className={styles.configGrid}>
        <label><span className={styles.configLabel}>Modo de tiempo</span>
          <select className={styles.configInput} value={modoLocal} onChange={e => { const m = e.target.value as TimerModo; setModoLocal(m); onGuardar(m, m === 'cuenta_atras' ? Number(minLocal) || 10 : null) }}>
            <option value="cronometro">Cronómetro</option><option value="cuenta_atras">Cuenta atrás</option>
          </select>
        </label>
        {modoLocal === 'cuenta_atras' && (
          <label><span className={styles.configLabel}>Minutos</span>
            <input type="number" min={1} max={120} className={styles.configInput} value={minLocal} onChange={e => setMinLocal(e.target.value)} onBlur={() => onGuardar('cuenta_atras', Number(minLocal) || 10)} />
          </label>
        )}
      </div>
    </div>
  )
}

function PanelDisciplina({ nombre, tarjetas, challenge, challengeMax, esStaff, onTarjeta, onChallenge }: {
  nombre: string; tarjetas: TarjetasLado; challenge: number; challengeMax: number; esStaff: boolean
  onTarjeta: (campo: keyof TarjetasLado, valor: boolean | number) => void; onChallenge: () => void
}) {
  return (
    <div className={styles.disciplineCard}>
      <div className={styles.disciplineName}>{nombre}</div>
      <label className={styles.checkRow}><input type="checkbox" checked={tarjetas.blanca} disabled={!esStaff} onChange={e => onTarjeta('blanca', e.target.checked)} /> Tarjeta blanca</label>
      <div className={styles.tarjetaRow}>
        <TarjetaBtn label="Amarilla" className={`${styles.tarjetaBtn} ${styles.tarjetaAmarilla}`} count={tarjetas.amarilla} disabled={!esStaff} onAdd={() => onTarjeta('amarilla', tarjetas.amarilla + 1)} onUndo={() => onTarjeta('amarilla', Math.max(0, tarjetas.amarilla - 1))} />
        <TarjetaBtn label="Roja" className={`${styles.tarjetaBtn} ${styles.tarjetaRoja}`} count={tarjetas.roja} disabled={!esStaff} onAdd={() => onTarjeta('roja', tarjetas.roja + 1)} onUndo={() => onTarjeta('roja', Math.max(0, tarjetas.roja - 1))} />
      </div>
      <button type="button" disabled={!esStaff || challenge >= challengeMax} onClick={onChallenge} className={styles.challengeBtn}>Challenge {challenge}/{challengeMax}</button>
    </div>
  )
}

function TarjetaBtn({ label, className, count, disabled, onAdd, onUndo }: { label: string; className: string; count: number; disabled?: boolean; onAdd: () => void; onUndo: () => void }) {
  return (
    <div style={{ flex: 1, minWidth: 90 }}>
      <button type="button" disabled={disabled} onClick={onAdd} className={className}>{label}{count > 0 ? ` · ${count}` : ''}</button>
      {count > 0 && !disabled && <button type="button" onClick={onUndo} className={styles.undoBtn}>Deshacer</button>}
    </div>
  )
}
