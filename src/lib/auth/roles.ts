export type RolAplicacion = 'superadmin' | 'admin' | 'profesor' | 'jugador'

// Un superadmin administra la plataforma, no suplanta al admin de un tenant.
// Esta es la regla de ESCRITURA: la aplican las Server Actions (require.ts).
export function esAdminDeClub(rol: string | null | undefined): boolean {
  return rol === 'admin'
}

// Regla de LECTURA, deliberadamente más ancha. El superadmin entra a un club
// por "Gestionar" y el proxy ya lo deja pasar por las rutas de admin, pero
// algunas pantallas lo devolvían al panel de superadmin con un `rol !== 'admin'`
// suelto: entrabas a Jugadores, tocabas "Ver perfil" y te expulsaba.
//
// Mirar no es administrar: los botones de guardar siguen colgando de
// `esAdminDeClub`, así que esto no le da ningún permiso de escritura.
export function puedeVerPantallasDeClub(rol: string | null | undefined): boolean {
  return rol === 'admin' || rol === 'superadmin'
}
