import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { esAdminDeClub, puedeVerPantallasDeClub } from './roles'

describe('semántica de roles administrativos', () => {
  it('permite administrar un tenant solo al rol admin', () => {
    expect(esAdminDeClub('admin')).toBe(true)
    expect(esAdminDeClub('superadmin')).toBe(false)
    expect(esAdminDeClub('profesor')).toBe(false)
    expect(esAdminDeClub('jugador')).toBe(false)
    expect(esAdminDeClub(null)).toBe(false)
  })

  // El superadmin entra a un club por "Gestionar" y tiene que poder mirar sus
  // pantallas; escribir sigue siendo del admin. Que sean dos funciones
  // distintas es el punto: ensanchar la de lectura no toca la de escritura.
  it('deja mirar las pantallas del club al admin y al superadmin', () => {
    expect(puedeVerPantallasDeClub('admin')).toBe(true)
    expect(puedeVerPantallasDeClub('superadmin')).toBe(true)
    expect(puedeVerPantallasDeClub('jugador')).toBe(false)
    expect(puedeVerPantallasDeClub(null)).toBe(false)
  })

  it('mirar no habilita a escribir: el superadmin sigue sin ser admin', () => {
    expect(puedeVerPantallasDeClub('superadmin')).toBe(true)
    expect(esAdminDeClub('superadmin')).toBe(false)
  })

  it('comparte la misma regla entre proxy y Server Actions', () => {
    // Se normalizan los saltos de línea: el repo guarda CRLF y CI corre en
    // Linux, así que comparar con "\n" a secas hacía pasar o fallar el test
    // según el sistema, no según el código.
    const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')
    const proxy = leer('src/proxy.ts')
    const requireAuth = leer('src/lib/auth/require.ts')

    expect(proxy).toContain('!esAdminDeClub(rol)')
    expect(requireAuth).toContain('!esAdminDeClub(perfil.rol)')

    // El guard de rutas de admin tiene que delegar en el helper. Comparar roles
    // a mano solo es válido en el de profesor, que admite tres roles distintos,
    // por eso se acota la búsqueda a este bloque.
    const guardAdmin = proxy.slice(
      proxy.indexOf('adminRoutes.some('),
      proxy.indexOf('staffRoutes.some('),
    )
    expect(guardAdmin).toContain('!esAdminDeClub(rol)')
    expect(guardAdmin).not.toMatch(/rol !== 'admin'/)
  })
})
