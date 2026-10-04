/** No revisar un padrón con la primera página de 1000 marcas de Supabase. */
export async function leerRetencionPaginada<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, tamano = 1000): Promise<{ data: T[]; error: null }> {
  const filas: T[] = []
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await consulta(desde, desde + tamano - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < tamano) break
  }
  return { data: filas, error: null }
}
