// Sedes y grupos de entrenamiento. El valor guardado en la base es la clave
// corta; el label es lo que se muestra, con la dirección para que en pantalla
// se lea el lugar y no un apodo.
//
// El catálogo junta las sedes de TODOS los clubes, así que nadie lo recorre
// para pintar pestañas: las de cada club salen de `sedesDe()`, que las deriva
// de sus propios bloques. Recorrer `SEDES` le ponía a Spinhouse las sedes de
// Buin y a Buin una pestaña vacía de Spinhouse.

export const SEDES = [
  { value: 'buin',  label: 'Buin (Aníbal Pinto 158)' },
  { value: 'paine', label: 'Paine (Centro deportivo Fátima)' },
  { value: 'spinhouse', label: 'Spinhouse (José Ananías 128, Macul)' },
  { value: 'ambos', label: 'Ambos centros' },
] as const

/**
 * Las sedes que este club realmente usa, en el orden del catálogo.
 *
 * Las pestañas de sede salían de `SEDES` a secas, así que eran las de Buin para
 * todos los clubes: Spinhouse no tenía dónde ver sus bloques, y agregarle su
 * sede al catálogo le habría puesto a Buin una pestaña vacía. Derivarlas del
 * dato arregla los dos casos y hace que el próximo club no necesite código.
 *
 * Los valores que no están en el catálogo igual aparecen, al final: es mejor
 * mostrar una sede con nombre crudo que esconder sus bloques.
 */
export function sedesDe(items: { sede: string }[]): string[] {
  const orden = SEDES.map(s => s.value)
  const pos = (v: string) => { const i = orden.indexOf(v as typeof orden[number]); return i === -1 ? 99 : i }
  return [...new Set(items.map(i => i.sede).filter(Boolean))]
    .sort((a, b) => pos(a) - pos(b) || a.localeCompare(b, 'es'))
}

export const GRUPOS = [
  { value: 'MEN', label: 'MEN — Menores' },
  { value: 'ADU', label: 'ADU — Adultos' },
] as const

export function sedeLabel(sede: string | null | undefined): string {
  if (!sede) return '—'
  return SEDES.find(s => s.value === sede)?.label ?? sede
}

export function grupoLabel(grupo: string | null | undefined): string {
  if (!grupo) return '—'
  return GRUPOS.find(g => g.value === grupo)?.label ?? grupo
}

// Quien entrena en "ambos" también aparece al filtrar por Buin o por Paine.
export function entrenaEnSede(sedeJugador: string | null | undefined, sedeBuscada: string): boolean {
  if (!sedeJugador) return false
  if (sedeJugador === sedeBuscada) return true
  return sedeJugador === 'ambos' && (sedeBuscada === 'buin' || sedeBuscada === 'paine')
}
