/**
 * Valida el `?next=` del login: a dónde volver después de iniciar sesión.
 *
 * Solo se acepta una ruta de esta misma app. Si `next` pudiera ser cualquier
 * cosa, un enlace armado a mano (`/login?next=https://sitio-falso.cl`) dejaría
 * al usuario, recién autenticado, en otro sitio que imita al nuestro.
 *
 * Devuelve la ruta lista para usar, o `null` si no es segura.
 */
export function rutaInternaSegura(next: string | null | undefined): string | null {
  if (!next) return null
  // Un solo `/` al inicio. `//host` y `/\host` los lee el navegador como otro
  // origen; cualquier esquema (`https:`, `javascript:`) no empieza con `/`.
  if (next[0] !== '/' || next[1] === '/' || next[1] === '\\') return null
  // Saltos de línea y tabs se descartan al parsear la URL y pueden esconder un `//`.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null
  // Volver al login (o a /registro) no sirve de nada y puede formar un ciclo.
  if (/^\/(login|registro)(\/|\?|#|$)/.test(next)) return null
  return next
}
