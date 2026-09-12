import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/PerfilProvider', () => ({ usePerfil: vi.fn() }))

import { guardarCacheModulos, leerCacheModulos } from './useModulos'

// Un localStorage de mentira sobre `window`, que en el entorno de node no existe.
function conNavegador() {
  const bolsa = new Map<string, string>()
  const ls = {
    getItem: (k: string) => bolsa.get(k) ?? null,
    setItem: (k: string, v: string) => { bolsa.set(k, v) },
    removeItem: (k: string) => { bolsa.delete(k) },
  }
  ;(globalThis as any).window = {}
  ;(globalThis as any).localStorage = ls
  return ls
}

describe('caché de módulos por club', () => {
  beforeEach(() => conNavegador())
  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).localStorage
    vi.useRealTimers()
  })

  it('devuelve lo guardado para el mismo club', () => {
    guardarCacheModulos('club-a', ['torneos', 'liga'])
    expect(leerCacheModulos('club-a')).toEqual(['torneos', 'liga'])
  })

  // El error que ya mordió con el perfil: "Gestionar otro club" no puede
  // heredar los módulos del anterior.
  it('no sirve los módulos de OTRO club', () => {
    guardarCacheModulos('club-a', ['torneos'])
    expect(leerCacheModulos('club-b')).toBeNull()
  })

  it('caduca después de un día', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T10:00:00Z'))
    guardarCacheModulos('club-a', ['torneos'])
    vi.setSystemTime(new Date('2026-09-13T10:00:01Z'))
    expect(leerCacheModulos('club-a')).toBeNull()
  })

  it('un valor corrupto en el navegador no rompe nada', () => {
    localStorage.setItem('cmsports_modulos', '{esto no es json')
    expect(leerCacheModulos('club-a')).toBeNull()
  })

  it('sin navegador (render en el servidor) no hay caché', () => {
    delete (globalThis as any).window
    expect(leerCacheModulos('club-a')).toBeNull()
  })
})
