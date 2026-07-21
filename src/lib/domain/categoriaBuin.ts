// Categorías por año de nacimiento del Club Buin (tabla oficial de la asociación, temporada 2026).
// Fuera de estos rangos (ej. 1997-2006, o anteriores a 1947) se asigna TC ("Todo Competidor").
const RANGOS_EDAD: { desde: number; hasta: number; categoria: string }[] = [
  { desde: 2015, hasta: Infinity, categoria: 'PENECA' },
  { desde: 2013, hasta: 2014, categoria: 'PREINFANTIL' },
  { desde: 2011, hasta: 2012, categoria: 'INFANTIL' },
  { desde: 2007, hasta: 2010, categoria: 'JUVENIL' },
  { desde: 1992, hasta: 1996, categoria: 'MASTER A' },
  { desde: 1987, hasta: 1991, categoria: 'MASTER B' },
  { desde: 1982, hasta: 1986, categoria: 'MASTER C' },
  { desde: 1977, hasta: 1981, categoria: 'MASTER D' },
  { desde: 1972, hasta: 1976, categoria: 'MASTER E' },
  { desde: 1967, hasta: 1971, categoria: 'MASTER F' },
  { desde: 1962, hasta: 1966, categoria: 'MASTER G' },
  { desde: 1957, hasta: 1961, categoria: 'MASTER H' },
  { desde: 1952, hasta: 1956, categoria: 'MASTER I' },
  { desde: 1947, hasta: 1951, categoria: 'MASTER J' },
]

export const CATEGORIAS_BUIN = ['PENECA', 'PREINFANTIL', 'INFANTIL', 'JUVENIL', 'TC',
  'MASTER A', 'MASTER B', 'MASTER C', 'MASTER D', 'MASTER E', 'MASTER F', 'MASTER G', 'MASTER H', 'MASTER I', 'MASTER J'] as const

export function categoriaLabel(categoria: string): string {
  const rango = RANGOS_EDAD.find(r => r.categoria === categoria)
  if (!rango) return categoria
  if (rango.hasta === Infinity) return `${categoria} (${rango.desde}+)`
  return `${categoria} (${rango.desde}–${rango.hasta})`
}

export function categoriaBuinPorFechaNacimiento(fechaNacimiento: string | null | undefined): string | null {
  if (!fechaNacimiento) return null
  const anio = new Date(fechaNacimiento).getUTCFullYear()
  if (Number.isNaN(anio)) return null
  const rango = RANGOS_EDAD.find((r) => anio >= r.desde && anio <= r.hasta)
  return rango?.categoria ?? 'TC'
}
