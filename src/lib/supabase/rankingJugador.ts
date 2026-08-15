import { createClient } from '@/lib/supabase/client'
import { calcularRankingInterno, type TorneoConPartidos } from '@/lib/domain/rankingInterno'

const supabase = createClient()

export type PuestoEnCategoria = {
  categoria: string
  /** varones | damas | mixto | null. Separa rankings distintos con igual nombre. */
  genero: string | null
  /** Puesto compartido: dos con los mismos puntos tienen el mismo número. */
  rank: number
  /** Cuántos jugadores hay en esa categoría. */
  total: number
  pts: number
  /** Puntos del puntero de esa categoría. Es contra esto que se mide la barra. */
  ptsLider: number
  victorias: number
  derrotas: number
  jugados: number
  /** Puntos que le faltan para alcanzar al de más arriba. 0 si va primero. */
  faltanParaSubir: number
}

/**
 * Dónde va un jugador en cada categoría donde compite.
 *
 * Vive acá y no dentro de cada pantalla porque lo miran tres lugares: el perfil
 * del jugador, su ficha y el PDF del informe. Cuando el cálculo estaba metido
 * dentro de la función que arma el PDF, la ficha mostraba un número y la
 * pantalla de Ranking otro, porque cada una filtraba los torneos a su manera.
 *
 * Los criterios tienen que ser LOS MISMOS que usa /ranking:
 *  · solo torneos terminados o archivados — los puntos salen del puesto final,
 *    y un torneo en curso todavía no tiene puestos;
 *  · se respeta `ranking_reiniciado_en`, o el botón de reinicio mentiría;
 *  · se suma el saldo del ranking en papel (migración 188).
 */
export async function cargarRankingDeJugador(
  clubId: string,
  jugadorId: string,
): Promise<PuestoEnCategoria[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: club } = await sb
    .from('clubes').select('ranking_reiniciado_en').eq('id', clubId).single()
  const reinicioTs: string | null = club?.ranking_reiniciado_en ?? null

  let queryTorneos = sb.from('torneos')
    .select('id,categoria,genero').eq('club_id', clubId).eq('tipo', 'interno')
    .in('estado', ['finalizado', 'archivado'])
  if (reinicioTs) queryTorneos = queryTorneos.gt('creado_en', reinicioTs)
  const { data: torneos } = await queryTorneos

  const { data: saldos } = await sb
    .from('ranking_saldo_inicial')
    .select('jugador_id,categoria,genero,puntos,creado_en')
    .eq('club_id', clubId)

  // La clave incluye el género, igual que en /ranking. Si acá se agrupara solo
  // por categoría, un club con "TC varones" y "TC damas" vería un puesto en la
  // ficha y otro distinto en el Ranking, porque la ficha los estaría mezclando
  // en una sola tabla. Es el mismo desajuste que ya apareció una vez.
  const clave = (categoria: string, genero: string | null) => `${categoria}||${genero ?? ''}`

  type FilaSaldo = { jugador_id: string; categoria: string; genero: string | null; puntos: number; creado_en: string }
  const saldoPorClave = new Map<string, Map<string, number>>()
  for (const s of ((saldos ?? []) as FilaSaldo[])) {
    if (reinicioTs && s.creado_en <= reinicioTs) continue
    const k = clave(s.categoria, s.genero)
    const porJugador = saldoPorClave.get(k) ?? new Map<string, number>()
    porJugador.set(s.jugador_id, (porJugador.get(s.jugador_id) ?? 0) + s.puntos)
    saldoPorClave.set(k, porJugador)
  }

  const claveDe = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((torneos ?? []) as any[]).map(t => [
      t.id as string, clave((t.categoria as string) || 'Sin categoría', (t.genero as string) ?? null),
    ]),
  )
  const torneoIds = [...claveDe.keys()]

  const { data: partidos } = torneoIds.length
    ? await supabase.from('torneo_partidos')
        .select('torneo_id,jugador_a,jugador_b,ganador,fase')
        .in('torneo_id', torneoIds)
        .not('jugador_b', 'is', null)
        .not('ganador', 'is', null)
    : { data: [] }

  // Por categoría+género, y adentro por torneo: el puesto —y con él los
  // puntos— solo existe dentro de un torneo.
  const porClave: Record<string, Map<string, TorneoConPartidos>> = {}
  for (const k of saldoPorClave.keys()) porClave[k] ??= new Map()
  for (const p of (partidos ?? [])) {
    const torneoId = p.torneo_id as string
    const k = claveDe.get(torneoId) ?? 'Sin categoría||'
    const porTorneo = (porClave[k] ??= new Map())
    const acc = porTorneo.get(torneoId) ?? { torneoId, partidos: [] }
    acc.partidos.push({
      jugador_a: p.jugador_a as string, jugador_b: p.jugador_b as string,
      ganador: p.ganador as string, fase: p.fase as string | null,
    })
    porTorneo.set(torneoId, acc)
  }

  const salida: PuestoEnCategoria[] = []
  for (const [k, porTorneo] of Object.entries(porClave)) {
    const tabla = calcularRankingInterno(
      [...porTorneo.values()], () => '', saldoPorClave.get(k),
    )
    const suya = tabla.find(f => f.jugadorId === jugadorId)
    if (!suya) continue

    const [categoria, generoRaw] = k.split('||')
    // El de más arriba es el primero con MÁS puntos: si tres empatan en el 5°,
    // subir no es alcanzar al de al lado, es pasar al 4°.
    const arriba = tabla.find(f => f.pts > suya.pts)
    salida.push({
      categoria, genero: generoRaw || null,
      rank: suya.rank, total: tabla.length, pts: suya.pts,
      ptsLider: tabla[0]?.pts ?? suya.pts,
      victorias: suya.victorias, derrotas: suya.derrotas, jugados: suya.jugados,
      faltanParaSubir: arriba ? arriba.pts - suya.pts : 0,
    })
  }

  salida.sort((a, b) => a.rank - b.rank || a.categoria.localeCompare(b.categoria, 'es'))
  return salida
}
