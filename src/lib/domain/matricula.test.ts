import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

describe('matrícula: la plata y el flag no se separan', () => {
  const accion = leer('src/app/actions/jugadores.ts')
  const migracion = leer('supabase/migrations/138_matricula_jugadores.sql')

  it('marcar la matrícula pasa por el RPC, no por un update suelto', () => {
    const registrar = accion.slice(
      accion.indexOf('export async function registrarMatricula'),
      accion.indexOf('export async function desmarcarMatricula'),
    )
    expect(registrar).toContain('registrar_pago_matricula_atomico')
    // Si escribiera el flag por su cuenta, el movimiento podría fallar después
    // y dejar al jugador "pagado" sin su ingreso.
    expect(registrar).not.toMatch(/from\('jugadores'\)[\s\S]{0,80}\.update\(/)
  })

  it('desmarcar no toca Finanzas: esa plata ya entró', () => {
    const desmarcar = accion.slice(
      accion.indexOf('export async function desmarcarMatricula'),
      accion.indexOf('export async function actualizarMensualidad'),
    )
    expect(desmarcar).toContain('matricula_pagada: false')
    expect(desmarcar).not.toContain('movimientos')
    expect(desmarcar).not.toContain('rpc(')
    // Y sigue verificando el club antes de escribir, como todo lo demás.
    expect(desmarcar).toContain("eq('club_id', clubId)")
  })

  it('el RPC solo crea movimiento si entró plata', () => {
    const cuerpo = migracion.slice(migracion.indexOf('registrar_pago_matricula_atomico'))
    expect(cuerpo).toContain('IF p_monto > 0 THEN')
    // 0 es válido (matrícula eximida); negativo no.
    expect(cuerpo).toContain('p_monto < 0')
  })

  it('el RPC comprueba que el jugador sea del club de quien llama', () => {
    const cuerpo = migracion.slice(migracion.indexOf('registrar_pago_matricula_atomico'))
    expect(cuerpo).toContain('club_id = v_club_id')
    expect(cuerpo).toContain('Jugador no encontrado en el club')
  })

  it("'matricula' es categoría válida de ingreso en los cuatro lugares", () => {
    // La lista blanca del RPC y las tres de TypeScript tienen que coincidir, o
    // el movimiento se rechaza en la base o no se puede elegir en la interfaz.
    expect(migracion).toContain("'mensualidad','matricula','inscripcion_torneo'")
    expect(leer('src/lib/validation/finanzas.ts')).toContain("'matricula'")
    expect(leer('src/app/finanzas/page.tsx')).toContain("matricula:'Matrícula'")
    expect(leer('src/app/reportes/page.tsx')).toContain("matricula:'Matrícula'")
  })

  it('la migración deja marcados a los que ya existían, sin inventarles ingreso', () => {
    expect(migracion).toContain('matricula_pagada boolean NOT NULL DEFAULT true')

    // Todo INSERT en movimientos de esta migración tiene que ser de una fila
    // con VALUES —dentro del cuerpo de un RPC, uno por cobro real—. Un
    // `INSERT ... SELECT ... FROM jugadores` sería un alta masiva: le fabricaría
    // un ingreso a cada jugador viejo por una matrícula que nadie cobró.
    const inserts = [...migracion.matchAll(/INSERT INTO public\.movimientos[\s\S]{0,400}?;/g)]
    expect(inserts.length).toBeGreaterThan(0)
    for (const [bloque] of inserts) {
      expect(bloque, 'los movimientos se insertan de a uno, no en masa').toContain('VALUES')
      expect(bloque, 'ningún alta masiva desde jugadores').not.toMatch(/SELECT[\s\S]*FROM public\.jugadores/)
    }
    // Y el UPDATE de jugadores de la migración no toca montos.
    expect(migracion).not.toMatch(/UPDATE public\.jugadores\s+SET[\s\S]{0,120}matricula_monto\s*=\s*\d/)
  })
})

describe('quién es staff se define en un solo lugar', () => {
  it('los archivos que lo necesitaban dejaron de tener su propia copia', () => {
    for (const ruta of [
      'src/app/actions/horario.ts',
      'src/app/actions/vouchers.ts',
      'src/app/actions/tienda-profe.ts',
      'src/app/actions/tienda-asociacion.ts',
    ]) {
      const texto = leer(ruta)
      expect(texto, `${ruta} debe usar el guard compartido`).toContain('requireStaffClub')
      // La lista de roles ya no se repite acá: si se repitiera, cambiarla en
      // require.ts dejaría este archivo con el criterio viejo.
      expect(texto, `${ruta} no debe repetir la lista de roles`)
        .not.toMatch(/\['admin', 'superadmin', 'profesor'\]/)
    }
  })
})
