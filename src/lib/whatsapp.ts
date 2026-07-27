// Los teléfonos vienen cargados en cualquier formato: "974073161",
// "+56948788302", "9 7525 2054", "±56988158583", "9-45301381".
//
// Antes el link se armaba sacando solo los símbolos, así que un número sin
// código de país quedaba como wa.me/974073161 y WhatsApp respondía que el
// número no está registrado.
//
// Devuelve el número en el formato que espera wa.me (56 + 9 dígitos), o null
// si no es un celular chileno válido: preferimos no mostrar el botón antes que
// mostrar uno que no funciona.

export function telefonoWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null

  let d = String(raw).replace(/\D/g, '')
  if (!d) return null

  d = d.replace(/^00/, '')   // prefijo de salida internacional
  d = d.replace(/^56/, '')   // código de Chile: se vuelve a agregar al final
  d = d.replace(/^0/, '')    // 0 de larga distancia

  // Celular chileno: nueve dígitos que empiezan con 9.
  // Los fijos no sirven para WhatsApp, así que quedan fuera.
  if (d.length === 9 && d.startsWith('9')) return `56${d}`

  return null
}

/** Link a wa.me con mensaje opcional. null si el número no sirve. */
export function linkWhatsApp(raw: string | null | undefined, mensaje?: string): string | null {
  const numero = telefonoWhatsApp(raw)
  if (!numero) return null
  return mensaje
    ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/${numero}`
}
