import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/038_seguridad_critica_fase1.sql'), 'utf8')

describe('migración de seguridad crítica fase 1', () => {
  it('reserva los cambios sensibles de perfil para superadmin', () => {
    expect(sql).toContain("v_rol IS DISTINCT FROM 'superadmin'")
    expect(sql).toContain('NEW.club_id    IS DISTINCT FROM OLD.club_id')
    expect(sql).toContain('NEW.rol        IS DISTINCT FROM OLD.rol')
  })

  it('cierra el insert público directo y expone una RPC estrecha', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "solicitudes_insert_public"')
    expect(sql).toContain('REVOKE INSERT ON public.solicitudes_jugador FROM anon, authenticated')
    expect(sql).toContain('public.crear_solicitud_jugador')
    expect(sql).toContain('UPDATE public.solicitudes_jugador SET password = NULL')
  })
})
