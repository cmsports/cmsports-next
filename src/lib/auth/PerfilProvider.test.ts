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

  // Documenta el contrato del listener: solo un bump real de sesión (login/
  // logout) debe invalidar. Si INITIAL_SESSION o TOKEN_REFRESHED bumpan la
  // generación sin relanzar carga, cargaPerfilSigueVigente rechaza la respuesta
  // inicial y el UI queda en "Cargando..." — el caso de Agustín en el celu.
  it('una generación que no cambió sigue vigente tras un refresh de token', () => {
    const generacion = 1
    expect(cargaPerfilSigueVigente(generacion, generacion, 'user-a', 'user-a')).toBe(true)
  })
})
