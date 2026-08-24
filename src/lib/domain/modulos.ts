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
  { key: 'tecnico', label: 'Perfil técnico' },
  { key: 'liga_futbol', label: 'Liga Fútbol' },
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
