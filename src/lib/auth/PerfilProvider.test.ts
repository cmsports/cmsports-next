import { describe, expect, it } from 'vitest'
import { cargaPerfilSigueVigente } from './PerfilProvider'

describe('protección contra carreras del perfil', () => {
  it('descarta respuestas de una generación anterior', () => {
    expect(cargaPerfilSigueVigente(3, 2, 'user-a', 'user-a')).toBe(false)
  })

  it('descarta respuestas si cambió o terminó la sesión', () => {
    expect(cargaPerfilSigueVigente(2, 2, 'user-a', null)).toBe(false)
    expect(cargaPerfilSigueVigente(2, 2, 'user-a', 'user-b')).toBe(false)
  })

  it('acepta solo la generación y usuario vigentes', () => {
    expect(cargaPerfilSigueVigente(2, 2, 'user-a', 'user-a')).toBe(true)
  })
})
