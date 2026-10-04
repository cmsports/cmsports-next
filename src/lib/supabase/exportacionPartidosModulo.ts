import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/** Opt-in explícito: un club sin módulos configurados no obtiene esta función. */
export async function moduloExportacionPartidos(db: SupabaseClient<Database>, clubId: string | null | undefined) {
  if (!clubId) return { habilitado: false, error: null }
  const { data, error } = await db.from('clubes').select('modulos_habilitados').eq('id', clubId).maybeSingle()
  return { habilitado: !error && !!data?.modulos_habilitados?.includes('exportacion_partidos'), error }
}
