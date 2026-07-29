import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Guardia contra el bug de Sofía (2026-07-29).
//
// `vigente_hasta` es el último día en que vale, así que cerrar con la fecha de
// HOY no saca a nadie: lo deja vivo hasta la medianoche. Costó 22 inscripciones
// rotas, 13 jugadores apareciendo en listas de grupos que ya no eran suyos y 10
// ocupando cupo en dos bloques a la vez.
//
// El arreglo fue reemplazar todos los cierres por `cierreVigencia`. Nada impide
// que el próximo que escriba un cierre vuelva a poner la fecha de hoy, y el
// síntoma tarda un día en aparecer y se va solo a la medianoche: es de los que
// se descartan como "cosa rara del sistema". Por eso el archivo se revisa acá.

function archivosTs(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next') continue
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) archivosTs(ruta, salida)
    else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) salida.push(ruta)
  }
  return salida
}

// Se prohíbe exactamente el error, en vez de permitir lo válido: la lista de
// formas correctas incluiría las anotaciones de tipo (`vigente_hasta: string |
// null`) y cualquier campo nuevo la rompería sin que nadie hubiera hecho nada
// mal. Lo que nunca puede pasar es que la columna reciba la fecha de hoy.
const CIERRE_CON_HOY = /vigente_hasta:\s*(hoyISO\(\)|fechaChile\(|new Date\(|[\w.]*toISOString)/

describe('nadie vuelve a cerrar una vigencia con la fecha de hoy', () => {
  it('todo cierre pasa por cierreVigencia', () => {
    const ofensas: string[] = []

    for (const archivo of archivosTs(join(process.cwd(), 'src'))) {
      const lineas = readFileSync(archivo, 'utf8').split('\n')
      lineas.forEach((linea, i) => {
        if (!CIERRE_CON_HOY.test(linea)) return
        ofensas.push(`${archivo.replace(process.cwd(), '.')}:${i + 1}  ${linea.trim()}`)
      })
    }

    expect(ofensas, [
      'Hay un cierre de vigencia que no usa cierreVigencia().',
      'Cerrar con hoy no saca a nadie: `vigente_hasta` es el último día en que vale,',
      'así que el registro sigue vigente hasta la medianoche. Usá cierreVigencia(hoyISO()).',
      '',
      ...ofensas,
    ].join('\n')).toEqual([])
  })
})
