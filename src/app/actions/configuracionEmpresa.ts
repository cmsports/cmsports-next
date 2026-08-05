'use server'

import { z } from 'zod'
import { requireSuperadmin } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { rutValido } from '@/lib/rut'
import type { InsertDto } from '@/types/database'

/**
 * Campos de texto libre de la ficha de empresa.
 *
 * Todos opcionales: la ficha se llena de a poco, copiando de la escritura de
 * constitución, y obligar a completarla entera para guardar un solo dato
 * corregido garantiza que nadie la guarde nunca.
 *
 * El string vacío se normaliza a `null` para que "nunca se llenó" y "se
 * borró" queden iguales en la base; si no, la mitad de las filas quedan con
 * '' y la otra con NULL y toda lectura tiene que contemplar los dos casos.
 */
const textoOpcional = z.string().trim().max(200).transform(v => v || null).nullable()

// Los RUT se validan con dígito verificador (mismo helper que usa la ficha de
// jugadores). Un RUT mal tipeado en una boleta no se nota hasta que el SII la
// rechaza, y para entonces ya se emitió.
const rutOpcional = z.string().trim()
  .refine(v => v === '' || rutValido(v), 'RUT inválido')
  .transform(v => v || null)
  .nullable()

const emailOpcional = z.string().trim().toLowerCase()
  .refine(v => v === '' || z.string().email().safeParse(v).success, 'Correo inválido')
  .transform(v => v || null)
  .nullable()

// No se exporta: un archivo 'use server' solo puede exportar funciones async.
const esquemaConfiguracionEmpresa = z.object({
  razon_social: textoOpcional,
  nombre_fantasia: textoOpcional,
  rut: rutOpcional,
  giro: textoOpcional,
  domicilio: textoOpcional,
  comuna: textoOpcional,
  ciudad: textoOpcional,
  email_contacto: emailOpcional,
  telefono: textoOpcional,
  representante_nombre: textoOpcional,
  representante_rut: rutOpcional,
})

export type DatosEmpresa = z.input<typeof esquemaConfiguracionEmpresa>

/**
 * Guarda la ficha de empresa (datos principales + datos legales van juntos:
 * es una sola fila y un solo botón).
 *
 * La tabla es de fila única, así que esto es "actualiza la que hay o crea la
 * primera". No se usa `upsert` con id fijo porque el id lo genera la base; se
 * busca la fila existente y se decide. Si dos pestañas guardan a la vez, el
 * índice único de la migración 123 rechaza el segundo insert en vez de dejar
 * dos configuraciones compitiendo.
 */
export async function guardarConfiguracionEmpresa(datos: DatosEmpresa): Promise<{ error?: string; success?: boolean }> {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const parsed = esquemaConfiguracionEmpresa.safeParse(datos)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const valores: InsertDto<'configuracion_empresa'> = {
    ...parsed.data,
    actualizado_en: new Date().toISOString(),
  }

  const { data: fila } = await supabase.from('configuracion_empresa').select('id').maybeSingle()
  const { error: dbErr } = fila
    ? await supabase.from('configuracion_empresa').update(valores).eq('id', fila.id)
    : await supabase.from('configuracion_empresa').insert(valores)
  if (dbErr) return { error: 'No se pudo guardar: ' + dbErr.message }

  return { success: true }
}

/**
 * Cambia el correo con el que entra el propio superadmin.
 *
 * Se tocan dos lugares en la misma operación: `auth.users` (que es con lo que
 * se hace login) y `perfiles.email` (que es lo que muestra el resto de la app).
 * Si quedaran desalineados, el superadmin vería un correo en pantalla y
 * necesitaría otro para entrar — o sea, se queda afuera sin entender por qué.
 * Por eso auth va primero: si el update de `perfiles` falla se avisa
 * explícitamente cuál es el correo que sirve para entrar, en vez de reportar
 * un éxito a medias.
 *
 * La contraseña actual se pide como confirmación de identidad: esta pantalla
 * se abre con la sesión ya iniciada, así que sin ese paso cualquiera con el
 * computador desbloqueado se apropia de la cuenta cambiándole el correo.
 * Se verifica con el cliente normal (`signInWithPassword`) y no con el admin:
 * el cliente admin puede cambiar la clave, pero no comprobar que alguien la
 * sepa.
 */
export async function cambiarEmailPropio(params: { nuevoEmail: string; passwordActual: string }): Promise<{ error?: string; success?: boolean }> {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const nuevoEmail = params.nuevoEmail.trim().toLowerCase()
  if (!z.string().email().safeParse(nuevoEmail).success) return { error: 'Correo inválido' }
  if (!params.passwordActual) return { error: 'Escribe tu contraseña actual para confirmar' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'Sin sesión' }
  if (user.email.toLowerCase() === nuevoEmail) return { error: 'Ese ya es tu correo actual' }

  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: params.passwordActual,
  })
  if (loginErr) return { error: 'La contraseña actual no es correcta' }

  const admin = createAdminClient()
  // `email_confirm: true` porque el cambio lo hace el dueño de la cuenta ya
  // autenticado: dejarlo pendiente de confirmación mantendría el correo viejo
  // activo en auth y desalineado de `perfiles`, que es justo lo que se evita.
  const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { email: nuevoEmail, email_confirm: true })
  if (upErr) return { error: 'No se pudo cambiar el correo: ' + upErr.message }

  const { error: perfilErr } = await admin.from('perfiles').update({ email: nuevoEmail }).eq('id', user.id)
  if (perfilErr) return { error: `El correo de acceso quedó en ${nuevoEmail}, pero no se actualizó el perfil: ${perfilErr.message}` }

  return { success: true }
}
