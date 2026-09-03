import { CATEGORIAS_BUIN, categoriaBuinPorFechaNacimiento } from './categoriaBuin'
import { edadEn } from './perfilDeportivo'
import { fechaChile } from './fechaChile'
import { CLUB_ID_BUIN } from './clubSlug'
import type { LectorConfig } from './clubConfig'

/**
 * Qué categorías usa cada club y si se pueden sugerir por edad.
 *
 * Existe para sacar el `if (clubId === CLUB_BUIN_ID)` que estaba repartido en
 * cinco puntos de `/solicitudes`. Esa comparación es justo lo que `CLAUDE.md`
 * prohíbe en código compartido: ata a todos los clubes al mismo archivo, y
 * darle categorías propias a un club nuevo obligaba a editar la pantalla.
 *
 * Acá la diferencia vuelve a ser **dato**: agregar un club es agregar una
 * entrada a `POR_CLUB`, igual que `clubSlug.ts` hace con los links cortos.
 * Cuando exista `club_config` (ver `docs/plan-aislamiento-clubes.md`), esta
 * tabla es lo que se mueve a la base sin tocar las pantallas.
 */
export type EsquemaCategorias = {
  /** Las opciones que se ofrecen al clasificar a alguien. */
  opciones: readonly string[]
  /**
   * Categoría sugerida a partir de la fecha de nacimiento, si el club clasifica
   * por edad. `undefined` = este club no sugiere nada y se elige a mano.
   */
  sugerirPorFechaNacimiento?: (fechaNacimiento: string) => string | null
}

/** Lo que ve un club que no declaró un esquema propio. */
const GENERICO: EsquemaCategorias = {
  opciones: ['principiante', 'intermedio', 'avanzado'],
}

/** Buin clasifica por año de nacimiento (tabla oficial de la asociación). */
const BUIN: EsquemaCategorias = {
  opciones: CATEGORIAS_BUIN,
  sugerirPorFechaNacimiento: (fn) => categoriaBuinPorFechaNacimiento(fn) ?? 'TC',
}

/** El corte entre los dos grupos de Spinhouse. Confirmado por el club. */
const EDAD_ADULTO_SPINHOUSE = 18

/**
 * Spinhouse agrupa en dos: Adultos y Menores.
 *
 * ── Esto NO es la categoría federada, y la diferencia importa ───────────
 *
 * `jugadores.categoria` guarda el GRUPO DE ENTRENAMIENTO: con quién entrena.
 * La categoría federada por edad —U11, U13, Senior— es otro eje, se calcula
 * sola en `perfilDeportivo.ts` y **no se guarda en ningún lado**, porque
 * guardarla garantiza que en enero quede vieja.
 *
 * Llegué a escribir U11…Senior acá, y estaba mal: la base dice que el club
 * tiene 34 en "Adultos" y 16 en "Menores". Cambiar el esquema a las categorías
 * federadas habría dejado a 50 de 53 jugadores con una categoría que ya no
 * figura entre las opciones, y el primer guardado de cada ficha se la habría
 * cambiado sin que nadie se enterara.
 *
 * ── Por qué hacía falta igual ──────────────────────────────────────────
 *
 * Sin esquema propio, el link de inscripción le ofrecía a Spinhouse las
 * opciones genéricas —principiante, intermedio, avanzado—, que el club no usa.
 * De ahí salió el jugador con categoría "principiante" que hay en la base: no
 * es un error de carga, es la pantalla ofreciendo algo que no correspondía.
 */
const SPINHOUSE: EsquemaCategorias = {
  opciones: ['Adultos', 'Menores'],
  sugerirPorFechaNacimiento: (fn) => {
    const edad = edadEn(fn, fechaChile())
    // Sin fecha de nacimiento no se sugiere nada. Mandar a "Adultos" por
    // defecto metería a un niño en el grupo de adultos por un campo vacío.
    if (edad === null) return null
    return edad < EDAD_ADULTO_SPINHOUSE ? 'Menores' : 'Adultos'
  },
}

const POR_CLUB: Record<string, EsquemaCategorias> = {
  [CLUB_ID_BUIN]: BUIN,
}

/** Los esquemas que un club puede elegir por configuración, por nombre. */
const POR_NOMBRE: Record<string, EsquemaCategorias> = {
  generico: GENERICO,
  buin: BUIN,
  spinhouse: SPINHOUSE,
}

/**
 * El esquema de un club.
 *
 * ── Por qué Spinhouse no está en `POR_CLUB` ─────────────────────────────
 *
 * Porque eso habría metido un segundo UUID de club en `src/`, que es
 * exactamente lo que `CLAUDE.md` prohíbe y lo que la meta-prueba
 * `sin-club-id-en-codigo` del plan (§14.4) va a hacer fallar. El UUID de Buin
 * ya estaba y se queda como está; sumarle otro es empeorar el problema para
 * ahorrarse una línea.
 *
 * Así que la elección va por `club_config`, que es donde este archivo siempre
 * dijo que iba a terminar. `POR_CLUB` queda como el camino de compatibilidad:
 * con la clave en `'auto'` —su default— el comportamiento es **idéntico** al de
 * antes de que existiera la configuración, y por eso Buin no se entera.
 */
export function esquemaCategoriasDe(
  clubId: string | null | undefined,
  config?: LectorConfig,
): EsquemaCategorias {
  const elegido = config?.('categorias.esquema') ?? 'auto'
  if (elegido !== 'auto') return POR_NOMBRE[elegido] ?? GENERICO

  if (!clubId) return GENERICO
  return POR_CLUB[clubId] ?? GENERICO
}

/** La categoría con que se abre el formulario cuando aún no hay fecha de nacimiento. */
export function categoriaPorDefecto(esquema: EsquemaCategorias): string {
  return esquema.opciones[0] ?? 'principiante'
}
