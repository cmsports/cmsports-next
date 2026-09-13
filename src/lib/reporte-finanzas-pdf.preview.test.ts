import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Vista previa del reporte financiero con datos inventados (ver el del General).
vi.stubGlobal('fetch', async (url: string) => {
  const ruta = join(process.cwd(), 'public', String(url))
  if (!existsSync(ruta)) return { ok: false } as Response
  const buf = readFileSync(ruta)
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response
})

describe('reporte financiero v2', () => {
  it('se arma con datos de prueba y se deja en disco para mirarlo', async () => {
    const { construirReporteFinanzas } = await import('./reporte-finanzas-pdf')
    const { marcaDelClub } = await import('@/lib/pdf/papel')
    const marca = await marcaDelClub({ nombre: 'Spinhouse', logo_url: null })
    marca.acento = [219, 39, 119]
    const nombres = ['Lucas Martínez', 'Renata López', 'Tomás Morales', 'Valentina Díaz', 'Antonia Silva', 'Bruno Torres']
    const doc = await construirReporteFinanzas({
      marca, periodo: 'Q3 2026', generado: '12-09-2026',
      nombreCategoria: c => ({ mensualidad: 'Mensualidad', arriendo_mesa: 'Arriendo de mesa', clase_particular: 'Clase particular', inscripcion_torneo: 'Inscripción torneo', arriendo: 'Arriendo', sueldos: 'Sueldos', premio_liga: 'Premio de liga', materiales: 'Materiales', marketing: 'Marketing y redes' }[c] ?? c),
      datos: {
        ingresos: 1310000, gastos: 721000, ingresosPrev: 1180000, gastosPrev: 690000, tituloPrev: 'Q2 2026',
        desgloseIngresos: { mensualidad: 1140000, arriendo_mesa: 105000, clase_particular: 60000, inscripcion_torneo: 5000 },
        desgloseGastos: { arriendo: 540000, sueldos: 120000, premio_liga: 25000, materiales: 24000, marketing: 12000 },
        prevIngresos: { mensualidad: 1050000, arriendo_mesa: 90000, clase_particular: 40000 },
        prevGastos: { arriendo: 540000, sueldos: 120000, materiales: 30000 },
        porMes: { '2026-07': { ingresos: 380000, gastos: 210000 }, '2026-08': { ingresos: 410000, gastos: 240000 }, '2026-09': { ingresos: 520000, gastos: 271000 } },
        porCobrar: [
          { mes: 9, anio: 2026, monto: 35000, estado: 'pendiente', jugadores: { nombre: nombres[0], categoria: 'Adultos' } },
          { mes: 9, anio: 2026, monto: 35000, estado: 'pendiente', jugadores: { nombre: nombres[1], categoria: 'Adultos' } },
          { mes: 8, anio: 2026, monto: 35000, estado: 'atrasado', jugadores: { nombre: nombres[2], categoria: 'Menores' } },
          { mes: 9, anio: 2026, monto: 35000, estado: 'pendiente', jugadores: { nombre: nombres[2], categoria: 'Menores' } },
          { mes: 6, anio: 2026, monto: 30000, estado: 'atrasado', jugadores: { nombre: nombres[3], categoria: 'Menores' } },
          { mes: 7, anio: 2026, monto: 30000, estado: 'atrasado', jugadores: { nombre: nombres[3], categoria: 'Menores' } },
          { mes: 8, anio: 2026, monto: 30000, estado: 'atrasado', jugadores: { nombre: nombres[3], categoria: 'Menores' } },
          { mes: 9, anio: 2026, monto: 30000, estado: 'pendiente', jugadores: { nombre: nombres[3], categoria: 'Menores' } },
        ],
        totalPorCobrar: 260000,
        movimientos: [
          ...Array.from({ length: 12 }, (_, i) => ({ fecha: `2026-09-${String(1 + i).padStart(2, '0')}`, tipo: 'ingreso', categoria: 'mensualidad', descripcion: `Mensualidad septiembre — ${nombres[i % nombres.length]}`, monto: 35000 })),
          { fecha: '2026-09-01', tipo: 'gasto', categoria: 'arriendo', descripcion: 'Arriendo sede septiembre', monto: 180000 },
          { fecha: '2026-09-05', tipo: 'ingreso', categoria: 'arriendo_mesa', descripcion: 'Arriendo de mesas fin de semana', monto: 105000 },
          { fecha: '2026-09-10', tipo: 'gasto', categoria: 'premio_liga', descripcion: 'Premio liga agosto', monto: 25000 },
          { fecha: '2026-09-15', tipo: 'gasto', categoria: 'materiales', descripcion: 'Pelotas y redes', monto: 24000 },
        ],
        finAnio: 2026, finMes: 9,
      },
    })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
    const salida = process.env.PDF_PREVIEW_DIR
    if (salida) writeFileSync(join(salida, 'reporte-finanzas-preview.pdf'), Buffer.from(doc.output('arraybuffer')))
  })
})
