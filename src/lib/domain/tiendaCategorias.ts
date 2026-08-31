// Categorías de las tiendas (Tienda del profe / Tienda Buin) y su identidad
// visual — un solo lugar para que la pantalla y el catálogo en PDF
// (tienda-pdf.ts) usen siempre el mismo color y el mismo emoji por
// categoría, en vez de que cada uno invente el suyo y con el tiempo queden
// desalineados.

export const CATEGORIAS_TIENDA = [
  { key: 'maderos',    label: 'Maderos',          color: '#8a5a2b', emoji: '🏓' },
  { key: 'gomas',      label: 'Gomas',            color: '#c8102e', emoji: '🔴' },
  { key: 'pelotas',    label: 'Pelotas',          color: '#d97706', emoji: '⚪' },
  { key: 'accesorios', label: 'Accesorios',       color: '#7c3aed', emoji: '🎒' },
  { key: 'vestimenta', label: 'Vestimenta',       color: '#1e3a6d', emoji: '👕' },
  { key: 'otros',      label: 'Otros deportivos', color: '#0d9488', emoji: '🏅' },
] as const

export type CategoriaTiendaKey = typeof CATEGORIAS_TIENDA[number]['key']

// Categorías donde el color/talla tiene sentido (una goma tiene color, un
// candado no). Vive acá y no como un array suelto repetido en cada pantalla.
export const CATS_CON_COLOR: string[] = ['gomas', 'vestimenta']

const PALETA_RESPALDO = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

/** Color de marca de una categoría. Si es una que no está en la lista (dato
 *  viejo, o alguien agregó una categoría nueva sin actualizar esto), sale un
 *  color estable derivado del nombre en vez de romperse o quedar gris. */
export function colorCategoriaTienda(categoria: string): string {
  const conocida = CATEGORIAS_TIENDA.find(c => c.key === categoria)
  if (conocida) return conocida.color
  let h = 0
  for (const c of categoria) h = (h * 31 + c.charCodeAt(0)) | 0
  return PALETA_RESPALDO[Math.abs(h) % PALETA_RESPALDO.length]
}

export function emojiCategoriaTienda(categoria: string): string {
  return CATEGORIAS_TIENDA.find(c => c.key === categoria)?.emoji ?? '🛍️'
}

export function labelCategoriaTienda(categoria: string): string {
  return CATEGORIAS_TIENDA.find(c => c.key === categoria)?.label ?? categoria
}

/** Mezcla un color hex con blanco — para fondos tintados suaves (la foto del
 *  producto, el chip de categoría sin seleccionar). */
export function tinteCategoria(hex: string, opacidadBlanco: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const mezcla = (c: number) => Math.round(255 * opacidadBlanco + c * (1 - opacidadBlanco))
  return `rgb(${mezcla(r)}, ${mezcla(g)}, ${mezcla(b)})`
}
