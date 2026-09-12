import { createAdminClient } from '@/lib/supabase/admin'
import { cargarRankingDelClub } from '@/lib/supabase/rankingClub'

// El ranking del club para quien escanea el QR pegado en la sede: sin cuenta.
//
// Usa el cliente de servicio porque quien pregunta no tiene sesión y RLS no
// lo dejaría leer nada. Por eso mismo lo que devuelve es lo mínimo: nombre y
// puntos por categoría. Nada de la ficha, ni fotos, ni ids.
//
// Dos candados, los dos del lado del club y no de quien pregunta:
//   1. el código público del club (`clubes.codigo_publico`, opaco, migración
//      270), que es lo único que va en la URL;
//   2. el módulo `qr_publico` encendido. Sin él, tener el código no sirve:
//      publicar nombres fuera de la app lo decide cada club, no un link.
//
// Mismo cálculo que la pantalla /ranking (`cargarRankingDelClub`): el que se
// pega en la pared es el mismo que ve el admin.
const CODIGO = /^[A-Z0-9]{6,16}$/

export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo: crudo } = await ctx.params
  const codigo = String(crudo ?? '').toUpperCase()
  if (!CODIGO.test(codigo)) return Response.json({ error: 'Código inválido' }, { status: 404 })

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: club } = await (admin as any)
    .from('clubes')
    .select('id, nombre, modulos_habilitados')
    .eq('codigo_publico', codigo)
    .maybeSingle()

  const modulos: string[] = club?.modulos_habilitados ?? []
  if (!club || !modulos.includes('qr_publico')) {
    return Response.json({ error: 'No existe' }, { status: 404 })
  }

  const ranking = await cargarRankingDelClub(admin, club.id)

  return Response.json(
    {
      club: ranking.clubNombre,
      reiniciadoEn: ranking.reiniciadoEn,
      categorias: ranking.categorias.map(c => ({
        categoria: c.categoria,
        genero: c.genero,
        filas: c.filas.map(f => ({
          rank: f.rank, nombre: f.nombre, pts: f.pts,
          victorias: f.victorias, derrotas: f.derrotas, jugados: f.jugados, torneos: f.torneos,
        })),
      })),
    },
    // Público a propósito (no depende de quién pregunta) y con un minuto de
    // caché: el QR se escanea de a muchos en la puerta y el ranking cambia
    // cuando cierra un torneo, no cada segundo.
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  )
}
