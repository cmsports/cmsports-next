/**
 * Contraseñas iniciales del club, en el patrón que usa el reporte impreso:
 * primer nombre + último apellido + "123", en minúsculas y sin acentos.
 *
 * Un solo token cuenta como nombre y ya está: hay jugadores con un solo
 * campo. La ñ se convierte a n para que la clave sea escribible en cualquier
 * teclado que reciban.
 */
export function generarPasswordInicial(nombreCompleto: string): string {
  const partes = nombreCompleto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (partes.length === 0) return 'usuario123'
  if (partes.length === 1) return partes[0] + '123'
  return partes[0] + partes[partes.length - 1] + '123'
}

/**
 * El email de auth con el patrón del reset masivo: primera letra del nombre,
 * primer apellido completo, primera letra del segundo apellido, `@cmsports.cl`.
 *
 * Se asume convención chilena: nombres primero, apellidos al final. Los dos
 * últimos tokens son los apellidos, pase lo que pase entre medio.
 *
 * Casos borde:
 * - un solo token (nombre) → `agustin@cmsports.cl`
 * - dos tokens (nombre y un apellido) → `ahonores@cmsports.cl`
 * - tres o más → primer nombre + primer apellido + inicial segundo apellido
 *
 * Los duplicados NO se resuelven acá: el que llama sabe qué está usado en el
 * batch y agrega el numerito. Así esta función queda pura.
 */
export function generarEmailInicial(nombreCompleto: string): string {
  const partes = nombreCompleto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (partes.length === 0) return 'usuario@cmsports.cl'
  if (partes.length === 1) return `${partes[0]}@cmsports.cl`
  if (partes.length === 2) return `${partes[0][0]}${partes[1]}@cmsports.cl`

  const apellido1 = partes[partes.length - 2]
  const apellido2 = partes[partes.length - 1]
  return `${partes[0][0]}${apellido1}${apellido2[0]}@cmsports.cl`
}

/**
 * Con qué se loguea el usuario en la práctica. Es lo que va en la columna
 * "Usuario" del reporte. El email manda si existe; el celular si no; el RUT
 * es la salida cuando varios jugadores comparten celular (caso familiar).
 */
export function usuarioLoginDe(datos: {
  email?: string | null
  telefono?: string | null
  rut?: string | null
}): { login: string; tipo: 'email' | 'celular' | 'rut' } {
  if (datos.email?.trim()) return { login: datos.email.trim(), tipo: 'email' }
  if (datos.telefono?.trim()) return { login: datos.telefono.trim(), tipo: 'celular' }
  if (datos.rut?.trim()) return { login: datos.rut.trim(), tipo: 'rut' }
  return { login: '', tipo: 'email' }
}
