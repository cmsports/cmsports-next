// Mantiene `auth.users.email` alineado con los datos actuales del jugador
// (email/telefono/rut) cada vez que se toca su credencial. Sin esto, editar
// el email de un jugador o resetearle la clave dejaba auth.users con el email
// viejo (o sintético) mientras el reporte de credenciales ya mostraba el
// nuevo: el jugador probaba con lo que el reporte decía y el login fallaba.
import type { createAdminClient } from '@/lib/supabase/admin'
import { authEmailDe } from '@/lib/domain/credenciales'

type AdminClient = ReturnType<typeof createAdminClient>

/** Si el email de auth calculado difiere del actual, lo actualiza en auth y en `perfiles`. */
export async function sincronizarEmailAuth(
  admin: AdminClient,
  perfilId: string,
  emailActual: string | null | undefined,
  datos: { email?: string | null; telefono?: string | null; rut?: string | null },
): Promise<string | null> {
  const nuevo = authEmailDe(datos)
  if (!nuevo || nuevo === emailActual) return null
  const { error } = await admin.auth.admin.updateUserById(perfilId, { email: nuevo })
  if (error) return null
  await admin.from('perfiles').update({ email: nuevo }).eq('id', perfilId)
  return nuevo
}
