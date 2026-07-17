import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sw = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
const route = readFileSync(resolve(process.cwd(), 'src/app/api/generar-flyer-ia/route.ts'), 'utf8')
const actions = readFileSync(resolve(process.cwd(), 'src/app/actions/redes-sociales.ts'), 'utf8')
const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/040_seguridad_endpoints_publicos.sql'), 'utf8')
const sqlKiosco = readFileSync(resolve(process.cwd(), 'supabase/migrations/042_seguridad_kiosco_y_solicitudes.sql'), 'utf8')

describe('fase 3 de endpoints públicos', () => {
  it('no guarda navegaciones y permite limpiar cachés al cambiar sesión', () => {
    expect(sw).toContain("fetch(request, { cache: 'no-store' })")
    expect(sw).toContain('CLEAR_PRIVATE_DATA')
    expect(sw).not.toContain("caches.match('/')")
  })

  it('comprueba que las imágenes estén registradas en el club', () => {
    expect(route).toContain("from('flyer_referencias')")
    expect(route).toContain("from('fotos_galeria')")
    expect(route).toContain("eq('club_id', perfil.club_id)")
    expect(route).toContain('reserveFlyerGeneration(user.id)')
    expect(route).toContain("rpc('consumir_cuota_flyer_ia')")
  })

  it('limpia Storage al fallar o eliminar datos', () => {
    expect(actions).toContain('await storage.remove([path])')
    expect(actions).toContain("storage.from('galeria-fotos').remove([path])")
    expect(actions).toContain("storage.from('flyer-referencias').remove([path])")
  })

  it('limita kiosco, registro e inscripción de torneo sin datos sensibles en claro', () => {
    expect(sql).toContain("'asistencia-club'")
    expect(sql).toContain("'solicitud-identidad'")
    expect(sql).toContain("'torneo-nombre'")
    expect(sql).toContain('public.consumir_cuota_flyer_ia()')
    expect(sql).toContain('md5(p_clave)')
    expect(sql).toContain('REVOKE ALL ON TABLE public.limites_publicos FROM anon, authenticated')
  })

  it('consume intentos antes de consultar códigos públicos', () => {
    expect(sql).toMatch(/solicitud-intento-codigo[\s\S]*SELECT 1 FROM public\.invitaciones/)
    expect(sql).toMatch(/torneo-intento-codigo[\s\S]*SELECT club_id INTO v_club/)
    expect(sqlKiosco).toMatch(/invitacion-codigo[\s\S]*RETURN QUERY[\s\S]*FROM public\.invitaciones/)
    expect(sqlKiosco).toContain('Retorno normal: conserva los contadores')
  })

  it('deduplica solicitudes por torneo e identidad derivada', () => {
    expect(sqlKiosco).toContain('ADD COLUMN IF NOT EXISTS torneo_id uuid')
    expect(sqlKiosco).toContain('ADD COLUMN IF NOT EXISTS identidad_hash text')
    expect(sqlKiosco).toContain('solicitudes_torneo_identidad_pendiente_uidx')
    expect(sqlKiosco).toContain("v_email, v_identidad_hash, 'torneo_publico'")
    expect(sqlKiosco).not.toContain("lower(trim(s.nombre)) = lower(v_nombre)")
  })
})
