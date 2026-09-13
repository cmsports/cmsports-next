// La marca del club (nombre, logo y color) leída desde la base, para las
// pantallas que arman un PDF y solo tienen a mano el `club_id`.

import { marcaDelClub, type Marca } from './papel'

/**
 * Lee nombre y logo del club y arma la marca. Nunca falla: si no se pudo
 * leer, el PDF sale con el nombre que se tenga y el acento por defecto.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function marcaDesdeClub(supabase: any, clubId: string | null | undefined, nombreFallback = 'CmSports'): Promise<Marca> {
  if (!clubId) return marcaDelClub({ nombre: nombreFallback, logo_url: null })
  try {
    const { data } = await supabase.from('clubes').select('nombre, logo_url').eq('id', clubId).single()
    return marcaDelClub({ nombre: data?.nombre || nombreFallback, logo_url: data?.logo_url ?? null })
  } catch {
    return marcaDelClub({ nombre: nombreFallback, logo_url: null })
  }
}
