import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

const pdf = leer('src/lib/panorama-asistencia-pdf.ts')
const panel = leer('src/components/PanelRankingAsistencia.tsx')

describe('el PDF no puede decir otra cosa que la pantalla', () => {
  it('usa las mismas funciones del dominio, no un cálculo propio', () => {
    // Si recalculara "parecido", el día que cambie el criterio de una falta
    // quedan diciendo cosas distintas y no hay forma de saber cuál miente.
    expect(pdf).toContain("from '@/lib/domain/panoramaAsistencia'")
    for (const fn of ['conteoDelRango', 'resumenPorDia', 'resumenPorGrupo', 'ordenarPorRiesgo']) {
      expect(pdf).toContain(fn)
    }
  })

  it('recibe los calendarios que pinta la pantalla', () => {
    expect(panel).toMatch(/descargarPdf\(\s*modo,\s*calendarios\s*\)/)
  })

  it('exporta el período elegido, no un rango propio', () => {
    // El Excel pide su propio rango; el PDF sale de lo que estás mirando.
    const fn = panel.slice(panel.indexOf('async function descargarPdf'))
    expect(fn.slice(0, 700)).toContain('desde, hasta')
    expect(fn.slice(0, 700)).toContain('periodo: etiqueta')
  })
})

describe('masivo e individual responden preguntas distintas', () => {
  it('los dos existen', () => {
    expect(pdf).toContain('export async function exportarPanoramaPdf')
    expect(pdf).toContain('export async function exportarPanoramaIndividualPdf')
  })

  it('el individual NO lleva el ranking del club', () => {
    // Se le entrega al apoderado: nadie tiene por qué recibir un papel donde
    // figura la asistencia de los hijos de otros.
    const ind = pdf.slice(pdf.indexOf('export async function exportarPanoramaIndividualPdf'))
    expect(ind).not.toContain('ordenarPorRiesgo')
    expect(ind).not.toContain('Jugador por jugador')
  })

  it('el individual ordena por nombre y no por riesgo', () => {
    const ind = pdf.slice(pdf.indexOf('export async function exportarPanoramaIndividualPdf'))
    expect(ind).toContain("localeCompare(b.jugador.nombre, 'es')")
  })

  it('el masivo ordena de peor a mejor: lo que hay que mirar va arriba', () => {
    const mas = pdf.slice(
      pdf.indexOf('export async function exportarPanoramaPdf'),
      pdf.indexOf('export async function exportarPanoramaIndividualPdf'),
    )
    expect(mas).toContain('ordenarPorRiesgo')
  })
})

describe('lo que distingue una falta de una lista sin pasar', () => {
  it('las listas sin pasar van aparte de las faltas', () => {
    // Sumarlas haría que el profe que no pasó lista aparezca como un grupo
    // que no viene.
    expect(pdf).toContain("etiqueta: 'Sin pasar lista'")
    expect(pdf).toContain("etiqueta: 'Faltas'")
  })

  it('un porcentaje nulo se muestra como raya, no como cero', () => {
    // null es "todavía no hay nada resuelto". Un 0% dice que nadie vino.
    expect(pdf).toMatch(/v === null \? '—'/)
  })

  it('el individual solo lista los días que le tocaba entrenar', () => {
    const ind = pdf.slice(pdf.indexOf('export async function exportarPanoramaIndividualPdf'))
    expect(ind).toContain('d.bloques.length > 0')
  })

  it('la clase extra se anota al lado, no como estado', () => {
    // No consume sesión ni entra en el porcentaje, pero se le cobra aparte.
    expect(pdf).toContain('clase extra')
    expect(pdf).toContain('d.extra')
  })
})

describe('el estilo sale del módulo compartido', () => {
  it('no inventa su propio encabezado ni su propia paleta', () => {
    expect(pdf).toContain("from '@/lib/pdf/estilo'")
    for (const fn of ['encabezado', 'piePagina', 'estiloTabla', 'filaTarjetas']) {
      expect(pdf).toContain(fn)
    }
  })

  it('jsPDF se carga con import dinámico, como los otros generadores', () => {
    // Son ~300 KB: si entraran en el bundle los pagaría toda la app.
    expect(pdf).toMatch(/await import\('jspdf'\)/)
    expect(pdf).toMatch(/await import\('jspdf-autotable'\)/)
  })
})
