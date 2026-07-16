import { afterEach, describe, expect, it, vi } from 'vitest'
import { decrypt, encrypt } from './crypto'

describe('cifrado de solicitudes', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('usa una clave derivada del service role cuando falta ENCRYPTION_KEY', () => {
    vi.stubEnv('ENCRYPTION_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-de-prueba')
    const cifrado = encrypt('ClaveJugador123!')
    expect(cifrado).not.toContain('ClaveJugador123!')
    expect(decrypt(cifrado)).toBe('ClaveJugador123!')
  })

  it('puede descifrar con la clave alternativa después de agregar ENCRYPTION_KEY', () => {
    vi.stubEnv('ENCRYPTION_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-estable')
    const cifrado = encrypt('ClavePendiente')
    vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64))
    expect(decrypt(cifrado)).toBe('ClavePendiente')
  })
})
