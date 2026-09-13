import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Igual que reporte-general-pdf.preview.test.ts: arma el reporte de torneos
// y ligas con datos inventados y lo deja en PDF_PREVIEW_DIR para mirarlo.

vi.stubGlobal('fetch', async (url: string) => {
  const ruta = join(process.cwd(), 'public', String(url))
  if (!existsSync(ruta)) return { ok: false } as Response
  const buf = readFileSync(ruta)
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response
})

const nombres = ['Agustín Pérez', 'Amanda González', 'Bruno González', 'Catalina Pérez', 'Cristóbal López', 'Diego Araya', 'Florencia Martínez', 'Gaspar Hernández', 'Josefa Morales', 'Lucas Martínez', 'Martín Espinoza', 'Renata López', 'Tomás Morales', 'Valentina Díaz', 'Vicente Silva', 'Antonia Rojas']
const jug = (desde: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `j${(desde + i) % nombres.length}`, nombre: nombres[(desde + i) % nombres.length] }))

function datosDePrueba() {
  return {
    torneos: [
      { id: 't1', nombre: 'Copa Primavera', estado: 'finalizado', fase: 'finalizado', tipo: 'externo', formato: 'grupos', fecha_inicio: '2026-09-05', categoria: 'Adultos', cuota_inscripcion: 5000, campeon: 'Agustín Pérez', subcampeon: 'Diego Araya', participantes: jug(0, 12), partidosTotal: 31, partidosJugados: 31 },
      { id: 't2', nombre: 'Torneo Interno Menores', estado: 'finalizado', fase: 'finalizado', tipo: 'interno', formato: 'grupos', fecha_inicio: '2026-08-22', categoria: 'Menores', cuota_inscripcion: 0, campeon: 'Renata López', subcampeon: 'Tomás Morales', participantes: jug(6, 6), partidosTotal: 11, partidosJugados: 11 },
      { id: 't3', nombre: 'Liguilla de Septiembre', estado: 'en_curso', fase: 'grupos', tipo: 'externo', formato: 'liguilla', fecha_inicio: '2026-09-12', categoria: null, cuota_inscripcion: 3000, campeon: null, subcampeon: null, participantes: jug(3, 8), partidosTotal: 28, partidosJugados: 17 },
      { id: 't4', nombre: 'Copa por Equipos', estado: 'en_curso', fase: 'grupos', tipo: 'externo', formato: 'equipos', fecha_inicio: '2026-09-19', categoria: null, cuota_inscripcion: 4000, campeon: null, subcampeon: null, participantes: jug(1, 9), partidosTotal: 15, partidosJugados: 0 },
    ],
    ligas: [
      { id: 'l1', nombre: 'Liga Individual SpinHouse 2026', estado: 'en_curso', divisiones: [{ nombre: 'Honor', jugadores: 10 }, { nombre: 'Primera', jugadores: 12 }, { nombre: 'Segunda', jugadores: 6 }, { nombre: 'Tercera', jugadores: 6 }], fechas: 5, partidosTotal: 141, partidosJugados: 27 },
    ],
    movimientos: [
      { tipo: 'ingreso', monto: 60000, categoria: 'inscripcion_torneo', fecha: '2026-09-05', torneo_id: 't1' },
      { tipo: 'gasto', monto: 30000, categoria: 'premio_torneo', fecha: '2026-09-06', torneo_id: 't1', descripcion: 'Premio 1°' },
      { tipo: 'gasto', monto: 15000, categoria: 'premio_torneo', fecha: '2026-09-06', torneo_id: 't1', descripcion: 'Premio 2°' },
      { tipo: 'gasto', monto: 8000, categoria: 'otro_gasto', fecha: '2026-09-05', torneo_id: 't1', descripcion: 'Árbitros' },
      { tipo: 'ingreso', monto: 24000, categoria: 'inscripcion_torneo', fecha: '2026-09-12', torneo_id: 't3' },
      { tipo: 'ingreso', monto: 170000, categoria: 'inscripcion_liga', fecha: '2026-08-30', torneo_id: null },
      { tipo: 'gasto', monto: 55000, categoria: 'premio_liga', fecha: '2026-09-10', torneo_id: null },
    ],
    torneosPrev: 2,
    tituloPrev: 'el trimestre anterior',
  }
}

describe('reporte de torneos y ligas v2', () => {
  it('cuadra el balance y la participación', async () => {
    const { balancePorTorneo, participacion, analizarTorneos } = await import('./reporte-torneos-pdf')
    const p = datosDePrueba()
    const b = balancePorTorneo(p)
    expect(b.filas.map(f => f.nombre)).toEqual(['Copa Primavera', 'Liguilla de Septiembre', 'Ligas'])
    expect(b.resultado).toBe(60000 - 30000 - 15000 - 8000 + 24000 + 170000 - 55000)
    const top = participacion(p)
    expect(top[0].torneos).toBeGreaterThanOrEqual(3)
    const textos = analizarTorneos(p).map(h => h.texto)
    expect(textos.some(t => t.includes('Se organizaron 4 torneos'))).toBe(true)
    expect(textos.some(t => t.includes('resultado positivo'))).toBe(true)
  })

  it('se arma con datos de prueba y se deja en disco para mirarlo', async () => {
    const { construirReporteTorneos } = await import('./reporte-torneos-pdf')
    const { marcaDelClub } = await import('@/lib/pdf/papel')
    const marca = await marcaDelClub({ nombre: 'Spinhouse', logo_url: null })
    marca.acento = [219, 39, 119]
    const doc = await construirReporteTorneos({ marca, periodo: 'Q3 2026', generado: '12-09-2026', datos: datosDePrueba() })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    const salida = process.env.PDF_PREVIEW_DIR
    if (salida) writeFileSync(join(salida, 'reporte-torneos-preview.pdf'), Buffer.from(doc.output('arraybuffer')))
  })
})
