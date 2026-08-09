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

describe('migración 139: solo hace lo que la base deja hacer', () => {
  const m = leer('supabase/migrations/139_central_pago_privado.sql')

  it('empieza con el portazo', () => {
    expect(m).toContain("SELECT _migracion_nueva('139_central_pago_privado')")
  })

  it('no intenta escribir storage.objects', () => {
    // La primera versión hacía DELETE ahí y la base la rechazó con el trigger
    // storage.protect_delete: borrar la fila dejaba el archivo huérfano en el
    // disco, sin la fila que permitía encontrarlo. Mover archivos va por la
    // API de almacenamiento, no por SQL.
    //
    // Se miran solo las líneas de SQL: el encabezado explica ese error y
    // nombra el DELETE viejo, y un test que lea los comentarios prohibiría
    // contar la historia de por qué el archivo es como es.
    const sql = m.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    expect(sql).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i)
    expect(sql).not.toMatch(/UPDATE\s+storage\.objects/i)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+storage\.objects/i)
  })

  it('deja escrito por dónde se mueven los archivos', () => {
    expect(m).toContain('scripts/migrar-central-pago-a-privado.mjs')
    expect(m).toContain('storage.protect_delete')
  })

  it('carga el teléfono sin pisar el que ya esté cargado', () => {
    expect(m).toMatch(/UPDATE clubes/)
    expect(m).toMatch(/nullif\(btrim\(coalesce\(telefono, ''\)\), ''\) IS NULL/)
  })

  it('va en una sola transacción y termina con verificación', () => {
    expect(m).toContain('BEGIN;')
    expect(m).toContain('COMMIT;')
    expect(m).toContain('estado_boton')
  })
})

describe('el script que mueve los archivos copia antes de borrar', () => {
  const s = leer('scripts/migrar-central-pago-a-privado.mjs')

  it('no borra nada sin --borrar', () => {
    expect(s).toContain("process.argv.includes('--borrar')")
    expect(s).toMatch(/if \(!BORRAR\)/)
  })

  it('verifica la copia antes de borrar el original', () => {
    const iVerifica = s.indexOf('.download(rutaPrivada(club.id))')
    const iBorra    = s.indexOf('.remove([`central-pago/${club.id}`])')
    expect(iVerifica).toBeGreaterThan(-1)
    expect(iBorra).toBeGreaterThan(iVerifica)
  })

  it('no borra si la copia privada quedó vacía', () => {
    // Un upload que devuelve ok pero deja el archivo en 0 bytes se llevaría
    // puesta la única copia que quedaba.
    expect(s).toMatch(/check\.size === 0/)
  })

  it('comprueba al final que la URL pública ya no responde', () => {
    expect(s).toContain('/storage/v1/object/public/')
    expect(s).toContain('SIGUE EXPUESTO')
  })
})
