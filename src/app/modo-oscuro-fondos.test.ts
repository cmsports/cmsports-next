import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// El modo oscuro de este proyecto no usa variables: traduce colores hex
// escritos EN LÍNEA, uno por uno, con reglas `html.dark [style*="background:#xxx"]`.
//
// Eso tiene una consecuencia incómoda: un color claro que nadie tradujo se
// queda claro, y como `html.dark body *` pone TODO el texto en blanco con
// !important, el resultado es blanco sobre casi blanco. El elemento está ahí y
// no se lee.
//
// Pasó en la grilla de Cupos/bloques: los colores de grupo salen de una paleta
// de seis pasteles y dos —#ecfdf5 y #f0fdfa— eran los únicos sin traducir. Los
// bloques "Menores Iniciación" y "Todo Público" quedaban invisibles.
//
// Este test recorre TODOS los fondos claros escritos en línea y exige que cada
// uno tenga su regla. Es la única forma de que no vuelva a pasar: nadie va a
// acordarse de tocar globals.css al elegir un pastel nuevo.

const raiz = process.cwd()
const css = readFileSync(resolve(raiz, 'src/app/globals.css'), 'utf8')

function archivos(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) archivos(p, out)
    else if (/\.tsx$/.test(f) && !f.includes('.test.')) out.push(p)
  }
  return out
}

/** Un color es "claro" si sus tres canales están altos: sobre él va texto oscuro. */
function esClaro(hex: string): boolean {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
  return n(1) >= 220 && n(3) >= 220 && n(5) >= 220
}

function tieneReglaOscura(hex: string): boolean {
  return css.includes(`background:${hex}`) || css.includes(`background: ${hex}`)
}

describe('todo fondo claro en línea tiene su traducción a modo oscuro', () => {
  const usos = new Map<string, Set<string>>()

  for (const archivo of archivos(resolve(raiz, 'src'))) {
    const texto = readFileSync(archivo, 'utf8')
    for (const m of texto.matchAll(/background: ?'(#[0-9a-fA-F]{6})'/g)) {
      const hex = m[1].toLowerCase()
      if (!esClaro(hex)) continue
      const donde = usos.get(hex) ?? new Set<string>()
      donde.add(archivo.replace(raiz, '').replace(/\\/g, '/'))
      usos.set(hex, donde)
    }
  }

  it('encuentra fondos claros para revisar', () => {
    // Si esto da cero, el escaneo se rompió y los demás casos pasarían solos.
    expect(usos.size).toBeGreaterThan(5)
  })

  it('ninguno queda sin regla `html.dark`', () => {
    const huerfanos = [...usos.entries()]
      .filter(([hex]) => !tieneReglaOscura(hex))
      .map(([hex, donde]) => `${hex} — usado en ${[...donde].join(', ')}`)

    expect(huerfanos, `Fondos claros sin traducir en globals.css:\n  ${huerfanos.join('\n  ')}`).toEqual([])
  })
})

describe('la paleta de grupos de Cupos/bloques', () => {
  const horario = readFileSync(resolve(raiz, 'src/app/horario/page.tsx'), 'utf8')
  const linea = horario.slice(horario.indexOf('const COLORES ='))
  const colores = (linea.slice(0, linea.indexOf('\n')).match(/#[0-9a-fA-F]{6}/g) ?? []).map(c => c.toLowerCase())

  it('son seis', () => {
    expect(colores).toHaveLength(6)
  })

  it('los seis se traducen a oscuro', () => {
    // Los dos que faltaban dejaban el bloque ilegible, no feo: texto blanco
    // sobre fondo casi blanco.
    const sinRegla = colores.filter(c => !tieneReglaOscura(c))
    expect(sinRegla, `Sin regla en globals.css: ${sinRegla.join(', ')}`).toEqual([])
  })
})
