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
  // 1. Timestamp de reinicio del club. El nombre viene en la misma consulta:
  // lo necesita el encabezado del PDF y de la página pública.
  const { data: club } = await sb
    .from('clubes')
    .select('nombre,ranking_reiniciado_en')
    .eq('id', clubId)
    .single()
  const reinicioTs: string | null = club?.ranking_reiniciado_en ?? null
  const clubNombre: string = club?.nombre ?? ''
  const vacio = (): RankingDelClub => ({ clubNombre, reiniciadoEn: reinicioTs, categorias: [], jugadores: [] })

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
    .eq('club_id', clubId)
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
    .eq('club_id', clubId)

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
