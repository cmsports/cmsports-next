import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const kiosco = readFileSync(new URL('./[clubId]/page.tsx', import.meta.url), 'utf8')
const migracion = readFileSync(
  new URL('../../../supabase/migrations/032_asistencia_reservas.sql', import.meta.url),
  'utf8'
)

describe('seguridad de asistencia y reservas', () => {
  it('el kiosco envía un único RUT al RPC y no descarga jugadores', () => {
    expect(kiosco).toContain("rpc('registrar_asistencia_rut'")
    expect(kiosco).not.toContain("from('jugadores')")
    expect(kiosco).not.toContain("select('id,nombre,sesiones_usadas,sesiones_limite,estado,rut')")
  })

  it('registra asistencia y sesiones dentro de la misma función SQL', () => {
    expect(migracion).toContain('FUNCTION public.registrar_asistencia_segura')
    expect(migracion).toMatch(/INSERT INTO public\.asistencia[\s\S]*UPDATE public\.jugadores/)
    expect(migracion).toContain('pg_advisory_xact_lock')
  })

  it('la eliminación también revierte sesiones atómicamente', () => {
    expect(migracion).toContain('FUNCTION public.eliminar_asistencia_segura')
    expect(migracion).toMatch(/DELETE FROM public\.asistencia[\s\S]*sesiones_usadas = GREATEST/)
  })

  it('la reserva permite insertar, cancelar y reactivar sin duplicados', () => {
    expect(migracion).toContain('reservas_clase_jugador_uidx')
    expect(migracion).toContain('FUNCTION public.cambiar_reserva_clase')
    expect(migracion).toContain('ON CONFLICT (clase_id, jugador_id)')
    expect(migracion).toContain("estado IN ('confirmado', 'cancelado')")
  })
})
