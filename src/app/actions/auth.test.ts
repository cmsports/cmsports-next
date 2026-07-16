import { describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ rpc })) }))

import { registrarSolicitud } from './auth'

describe('registrarSolicitud', () => {
  it('usa la RPC segura y no recibe contraseña', async () => {
    rpc.mockResolvedValue({ data: 'solicitud-id', error: null })

    const resultado = await registrarSolicitud({
      nombre: 'Jugador Seguro',
      rut: '12345678-9',
      email: 'jugador@example.com',
      telefono: '+56911111111',
      club_id: '11111111-1111-4111-8111-111111111111',
      codigo: 'ABC123',
    })

    expect(resultado).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('crear_solicitud_jugador', {
      p_codigo: 'ABC123',
      p_club_id: '11111111-1111-4111-8111-111111111111',
      p_nombre: 'Jugador Seguro',
      p_rut: '12345678-9',
      p_email: 'jugador@example.com',
      p_telefono: '+56911111111',
    })
  })
})
