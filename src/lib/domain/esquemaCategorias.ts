import { CATEGORIAS_BUIN, categoriaBuinPorFechaNacimiento } from './categoriaBuin'
import { CLUB_ID_BUIN } from './clubSlug'

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

const POR_CLUB: Record<string, EsquemaCategorias> = {
  [CLUB_ID_BUIN]: BUIN,
}

export function esquemaCategoriasDe(clubId: string | null | undefined): EsquemaCategorias {
  if (!clubId) return GENERICO
  return POR_CLUB[clubId] ?? GENERICO
}

/** La categoría con que se abre el formulario cuando aún no hay fecha de nacimiento. */
export function categoriaPorDefecto(esquema: EsquemaCategorias): string {
  return esquema.opciones[0] ?? 'principiante'
}
