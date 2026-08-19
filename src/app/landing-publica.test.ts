import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('landing pública en la raíz', () => {
  it('muestra la vitrina en /, no redirige al login', () => {
    expect(pagina).toContain('LandingPublica')
    expect(pagina).not.toContain("router.push('/login')")
  })

  it('deja / sin sesión y manda al panel si ya hay sesión', () => {
    expect(proxy).toMatch(/if \(pathname === '\/'\)/)
    expect(proxy).toMatch(/if \(user\) \{[\s\S]*getRolRedirect/)
  })

  it('el bloque de / va antes de publicRoutes', () => {
    const iRaiz = proxy.indexOf("if (pathname === '/')")
    const iPublica = proxy.indexOf('if (publicRoutes.some(')
    expect(iRaiz).toBeGreaterThan(-1)
    expect(iRaiz).toBeLessThan(iPublica)
  })
})
