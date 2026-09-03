/**
 * Catálogo único de la configuración por club.
 *
 * Es el hermano de `modulos.ts`. Aquel decide qué módulos VE un club; este
 * decide cómo se COMPORTAN los módulos que ya tiene. La diferencia importa:
 * Buin y Spinhouse tienen los dos el módulo de cupos, pero uno cuenta un
 * número escrito a mano y el otro multiplica mesas.
 *
 * ── La regla que hace que esto sea seguro ───────────────────────────────
 *
 * **El `defecto` de cada clave es el comportamiento ACTUAL de Buin.**
 *
 * Un club sin ninguna fila en `club_config` se comporta exactamente como
 * antes de que esta tabla existiera. Eso no es una comodidad: es lo que
 * permite introducir la configuración sin tocar producción, y es el criterio
 * con el que se acepta cada clave nueva.
 *
 * Concretamente: los `0` de morosidad y retención significan "nunca", que es
 * lo que Buin hace hoy. Si alguien los cambia a 30 "porque parece razonable",
 * Buin empieza a bloquear alumnos al día siguiente.
 *
 * ── Quién puede editar cada clave ───────────────────────────────────────
 *
 * `editablePor` y no un permiso para toda la tabla. **Casi todo es del
 * admin**: cuántos jugadores entran por mesa, a los cuántos días avisar de una
 * deuda, cuánto vale ganar un partido de liga. Son decisiones sobre su propio
 * club, y hacer que tenga que pedirlas por WhatsApp es exactamente la fricción
 * que este sistema existe para sacar.
 *
 * `superadmin` queda para las dos claves cuya seguridad depende de código que
 * puede no existir todavía:
 *
 *   · `mensualidad.modo` — pasar a planes sin planes cargados deja al club sin
 *     poder emitir una sola cuota.
 *   · `inscripcion.autoservicio` — encenderlo sin la función atómica de
 *     inscripción hace que dos alumnos tomen el mismo último cupo.
 *
 * O sea: el superadmin no guarda las claves *delicadas*, guarda las que tienen
 * una **precondición técnica**. Que una decisión sea grave —bloquear morosos lo
 * es— no la vuelve suya: la vuelve algo que la pantalla tiene que explicar bien
 * antes de que el admin apriete.
 *
 * ── Cómo agregar una clave ──────────────────────────────────────────────
 *
 * 1. Verificar en el código qué hace HOY el sistema, y poner eso de `defecto`.
 *    No lo que parece razonable: lo que hace. `clubConfig.test.ts` congela
 *    cada default, así que cambiar uno rompe la prueba a propósito.
 * 2. Agregarla acá, con su `label` en español — es el texto que quien la
 *    configure va a ver en pantalla.
 * 3. Elegir `editablePor`. Por defecto, `'admin'`: es su club.
 * 4. **Si es `'superadmin'`, sumarla también a la lista de la migración 250.**
 *    Son dos listas en dos lenguajes distintos; `clubConfig.test.ts` las cruza
 *    y falla si se separan.
 * 5. Leerla con `configDelClub()`. Nunca consultar la tabla suelta.
 *
 * Y lo que NO va acá: cualquier diferencia que no se pueda expresar como un
 * valor —un número, una opción de una lista cerrada, un sí/no—. Eso va como
 * módulo aparte. Meter lógica dentro del valor es reinventar el `if` por club
 * con más pasos y sin tipos.
 *
 * Ver `docs/plan-spinhouse-maestro.md` §4 y la migración 248.
 */

export const CONFIG_CLUB = [
  // ── Cupos ──────────────────────────────────────────────────────────────
  {
    clave: 'cupos.modo',
    tipo: 'opcion',
    opciones: ['numero', 'por_mesas'],
    defecto: 'numero',
    editablePor: 'admin',
    label: 'Cómo se calcula el cupo de un bloque',
    // 'numero' es lo que hay hoy: `bloques_horario.cupo_maximo`, escrito a
    // mano (migración 073). 'por_mesas' lo deriva de las mesas asignadas.
  },
  {
    clave: 'cupos.por_mesa_grupal',
    tipo: 'entero',
    min: 1,
    max: 8,
    defecto: 4,
    editablePor: 'admin',
    label: 'Jugadores por mesa en clase grupal',
    // Inerte mientras `cupos.modo` sea 'numero', que es el default. El 4 es
    // lo que pidió Spinhouse, no un supuesto sobre Buin.
  },
  {
    clave: 'cupos.por_mesa_particular',
    tipo: 'entero',
    min: 1,
    max: 4,
    defecto: 2,
    editablePor: 'admin',
    label: 'Jugadores por mesa en clase particular',
  },

  // ── Mensualidades ──────────────────────────────────────────────────────
  {
    clave: 'mensualidad.modo',
    tipo: 'opcion',
    opciones: ['monto_libre', 'por_plan'],
    defecto: 'monto_libre',
    editablePor: 'superadmin',
    label: 'Cómo se determina la cuota de un jugador',
    // 'monto_libre' es lo que hay hoy: `jugadores.mensualidad`, un número por
    // persona. `mensualidades.ts` lo explica: "el profe define cada cuota a
    // mano —hay de $7.000, de $30.000, de $50.000— y ninguna tabla puede
    // adivinarlas". Eso es correcto para Buin y no se toca.
  },

  // ── Morosidad ──────────────────────────────────────────────────────────
  // Los dos umbrales en 0 = nunca. Buin no bloquea a nadie automáticamente: lo
  // hace a mano con `toggleEstadoJugador`. Cambiar estos números bloquea gente.
  {
    clave: 'morosidad.dia_vencimiento',
    tipo: 'entero',
    min: 1,
    max: 28,
    defecto: 1,
    editablePor: 'admin',
    label: 'Día del mes en que vence la cuota',
    // El sistema no tenía noción de vencimiento: `v_morosos` solo mira si la
    // cuota del mes está impaga. Para contar DÍAS de mora hace falta una fecha
    // desde la cual contar, y adivinarla sería inventar el número que decide a
    // quién se bloquea. El tope es 28 para que exista en febrero.
    //
    // El default de 1 no cambia nada mientras los umbrales estén en 0.
  },
  {
    clave: 'morosidad.dias_aviso',
    tipo: 'entero',
    min: 0,
    max: 365,
    defecto: 0,
    editablePor: 'admin',
    label: 'Días de deuda antes de avisar (0 = nunca)',
  },
  {
    clave: 'morosidad.dias_bloqueo',
    tipo: 'entero',
    min: 0,
    max: 365,
    defecto: 0,
    editablePor: 'admin',
    label: 'Días de deuda antes de bloquear la cuenta (0 = nunca)',
  },

  // ── Retención ──────────────────────────────────────────────────────────
  {
    clave: 'retencion.faltas_alerta',
    tipo: 'entero',
    min: 0,
    max: 20,
    defecto: 0,
    editablePor: 'admin',
    label: 'Inasistencias seguidas antes de alertar (0 = nunca)',
  },
  {
    clave: 'retencion.dias_inactivo',
    tipo: 'entero',
    min: 0,
    max: 365,
    defecto: 0,
    editablePor: 'admin',
    label: 'Días sin asistir ni pagar antes de marcar inactivo (0 = nunca)',
  },

  // ── Liga ───────────────────────────────────────────────────────────────
  // Verificado contra `liga.ts`: el ganador suma 3, el perdedor de un partido
  // jugado suma 1, y el walkover suma 0. Spinhouse usa 2/1/0.
  {
    clave: 'liga.puntos_victoria',
    tipo: 'entero',
    min: 0,
    max: 10,
    defecto: 3,
    editablePor: 'admin',
    label: 'Puntos por ganar un partido de liga',
  },
  {
    clave: 'liga.puntos_derrota',
    tipo: 'entero',
    min: 0,
    max: 10,
    defecto: 1,
    editablePor: 'admin',
    label: 'Puntos por perder un partido jugado',
  },
  {
    clave: 'liga.puntos_walkover',
    tipo: 'entero',
    min: 0,
    max: 10,
    defecto: 0,
    editablePor: 'admin',
    label: 'Puntos para quien no se presenta',
  },

  // ── Categorías de jugador ──────────────────────────────────────────────
  {
    clave: 'categorias.esquema',
    tipo: 'opcion',
    opciones: ['auto', 'generico', 'buin', 'spinhouse'],
    defecto: 'auto',
    editablePor: 'admin',
    label: 'Con qué categorías se clasifica a los jugadores',
    // 'auto' = lo que hacía `esquemaCategorias.ts` antes de que existiera esta
    // clave: Buin por su UUID, todos los demás el genérico. Es el default
    // porque es el comportamiento actual, y porque cambiarlo a 'buin' le
    // pondría las categorías PENECA…MASTER J a los otros cinco clubes.
  },

  // ── Índice de fuerza (Elo) ─────────────────────────────────────────────
  // Las cuatro son inertes sin el módulo 'ranking_elo': nadie las lee. Por eso
  // sus defaults no son "lo que Buin hace hoy" en el sentido literal —Buin no
  // calcula Elo— sino los valores estándar del sistema. Lo que protege a Buin
  // acá es el módulo apagado, no el default.
  {
    clave: 'elo.inicial',
    tipo: 'entero',
    min: 100,
    max: 3000,
    defecto: 1500,
    editablePor: 'admin',
    label: 'Índice con que arranca un jugador nuevo',
  },
  {
    clave: 'elo.k',
    tipo: 'entero',
    min: 1,
    max: 100,
    defecto: 24,
    editablePor: 'admin',
    label: 'Cuánto se mueve el índice por partido (K)',
    // 24 es el valor habitual para competencia de club. Más alto reacciona
    // antes y salta más con un resultado raro; más bajo es estable pero tarda
    // media temporada en reflejar que alguien mejoró.
  },
  {
    clave: 'elo.k_menores',
    tipo: 'entero',
    min: 1,
    max: 100,
    defecto: 40,
    editablePor: 'admin',
    label: 'Cuánto se mueve el índice de un menor por partido (K)',
    // Más alto que el de adultos a propósito: la fuerza real de un juvenil
    // cambia de mes a mes. Ponerlo igual al de adultos desactiva la
    // diferencia sin romper nada.
  },
  {
    clave: 'elo.cuenta_walkover',
    tipo: 'opcion',
    opciones: ['no', 'si'],
    defecto: 'no',
    editablePor: 'admin',
    label: 'Si no presentarse mueve el índice',
    // 'no' porque un partido que no se jugó no es evidencia de fuerza.
    // Castigar la no presentación es disciplina y va por los puntos de la
    // liga, no por el índice.
  },

  // ── Inscripción ────────────────────────────────────────────────────────
  {
    clave: 'inscripcion.autoservicio',
    tipo: 'opcion',
    opciones: ['off', 'pide_aprobacion', 'directo'],
    defecto: 'off',
    editablePor: 'superadmin',
    label: 'Si el alumno puede inscribirse solo en un bloque',
    // 'off' es lo que hay hoy en los dos clubes: inscribe el staff. Encenderlo
    // exige antes la función atómica de inscripción — sin ella, dos alumnos
    // toman el mismo último cupo. Ver §10.6 del plan maestro.
  },
] as const

// ── Tipos derivados del catálogo ─────────────────────────────────────────
// Todo sale del `as const` de arriba: no hay una segunda lista que mantener
// sincronizada, que es exactamente el error que `modulos.ts` vino a arreglar.

type Definicion = (typeof CONFIG_CLUB)[number]

export type ClaveConfig = Definicion['clave']

type DefinicionDe<K extends ClaveConfig> = Extract<Definicion, { clave: K }>

/** El tipo del valor de una clave, deducido de su definición. */
export type ValorDe<K extends ClaveConfig> =
  DefinicionDe<K> extends { tipo: 'opcion'; opciones: readonly (infer O)[] } ? O
  : DefinicionDe<K> extends { tipo: 'entero' } ? number
  : never

export const CLAVES_CONFIG = CONFIG_CLUB.map(c => c.clave) as ClaveConfig[]

const POR_CLAVE = new Map<string, Definicion>(
  CONFIG_CLUB.map(c => [c.clave, c]),
)

export function esClaveConfig(valor: string): valor is ClaveConfig {
  return POR_CLAVE.has(valor)
}

/** Las claves cuya edición exige superadmin. La migración 250 tiene la misma lista. */
export const CLAVES_SOLO_SUPERADMIN: ClaveConfig[] =
  CONFIG_CLUB.filter(c => c.editablePor === 'superadmin').map(c => c.clave)

/**
 * Si ese rol puede editar esa clave.
 *
 * Es la misma regla que aplica la RLS, acá para poder esconder el control en
 * vez de dejar que el admin apriete y reciba un error. La base sigue siendo la
 * garantía: esto es cortesía, no seguridad.
 */
export function puedeEditarClave(clave: ClaveConfig, rol: string | null | undefined): boolean {
  if (rol === 'superadmin') return true
  if (rol !== 'admin') return false
  return POR_CLAVE.get(clave)?.editablePor === 'admin'
}

/** Las claves que ese rol puede tocar, en el orden del catálogo. */
export function clavesEditablesPor(rol: string | null | undefined): ClaveConfig[] {
  return CLAVES_CONFIG.filter(c => puedeEditarClave(c, rol))
}

export function definicionDe<K extends ClaveConfig>(clave: K): DefinicionDe<K> {
  return POR_CLAVE.get(clave) as DefinicionDe<K>
}

export function valorPorDefecto<K extends ClaveConfig>(clave: K): ValorDe<K> {
  return POR_CLAVE.get(clave)!.defecto as ValorDe<K>
}

/**
 * Convierte lo que vino de la base en un valor usable, o devuelve el default.
 *
 * Esta función NUNCA lanza y NUNCA devuelve algo fuera de rango. Es
 * deliberado: lo que hay del otro lado es una tabla que alguien edita a mano,
 * y el peor resultado posible sería que un valor mal escrito tumbe una
 * pantalla —o peor, que se cuele y cambie un cálculo de plata—.
 *
 * Ante cualquier duda, el default. Y el default es lo que Buin hace hoy, así
 * que el peor caso de un valor corrupto es "se comporta como antes".
 */
export function normalizarValor<K extends ClaveConfig>(clave: K, crudo: unknown): ValorDe<K> {
  const def = POR_CLAVE.get(clave)
  if (!def) return undefined as never

  if (def.tipo === 'opcion') {
    return ((def.opciones as readonly string[]).includes(crudo as string)
      ? crudo
      : def.defecto) as ValorDe<K>
  }

  // Entero. `Number.isInteger` descarta de una los strings, los null, los
  // NaN, los decimales y los infinitos, que es todo lo que puede llegar mal
  // desde un jsonb.
  if (!Number.isInteger(crudo)) return def.defecto as ValorDe<K>
  const n = crudo as number
  if (n < def.min || n > def.max) return def.defecto as ValorDe<K>
  return n as ValorDe<K>
}

/** Una fila cruda de `club_config`, tal como la devuelve Supabase. */
export type FilaConfig = { clave: string; valor: unknown }

/** Lo que devuelve `configDelClub()`: se llama con la clave y da el valor. */
export type LectorConfig = <K extends ClaveConfig>(clave: K) => ValorDe<K>

/**
 * Arma el lector a partir de las filas del club.
 *
 * Las filas con claves que el catálogo no conoce se descartan en silencio,
 * igual que hace `conDependencias` en `modulos.ts`. Eso permite que una
 * versión vieja del código conviva con una fila nueva en la base sin
 * romperse — que es exactamente lo que pasa durante un despliegue.
 */
export function crearLectorConfig(filas: readonly FilaConfig[] = []): LectorConfig {
  const guardados = new Map<ClaveConfig, unknown>()
  for (const fila of filas) {
    if (esClaveConfig(fila.clave)) guardados.set(fila.clave, fila.valor)
  }

  return <K extends ClaveConfig>(clave: K): ValorDe<K> =>
    guardados.has(clave)
      ? normalizarValor(clave, guardados.get(clave))
      : valorPorDefecto(clave)
}

/** El lector de un club sin ninguna fila: todo en su default. */
export const CONFIG_POR_DEFECTO: LectorConfig = crearLectorConfig([])
