// Los cuatro generadores corridos de punta a punta con datos de mentira.
//
// No verifica cómo se ve —eso se mira abriendo el archivo—, verifica que
// corran: jsPDF y xlsx fallan en tiempo de ejecución, no de compilación. Un
// merge mal armado, una hoja repetida, un `undefined` donde va un número, y
// el admin ve "Generando..." para siempre sin que nada lo haya avisado antes.

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { calendarioJugador, indexar, type DatosHistorial } from '@/lib/domain/historialAsistencia'
import type { CalendarioDeJugador } from '@/lib/domain/panoramaAsistencia'
import type { JugadorDeBloque } from '@/lib/domain/asistenciaPorBloque'

/** Lo que cada generador quiso guardar: nombre de archivo → contenido. */
const guardados: string[] = []

vi.mock('xlsx-js-style', async (importOriginal) => {
  // El paquete es CommonJS: lo que importa vive en `default`, no en el
  // namespace, y esparcir el namespace deja `utils` afuera.
  const real = await importOriginal<any>()
  const base = real.default ?? real
  const api = { ...base, writeFile: (_wb: unknown, nombre: string) => { guardados.push(nombre) } }
  return { ...api, default: api }
})

const DESDE = '2026-08-03'
const HASTA = '2026-08-28'

const jugadores: JugadorDeBloque[] = [
  { id: 'j1', nombre: 'Ana Pérez', sede: 'buin' },
  { id: 'j2', nombre: 'Beto Silva', sede: 'buin' },
  { id: 'j3', nombre: 'Cami Rojas', sede: 'paine' },
]

const datos: DatosHistorial = {
  bloques: [
    { id: 'b1', nombre: 'Lunes Iniciación', sede: 'buin', dia_semana: 'lun', hora_inicio: '18:00', vigente_desde: '2026-01-01', vigente_hasta: null },
    { id: 'b2', nombre: 'Martes Avanzado', sede: 'paine', dia_semana: 'mar', hora_inicio: '19:00', vigente_desde: '2026-01-01', vigente_hasta: null },
  ] as any,
  inscripciones: [
    { bloque_id: 'b1', jugador_id: 'j1', vigente_desde: '2026-01-01', vigente_hasta: null },
    { bloque_id: 'b1', jugador_id: 'j2', vigente_desde: '2026-01-01', vigente_hasta: null },
    { bloque_id: 'b2', jugador_id: 'j1', vigente_desde: '2026-01-01', vigente_hasta: null },
    { bloque_id: 'b2', jugador_id: 'j3', vigente_desde: '2026-01-01', vigente_hasta: null },
  ] as any,
  asistencias: [
    { jugador_id: 'j1', fecha: '2026-08-03', estado: 'presente' },
    { jugador_id: 'j1', fecha: '2026-08-10', estado: 'presente' },
    { jugador_id: 'j2', fecha: '2026-08-03', estado: 'presente' },
    { jugador_id: 'j2', fecha: '2026-08-10', estado: 'ausente' },
    { jugador_id: 'j3', fecha: '2026-08-04', estado: 'presente' },
  ],
  excepciones: [],
  hoy: '2026-08-28',
}

const meta = { clubNombre: 'Asociación TDM Buin y Paine', periodo: 'Agosto', desde: DESDE, hasta: HASTA }
const argsBloque = { clubNombre: meta.clubNombre, desde: DESDE, hasta: HASTA, meses: 1, datos, jugadores }

let cals: CalendarioDeJugador[]

beforeAll(async () => {
  // `doc.save()` termina en el `saveAs` del navegador y acá no hay DOM. Se
  // parchea el prototipo y no el módulo: los generadores importan jsPDF de
  // forma dinámica, así que reciben esta misma clase.
  // jsPDF cuelga sus métodos de `API` y cada instancia los copia: parchear el
  // prototipo no alcanza.
  const { default: jsPDF } = await import('jspdf')
  const api = (jsPDF as any).API ?? jsPDF.prototype
  api.save = function (nombre: string) { guardados.push(nombre); return this }

  const indice = indexar(datos)
  cals = jugadores.map(j => ({
    jugador: { id: j.id, nombre: j.nombre },
    dias: calendarioJugador(j.id, DESDE, HASTA, datos, indice),
  }))
})

describe('los cuatro reportes se generan sin reventar', () => {
  it('Panorama en PDF y en Excel', async () => {
    const pdf = await import('@/lib/panorama-asistencia-pdf')
    const xls = await import('@/lib/panorama-asistencia-excel')
    await pdf.exportarPanoramaPdf(cals, meta)
    await pdf.exportarPanoramaIndividualPdf(cals, meta)
    await xls.exportarPanoramaExcel(cals, meta)
    await xls.exportarPanoramaIndividualExcel(cals, meta)
    expect(guardados.filter(n => n.endsWith('.pdf')).length).toBe(2)
    expect(guardados.filter(n => n.endsWith('.xlsx')).length).toBe(2)
  })

  it('Por bloque en PDF y en Excel', async () => {
    const pdf = await import('@/lib/asistencia-bloque-pdf')
    const xls = await import('@/lib/asistencia-bloque-excel')
    await pdf.exportarAsistenciaPorBloquePdf(argsBloque)
    await xls.descargarExcelAsistenciaPorBloque(argsBloque)
    expect(guardados.some(n => n.startsWith('asistencia_por_bloque') && n.endsWith('.pdf'))).toBe(true)
    expect(guardados.some(n => n.startsWith('asistencia_por_bloque') && n.endsWith('.xlsx'))).toBe(true)
  })

  it('un club sin nadie no rompe: no genera nada y no explota', async () => {
    const xls = await import('@/lib/panorama-asistencia-excel')
    const antes = guardados.length
    await xls.exportarPanoramaIndividualExcel([], meta)
    expect(guardados.length).toBe(antes)
  })

  it('dos jugadores del mismo nombre no chocan de pestaña', async () => {
    // Excel tira el libro entero abajo si se repite un nombre de hoja, y en un
    // club con dos "Juan Pérez" eso pasa el primer día.
    const xls = await import('@/lib/panorama-asistencia-excel')
    const repetidos = cals.map((c, i) => ({ ...c, jugador: { id: `x${i}`, nombre: 'Juan Pérez González Muñoz' } }))
    await expect(xls.exportarPanoramaIndividualExcel(repetidos, meta)).resolves.not.toThrow()
  })
})
