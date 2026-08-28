import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

const pdf = leer('src/lib/panorama-asistencia-pdf.ts')
const xls = leer('src/lib/panorama-asistencia-excel.ts')
const bloquePdf = leer('src/lib/asistencia-bloque-pdf.ts')
const bloqueXls = leer('src/lib/asistencia-bloque-excel.ts')
const panel = leer('src/components/PanelRankingAsistencia.tsx')

describe('el reporte no puede decir otra cosa que la pantalla', () => {
  it('PDF y Excel usan las mismas funciones del dominio, no un cálculo propio', () => {
    // Si recalcularan "parecido", el día que cambie el criterio de una falta
    // quedan diciendo cosas distintas y no hay forma de saber cuál miente.
    for (const archivo of [pdf, xls]) {
      expect(archivo).toContain("from '@/lib/domain/panoramaAsistencia'")
      for (const fn of ['conteoDelRango', 'resumenPorDia', 'resumenPorGrupo', 'ordenarPorRiesgo']) {
        expect(archivo).toContain(fn)
      }
    }
  })

  it('los dos formatos del reporte por bloque salen del mismo cálculo', () => {
    for (const archivo of [bloquePdf, bloqueXls]) {
      expect(archivo).toContain("from '@/lib/domain/asistenciaPorBloque'")
      expect(archivo).toContain('agruparPorBloque')
    }
  })

  it('recibe los calendarios que pinta la pantalla', () => {
    expect(panel).toMatch(/descargarPanorama\(\s*modo,\s*calendarios,\s*f\s*\)/)
  })

  it('exporta el período elegido, no un rango propio', () => {
    // El reporte por bloque pide su propio rango; estos dos salen de lo que
    // estás mirando.
    const fn = panel.slice(panel.indexOf('async function descargarPanorama'))
    expect(fn.slice(0, 700)).toContain('desde, hasta')
    expect(fn.slice(0, 700)).toContain('periodo: etiqueta')
  })
})

describe('el admin elige el formato', () => {
  it('los cuatro exportadores existen y están enganchados', () => {
    for (const fn of ['exportarPanoramaPdf', 'exportarPanoramaIndividualPdf',
                      'exportarPanoramaExcel', 'exportarPanoramaIndividualExcel',
                      'exportarAsistenciaPorBloquePdf', 'descargarExcelAsistenciaPorBloque']) {
      expect(panel).toContain(fn)
    }
  })

  it('cada reporte ofrece PDF y Excel, no uno solo', () => {
    expect(panel).toContain("type Formato = 'pdf' | 'excel'")
    // Las tres filas del menú comparten el mismo par de botones —dos usos en
    // el código: uno dentro del map de masivo/individual y otro para el de
    // bloques—, así que agregar un formato entra en las tres de una.
    expect(panel.match(/<BotonesFormato/g)?.length).toBe(2)
    expect(panel).toContain('onElegir={f => void descargarPanorama(modo, calendarios, f)}')
    expect(panel).toContain('onElegir={f => void descargarPorBloque(f)}')
  })

  it('los generadores pesados entran por import dinámico', () => {
    // jsPDF y xlsx son ~300 KB cada uno: en el bundle los pagaría toda la app.
    for (const mod of ['panorama-asistencia-pdf', 'panorama-asistencia-excel',
                       'asistencia-bloque-pdf', 'asistencia-bloque-excel']) {
      expect(panel).toContain(`await import('@/lib/${mod}')`)
    }
  })
})

describe('masivo e individual responden preguntas distintas', () => {
  it('los dos existen en los dos formatos', () => {
    expect(pdf).toContain('export async function exportarPanoramaPdf')
    expect(pdf).toContain('export async function exportarPanoramaIndividualPdf')
    expect(xls).toContain('export async function exportarPanoramaExcel')
    expect(xls).toContain('export async function exportarPanoramaIndividualExcel')
  })

  it('el individual NO lleva el ranking del club, ni en PDF ni en Excel', () => {
    // Se le entrega al apoderado: nadie tiene por qué recibir un papel —ni una
    // planilla— donde figura la asistencia de los hijos de otros.
    const ind = pdf.slice(pdf.indexOf('export async function exportarPanoramaIndividualPdf'))
    expect(ind).not.toContain('ordenarPorRiesgo')
    expect(ind).not.toContain('Jugador por jugador')
    const indXls = xls.slice(xls.indexOf('export async function exportarPanoramaIndividualExcel'))
    expect(indXls).not.toContain('ordenarPorRiesgo')
    expect(indXls).not.toContain('Jugador por jugador')
  })

  it('el individual ordena por nombre y no por riesgo', () => {
    const ind = pdf.slice(pdf.indexOf('export async function exportarPanoramaIndividualPdf'))
    expect(ind).toContain("localeCompare(b.jugador.nombre, 'es')")
    const indXls = xls.slice(xls.indexOf('export async function exportarPanoramaIndividualExcel'))
    expect(indXls).toContain("localeCompare(b.jugador.nombre, 'es')")
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
    expect(xls).toContain("['Sin pasar lista', total.pendientes]")
    expect(xls).toContain("['Faltaron', total.ausentes]")
  })

  it('un porcentaje nulo se muestra como raya, no como cero', () => {
    // null es "todavía no hay nada resuelto". Un 0% dice que nadie vino.
    expect(pdf).toMatch(/v === null \? '—'/)
  })

  it('el individual solo lista los días que le tocaba entrenar', () => {
    for (const archivo of [pdf, xls]) {
      const ind = archivo.slice(archivo.indexOf('IndividualPdf') >= 0
        ? archivo.indexOf('export async function exportarPanoramaIndividualPdf')
        : archivo.indexOf('export async function exportarPanoramaIndividualExcel'))
      expect(ind).toContain('d.bloques.length > 0')
    }
  })

  it('la clase extra se anota al lado, no como estado', () => {
    // No consume sesión ni entra en el porcentaje, pero se le cobra aparte.
    for (const archivo of [pdf, xls]) {
      expect(archivo).toContain('clase extra')
      expect(archivo).toContain('d.extra')
    }
  })
})

describe('el estilo sale del módulo compartido', () => {
  it('ningún generador inventa su propio encabezado ni su propia paleta', () => {
    for (const archivo of [pdf, bloquePdf]) {
      expect(archivo).toContain("from '@/lib/pdf/estilo'")
      for (const fn of ['encabezado', 'piePagina', 'estiloTabla']) expect(archivo).toContain(fn)
    }
    for (const archivo of [xls, bloqueXls]) {
      expect(archivo).toContain("from '@/lib/excel/estilo'")
      for (const fn of ['estiloPct', 'nombreDeHoja']) expect(archivo).toContain(fn)
    }
  })

  it('jsPDF y xlsx se cargan con import dinámico', () => {
    // Son ~300 KB cada uno: si entraran en el bundle los pagaría toda la app.
    for (const archivo of [pdf, bloquePdf]) {
      expect(archivo).toMatch(/await import\('jspdf'\)/)
      expect(archivo).toMatch(/await import\('jspdf-autotable'\)/)
    }
    for (const archivo of [xls, bloqueXls]) {
      expect(archivo).toMatch(/await import\('xlsx-js-style'\)/)
    }
  })
})
