import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// El cronómetro del plan de rendimiento (2026-09-12): responde, en
// milisegundos, cuánto cuesta cada pieza de una petición desde el servidor.
// Se abre logueado como superadmin y se lee el JSON; no toca nada.
//
// Lo que mide, y por qué:
//   · region / instancia: dónde corre la función y hace cuánto despertó. Una
//     instancia con segundos de vida es un "arranque en frío": el primer clic
//     después de un rato sin uso paga ese arranque, y es el sospechoso número
//     uno de los "10 segundos" que se ven a veces.
//   · sesion_con_viaje vs sesion_sin_viaje: `getUser()` pregunta a Supabase
//     Auth si la sesión sigue válida (un viaje); `getClaims()` verifica la
//     firma del token acá mismo. Las Server Actions usan la primera en cada
//     clic; el middleware, la segunda. La diferencia es lo que se ahorraría.
//   · consulta_base: cinco lecturas triviales, una tras otra. Si dan ~15 ms,
//     el servidor está al lado de la base; si dan ~130, están en regiones
//     distintas y cada acción paga eso por cada consulta que hace.
//   · perfil: la consulta a `perfiles` que hacen requireAdmin y el middleware.
//
// Solo superadmin: la región y la latencia no son secretos, pero tampoco son
// para cualquiera con el link.

// Cuándo despertó esta instancia. Es de módulo a propósito: sobrevive entre
// peticiones mientras la instancia viva, y vuelve a cero cuando Vercel levanta
// una nueva.
const instanciaDesde = Date.now()

// PromiseLike y no Promise: los builders de Supabase son "thenables".
async function cronometrar<T>(fn: () => PromiseLike<T>): Promise<{ ms: number; resultado: T }> {
  const t0 = performance.now()
  const resultado = await fn()
  return { ms: Math.round((performance.now() - t0) * 10) / 10, resultado }
}

export async function GET() {
  const supabase = await createClient()

  const sesionConViaje = await cronometrar(() => supabase.auth.getUser())
  const user = sesionConViaje.resultado.data.user
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const perfil = await cronometrar(() =>
    supabase.from('perfiles').select('rol,club_id').eq('id', user.id).maybeSingle(),
  )
  if (perfil.resultado.data?.rol !== 'superadmin') {
    return Response.json({ error: 'Solo superadmin' }, { status: 403 })
  }

  const sesionSinViaje = await cronometrar(() => supabase.auth.getClaims())

  // Cinco consultas triviales, en serie, con el cliente de servicio (el que
  // usan las acciones): lo que cuesta un viaje a la base, sin RLS de por medio.
  const admin = createAdminClient()
  const consultas: number[] = []
  for (let i = 0; i < 5; i++) {
    const c = await cronometrar(() => admin.from('clubes').select('id').limit(1))
    consultas.push(c.ms)
  }
  const ordenadas = [...consultas].sort((a, b) => a - b)

  const vivaMs = Date.now() - instanciaDesde

  return Response.json(
    {
      leeme: 'Milisegundos. consulta_base ~15 = servidor al lado de la base; ~130 = regiones distintas. instancia.viva_segundos chico = arranque en frío.',
      servidor: {
        region: process.env.VERCEL_REGION ?? 'desconocida (no es Vercel)',
        entorno: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        node: process.version,
      },
      instancia: {
        viva_segundos: Math.round(vivaMs / 1000),
        arranque_en_frio_probable: vivaMs < 5000,
        uptime_proceso_segundos: Math.round(process.uptime()),
      },
      sesion_con_viaje_ms: sesionConViaje.ms,
      sesion_sin_viaje_ms: sesionSinViaje.ms,
      perfil_ms: perfil.ms,
      consulta_base: {
        muestras_ms: consultas,
        minima_ms: ordenadas[0],
        mediana_ms: ordenadas[2],
      },
      base: {
        host: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://x').host,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
