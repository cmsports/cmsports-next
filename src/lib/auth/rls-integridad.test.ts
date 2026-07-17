import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/041_rls_auditoria_integridad.sql'),
  'utf8',
)

describe('migración RLS, auditoría e integridad multi-club', () => {
  it('aborta atómicamente si falta una función heredada', () => {
    expect(sql).toContain('BEGIN;')
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(sql).toContain('to_regprocedure(v_signature) IS NULL')
    expect(sql).toContain('RLS-041 preflight: falta la función')
    expect(sql.indexOf('to_regprocedure(v_signature) IS NULL'))
      .toBeLessThan(sql.indexOf('ALTER TABLE public.audit_log'))

    const normalizarFirma = (firma: string) => firma
      .toLowerCase()
      .replace(/\s+/g, '')
      .replaceAll('integer', 'int')
      .replaceAll('timewithouttimezone', 'time')
    const bloquePreflight = sql.match(/v_required_functions constant text\[\] := ARRAY\[([\s\S]+?)\];/)?.[1] ?? ''
    const firmasPreflight = new Set(
      [...bloquePreflight.matchAll(/'([^']+)'/g)].map((match) => normalizarFirma(match[1])),
    )
    const firmasAlteradas = [...sql.matchAll(/ALTER FUNCTION\s+([^;]+?)\s+SET search_path/gi)]
      .map((match) => normalizarFirma(match[1]))
    expect(firmasPreflight.size).toBe(18)
    for (const firma of firmasAlteradas) {
      expect(firmasPreflight).toContain(firma)
    }
  })

  it('aísla la auditoría por tenant y elimina escritura directa', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS club_id uuid')
    expect(sql).toContain('club_id = public.get_my_club_id()')
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM anon, authenticated')
    expect(sql).toContain('CREATE TRIGGER liga_jugador_pagos_audit')
    expect(sql).not.toContain('FOR INSERT WITH CHECK (true)')
  })

  it('exige clase y jugador del tenant en todas las políticas de reservas', () => {
    expect(sql).toContain('CREATE TRIGGER reservas_mismo_club')
    expect(sql).toContain("RAISE EXCEPTION 'La clase y el jugador deben pertenecer al mismo club'")
    expect(sql).toContain('j.id = reservas.jugador_id')
    expect(sql).toContain('c.id = reservas.clase_id')
  })

  it('fija search_path y grants de funciones privilegiadas', () => {
    expect(sql).toContain('ALTER FUNCTION public.dashboard_kpis(uuid) SET search_path = public, pg_temp')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.proteger_perfil() FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.cambiar_reserva_clase(uuid, boolean) TO authenticated')
  })
})
