import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

describe('Central de Pago: el comprobante va al club que corresponde', () => {
  const pagina = leer('src/app/central-de-pago/page.tsx')

  it('no queda ningún número de WhatsApp escrito en el código', () => {
    // Estaba fijo el de Buin, así que los jugadores de Paine y de Unión San
    // Bernardo le mandaban su comprobante de pago a otro club.
    expect(pagina).not.toMatch(/const WA\s*=\s*'\d+'/)
    expect(pagina).not.toMatch(/wa\.me\/\$\{WA\}/)
  })

  it('el número sale de clubes.telefono', () => {
    expect(pagina).toContain("from('clubes')")
    expect(pagina).toContain('telefono')
    expect(pagina).toContain('linkWhatsApp')
  })

  it('sin teléfono no se pinta un botón que no lleva a ninguna parte', () => {
    expect(pagina).toMatch(/linkWA &&/)
  })
})

describe('Central de Pago: el número de cuenta deja de ser público', () => {
  const pagina = leer('src/app/central-de-pago/page.tsx')
  const accion = leer('src/app/actions/central-pago.ts')
  const privado = leer('src/lib/supabase/privado.ts')

  it('la pantalla firma el enlace en vez de pedir la URL pública', () => {
    expect(pagina).not.toContain('getPublicUrl')
    expect(pagina).toContain('firmarUrl')
  })

  it('la subida va al bucket privado', () => {
    expect(accion).toContain('BUCKET_PRIVADO')
    expect(accion).not.toMatch(/from\('galeria-fotos'\)\s*\n?\s*\.upload/)
    expect(accion).not.toContain('getPublicUrl')
  })

  it('la subida borra la copia pública vieja', () => {
    // Sin esto el enlace público anterior sigue mostrando el número de cuenta
    // a cualquiera que lo tuviera guardado. Mismo patrón que subirFotoJugador.
    expect(accion).toContain("from('galeria-fotos').remove(")
  })

  it('la ruta pone el club en la segunda carpeta, que es lo que mira la política', () => {
    // La política del bucket privado (migración 072) compara
    // `foldername(name)[2]` contra el club del que pide. Si el club no queda
    // ahí, o no lo ve nadie o lo ven todos.
    const ruta = privado.slice(privado.indexOf('export function rutaCentralPago'))
    expect(ruta.slice(0, 200)).toMatch(/central-pago\/\$\{clubId\}\//)
  })

  it('sigue exigiendo admin del club para subir', () => {
    expect(accion).toContain('requireAdminClub')
  })
})

describe('migración 139: cumple las reglas de las destructivas', () => {
  const m = leer('supabase/migrations/139_central_pago_privado.sql')

  it('empieza con el portazo', () => {
    expect(m).toContain("SELECT _migracion_nueva('139_central_pago_privado')")
  })

  it('el respaldo no lleva IF NOT EXISTS: el error es la protección', () => {
    expect(m).toMatch(/CREATE TABLE _respaldo_central_pago_publico_\d{8}/)
    expect(m).not.toMatch(/CREATE TABLE IF NOT EXISTS _respaldo/)
  })

  it('respalda antes de borrar, no después', () => {
    expect(m.indexOf('CREATE TABLE _respaldo')).toBeLessThan(m.indexOf('DELETE FROM storage.objects'))
  })

  it('cuenta antes de borrar y se planta si el número no calza', () => {
    expect(m).toContain('RAISE EXCEPTION')
    expect(m.indexOf('SELECT count(*) INTO v_n')).toBeLessThan(m.indexOf('DELETE FROM storage.objects'))
  })

  it('el DELETE usa el mismo WHERE que el conteo y el respaldo', () => {
    const condiciones = m.match(/name LIKE 'central-pago\/%'/g) ?? []
    // conteo + respaldo + delete + verificación
    expect(condiciones.length).toBeGreaterThanOrEqual(4)
  })

  it('va en una sola transacción y termina con verificación', () => {
    expect(m).toContain('BEGIN;')
    expect(m).toContain('COMMIT;')
    expect(m).toContain('deberia_ser_cero')
  })
})
