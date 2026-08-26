// Mantiene `auth.users.email` alineado con los datos actuales del jugador
// (email/telefono/rut) cada vez que se toca su credencial. Sin esto, editar
// el email de un jugador o resetearle la clave dejaba auth.users con el email
// viejo (o sintético) mientras el reporte de credenciales ya mostraba el
// nuevo: el jugador probaba con lo que el reporte decía y el login fallaba.
import type { createAdminClient } from '@/lib/supabase/admin'
import { authEmailDe, usuarioLoginDe } from '@/lib/domain/credenciales'

type AdminClient = ReturnType<typeof createAdminClient>

/** Si el email de auth calculado difiere del actual, lo actualiza en auth y en `perfiles`.
 *  El usuario del reporte se alinea siempre, aunque Auth no haya cambiado:
 *  si no, el PDF y el lookup por RUT muestran un correo con el que ya no se entra. */
export async function sincronizarEmailAuth(
  admin: AdminClient,
  perfilId: string,
  emailActual: string | null | undefined,
  datos: { email?: string | null; telefono?: string | null; rut?: string | null },
): Promise<string | null> {
  const nuevo = authEmailDe(datos)
  const { login, tipo } = usuarioLoginDe(datos)
  let aplicado: string | null = null
  if (nuevo && nuevo !== emailActual) {
    const { error } = await admin.auth.admin.updateUserById(perfilId, { email: nuevo, email_confirm: true })
    if (error) return null
    await admin.from('perfiles').update({ email: nuevo }).eq('id', perfilId)
    aplicado = nuevo
  }
  if (login) {
    await admin.from('credencial_visible').update({
      usuario_login: login,
      tipo_login: tipo,
    }).eq('usuario_id', perfilId)
  }
  return aplicado
}
