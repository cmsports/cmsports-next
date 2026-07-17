export type RolAplicacion = 'superadmin' | 'admin' | 'profesor' | 'jugador'

// Un superadmin administra la plataforma, no suplanta al admin de un tenant.
export function esAdminDeClub(rol: string | null | undefined): boolean {
  return rol === 'admin'
}
