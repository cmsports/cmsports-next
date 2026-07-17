import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const actions = readFileSync(resolve(process.cwd(), 'src/app/actions/kiosco.ts'), 'utf8')
const panel = readFileSync(resolve(process.cwd(), 'src/components/configuracion/GestionKioscos.tsx'), 'utf8')
const configuracion = readFileSync(resolve(process.cwd(), 'src/app/configuracion/page.tsx'), 'utf8')
const torneo = readFileSync(resolve(process.cwd(), 'src/app/vivo/[codigo]/page.tsx'), 'utf8')
const registro = readFileSync(resolve(process.cwd(), 'src/app/actions/auth.ts'), 'utf8')

describe('flujos públicos seguros de fase 9', () => {
  it('exige administrador para gestionar cada dispositivo', () => {
    expect(actions.match(/requireAdminClub\(\)/g)).toHaveLength(3)
    expect(configuracion).toContain("import GestionKioscos from '@/components/configuracion/GestionKioscos'")
    expect(configuracion).toContain('<GestionKioscos />')
  })

  it('entrega el secreto una vez y ofrece rotación y revocación', () => {
    expect(panel).toContain('Copiar enlace de autorización')
    expect(panel).toContain('crearORotarKioscoAction')
    expect(panel).toContain('revocarKioscoAction')
    expect(panel).not.toContain('token_hash')
    expect(panel).toContain('#autorizar=')
    expect(panel).not.toContain('?autorizar=')
  })

  it('solicita correo y comprueba el resultado neutro', () => {
    expect(torneo).toContain('p_email: email.trim().toLowerCase()')
    expect(torneo).toContain('!resultado?.ok')
    expect(registro).toContain('data === null')
    expect(registro).not.toContain("from('solicitudes_jugador').insert")
  })
})
