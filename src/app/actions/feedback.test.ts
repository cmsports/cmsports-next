import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePerfil: vi.fn(),
  getUser: vi.fn(),
  perfilSelect: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/auth/require', () => ({ requirePerfil: mocks.requirePerfil }))

import { crearFeedback, editarFeedback, eliminarFeedback } from './feedback'

const supabaseFalso = {
  auth: { getUser: mocks.getUser },
  from: (tabla: string) => {
    if (tabla === 'perfiles') {
      return { select: () => ({ eq: () => ({ single: () => mocks.perfilSelect() }) }) }
    }
    // feedback_jugadores
    return {
      insert: (payload: unknown) => mocks.insert(payload),
      update: (payload: unknown) => ({ eq: (col: string, val: string) => mocks.update(payload, col, val) }),
      delete: () => ({ eq: (col: string, val: string) => mocks.delete(col, val) }),
    }
  },
}

describe('feedback entre roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'profesor', jugador_id: null },
    })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.perfilSelect.mockResolvedValue({ data: { nombre: 'Profe Test' } })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.update.mockResolvedValue({ error: null })
    mocks.delete.mockResolvedValue({ error: null })
  })

  describe('crearFeedback', () => {
    it('inserta con autor_id y autor_nombre del usuario actual', async () => {
      const resultado = await crearFeedback({
        jugadorId: 'jugador-1', fecha: '2026-08-01', hora: '18:00', comentario: '  Buen saque  ',
      })
      expect(resultado).toEqual({ success: true })
      expect(mocks.insert).toHaveBeenCalledWith({
        club_id: 'club-1',
        jugador_id: 'jugador-1',
        autor_id: 'user-1',
        autor_nombre: 'Profe Test',
        fecha: '2026-08-01',
        hora: '18:00',
        comentario: 'Buen saque',
      })
    })

    it('rechaza un comentario vacío sin llegar a insertar', async () => {
      const resultado = await crearFeedback({ jugadorId: 'jugador-1', fecha: '2026-08-01', comentario: '   ' })
      expect(resultado).toEqual({ error: 'El comentario no puede estar vacío' })
      expect(mocks.insert).not.toHaveBeenCalled()
    })

    it('rechaza si el rol no es staff', async () => {
      mocks.requirePerfil.mockResolvedValue({
        error: null, supabase: supabaseFalso,
        perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'jugador-1' },
      })
      const resultado = await crearFeedback({ jugadorId: 'jugador-1', fecha: '2026-08-01', comentario: 'Hola' })
      expect(resultado).toEqual({ error: 'Solo el admin o el profesor pueden dejar feedback' })
      expect(mocks.insert).not.toHaveBeenCalled()
    })
  })

  describe('editarFeedback', () => {
    it('actualiza y marca editado_en', async () => {
      const resultado = await editarFeedback({
        feedbackId: 'fb-1', fecha: '2026-08-02', hora: '19:00', comentario: 'Mejoró el revés',
      })
      expect(resultado).toEqual({ success: true })
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({ fecha: '2026-08-02', hora: '19:00', comentario: 'Mejoró el revés' }),
        'id', 'fb-1',
      )
      const payload = mocks.update.mock.calls[0][0]
      expect(payload.editado_en).toEqual(expect.any(String))
    })

    it('rechaza un comentario vacío', async () => {
      const resultado = await editarFeedback({ feedbackId: 'fb-1', fecha: '2026-08-02', comentario: '' })
      expect(resultado).toEqual({ error: 'El comentario no puede estar vacío' })
      expect(mocks.update).not.toHaveBeenCalled()
    })
  })

  describe('eliminarFeedback', () => {
    it('borra por id', async () => {
      const resultado = await eliminarFeedback({ feedbackId: 'fb-1' })
      expect(resultado).toEqual({ success: true })
      expect(mocks.delete).toHaveBeenCalledWith('id', 'fb-1')
    })

    it('rechaza si el rol no es staff', async () => {
      mocks.requirePerfil.mockResolvedValue({
        error: null, supabase: supabaseFalso,
        perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'jugador-1' },
      })
      const resultado = await eliminarFeedback({ feedbackId: 'fb-1' })
      expect(resultado).toEqual({ error: 'Solo el admin o el profesor pueden borrar feedback' })
      expect(mocks.delete).not.toHaveBeenCalled()
    })
  })
})
