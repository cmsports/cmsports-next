import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagina = readFileSync(new URL('./[clubId]/page.tsx', import.meta.url), 'utf8')
const proxy = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8')
const migracion = readFileSync(
  new URL('../../../supabase/migrations/180_consultar_credencial_por_rut.sql', import.meta.url),
  'utf8',
)
const credenciales = readFileSync(new URL('../credenciales/page.tsx', import.meta.url), 'utf8')

describe('consulta pública de credencial por RUT', () => {
  it('el link es público y no redirige a quien ya tiene sesión', () => {
    expect(proxy).toContain('mi-acceso')
  })

  it('la pantalla llama al RPC y no baja la tabla de claves al navegador', () => {
    expect(pagina).toContain("rpc('consultar_credencial_por_rut'")
    expect(pagina).not.toContain("from('jugadores')")
    expect(pagina).not.toContain("from('credencial_visible')")
    expect(pagina).not.toContain('createAdminClient')
    expect(pagina).not.toContain('setMensaje(error.message)')
    expect(pagina).toContain('mensajeGenerico')
  })

  it('el RPC limita intentos, no revierte el cupo con RAISE, y no entrega admins ni externos', () => {
    expect(migracion).toContain("'credencial-club'")
    expect(migracion).toContain("'credencial-rut'")
    expect(migracion).toContain('_consumir_limite_publico')
    expect(migracion).not.toMatch(/RAISE EXCEPTION/)
    expect(migracion).toContain("p.rol = 'jugador'")
    expect(migracion).toContain('es_externo')
    expect(migracion).toContain('v_n <> 1')
    expect(migracion).toMatch(/REVOKE ALL ON FUNCTION public\.consultar_credencial_por_rut\(uuid, text\)[\s\S]*FROM PUBLIC/)
    expect(migracion).toContain('GRANT EXECUTE ON FUNCTION public.consultar_credencial_por_rut(uuid, text) TO anon, authenticated')
  })

  it('el admin puede copiar el link del grupo desde Credenciales', () => {
    expect(credenciales).toContain('pathMiAcceso')
    expect(credenciales).toContain('Copiar mensaje para WhatsApp')
  })

  it('el UUID de Buin se acorta a /mi-acceso/buin', () => {
    expect(proxy).toContain('pathCanonicoMiAcceso')
    expect(pagina).toContain('clubIdDesdeParametro')
  })
})
