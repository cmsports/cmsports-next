/** Asignación greedy de mesas y horarios para torneo oficial. */

export type PartidoProgramar = {
  id: string
  inscritoA: string | null
  inscritoB: string | null
  /** Prioridad menor = se programa antes (grupos antes que llaves). */
  prioridad: number
  grupoId?: string | null
}

export type SlotProgramado = {
  mesa: number
  programadoEn: Date
}

function jugadoresEnConflicto(
  a: PartidoProgramar,
  b: PartidoProgramar,
): boolean {
  const idsA = [a.inscritoA, a.inscritoB].filter(Boolean) as string[]
  const idsB = [b.inscritoA, b.inscritoB].filter(Boolean) as string[]
  return idsA.some(id => idsB.includes(id))
}

/**
 * Asigna mesa y hora a cada partido sin solapar jugadores ni mesas.
 * Los bloques son discretos: inicio + n × bloqueMinutos.
 * Si un partido no cabe en `maxBloques` (default 500), queda fuera del Map.
 */
export function programarPartidosGreedy(
  partidos: PartidoProgramar[],
  opts: {
    mesas: number
    bloqueMinutos: number
    inicio: Date
    maxBloques?: number
    ocupados?: SlotProgramado[]
    intervalosBloqueados?: Array<{ inicio: Date; fin: Date }>
  },
): Map<string, SlotProgramado> {
  const resultado = new Map<string, SlotProgramado>()
  if (!partidos.length || opts.mesas < 1) return resultado

  const maxBloques = opts.maxBloques ?? 500
  const ordenados = [...partidos].sort((a, b) => a.prioridad - b.prioridad)
  const asignados: Array<{ partido: PartidoProgramar; slot: SlotProgramado }> = (opts.ocupados ?? []).map(slot => ({
    partido: { id: `occ-${slot.mesa}-${slot.programadoEn.getTime()}`, inscritoA: null, inscritoB: null, prioridad: -1 },
    slot,
  }))
  const bloqueadoEn = (t: Date) =>
    (opts.intervalosBloqueados ?? []).some(iv => t.getTime() >= iv.inicio.getTime() && t.getTime() < iv.fin.getTime())

  for (const p of ordenados) {
    let bloque = 0
    let asignado = false

    while (!asignado && bloque < maxBloques) {
      const programadoEnBloque = new Date(opts.inicio.getTime() + bloque * opts.bloqueMinutos * 60_000)
      if (bloqueadoEn(programadoEnBloque)) {
        bloque++
        continue
      }
      for (let mesa = 1; mesa <= opts.mesas; mesa++) {
        const programadoEn = programadoEnBloque
        const slot: SlotProgramado = { mesa, programadoEn }

        const mesaOcupada = asignados.some(a =>
          a.slot.mesa === mesa && a.slot.programadoEn.getTime() === programadoEn.getTime(),
        )
        if (mesaOcupada) continue

        const jugadorOcupado = asignados.some(a =>
          a.slot.programadoEn.getTime() === programadoEn.getTime() && jugadoresEnConflicto(a.partido, p),
        )
        if (jugadorOcupado) continue

        asignados.push({ partido: p, slot })
        resultado.set(p.id, slot)
        asignado = true
        break
      }
      if (!asignado) bloque++
    }
  }

  return resultado
}

/** Igual que greedy, pero reporta IDs que no cupieron (maña silenciosa antes). */
export function programarPartidosGreedyConInforme(
  partidos: PartidoProgramar[],
  opts: {
    mesas: number
    bloqueMinutos: number
    inicio: Date
    maxBloques?: number
    ocupados?: SlotProgramado[]
    intervalosBloqueados?: Array<{ inicio: Date; fin: Date }>
  },
): { asignaciones: Map<string, SlotProgramado>; omitidos: string[] } {
  const asignaciones = programarPartidosGreedy(partidos, opts)
  const omitidos = partidos.filter(p => !asignaciones.has(p.id)).map(p => p.id)
  return { asignaciones, omitidos }
}

/** Prioridad: fase grupos primero, luego playoff por orden de fase y llave. */
export function prioridadPartidoOficial(fase: string, orden: number): number {
  const fases = ['grupos', 'avance', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'tercer_lugar', 'final'] as const
  const idx = fases.indexOf(fase as typeof fases[number])
  const faseIdx = idx >= 0 ? idx : 99
  return faseIdx * 1000 + orden
}

export type PartidoProgramaSlot = {
  id: string
  inscritoA: string | null
  inscritoB: string | null
  mesa: number | null
  programadoEn: string | Date | null
  grupoId?: string | null
}

export type ConflictoPrograma = {
  partidoId: string
  otroId: string
  tipo: 'mesa' | 'jugador'
  motivo: string
}

/** Conflictos de mesa u jugador en el mismo bloque horario (§4.4, 4.7). */
export function detectarConflictosPrograma(partidos: PartidoProgramaSlot[]): ConflictoPrograma[] {
  const conSlot = partidos.filter(p => p.mesa != null && p.mesa > 0 && p.programadoEn)
  const out: ConflictoPrograma[] = []
  const visto = new Set<string>()

  for (let i = 0; i < conSlot.length; i++) {
    for (let j = i + 1; j < conSlot.length; j++) {
      const a = conSlot[i]
      const b = conSlot[j]
      const tA = new Date(a.programadoEn!).getTime()
      const tB = new Date(b.programadoEn!).getTime()
      if (tA !== tB) continue

      const pairKey = [a.id, b.id].sort().join('|')
      if (visto.has(pairKey)) continue
      // Un grupo ocupa la mesa ~70 min: los 3/6 partidos comparten hora de inicio.
      if (a.grupoId && b.grupoId && a.grupoId === b.grupoId) continue

      if (a.mesa === b.mesa) {
        visto.add(pairKey)
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'mesa',
          motivo: `Mesa ${a.mesa} ocupada por dos partidos a la misma hora`,
        })
        continue
      }

      const idsA = [a.inscritoA, a.inscritoB].filter(Boolean) as string[]
      const idsB = [b.inscritoA, b.inscritoB].filter(Boolean) as string[]
      const solape = idsA.find(id => idsB.includes(id))
      if (solape) {
        visto.add(pairKey)
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'jugador',
          motivo: 'Un jugador está en dos partidos a la misma hora',
        })
      }
    }
  }
  return out
}

/** Valida un slot propuesto contra el resto del programa. */
export function conflictosAlAsignar(
  partidos: PartidoProgramaSlot[],
  partidoId: string,
  mesa: number,
  programadoEn: Date,
): ConflictoPrograma[] {
  const proyectado = partidos.map(p =>
    p.id === partidoId
      ? { ...p, mesa, programadoEn: programadoEn.toISOString() }
      : p,
  )
  return detectarConflictosPrograma(proyectado).filter(
    c => c.partidoId === partidoId || c.otroId === partidoId,
  )
}

/**
 * Partido con clave de persona para conflictos multi-evento (§4.3).
 * `claveJugador*` = jugador_id o nombre normalizado (los inscrito_id no cruzan eventos).
 */
export type PartidoProgramaMulti = PartidoProgramaSlot & {
  eventoId?: string
  claveJugadorA?: string | null
  claveJugadorB?: string | null
  eventoNombre?: string
  labelPartido?: string
}

export type ConflictoProgramaEnriquecido = ConflictoPrograma & {
  eventoIdA?: string
  eventoIdB?: string
  labelA?: string
  labelB?: string
}

function clavesDe(p: PartidoProgramaMulti): string[] {
  const out: string[] = []
  if (p.claveJugadorA) out.push(p.claveJugadorA)
  if (p.claveJugadorB) out.push(p.claveJugadorB)
  // Fallback intra-evento: inscrito ids
  if (!p.claveJugadorA && p.inscritoA) out.push(`ins:${p.inscritoA}`)
  if (!p.claveJugadorB && p.inscritoB) out.push(`ins:${p.inscritoB}`)
  return out
}

/** Conflictos de mesa o misma persona (multi-evento) a la misma hora. */
export function detectarConflictosProgramaMulti(
  partidos: PartidoProgramaMulti[],
): ConflictoProgramaEnriquecido[] {
  const conSlot = partidos.filter(p => p.mesa != null && p.mesa > 0 && p.programadoEn)
  const out: ConflictoProgramaEnriquecido[] = []
  const visto = new Set<string>()

  for (let i = 0; i < conSlot.length; i++) {
    for (let j = i + 1; j < conSlot.length; j++) {
      const a = conSlot[i]
      const b = conSlot[j]
      const tA = new Date(a.programadoEn!).getTime()
      const tB = new Date(b.programadoEn!).getTime()
      if (tA !== tB) continue

      const pairKey = [a.id, b.id].sort().join('|')
      if (visto.has(pairKey)) continue
      // Bloque de grupo (Prog Koidan): no es conflicto que los tres se sienten a la misma hora.
      if (a.grupoId && b.grupoId && a.grupoId === b.grupoId) continue

      if (a.mesa === b.mesa) {
        visto.add(pairKey)
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'mesa',
          motivo: `Mesa ${a.mesa} ocupada por dos partidos a la misma hora`,
          eventoIdA: a.eventoId,
          eventoIdB: b.eventoId,
          labelA: a.labelPartido,
          labelB: b.labelPartido,
        })
        continue
      }

      const clavesA = new Set(clavesDe(a))
      const solape = clavesDe(b).find(k => clavesA.has(k))
      if (solape) {
        visto.add(pairKey)
        const cruzado = a.eventoId && b.eventoId && a.eventoId !== b.eventoId
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'jugador',
          motivo: cruzado
            ? 'Un jugador está en dos eventos a la misma hora'
            : 'Un jugador está en dos partidos a la misma hora',
          eventoIdA: a.eventoId,
          eventoIdB: b.eventoId,
          labelA: a.labelPartido,
          labelB: b.labelPartido,
        })
      }
    }
  }
  return out
}

/** Un grupo entero ocupa una mesa durante un bloque (~70 min). */
export type GrupoOlaProgramar = {
  grupoId: string
  partidoIds: string[]
  /** Claves de persona (jugador_id o nombre) para no solapar multi-evento en la misma ola. */
  clavesJugadores?: string[]
}

function clavesChocan(a?: string[], b?: string[]): boolean {
  if (!a?.length || !b?.length) return false
  const set = new Set(a)
  return b.some(x => set.has(x))
}

/**
 * Asigna cada grupo a una mesa × bloque. Todos los partidos del grupo
 * heredan la misma mesa y la misma hora de inicio (el juez ve «Juv V GR1»).
 * Recesos / premiación (`intervalosBloqueados`) saltan el cursor hasta el fin del bloque.
 */
export function programarGruposEnOlas(
  grupos: GrupoOlaProgramar[],
  opts: {
    mesas: number
    bloqueMinutos: number
    inicio: Date
    maxOlas?: number
    ocupados?: SlotProgramado[]
    intervalosBloqueados?: Array<{ inicio: Date; fin: Date }>
  },
): { asignaciones: Map<string, SlotProgramado>; omitidosGrupos: string[]; fin: Date } {
  const asignaciones = new Map<string, SlotProgramado>()
  const omitidosGrupos: string[] = []
  if (!grupos.length || opts.mesas < 1) {
    return { asignaciones, omitidosGrupos: grupos.map(g => g.grupoId), fin: opts.inicio }
  }
  const maxOlas = opts.maxOlas ?? 80
  const cola = [...grupos]
  let cursor = new Date(opts.inicio.getTime())
  let olas = 0
  const mesaOcupadaEn = (mesa: number, t: Date) =>
    (opts.ocupados ?? []).some(o => o.mesa === mesa && o.programadoEn.getTime() === t.getTime())

  while (cola.length && olas < maxOlas) {
    const blocked = (opts.intervalosBloqueados ?? []).find(
      iv => cursor.getTime() >= iv.inicio.getTime() && cursor.getTime() < iv.fin.getTime(),
    )
    if (blocked) {
      cursor = new Date(blocked.fin.getTime())
      continue
    }

    const enOlaClaves: string[] = []
    for (let mesa = 1; mesa <= opts.mesas; mesa++) {
      if (mesaOcupadaEn(mesa, cursor)) continue
      const idx = cola.findIndex(g => !clavesChocan(g.clavesJugadores, enOlaClaves))
      if (idx < 0) break
      const g = cola.splice(idx, 1)[0]
      const slot = { mesa, programadoEn: new Date(cursor.getTime()) }
      for (const pid of g.partidoIds) asignaciones.set(pid, slot)
      enOlaClaves.push(...(g.clavesJugadores ?? []))
    }
    cursor = new Date(cursor.getTime() + opts.bloqueMinutos * 60_000)
    olas++
  }
  omitidosGrupos.push(...cola.map(g => g.grupoId))
  return { asignaciones, omitidosGrupos, fin: cursor }
}

export type CeldaMuralOficial = {
  mesa: number
  hora: string
  fecha: string
  etiqueta: string
  tipo: 'grupo' | 'partido' | 'especial'
  eventoNombre?: string
  eventoId?: string
  detalle?: string
  estado: 'pendiente' | 'finalizado' | 'walkover' | 'retiro' | 'especial'
  partidoIds: string[]
}

export type PartidoParaMural = {
  id: string
  mesa: number | null
  programadoEn: string | Date | null
  fase: string
  grupoId: string | null
  grupoNombre?: string | null
  eventoNombre?: string | null
  eventoId?: string | null
  jugadorA: string
  jugadorB: string
  ganadorId?: string | null
  tipoCierre?: string | null
  esWalkover?: boolean
}

export type BloqueEspecialMural = {
  fecha: string
  hora: string
  etiqueta: string
}

function horaDe(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function fechaDe(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

const FASE_CORTA: Record<string, string> = {
  grupos: 'GR',
  avance: '1/64',
  '32vos': '1/32',
  '16vos': '1/16',
  '8vos': '1/8',
  cuartos: '1/4',
  semis: 'SF',
  tercer_lugar: '3°',
  final: 'Final',
}

function estadoPartidoMural(p: PartidoParaMural): CeldaMuralOficial['estado'] {
  if (p.tipoCierre === 'retiro') return 'retiro'
  if (p.esWalkover || p.tipoCierre === 'walkover') return 'walkover'
  if (p.ganadorId) return 'finalizado'
  return 'pendiente'
}

/** Compacta partidos de grupo en una celda (estilo Prog Koidan). */
export function armarCeldasMural(
  partidos: PartidoParaMural[],
  especiales: BloqueEspecialMural[] = [],
): CeldaMuralOficial[] {
  const out: CeldaMuralOficial[] = []
  const grupoKey = new Map<string, PartidoParaMural[]>()
  const sueltos: PartidoParaMural[] = []

  for (const p of partidos) {
    if (!p.mesa || !p.programadoEn) continue
    if (p.fase === 'grupos' && p.grupoId) {
      const k = `${p.grupoId}|${p.mesa}|${fechaDe(p.programadoEn)}|${horaDe(p.programadoEn)}`
      const arr = grupoKey.get(k) ?? []
      arr.push(p)
      grupoKey.set(k, arr)
    } else {
      sueltos.push(p)
    }
  }

  for (const [, lista] of grupoKey) {
    const p0 = lista[0]
    const ev = p0.eventoNombre || ''
    const gn = p0.grupoNombre ? `GR${p0.grupoNombre}` : 'Grupo'
    const etiqueta = ev ? `${ev} ${gn}` : gn
    const estados = lista.map(estadoPartidoMural)
    const estado: CeldaMuralOficial['estado'] = estados.every(e => e !== 'pendiente')
      ? (estados.includes('retiro') ? 'retiro' : estados.includes('walkover') ? 'walkover' : 'finalizado')
      : 'pendiente'
    out.push({
      mesa: p0.mesa!,
      hora: horaDe(p0.programadoEn!),
      fecha: fechaDe(p0.programadoEn!),
      etiqueta,
      tipo: 'grupo',
      eventoNombre: ev || undefined,
      eventoId: p0.eventoId || undefined,
      detalle: `${lista.length} partido${lista.length === 1 ? '' : 's'}`,
      estado,
      partidoIds: lista.map(p => p.id),
    })
  }

  for (const p of sueltos) {
    const fase = FASE_CORTA[p.fase] || p.fase
    const ev = p.eventoNombre || ''
    out.push({
      mesa: p.mesa!,
      hora: horaDe(p.programadoEn!),
      fecha: fechaDe(p.programadoEn!),
      etiqueta: ev ? `${fase} ${ev}` : fase,
      tipo: 'partido',
      eventoNombre: ev || undefined,
      eventoId: p.eventoId || undefined,
      detalle: `${p.jugadorA} vs ${p.jugadorB}`,
      estado: estadoPartidoMural(p),
      partidoIds: [p.id],
    })
  }

  for (const e of especiales) {
    out.push({
      mesa: 1,
      hora: String(e.hora).slice(0, 5),
      fecha: e.fecha,
      etiqueta: e.etiqueta,
      tipo: 'especial',
      estado: 'especial',
      partidoIds: [],
    })
  }

  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.mesa - b.mesa)
}

export type PartidoProgramarDia = {
  id: string
  fechaJuego: string
  fase: string
  orden: number
  grupoId: string | null
  inscritoA: string | null
  inscritoB: string | null
  clavesJugadores?: string[]
  programadoEn?: string | Date | null
}

function horaInicioIso(fecha: string, horaInicio: string): string {
  const hora = horaInicio.length === 5 ? `${horaInicio}:00` : String(horaInicio).slice(0, 8)
  return `${fecha}T${hora}`
}

/** Receso / apertura / premiación del día → intervalos [inicio, fin). */
export function intervalosEspecialesDelDia(
  especiales: Array<{ fecha: string; hora: string; duracionMin: number }>,
  fecha: string,
): Array<{ inicio: Date; fin: Date }> {
  return especiales.filter(e => e.fecha === fecha).map(e => {
    const h = String(e.hora).slice(0, 8)
    const hh = h.length === 5 ? `${h}:00` : h
    const inicio = new Date(`${fecha}T${hh}-03:00`)
    return { inicio, fin: new Date(inicio.getTime() + e.duracionMin * 60_000) }
  })
}

/**
 * Programa un campeonato por día: grupos en olas (~70 min) y después llaves
 * en bloques cortos, respetando recesos y sin solapar mesa/jugador.
 */
export function programarCampeonatoPorDias(
  partidos: PartidoProgramarDia[],
  opts: {
    mesas: number
    bloqueGrupoMinutos: number
    bloqueLlaveMinutos: number
    horaInicio: string
    especiales?: Array<{ fecha: string; hora: string; duracionMin: number }>
    yaProgramados?: SlotProgramado[]
  },
): { asignaciones: Map<string, SlotProgramado>; omitidos: string[] } {
  const asignaciones = new Map<string, SlotProgramado>()
  const omitidos: string[] = []
  const pendientes = partidos.filter(p => !p.programadoEn && p.inscritoA && p.inscritoB)
  const fechas = [...new Set(pendientes.map(p => p.fechaJuego))].sort()

  for (const fecha of fechas) {
    const inicio = new Date(`${horaInicioIso(fecha, opts.horaInicio)}-03:00`)
    const delDia = pendientes.filter(p => p.fechaJuego === fecha)
    const intervalos = intervalosEspecialesDelDia(opts.especiales ?? [], fecha)

    const gruposMap = new Map<string, PartidoProgramarDia[]>()
    for (const p of delDia.filter(x => x.fase === 'grupos' && x.grupoId)) {
      const arr = gruposMap.get(p.grupoId!) ?? []
      arr.push(p)
      gruposMap.set(p.grupoId!, arr)
    }
    const grupos: GrupoOlaProgramar[] = [...gruposMap.entries()].map(([grupoId, ps]) => ({
      grupoId,
      partidoIds: ps.map(p => p.id),
      clavesJugadores: [...new Set(ps.flatMap(p => p.clavesJugadores ?? []))],
    }))

    const olas = programarGruposEnOlas(grupos, {
      mesas: opts.mesas,
      bloqueMinutos: opts.bloqueGrupoMinutos,
      inicio,
      intervalosBloqueados: intervalos,
      ocupados: (opts.yaProgramados ?? []).filter(s => fechaDe(s.programadoEn) === fecha),
    })
    for (const [id, slot] of olas.asignaciones) asignaciones.set(id, slot)
    for (const gid of olas.omitidosGrupos) {
      omitidos.push(...(gruposMap.get(gid)?.map(p => p.id) ?? []))
    }

    const ocupados: SlotProgramado[] = [
      ...(opts.yaProgramados ?? []).filter(s => fechaDe(s.programadoEn) === fecha),
      ...olas.asignaciones.values(),
    ]
    const llaves = delDia.filter(p => p.fase !== 'grupos')
    const greedy = programarPartidosGreedyConInforme(
      llaves.map(p => ({
        id: p.id,
        inscritoA: p.inscritoA,
        inscritoB: p.inscritoB,
        prioridad: prioridadPartidoOficial(p.fase, p.orden),
        grupoId: p.grupoId,
      })),
      {
        mesas: opts.mesas,
        bloqueMinutos: opts.bloqueLlaveMinutos,
        inicio: olas.fin,
        ocupados,
        intervalosBloqueados: intervalos,
      },
    )
    for (const [id, slot] of greedy.asignaciones) asignaciones.set(id, slot)
    omitidos.push(...greedy.omitidos)
  }

  return { asignaciones, omitidos }
}

