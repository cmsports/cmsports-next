import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Ninguna escritura nueva a la base puede ignorar su `error`.
 *
 * Este es el patrón que produjo ocho de los treinta y tres hallazgos de la
 * auditoría del 2026-08-26, y el que está detrás de las migraciones 213 y 214,
 * que tuvieron que reponer a mano jugadores perdidos de sus grupos:
 *
 *     await supabase.from('grupo_jugadores').insert(inserts)   // ← sin revisar
 *     ...
 *     return { success: true }
 *
 * En Supabase una escritura que falla NO lanza: devuelve `{ error }`. Si nadie
 * lo mira, la función responde éxito con la base a medio escribir. Y un DELETE
 * o UPDATE filtrado por RLS ni siquiera da error: simplemente afecta 0 filas.
 *
 * Arreglar las que había de a una no impide que vuelva. Esto es lo mismo que
 * el proyecto ya hizo dos veces con buen resultado —el portazo
 * `_migracion_nueva`, los triggers de la 215—: convertir la regla en algo que
 * no dependa de que alguien se acuerde.
 *
 * ── Cómo agregar una excepción ───────────────────────────────────────────
 * Si una escritura de verdad no necesita revisar su error (una reversión
 * best-effort, una limpieza que da igual si no corre), se agrega su archivo y
 * línea a EXCEPCIONES **con el motivo escrito**. La lista es corta a propósito:
 * si empieza a crecer, la regla dejó de servir.
 */

const RAIZ = join(process.cwd(), 'src')

/**
 * Escrituras que ignoran su error a propósito.
 *
 * Clave: `ruta/relativa.ts`. Valor: por qué está bien que no se revise.
 * Se lista por archivo y no por línea para que un cambio de formato no
 * rompa la prueba; lo que se congela es el CONTEO por archivo.
 */
const EXCEPCIONES: Record<string, { max: number; motivo: string }> = {
  'app/actions/torneos.ts': {
    max: 27,
    motivo: 'Reversiones (`restaurarMovimiento`, `deshacerGrupos`, `limpiarNuevosGrupos`) y limpiezas de cabezas de serie: si fallan, el error que importa ya se está devolviendo por otro lado.',
  },
  'app/actions/torneo-oficial.ts': {
    max: 23,
    motivo: 'Sellos de `actualizado_en`, avance de fase y sincronización de sanciones desde el marcador: todos best-effort declarados, con el resultado del partido ya confirmado antes.',
  },
  'app/actions/liga.ts': {
    max: 6,
    motivo: 'Cierre de estados de liga y reubicación de partidos a la fecha de reajuste: el camino feliz ya devolvió sus conteos reales.',
  },
  'app/actions/credenciales.ts': {
    max: 3,
    motivo: 'Realineación de `usuario_login` en el espejo: cosmético, y el listado se devuelve igual con el login recalculado en memoria.',
  },
  'app/actions/jugadores.ts': {
    max: 8,
    motivo: 'Reversiones del alta (borrar la ficha recién creada) y espejo de credenciales, documentados en el propio archivo como preferibles a abortar el alta.',
  },
  'app/actions/solicitudes.ts': {
    max: 3,
    motivo: 'Reversión del alta y espejo de credenciales. La matrícula SÍ revisa su error desde la auditoría del 2026-08-26.',
  },
  'app/actions/horario.ts': {
    max: 2,
    motivo: 'Cierre de inscripciones al dar de baja un bloque, donde el error del bloque ya se devolvió.',
  },
  'app/actions/liga-futbol.ts': {
    max: 2,
    motivo: 'clonarLigaFutbol copia equipos de una liga a otra best-effort (patrón ya usado ahí con `?.[i]`, ningún equipo es indispensable para seguir clonando) y registrarPagoEquipo llama a Finanzas con un comentario explícito del autor: el cobro del equipo ya quedó registrado arriba pase lo que pase con el RPC de Finanzas.',
  },
  'app/actions/superadmin.ts': {
    max: 4,
    motivo: 'Borrado en cascada de un club: cada paso se reporta en el resumen que devuelve la acción.',
  },
  'app/actions/profesores.ts': { max: 2, motivo: 'Reversiones del alta de profesor.' },
  'app/actions/vouchers.ts': { max: 1, motivo: 'Reversión de la subida de imagen.' },
  'app/actions/club.ts': { max: 1, motivo: 'Sincronización de nombre/email del perfil, cosmética.' },
  'app/actions/actividad.ts': { max: 1, motivo: 'Bitácora de actividad: no puede tumbar la operación que registra.' },
  'app/actions/dashboard.ts': { max: 1, motivo: 'Alta de invitación con reintento desde la pantalla.' },
  'app/actions/tienda-asociacion.ts': { max: 3, motivo: 'Imagen del producto: el producto ya se creó.' },
  'app/actions/tienda-profe.ts': { max: 3, motivo: 'Imagen del producto: el producto ya se creó.' },
  'lib/credencialesAuth.ts': { max: 2, motivo: 'Sincronización de email en auth y espejo: devuelve null y quien llama decide.' },
  'components/campana-notificaciones.tsx': { max: 1, motivo: 'Marcar notificaciones como leídas.' },
  'app/solicitudes/page.tsx': { max: 1, motivo: 'Alta de invitación desde la pantalla, con reintento a la vista.' },
  'lib/offline/db.ts': { max: 1, motivo: 'IndexedDB, no Supabase: el falso positivo del escáner.' },
}

function archivosFuente(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) archivosFuente(p, salida)
    else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.includes('.test.')) salida.push(p)
  }
  return salida
}

/** Escrituras cuyo resultado no se guarda en ninguna variable. */
function escriturasSinRevisar(texto: string): number {
  const lineas = texto.split('\n')
  let total = 0
  for (let i = 0; i < lineas.length; i++) {
    if (!/\.(insert|update|delete|upsert|rpc)\s*\(/.test(lineas[i])) continue
    // Se mira hacia atrás hasta el comienzo de la sentencia (máx. 4 líneas).
    let inicio = i
    for (let k = 0; k < 4 && inicio > 0; k++) {
      if (/^\s*(const|let|var|return|if|await|void|\})/.test(lineas[inicio])) break
      inicio--
    }
    const sentencia = lineas.slice(inicio, i + 1).join(' ')
    // Si el resultado se destructura, se devuelve, se encadena o se acumula,
    // alguien lo está mirando.
    if (/const\s*\{|let\s*\{|=\s*await|return\s+|\.then\(|push\(|=>\s*(supabase|db|admin)/.test(sentencia)) continue
    if (!/await/.test(sentencia)) continue
    total++
  }
  return total
}

describe('escrituras a la base con su error revisado', () => {
  it('ningún archivo tiene más escrituras sin revisar de las declaradas', () => {
    const excedidos: string[] = []
    const inesperados: string[] = []

    for (const archivo of archivosFuente(RAIZ)) {
      const clave = relative(RAIZ, archivo).split(sep).join('/')
      const n = escriturasSinRevisar(readFileSync(archivo, 'utf8'))
      if (n === 0) continue

      const permitido = EXCEPCIONES[clave]
      if (!permitido) {
        inesperados.push(`${clave}: ${n} escritura(s) sin revisar su error`)
      } else if (n > permitido.max) {
        excedidos.push(`${clave}: ${n} sin revisar, se declararon ${permitido.max}`)
      }
    }

    // Un archivo nuevo con escrituras sin revisar: hay que revisarlas, o
    // declararlo acá con el motivo.
    expect(inesperados).toEqual([])
    // Un archivo conocido que sumó más: la que se agregó tiene que revisar su error.
    expect(excedidos).toEqual([])
  })

  it('la lista de excepciones no crece sin darse cuenta', () => {
    // Congelado a propósito. Subirlo es una decisión, no un descuido.
    // Subido a 20 en la auditoría 2026-08-26 al declarar liga-futbol.ts, el
    // primer módulo nuevo del amigo que trae escrituras best-effort propias.
    expect(Object.keys(EXCEPCIONES).length).toBeLessThanOrEqual(20)
    for (const [archivo, { motivo }] of Object.entries(EXCEPCIONES)) {
      expect(motivo.length, `${archivo} necesita un motivo escrito`).toBeGreaterThan(30)
    }
  })
})
