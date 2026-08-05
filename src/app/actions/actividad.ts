'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperadmin } from '@/lib/auth/require'
import { moduloRequeridoPorRuta } from '@/lib/auth/modulos-rutas'
import { DIAS_VENTANA, rutaRegistrable, rutaSinParametros, type FilaActividad } from '@/lib/domain/actividad'

/**
 * Cuántas filas se traen al panel. Un mes de uso real del piloto son miles,
 * no cientos de miles.
 *
 * ponytail: techo conocido —si el tope se alcanza, el promedio de 30 días se
 * calcula sobre una ventana más corta y queda subestimado. Cuando eso pase, lo
 * que corresponde es agregar en SQL (una vista materializada por día), no subir
 * el número. El borrado de retención a 90 días mantiene esto lejos por un buen
 * rato.
 */
const TOPE_FILAS = 20_000

const pingSchema = z.object({
  ruta: z.string().min(1).max(300),
  // Un tramo no puede durar más que el intervalo de ping con holgura: si el
  // navegador estuvo dormido y despierta con dos horas encima, ese tiempo no
  // fue uso real. Se recorta en vez de rechazarse.
  segundos: z.number().int().min(0).max(300),
})

/**
 * Registra un tramo de uso del usuario de la sesión.
 *
 * La escritura la hace el cliente admin porque RLS bloquea la tabla para todo
 * el mundo. Lo que hace segura esa llave es que `usuario_id`, `club_id` y `rol`
 * salen del perfil de la sesión y NUNCA de los parámetros: lo único que el
 * cliente puede elegir es la ruta y los segundos, y ambos van validados.
 *
 * Falla en silencio a propósito. Es telemetría: si no se puede guardar un ping
 * no hay nada que mostrarle al usuario ni nada que reintentar.
 */
export async function registrarActividad(params: { ruta: string; segundos: number }): Promise<void> {
  const parsed = pingSchema.safeParse(params)
  if (!parsed.success) return

  // Segunda pasada de la limpieza de privacidad: el cliente ya corta la query
  // string, pero esta Action es la frontera y no confía en eso.
  const ruta = rutaSinParametros(parsed.data.ruta)
  if (!rutaRegistrable(ruta)) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()

  const admin = createAdminClient()
  await admin.from('actividad').insert({
    usuario_id: user.id,
    club_id: perfil?.club_id ?? null,
    rol: perfil?.rol ?? null,
    ruta,
    modulo: moduloRequeridoPorRuta(ruta),
    segundos: parsed.data.segundos,
  })
}

/**
 * Las filas de los últimos 30 días, con nombre de persona y de club resueltos.
 *
 * Se devuelven crudas y toda la agregación (promedios, ranking, quién está en
 * línea) la hace `src/lib/domain/actividad.ts`. Así la regla vive en un solo
 * lugar testeable y la página solo pinta.
 */
export async function cargarActividad(): Promise<{ error?: string; filas?: FilaActividad[] }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  const desde = new Date(Date.now() - DIAS_VENTANA * 86_400_000).toISOString()

  const [{ data: registros, error }, { data: perfiles }, { data: clubes }] = await Promise.all([
    admin.from('actividad')
      .select('usuario_id,club_id,rol,ruta,modulo,segundos,ocurrido_en')
      .gte('ocurrido_en', desde)
      .order('ocurrido_en', { ascending: false })
      .limit(TOPE_FILAS),
    admin.from('perfiles').select('id,nombre,email'),
    admin.from('clubes').select('id,nombre'),
  ])
  if (error) return { error: 'No se pudo cargar la actividad' }

  // El nombre se resuelve acá y no con un join porque `actividad` no tiene FK a
  // `perfiles` (apunta a auth.users). Son dos tablas chicas: traerlas enteras y
  // cruzarlas en memoria es más barato que 20.000 joins.
  const nombres = new Map((perfiles ?? []).map(p => [p.id, p.nombre || p.email]))
  const nombresClub = new Map((clubes ?? []).map(c => [c.id, c.nombre]))

  return {
    filas: (registros ?? []).map(r => ({
      usuarioId: r.usuario_id,
      nombre: r.usuario_id ? nombres.get(r.usuario_id) ?? null : null,
      rol: r.rol,
      club: r.club_id ? nombresClub.get(r.club_id) ?? null : null,
      ruta: r.ruta,
      modulo: r.modulo,
      segundos: r.segundos,
      ocurridoEn: r.ocurrido_en,
    })),
  }
}
