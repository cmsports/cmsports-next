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

type DatosIdentidad = {
  email?: string | null
  telefono?: string | null
  rut?: string | null
}

/**
 * Con qué entra el jugador y qué email tiene en `auth.users`. Las dos cosas
 * salen de acá, juntas, y ese es el punto.
 *
 * ANTES ERAN DOS FUNCIONES SEPARADAS Y SE DESALINEARON. `authEmailDe` exigía
 * que el celular fuera exactamente nueve dígitos; `usuarioLoginDe` aceptaba
 * cualquier cosa no vacía. Con un teléfono guardado como "+56937073626" —o
 * "56989859433", con el código de país pegado— la cuenta de auth se creaba con
 * el RUT, pero el reporte de credenciales le mostraba al admin el celular.
 *
 * El jugador recibía un usuario que no existe. Y encima ese texto tampoco se
 * puede escribir en la pantalla de login, que exige nueve dígitos pelados o un
 * RUT con guion. Eran 7 jugadores de Buin, 6 de ellos imposibilitados de
 * entrar con lo que se les entregó.
 *
 * Devolviendo las dos cosas de una sola decisión, no pueden volver a discrepar.
 */
function identidadDe(datos: DatosIdentidad):
  { login: string; tipo: 'email' | 'celular' | 'rut'; authEmail: string } | null {

  const email = datos.email?.trim()
  // Un "email" sin arroba no sirve para entrar ni para auth. Se descarta acá y
  // se sigue con el celular o el RUT, en vez de mostrar algo inservible.
  if (email && email.includes('@')) {
    return { login: email, tipo: 'email', authEmail: email.toLowerCase() }
  }

  const tel = datos.telefono?.trim()
  if (tel && /^\d{9}$/.test(tel)) {
    return { login: tel, tipo: 'celular', authEmail: `${tel}@cel.cmsports.cl` }
  }

  // El RUT se muestra CON guion porque es como lo pide la pantalla de login,
  // y sin guion en el email de auth. Guardado puede venir de cualquier forma.
  const rut = datos.rut?.trim().replace(/[.\-]/g, '').toUpperCase()
  if (rut && /^\d{7,8}[\dK]$/.test(rut)) {
    return {
      login: `${rut.slice(0, -1)}-${rut.slice(-1)}`,
      tipo: 'rut',
      authEmail: `${rut.toLowerCase()}@rut.cmsports.cl`,
    }
  }

  return null
}

/**
 * Con qué se loguea el usuario en la práctica. Es lo que va en la columna
 * "Usuario" del reporte, y lo que el admin le pasa al jugador: tiene que ser
 * algo que se pueda escribir tal cual en la pantalla de login.
 */
export function usuarioLoginDe(datos: DatosIdentidad): { login: string; tipo: 'email' | 'celular' | 'rut' } {
  const id = identidadDe(datos)
  return id ? { login: id.login, tipo: id.tipo } : { login: '', tipo: 'email' }
}

/**
 * El email real que debe tener en `auth.users`.
 *
 * El celular y el RUT no sirven tal cual como email, así que se les arma uno
 * sintético (`<celular>@cel.cmsports.cl`, `<rut-sin-guion>@rut.cmsports.cl`)
 * que la pantalla de login reconstruye a partir de lo que el jugador escribe.
 */
export function authEmailDe(datos: DatosIdentidad): string | null {
  return identidadDe(datos)?.authEmail ?? null
}
