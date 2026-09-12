/**
 * Catálogo único de los módulos opcionales de un club.
 *
 * Vivía duplicado en tres lados —el hook que los lee (`useModulos`), la
 * pantalla del superadmin que los muestra y la Server Action que los guarda— y
 * las copias se desincronizaron: los cuatro módulos de Recursos (tienda del
 * profe, tienda Buin, bibliografía, libro del profe) existían solo en el hook.
 * El resultado era que no había forma de activarlos desde el panel, y si el
 * valor llegaba igual a la Action, la validación lo descartaba sin avisar.
 *
 * El `label` es el mismo texto que muestra el sidebar: el superadmin marca la
 * casilla con el nombre que el admin del club va a ver.
 */
export const MODULOS = [
  { key: 'torneos', label: 'Torneos' },
  { key: 'torneo_oficial', label: 'Torneo oficial' },
  { key: 'liga', label: 'Liga' },
  // La clave sigue siendo 'clases' en la base, pero el módulo hoy solo gobierna
  // el horario semanal: la pantalla de clases generadas se eliminó.
  { key: 'clases', label: 'Cupos/bloques' },
  { key: 'calendario', label: 'Calendario' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'mensualidades', label: 'Mensualidades' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'tienda', label: 'Tienda DoubleTT' },
  { key: 'tienda_buin', label: 'Tienda del profe' },
  { key: 'tienda_asociacion', label: 'Tienda Buin' },
  { key: 'bibliografia', label: 'Bibliografía TDM' },
  { key: 'libro_profe', label: 'Libro del profe' },
  { key: 'feedback', label: 'Feedback' },
  // El alumno avisa que no va a un bloque y su lugar queda libre ese día. Va
  // aparte de 'clases' porque la mayoría de los clubes no quiere que el alumno
  // toque su horario: hoy solo Spinhouse (migración 226).
  { key: 'recuperar_clases', label: 'Recuperar clases' },
  // El profesor marca que estuvo, para contabilizar horas trabajadas. Aparte de
  // 'asistencia', que es la de los alumnos: son dos registros distintos y un
  // club puede querer uno sin el otro (migración 227).
  { key: 'asistencia_profes', label: 'Asistencia de profesores' },
  // El alumno le escribe al profesor, con su nombre o anónimo. Aparte de
  // 'feedback', que es del profe hacia el alumno: van en direcciones opuestas y
  // un club puede querer una sola (migración 228).
  { key: 'feedback_profes', label: 'Feedback al profesor' },
  // Las mesas de la sede como recurso, y el cupo de cada bloque derivado de
  // ellas en vez de escrito a mano. Va aparte de 'clases' porque cambia de
  // dónde sale el cupo: un club que lo lleva a mano —Buin— no quiere ver la
  // palabra "mesa" en ninguna pantalla (migración 249).
  { key: 'mesas', label: 'Mesas de la sede' },
  // El panel de `club_config` en Configuración. Apagado por defecto, y eso NO
  // es cautela de más: ese panel tiene el control de los días de morosidad, y
  // un club que hoy no bloquea a nadie no puede encontrarse la perilla puesta
  // en su pantalla sin haberla pedido. Se enciende cuando el club de verdad
  // necesita comportarse distinto.
  { key: 'config_club', label: 'Configuración avanzada del club' },
  // Tarifas de mensualidad: frecuencia semanal × tipo de clase → monto. Va
  // aparte de 'mensualidades' porque cambia de dónde sale la cuota. En Buin
  // cada cuota es un acuerdo por persona y ninguna tabla puede adivinarlas
  // (ver mensualidades.ts); en Spinhouse sale de una tarifa publicada
  // (migración 252).
  { key: 'planes', label: 'Planes de mensualidad' },
  // Avisos y bloqueos automáticos por morosidad e inasistencia. Apagado por
  // defecto y con TODOS sus umbrales en 0 (= nunca): encenderlo sin configurar
  // no bloquea a nadie, y la pantalla que trae es una marcha en seco que
  // muestra a quién le tocaría sin tocar a nadie. No tiene migración: lee
  // `club_config` y `movimientos`, que ya existen, y el módulo se enciende
  // desde el panel del superadmin.
  { key: 'retencion', label: 'Retención y morosidad' },
  // Los campos deportivos de la ficha: nivel interno, licencia FECHITEME, mano
  // hábil, estilo y material. Va aparte de 'jugadores' —que es core y no se
  // apaga— porque son datos que solo un club de competición llena: una ficha de
  // Buin con cinco campos vacíos de por vida es ruido, no una función
  // (migración 254).
  { key: 'perfil_deportivo', label: 'Perfil deportivo del jugador' },
  // Pasar lista optimizado para la cancha: contador de cuántos faltan y
  // botones de 44 px. Va aparte de 'asistencia' porque no agrega una función,
  // cambia cómo se ve la pantalla que Buin usa todos los días — y eso se
  // enciende cuando el club lo pide, no de sorpresa en un despliegue.
  { key: 'pasar_lista_rapido', label: 'Pasar lista rápido (para la cancha)' },
  // Categorías de ingreso y gasto propias: clases particulares, arriendo de
  // mesa, venta de artículos, auspicios, premios de liga, marketing. Va aparte
  // de 'finanzas' porque las claves de un club son historia escrita —cada
  // movimiento guardado lleva la suya como texto— y sumarle categorías a un
  // club que no las pidió le ensucia el formulario y sus reportes (254).
  { key: 'finanzas_categorias', label: 'Categorías de finanzas propias del club' },
  { key: 'tecnico', label: 'Perfil técnico' },
  // Tipo de clase por bloque (grupal, competitivo, particular, adultos,
  // paralímpico, arriendo), entrenador auxiliar, plantilla de la sesión y la
  // clase que se cobra aparte. Va aparte de 'clases' porque un club que dicta
  // una sola modalidad no gana nada eligiendo "grupal" en cada bloque: gana un
  // campo más que llenar. Y porque 'particular' cambia la cuenta de las mesas,
  // que es algo que solo tiene sentido con 'mesas' encendido (migración 257).
  { key: 'tipos_clase', label: 'Tipos de clase y entrenador auxiliar' },
  { key: 'liga_futbol', label: 'Liga Fútbol' },
  // El registro de autorizaciones —hoy solo uso de imagen— y el campo de
  // necesidades de accesibilidad. Apagado por defecto aunque los seis clubes lo
  // vayan a necesitar antes del 2026-12-01: encenderlo le agrega un panel a la
  // ficha de 140 personas reales, y eso se decide cuando el club defina cómo va
  // a juntar las autorizaciones, no en un despliegue (migración 259).
  { key: 'consentimientos', label: 'Consentimientos y accesibilidad' },
  // Liguilla (todos contra todos, una o dos ruedas) y eliminación directa con
  // cuadro de consolación, como alternativas al torneo tradicional de grupos +
  // llave. Va aparte de 'torneos' —que es el módulo entero y Buin usa todos los
  // días— porque agrega un selector al formulario de creación: un club que
  // corre una sola forma de torneo no gana nada eligiéndola cada vez, gana un
  // paso más. Solo aparece en Torneo Externo; el interno es siempre tradicional
  // y eso lo hace cumplir `crearTorneo`, no el formulario (migración 264).
  { key: 'torneos_modalidades', label: 'Modalidades de torneo' },
  // Torneos por equipos: Swaythling (5 individuales) o Corbillon (4 y un
  // dobles). Va aparte de 'torneos_modalidades' y no como una opción más
  // porque no es una variante del mismo motor: el participante deja de ser un
  // jugador y pasa a ser un equipo, un encuentro contiene cinco partidos, y el
  // dobles necesita cuatro personas en una tabla que tiene dos lados. Trae sus
  // propias tablas. Un club puede querer liguilla sin meterse en nada de eso.
  { key: 'torneos_equipos', label: 'Torneos por equipos' },
  // Códigos QR para imprimir y pegar en la sede: uno que lleva al login, y
  // uno por cada ranking que lleva a una página PÚBLICA del ranking (sin
  // cuenta: nombre y puntos, nada más). Apagado por defecto porque publica
  // nombres de jugadores fuera de la app; lo pidió Buin (migración 270). Sin
  // el módulo, la página pública responde 404 aunque alguien tenga el link.
  { key: 'qr_publico', label: 'QR para imprimir (login y ranking público)' },
  // Ligas programadas por jornadas: cada división juega una tarde con varias
  // mesas, 3 partidos por cabeza, árbitros de la misma división, y el día y
  // las mesas se eligen por jornada. Es cómo corre la liga Spinhouse
  // (migración 272/273). Va aparte de 'liga' porque cambia el motor entero de
  // programación: el modo de siempre (una mesa por división, fecha larga)
  // sigue siendo el de San Bernardo y no se toca.
  { key: 'liga_jornadas', label: 'Liga por jornadas (varias mesas por división)' },
  // Tareas NO va acá: es la lista privada de los superadmin
  // (/superadmin/tareas), no una función que un club pueda activar.
] as const

export type Modulo = (typeof MODULOS)[number]['key']

/** Dashboard y Jugadores no se pueden apagar: son la app mínima. */
export const MODULOS_CORE: readonly string[] = ['dashboard', 'jugadores']

export const MODULOS_KEYS: Modulo[] = MODULOS.map(m => m.key)

export function esModulo(valor: string): valor is Modulo {
  return (MODULOS_KEYS as string[]).includes(valor)
}

/**
 * Normaliza una selección: descarta claves desconocidas y agrega las
 * dependencias que faltan.
 *
 * Hoy la única dependencia es Mensualidades → Finanzas (el cobro se registra
 * como movimiento financiero; sin Finanzas el módulo queda a medias). La regla
 * estaba copiada en la UI y en las dos Actions que escriben módulos, así que
 * se podía arreglar en una y olvidar la otra.
 */
export function conDependencias(modulos: string[]): Modulo[] {
  const validos = modulos.filter(esModulo)
  return validos.includes('mensualidades') && !validos.includes('finanzas')
    ? [...validos, 'finanzas']
    : validos
}
