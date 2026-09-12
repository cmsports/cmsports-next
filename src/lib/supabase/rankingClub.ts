import { calcularRankingInterno, type ResultadoJugadorRanking, type TorneoConPartidos } from '@/lib/domain/rankingInterno'

export type CategoriaRanking = {
  categoria: string
  genero: string | null
  filas: ResultadoJugadorRanking[]
}

export type RankingDelClub = {
  clubNombre: string
  reiniciadoEn: string | null
  /** Ordenadas por categoría y, adentro, varones · damas · mixto · sin género. */
  categorias: CategoriaRanking[]
  /** Los jugadores que aparecen en alguna categoría, con su foto sin firmar.
   *  La pantalla privada firma las fotos; la pública no las muestra. */
  jugadores: { id: string; nombre: string; foto_path: string | null }[]
}

/**
 * El ranking del club, por categoría y género, tal como lo pinta /ranking.
 *
 * Vivía dentro de la pantalla. Se sacó a un solo lugar porque ahora lo leen
 * dos: la pantalla (con la sesión del usuario) y la API de la página pública
 * del ranking (con el cliente de servicio, para quien escanea el QR sin
 * cuenta). Dos copias del cálculo habrían terminado mostrando dos rankings
 * distintos para la misma categoría, y el que se pega en la sede tiene que
 * ser el mismo que ve el admin.
 *
 * `sb` puede ser cualquier cliente de Supabase: lo que cambia entre los dos
 * usos es quién pregunta, no qué se pregunta.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cargarRankingDelClub(sb: any, clubId: string): Promise<RankingDelClub> {
  // Las tres primeras salen juntas, no en fila.
  //
  // 1. El club: de ahí sale el timestamp de reinicio, y el nombre que necesita
  //    el encabezado del PDF y de la página pública.
  // 2. Los torneos internos del club que ya terminaron.
  //
  //    Los puntos salen del puesto final, y un torneo en curso todavía no
  //    tiene puestos: el que hoy va en semifinales puede terminar campeón o
  //    cuarto. Se cuentan cuando se cierran. Los archivados también: archivar
  //    es guardar un torneo terminado, no anularlo — si no, archivar le movería
  //    el ranking a todo el mundo.
  // 3. El ranking que el club traía en papel (migración 188). Se suma a lo que
  //    se juegue en el sistema.
  //
  // El reinicio recorta 2 y 3, así que antes la consulta de torneos esperaba a
  // la del club solo para conocer ese timestamp y mandarlo como filtro. Ese
  // `await` de por medio costaba un viaje entero, y desde el navegador cada
  // viaje a Supabase son ~320 ms medidos. El recorte se hace más abajo sobre lo
  // que llegó, que es como los saldos ya lo venían haciendo.
  const [clubRes, torneosRes, saldosRes] = await Promise.all([
    sb.from('clubes')
      .select('nombre,ranking_reiniciado_en')
      .eq('id', clubId)
      .single(),
    sb.from('torneos')
      .select('id,categoria,genero,fecha_fin,creado_en')
      .eq('club_id', clubId)
      .eq('tipo', 'interno')
      .in('estado', ['finalizado', 'archivado']),
    sb.from('ranking_saldo_inicial')
      .select('jugador_id,categoria,genero,puntos,creado_en')
      .eq('club_id', clubId),
  ])

  const club = clubRes.data
  const reinicioTs: string | null = club?.ranking_reiniciado_en ?? null
  const clubNombre: string = club?.nombre ?? ''
  const vacio = (): RankingDelClub => ({ clubNombre, reiniciadoEn: reinicioTs, categorias: [], jugadores: [] })

  // El mismo corte que antes hacía el `.gt('creado_en', ...)` en la consulta.
  // Se descartan los anteriores al reinicio: si no, "Reiniciar Ranking" dejaría
  // todo en cero salvo el arrastre.
  type FilaTorneo = { id: string; categoria: string | null; genero: string | null; creado_en: string }
  const torneos = ((torneosRes.data ?? []) as FilaTorneo[])
    .filter(t => !reinicioTs || t.creado_en > reinicioTs)
  const saldos = saldosRes.data

  type FilaSaldo = { jugador_id: string; categoria: string; genero: string | null; puntos: number; creado_en: string }
  const saldoPorClave = new Map<string, Map<string, number>>()
  for (const s of ((saldos ?? []) as FilaSaldo[])) {
    if (reinicioTs && s.creado_en <= reinicioTs) continue
    const clave = `${s.categoria}||${s.genero ?? ''}`
    const porJugador = saldoPorClave.get(clave) ?? new Map<string, number>()
    porJugador.set(s.jugador_id, (porJugador.get(s.jugador_id) ?? 0) + s.puntos)
    saldoPorClave.set(clave, porJugador)
  }

  if (!torneos?.length && saldoPorClave.size === 0) return vacio()

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
    ? await sb
        .from('torneo_partidos')
        .select('torneo_id,jugador_a,jugador_b,ganador,fase')
        .in('torneo_id', torneoIds)
        .not('jugador_b', 'is', null)
        .not('ganador', 'is', null)
    : { data: [] }

  if (!partidos?.length && saldoPorClave.size === 0) return vacio()

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

  type FilaPartido = { torneo_id: string; jugador_a: string; jugador_b: string; ganador: string; fase: string | null }
  for (const p of ((partidos ?? []) as FilaPartido[])) {
    const meta = torneoMeta[p.torneo_id]
    const clave = `${meta?.categoria ?? 'Sin categoría'}||${meta?.genero ?? ''}`
    const porTorneo = (torneosPorClave[clave] ??= new Map())
    const acc = porTorneo.get(p.torneo_id) ?? { torneoId: p.torneo_id, partidos: [] }
    acc.partidos.push({ jugador_a: p.jugador_a, jugador_b: p.jugador_b, ganador: p.ganador, fase: p.fase })
    porTorneo.set(p.torneo_id, acc)
    jugadoresIds.add(p.jugador_a)
    jugadoresIds.add(p.jugador_b)
  }

  // 6. Nombres (y la ruta de la foto, para quien la quiera firmar), en una
  // sola consulta.
  const { data: jugadoresData } = await sb
    .from('jugadores')
    .select('id,nombre,foto_path')
    .in('id', [...jugadoresIds])
  const jugadores = ((jugadoresData ?? []) as { id: string; nombre: string | null; foto_path?: string | null }[])
    .map(j => ({ id: j.id, nombre: j.nombre ?? '', foto_path: j.foto_path ?? null }))
  const nombreMap: Record<string, string> = {}
  for (const j of jugadores) nombreMap[j.id] = j.nombre

  // 7. Construir ranking por categoria + genero
  const categorias: CategoriaRanking[] = []
  for (const [clave, porTorneo] of Object.entries(torneosPorClave)) {
    const [categoria, genero] = clave.split('||')
    const filas = calcularRankingInterno(
      [...porTorneo.values()],
      id => nombreMap[id] || 'Desconocido',
      saldoPorClave.get(clave),
    )
    categorias.push({ categoria, genero: genero || null, filas })
  }

  categorias.sort((a, b) => {
    const catCmp = a.categoria.localeCompare(b.categoria, 'es')
    if (catCmp !== 0) return catCmp
    // varones, damas, mixto, y sin género al final
    const gOrder = (g: string | null) => g === 'varones' ? 0 : g === 'damas' ? 1 : g === 'mixto' ? 2 : 3
    return gOrder(a.genero) - gOrder(b.genero)
  })

  return { clubNombre, reiniciadoEn: reinicioTs, categorias, jugadores }
}

/** La clave con la que la pantalla y el QR identifican una categoría. */
export function claveCategoria(categoria: string, genero: string | null | undefined): string {
  return `${categoria}||${genero ?? ''}`
}
