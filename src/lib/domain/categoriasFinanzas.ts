/**
 * Las categorías de ingreso y gasto, en un solo lugar.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────
 *
 * Estaban escritas en tres lados que ya se habían separado solos:
 *
 *   · `lib/validation/finanzas.ts` — el enum de zod, lo que el servidor acepta
 *   · `app/finanzas/page.tsx`      — lo que los <select> ofrecen, y sus tildes
 *   · `app/dashboard/page.tsx`     — las etiquetas del desglose de gastos
 *
 * La prueba de que se separan solas: `premio_torneo` está en el enum del
 * servidor desde hace rato y **no** en el select de la pantalla, así que hoy es
 * una categoría que el sistema acepta y nadie puede elegir. Y una categoría que
 * falta en el mapa de etiquetas no da error: pinta la clave cruda —
 * "sueldo_profesor"— en la pantalla de plata del club.
 *
 * ── Lo que NO se toca, y es lo importante ───────────────────────────────
 *
 * **Las claves de Buin son historia escrita.** Cada movimiento guardado lleva
 * su `categoria` como texto, así que renombrar una rompe todos los reportes
 * anteriores — los del mes pasado y los del año pasado. Por eso acá solo se
 * AGREGA, nunca se renombra ni se saca.
 *
 * Y por eso las listas base son, letra por letra, lo que cada lado ofrecía
 * antes de este archivo. Incluida la diferencia rara de `premio_torneo`: se
 * deja como estaba y se arregla aparte, porque unificarla de paso le cambiaría
 * el formulario a Buin en un commit que dice ser de Spinhouse.
 *
 * ── Lo que agrega el módulo ─────────────────────────────────────────────
 *
 * Spinhouse factura cosas que Buin no: clases particulares, arriendo de mesas
 * (que no es lo mismo que arrendar la cancha entera), venta de artículos y
 * auspicios. Y gasta en premios de liga y en marketing. Ver §5.7 del plan.
 *
 * Van detrás del módulo 'finanzas_categorias' porque son una LISTA, y una
 * lista no cabe en `club_config` — ahí van valores, no catálogos (CLAUDE.md).
 */

/** Ingresos que ofrece hoy el formulario, en todos los clubes. */
export const INGRESOS_BASE = [
  'mensualidad', 'matricula', 'inscripcion_torneo', 'inscripcion_liga',
  'arriendo_cancha', 'donacion', 'otro_ingreso',
] as const

/** Gastos que ofrece hoy el formulario, en todos los clubes. */
export const GASTOS_BASE = [
  'sueldo_profesor', 'sueldo_staff', 'arriendo_cancha', 'material_deportivo',
  'servicios_basicos', 'mantenimiento', 'otro_gasto',
] as const

/** Los que suma el módulo. */
export const INGRESOS_EXTRA = [
  'clase_particular', 'arriendo_mesa', 'venta_articulos', 'auspicio',
] as const

export const GASTOS_EXTRA = ['premio_liga', 'marketing'] as const

/**
 * El nombre que se lee en pantalla.
 *
 * Incluye claves que el formulario NO ofrece —`clase_extraordinaria`,
 * `premio_torneo`, `ajuste_mensualidad`— y eso es a propósito: las escriben los
 * RPC, y sin su etiqueta el movimiento aparece con la clave cruda en el listado.
 * Mostrar y ofrecer son dos cosas distintas.
 */
export const ETIQUETAS: Record<string, string> = {
  // ── Ingresos ──
  mensualidad: 'Mensualidad',
  matricula: 'Matrícula',
  inscripcion_torneo: 'Inscripción torneo',
  inscripcion_liga: 'Inscripción liga',
  arriendo_cancha: 'Arriendo cancha',
  donacion: 'Donación',
  clase_extraordinaria: 'Clase extra',
  otro_ingreso: 'Otro ingreso',
  clase_particular: 'Clase particular',
  arriendo_mesa: 'Arriendo de mesa',
  venta_articulos: 'Venta de artículos',
  auspicio: 'Auspicio',
  // ── Gastos ──
  sueldo_profesor: 'Sueldo profesor',
  sueldo_staff: 'Sueldo staff',
  material_deportivo: 'Material deportivo',
  servicios_basicos: 'Servicios básicos',
  mantenimiento: 'Mantenimiento',
  premio_torneo: 'Premio torneo',
  premio_liga: 'Premio de liga',
  marketing: 'Marketing y redes',
  otro_gasto: 'Otro gasto',
  // La escribe `corregir_mensualidad` al ajustar la cuota de un mes cerrado:
  // entra como ingreso si el ajuste es a favor y como gasto si es en contra.
  ajuste_mensualidad: 'Ajuste de mensualidad',
}

/**
 * Cómo se llama una categoría en pantalla.
 *
 * Ante una clave desconocida devuelve la clave, no un vacío ni una excepción:
 * un movimiento viejo con una categoría que ya nadie ofrece tiene que seguir
 * siendo legible. Se ve feo, y ese es el punto — se nota y se agrega acá.
 */
export function etiquetaCategoria(clave: string): string {
  return ETIQUETAS[clave] ?? clave
}

/** Los ingresos que el formulario ofrece a ese club. */
export function categoriasIngresoDe(conExtras: boolean): string[] {
  return conExtras ? [...INGRESOS_BASE, ...INGRESOS_EXTRA] : [...INGRESOS_BASE]
}

/** Los gastos que el formulario ofrece a ese club. */
export function categoriasGastoDe(conExtras: boolean): string[] {
  return conExtras ? [...GASTOS_BASE, ...GASTOS_EXTRA] : [...GASTOS_BASE]
}

/** Todo lo que el servidor acepta. El enum de zod sale de acá. */
export const TODAS_LAS_CATEGORIAS = [
  ...INGRESOS_BASE, ...INGRESOS_EXTRA,
  ...GASTOS_BASE, ...GASTOS_EXTRA,
  'premio_torneo', 'clase_extraordinaria', 'ajuste_mensualidad',
] as const
