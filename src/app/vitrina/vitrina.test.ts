import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const proxy = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('vitrina pública', () => {
  it('no está en las rutas protegidas del proxy: se abre sin cuenta', () => {
    const listas = proxy.slice(0, proxy.indexOf('function getRolRedirect'))
    expect(listas).not.toMatch(/vitrina/)
  })

  it('muestra la landing, no redirige al login', () => {
    expect(pagina).toContain('LandingPublica')
    expect(pagina).not.toContain("router.push('/login')")
  })
})
