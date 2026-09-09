import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * El motor de torneos no puede nombrar a ningún club.
 *
 * Interno y externo comparten un solo motor —los dos listados abren
 * `/torneos/[id]` y crean con el mismo `crearTorneo`—, y Buin lo usa en
 * producción todos los días. Cuando Spinhouse pidió cuatro modalidades, la
 * salida fácil era:
 *
 *     if (clubId === '2d8e7c36-…') { …la liguilla… } else { …lo de siempre… }
 *
 * `CLAUDE.md` lo prohíbe y la razón es concreta: ata a los dos clubes al mismo
 * archivo, así que cada pedido de Spinhouse obliga a editar código que Buin
 * usa a diario, y cada edición es una oportunidad de romper producción.
 *
 * La diferencia va como DATO: `torneos.formato` dice la modalidad de cada
 * torneo, y los módulos del club dicen si el selector aparece. Ninguna de las
 * dos cosas necesita que el código sepa el UUID de nadie.
 *
 * Esta prueba es del mismo tipo que `escrituras-revisadas.test.ts` y
 * `rutas-protegidas.test.ts`: no comprueba una función, recorre el código y
 * hace cumplir una regla. Caza la clase entera del bug y no la instancia.
 */

// El UUID cero no es un club: es el centinela para un `.in()` con la lista
// vacía, que sin él traería todas las filas en vez de ninguna.
const UUID_CENTINELA = '00000000-0000-0000-0000-000000000000'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Los archivos del motor. Es un patrón y no una lista escrita a mano para que
 * los de las fases siguientes —liguilla, consolación, equipos— queden cubiertos
 * sin que nadie se acuerde de agregarlos acá.
 */
function archivosDelMotor(): Array<{ ruta: string; nombre: string }> {
  const raiz = process.cwd()
  const dominio = join(raiz, 'src', 'lib', 'domain')

  const archivos = readdirSync(dominio)
    .filter(f => /^(torneos?|modalidadTorneo)/i.test(f))
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => ({ ruta: join(dominio, f), nombre: `src/lib/domain/${f}` }))

  archivos.push({
    ruta: join(raiz, 'src', 'app', 'actions', 'torneos.ts'),
    nombre: 'src/app/actions/torneos.ts',
  })

  return archivos
}

describe('el motor de torneos no conoce a ningún club', () => {
  it('encuentra los archivos que tiene que revisar', () => {
    const nombres = archivosDelMotor().map(a => a.nombre)
    // Si un renombre deja el patrón sin coincidencias, la prueba pasaría en
    // verde revisando nada. Esto lo impide.
    expect(nombres).toContain('src/lib/domain/torneos.ts')
    expect(nombres).toContain('src/lib/domain/modalidadTorneo.ts')
    expect(nombres).toContain('src/app/actions/torneos.ts')
  })

  it('ningún archivo del motor tiene un UUID de club escrito', () => {
    const hallazgos: string[] = []

    for (const { ruta, nombre } of archivosDelMotor()) {
      const lineas = readFileSync(ruta, 'utf8').split('\n')
      lineas.forEach((linea, i) => {
        for (const uuid of linea.match(UUID) ?? []) {
          if (uuid.toLowerCase() === UUID_CENTINELA) continue
          hallazgos.push(`${nombre}:${i + 1} → ${uuid}`)
        }
      })
    }

    expect(
      hallazgos,
      'El motor de torneos lo comparten Buin y Spinhouse. La diferencia entre ' +
      'clubes va como dato —torneos.formato y los módulos del club—, nunca como ' +
      'un UUID en el código. Ver CLAUDE.md y docs/plan-torneos-modalidades-spinhouse.md.',
    ).toEqual([])
  })

  it('tampoco los nombra por su nombre', () => {
    // Un `if (club.nombre === 'Spinhouse')` esquiva el UUID y tiene el mismo
    // problema, así que se cierra la puerta de al lado.
    const prohibidos = /['"`](spinhouse|asociaci[oó]n tdm buin[^'"`]*|uni[oó]n san bernardo)['"`]/i
    const hallazgos: string[] = []

    for (const { ruta, nombre } of archivosDelMotor()) {
      const lineas = readFileSync(ruta, 'utf8').split('\n')
      lineas.forEach((linea, i) => {
        // Los comentarios sí pueden nombrar clubes: es donde se explica el
        // porqué de una decisión, y eso no cambia el comportamiento.
        const codigo = linea.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
        if (prohibidos.test(codigo)) hallazgos.push(`${nombre}:${i + 1}`)
      })
    }

    expect(hallazgos, 'El motor no puede ramificar por el nombre de un club.').toEqual([])
  })
})
