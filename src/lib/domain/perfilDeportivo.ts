/**
 * El perfil deportivo de la ficha: nivel, mano hábil, estilo y material.
 *
 * ── Nivel y categoría son DOS ejes, no uno ──────────────────────────────
 *
 * Spinhouse cruza la edad (U11…senior, que sale sola de la fecha de
 * nacimiento) con el nivel que le pone el entrenador. La tentación es
 * guardarlos juntos —"U15-competitivo"— y con eso se pierde el filtro por uno
 * solo, que es justamente el que arma los grupos y el que el entrenador usa
 * todo el tiempo. Por eso son dos columnas y este archivo solo sabe del
 * segundo. Ver `docs/plan-spinhouse-maestro.md` §5.5.
 *
 * ── La edad no se guarda ────────────────────────────────────────────────
 *
 * `categoriaPorEdad` la calcula cada vez desde `fecha_nacimiento`, igual que
 * `categoriaBuinPorFechaNacimiento`. Guardarla sería garantizar que en enero
 * quede vieja y que nadie se entere hasta que alguien de 14 aparezca en U11.
 */

export const NIVELES = ['iniciacion', 'intermedio', 'competitivo'] as const
export type Nivel = (typeof NIVELES)[number]

export const MANOS = ['diestro', 'zurdo'] as const
export type Mano = (typeof MANOS)[number]

const LABEL_NIVEL: Record<Nivel, string> = {
  iniciacion:  'Iniciación',
  intermedio:  'Intermedio',
  competitivo: 'Competitivo',
}

const LABEL_MANO: Record<Mano, string> = { diestro: 'Diestro', zurdo: 'Zurdo' }

export function nivelLabel(nivel: string | null | undefined): string {
  return LABEL_NIVEL[nivel as Nivel] ?? '—'
}

export function manoLabel(mano: string | null | undefined): string {
  return LABEL_MANO[mano as Mano] ?? '—'
}

/** Las categorías por edad de Spinhouse, de la más chica a la más grande. */
export const CATEGORIAS_EDAD = ['U11', 'U13', 'U15', 'U17', 'U19', 'Adulto', 'Senior'] as const
export type CategoriaEdad = (typeof CATEGORIAS_EDAD)[number]

/**
 * Los años cumplidos al día de referencia.
 *
 * Se compara mes y día, no se divide por 365.25: con la división, alguien que
 * cumple años mañana ya figura con la edad nueva, y en categorías de menores
 * eso lo mete en la categoría equivocada durante días.
 */
export function edadEn(fechaNacimiento: string, hoy: string): number | null {
  const nac = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNacimiento)
  const ref = /^(\d{4})-(\d{2})-(\d{2})/.exec(hoy)
  if (!nac || !ref) return null

  const [, an, mn, dn] = nac.map(Number) as unknown as [string, number, number, number]
  const [, ar, mr, dr] = ref.map(Number) as unknown as [string, number, number, number]

  let edad = ar - an
  if (mr < mn || (mr === mn && dr < dn)) edad--
  return edad >= 0 && edad < 120 ? edad : null
}

/**
 * La categoría por edad, calculada.
 *
 * Devuelve `null` cuando no hay fecha de nacimiento —que es el caso de buena
 * parte del padrón— en vez de adivinar. Una categoría inventada es peor que
 * ninguna: se ve igual de plausible y nadie la revisa.
 *
 * El corte de Senior es a los 40, que es lo que usa la ITTF para veteranos.
 * Si el club dice otra cosa, esto pasa a `club_config`; hoy nadie lo pidió.
 */
export function categoriaPorEdad(
  fechaNacimiento: string | null | undefined,
  hoy: string,
): CategoriaEdad | null {
  if (!fechaNacimiento) return null
  const edad = edadEn(fechaNacimiento, hoy)
  if (edad === null) return null

  if (edad < 11) return 'U11'
  if (edad < 13) return 'U13'
  if (edad < 15) return 'U15'
  if (edad < 17) return 'U17'
  if (edad < 19) return 'U19'
  if (edad < 40) return 'Adulto'
  return 'Senior'
}
