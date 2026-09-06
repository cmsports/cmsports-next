'use server'

/**
 * Procesa los partidos que todavía no movieron el índice de fuerza.
 *
 * ── Por qué esto existe en vez de un trigger ───────────────────────────────
 *
 * El marcador (`tecnico_partidos`) se escribe DIRECTO desde el navegador —
 * `app/tecnico/marcador/[id]/page.tsx` hace el update solo, sin pasar por
 * ninguna Server Action—. O sea que no hay un punto por donde encajar "y ahora
 * actualizá el Elo".
 *
 * La opción obvia sería un trigger en plpgsql. No se hizo, y el motivo está
 * escrito completo en la migración 260: la fórmula ya vive en `domain/elo.ts`
 * con 17 pruebas, y escribirla otra vez en SQL daría dos implementaciones de la
 * misma matemática —una probada y otra no— que se separan en el primer arreglo
 * que alguien haga en una sola.
 *
 * Así que se procesa acá, con el motor probado, y la cola es un LEFT JOIN: está
 * pendiente el partido finalizado que todavía no tiene fila en el historial.
 *
 * ── El orden no es un detalle ──────────────────────────────────────────────
 *
 * **Elo no es conmutativo.** Los mismos partidos en otro orden dan otro número:
 * ganarle al mejor del club antes o después de que ese rival subiera vale
 * distinto. Por eso van ordenados por cuándo se finalizaron y se aplican de a
 * uno sobre el resultado del anterior, no todos contra el índice de ayer.
 */

import { requireStaffClub } from '@/lib/auth/require'
import { crearLectorConfig, type FilaConfig } from '@/lib/domain/clubConfig'
import { actualizar, kDe, type Resultado } from '@/lib/domain/elo'
import { edadEn } from '@/lib/domain/perfilDeportivo'
import { fechaChile } from '@/lib/domain/fechaChile'

/** Menor de edad para el K acelerado. El corte es el mismo que usa el club. */
const EDAD_ADULTO = 18

/**
 * `timestamptz` → `YYYY-MM-DD` en hora de Chile.
 *
 * `toISOString().slice(0,10)` da UTC y corre el día: un partido que terminó a
 * las 22:00 de un lunes en Chile aparece como martes, y en la curva de la ficha
 * queda un salto en un día en que nadie jugó.
 */
function fechaChilenaDe(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

export async function procesarEloPendientes() {
  const { error: authErr, supabase, clubId } = await requireStaffClub()
  if (authErr || !clubId) return { error: authErr ?? 'Acceso denegado' }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const db = supabase as any

  // La configuración se lee de la tabla y no por `configDelClub()`, que es del
  // cliente. El lector y sus defaults son los mismos, así que un club sin filas
  // se comporta igual que con la pantalla.
  const { data: filasCfg, error: errCfg } = await db.from('club_config')
    .select('clave, valor').eq('club_id', clubId)
  if (errCfg) return { error: 'No se pudo leer la configuración: ' + errCfg.message }
  const config = crearLectorConfig((filasCfg ?? []) as FilaConfig[])

  // Un partido cuenta si tiene los dos jugadores identificados y un ganador.
  // Los del marcador con nombres sueltos —una visita, un sparring de afuera— no
  // tienen `jugador_id` y no pueden mover el índice de nadie.
  const { data: partidos, error: errPart } = await db.from('tecnico_partidos')
    .select('id, jugador_a_id, jugador_b_id, ganador_lado, actualizado_en')
    .eq('club_id', clubId).eq('estado', 'finalizado')
    .not('jugador_a_id', 'is', null)
    .not('jugador_b_id', 'is', null)
    .not('ganador_lado', 'is', null)
    .order('actualizado_en', { ascending: true })
  if (errPart) return { error: 'No se pudieron leer los partidos: ' + errPart.message }

  type Partido = { id: string; jugador_a_id: string; jugador_b_id: string; ganador_lado: 'a' | 'b'; actualizado_en: string }
  const todos = (partidos ?? []) as Partido[]
  if (todos.length === 0) return { success: true, procesados: 0 }

  // Los ya procesados. `ponytail:` un `.in()` con todos los refs alcanza de
  // sobra para el volumen de un club; si algún día son decenas de miles, esto
  // se cambia por una vista con el LEFT JOIN adentro.
  const { data: hechos, error: errHechos } = await db.from('ranking_elo_hist')
    .select('partido_ref').eq('club_id', clubId)
    .in('partido_ref', todos.map(p => `tecnico:${p.id}`))
  if (errHechos) return { error: 'No se pudo leer el historial: ' + errHechos.message }

  const yaEstan = new Set((hechos ?? []).map((h: { partido_ref: string }) => h.partido_ref))
  const pendientes = todos.filter(p => !yaEstan.has(`tecnico:${p.id}`))
  if (pendientes.length === 0) return { success: true, procesados: 0 }

  const ids = [...new Set(pendientes.flatMap(p => [p.jugador_a_id, p.jugador_b_id]))]

  const [elosRes, jugRes] = await Promise.all([
    db.from('ranking_elo').select('jugador_id, elo, partidos').eq('club_id', clubId).in('jugador_id', ids),
    db.from('jugadores').select('id, fecha_nacimiento').eq('club_id', clubId).in('id', ids),
  ])
  if (elosRes.error) return { error: 'No se pudo leer el ranking: ' + elosRes.error.message }
  if (jugRes.error)  return { error: 'No se pudieron leer los jugadores: ' + jugRes.error.message }

  // Quién es del club. Un partido contra alguien que ya no está no se procesa:
  // sin su fila el índice del rival no se puede guardar, y dejarlo a medias
  // movería a uno solo de los dos.
  const delClub = new Set((jugRes.data ?? []).map((j: { id: string }) => j.id))

  const hoy = fechaChile()
  const kPorJugador = new Map<string, number>()
  for (const j of (jugRes.data ?? []) as { id: string; fecha_nacimiento: string | null }[]) {
    const edad = j.fecha_nacimiento ? edadEn(j.fecha_nacimiento, hoy) : null
    // Sin fecha de nacimiento se lo trata como adulto: el K de adulto se mueve
    // más lento, así que equivocarse hacia ahí ensucia menos el índice que
    // acelerarle el número a alguien por no saber su edad.
    kPorJugador.set(j.id, kDe(config, edad !== null && edad < EDAD_ADULTO))
  }

  const inicial = config('elo.inicial')
  const cuentaWalkover = config('elo.cuenta_walkover') === 'si'

  const estado = new Map<string, { elo: number; partidos: number }>()
  for (const id of ids) estado.set(id, { elo: inicial, partidos: 0 })
  for (const e of (elosRes.data ?? []) as { jugador_id: string; elo: number; partidos: number }[]) {
    estado.set(e.jugador_id, { elo: e.elo, partidos: e.partidos })
  }

  const filasHist: Record<string, unknown>[] = []
  let procesados = 0

  for (const p of pendientes) {
    if (!delClub.has(p.jugador_a_id) || !delClub.has(p.jugador_b_id)) continue

    const a = estado.get(p.jugador_a_id)!
    const b = estado.get(p.jugador_b_id)!
    const resultado: Resultado = p.ganador_lado === 'a' ? 'gana' : 'pierde'
    const fecha = fechaChilenaDe(p.actualizado_en)
    const ref = `tecnico:${p.id}`

    const r = actualizar({
      eloA: a.elo, eloB: b.elo, resultado,
      kA: kPorJugador.get(p.jugador_a_id) ?? config('elo.k'),
      kB: kPorJugador.get(p.jugador_b_id) ?? config('elo.k'),
      cuentaWalkover,
    })

    // Las dos filas guardan el índice del rival ANTES del partido, que es
    // contra el que se jugó. Guardar el de después haría que la ficha muestre
    // un rival cuya fuerza ya incluye el resultado de este mismo partido.
    filasHist.push(
      { club_id: clubId, jugador_id: p.jugador_a_id, fecha, partido_ref: ref,
        elo_antes: a.elo, elo_despues: r.eloA, rival_id: p.jugador_b_id, rival_elo: b.elo, resultado },
      { club_id: clubId, jugador_id: p.jugador_b_id, fecha, partido_ref: ref,
        elo_antes: b.elo, elo_despues: r.eloB, rival_id: p.jugador_a_id, rival_elo: a.elo,
        resultado: resultado === 'gana' ? 'pierde' : 'gana' },
    )

    // Los dos suman un partido, siempre. Por acá no puede entrar un walkover
    // —el marcador exige `ganador_lado`, así que el resultado es 'gana' o
    // 'pierde' y nunca otra cosa; TypeScript lo comprueba—. El walkover existe
    // en el motor para la importación del archivo histórico, que sí los tiene.
    estado.set(p.jugador_a_id, { elo: r.eloA, partidos: a.partidos + 1 })
    estado.set(p.jugador_b_id, { elo: r.eloB, partidos: b.partidos + 1 })
    procesados++
  }

  if (filasHist.length === 0) return { success: true, procesados: 0 }

  // ⚠️ EL HISTORIAL VA PRIMERO, Y SIN `ignoreDuplicates`. Es deliberado: si dos
  // pestañas procesan a la vez, el UNIQUE de la 260 hace que la segunda choque
  // acá y salga con error ANTES de tocar el caché. Ignorar el duplicado en
  // cambio dejaría entrar un `ranking_elo` calculado sobre partidos que otra
  // pasada ya había contado — el índice inflado, y sin nada que lo delate.
  const { error: errHist } = await db.from('ranking_elo_hist').insert(filasHist)
  if (errHist) {
    return errHist.code === '23505'
      ? { error: 'Alguien más está actualizando el ranking en este momento. Volvé a intentar en unos segundos.' }
      : { error: 'No se pudo guardar el historial: ' + errHist.message }
  }

  // El caché. Si esto falla, el historial ya está y una segunda pasada NO
  // vuelve a contar los partidos (chocarían con el UNIQUE): hay que
  // reconstruirlo desde el historial, que es para lo que existe.
  const { error: errCache } = await db.from('ranking_elo').upsert(
    [...estado].map(([jugador_id, v]) => ({
      club_id: clubId, jugador_id, elo: v.elo, partidos: v.partidos,
      actualizado_en: new Date().toISOString(),
    })),
    { onConflict: 'club_id,jugador_id' },
  )
  if (errCache) return { error: 'El historial se guardó, pero el ranking no se pudo actualizar: ' + errCache.message }

  return { success: true, procesados }
}
