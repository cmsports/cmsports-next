import { vi } from 'vitest'

/**
 * Un Supabase de mentira para probar las acciones de servidor.
 *
 * Las consultas reales se encadenan —`.from('x').select().eq().single()`— y
 * recién al final se resuelven. Acá cada eslabón devuelve el mismo objeto, que
 * además es esperable con `await`, así que la cadena funciona sin importar en
 * qué orden se llamen los métodos ni cuántos sean.
 *
 * Guarda todo lo que se le pidió, para poder afirmar sobre lo que la acción
 * intentó escribir. Eso es lo que atrapa un bug como el del formato del día al
 * generar la semana: la acción "funciona", pero manda un valor que la base
 * rechaza.
 */

export type Llamada = {
  tabla: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  datos?: unknown
  opciones?: unknown
}

/** Una llamada a una función de la base. */
export type LlamadaRpc = { nombre: string; args: Record<string, unknown> }

export type FakeSupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cliente: any
  llamadas: Llamada[]
  rpcs: LlamadaRpc[]
  /** Lo escrito en esa tabla, aplanado: los insert de varias filas vienen sueltos. */
  escrituras: (tabla: string) => Record<string, unknown>[]
  /** Los argumentos con que se llamó a esa función, en orden. */
  argsDe: (nombre: string) => Record<string, unknown>[]
}

type Respuestas = Record<string, unknown>

/**
 * Qué contesta cada función de la base.
 *
 * El valor puede ser el dato a devolver, o `{ error }` para simular que la
 * función rechazó la operación —que es como se comportan de verdad: validan y
 * lanzan excepción—. Sin poder simular eso, una prueba nunca ve el camino del
 * error, que es justo donde viven los bugs que el usuario nota.
 */
export type RespuestasRpc = Record<string, unknown | { error: { message: string } }>

/**
 * @param respuestas  Qué devuelve cada tabla al leerla. La clave es el nombre
 *                    de la tabla; el valor, lo que va en `data`.
 * @param usuario     Perfil de quien ejecuta. `null` simula sesión caída.
 */
export function fakeSupabase(
  respuestas: Respuestas = {},
  usuario: { id?: string; club_id: string | null; rol: string | null } | null =
    { id: 'usuario-1', club_id: 'club-1', rol: 'admin' },
  rpcs: RespuestasRpc = {},
): FakeSupabase {
  const llamadas: Llamada[] = []
  const llamadasRpc: LlamadaRpc[] = []

  function consulta(tabla: string) {
    let op: Llamada['op'] = 'select'
    let datos: unknown
    let opciones: unknown

    const resultado = () => {
      if (op !== 'select') return { data: { id: `${tabla}-nuevo` }, error: null }
      if (tabla === 'perfiles') return { data: usuario, error: null }
      const r = respuestas[tabla]
      return { data: r === undefined ? [] : r, error: null }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cadena: any = {
      then: (res: (v: unknown) => unknown) => {
        llamadas.push({ tabla, op, datos, opciones })
        return Promise.resolve(resultado()).then(res)
      },
    }

    for (const m of ['select', 'eq', 'in', 'is', 'not', 'lte', 'gte', 'lt', 'or', 'order', 'limit', 'range']) {
      cadena[m] = vi.fn(() => cadena)
    }
    for (const m of ['insert', 'update', 'upsert', 'delete'] as const) {
      cadena[m] = vi.fn((d?: unknown, o?: unknown) => { op = m; datos = d; opciones = o; return cadena })
    }
    // Devuelven la fila sola en vez de un arreglo, pero la cadena sigue igual.
    for (const m of ['single', 'maybeSingle']) {
      cadena[m] = vi.fn(() => ({
        then: (res: (v: unknown) => unknown) => {
          llamadas.push({ tabla, op, datos, opciones })
          const r = resultado()
          const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data
          return Promise.resolve({ data, error: r.error }).then(res)
        },
      }))
    }

    return cadena
  }

  const cliente = {
    from: vi.fn((tabla: string) => consulta(tabla)),
    rpc: vi.fn((nombre: string, args: Record<string, unknown> = {}) => {
      llamadasRpc.push({ nombre, args })
      const r = rpcs[nombre]
      if (r && typeof r === 'object' && r !== null && 'error' in r) {
        return Promise.resolve({ data: null, error: (r as { error: unknown }).error })
      }
      return Promise.resolve({ data: r === undefined ? null : r, error: null })
    }),
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: usuario ? { id: usuario.id ?? 'usuario-1' } : null },
      })),
    },
  }

  return {
    cliente,
    llamadas,
    rpcs: llamadasRpc,
    escrituras: (tabla) => llamadas
      .filter(l => l.tabla === tabla && l.op !== 'select' && l.datos !== undefined)
      .flatMap(l => (Array.isArray(l.datos) ? l.datos : [l.datos]) as Record<string, unknown>[]),
    argsDe: (nombre) => llamadasRpc.filter(r => r.nombre === nombre).map(r => r.args),
  }
}
