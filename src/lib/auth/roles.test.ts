import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { esAdminDeClub } from './roles'

describe('semántica de roles administrativos', () => {
  it('permite administrar un tenant solo al rol admin', () => {
    expect(esAdminDeClub('admin')).toBe(true)
    expect(esAdminDeClub('superadmin')).toBe(false)
    expect(esAdminDeClub('profesor')).toBe(false)
    expect(esAdminDeClub('jugador')).toBe(false)
    expect(esAdminDeClub(null)).toBe(false)
  })

  it('comparte la misma regla entre proxy y Server Actions', () => {
    const proxy = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')
    const requireAuth = readFileSync(resolve(process.cwd(), 'src/lib/auth/require.ts'), 'utf8')

    expect(proxy).toContain('!esAdminDeClub(rol)')
    expect(requireAuth).toContain('!esAdminDeClub(perfil.rol)')
    expect(proxy).not.toContain("rol !== 'admin' &&\n    rol !== 'superadmin'")
  })
})
