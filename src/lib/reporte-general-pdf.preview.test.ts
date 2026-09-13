import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Genera el Reporte General con datos inventados y lo escribe a disco para
// mirarlo. No afirma nada del dibujo (no hay forma sensata de hacerlo): solo
// que el documento sale y tiene páginas. Corre con:
//   npx vitest run src/lib/reporte-general-pdf.preview.test.ts
// y deja el PDF en la carpeta que diga PDF_PREVIEW_DIR (o el cwd).

// Las fuentes se sirven desde /fonts en el navegador; acá se leen del disco.
vi.stubGlobal('fetch', async (url: string) => {
  const ruta = join(process.cwd(), 'public', String(url))
  if (!existsSync(ruta)) return { ok: false } as Response
  const buf = readFileSync(ruta)
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response
})

describe('reporte general v2', () => {
  it('se arma con datos de prueba y se deja en disco para mirarlo', async () => {
    const { construirReporteGeneral } = await import('./reporte-general-pdf')
    const { analizarGeneral } = await import('@/lib/domain/reporteGeneral')
    const nombres = ['Agustín Pérez', 'Amanda González', 'Bruno González', 'Catalina Pérez', 'Cristóbal López', 'Diego Araya', 'Florencia Martínez', 'Gaspar Hernández', 'Josefa Morales', 'Lucas Martínez', 'Martín Espinoza', 'Renata López', 'Tomás Morales', 'Valentina Díaz', 'Vicente Silva', 'Antonia Rojas']
    const jugadores = nombres.map((n, i) => ({ id: `j${i}`, nombre: n, estado: i < 14 ? 'activo' : 'inactivo', categoria: i % 3 === 0 ? 'Menores' : 'Adultos' }))
    const activos = jugadores.filter(j => j.estado === 'activo')
    const asistencias: Array<{ jugador_id: string; fecha: string }> = []
    const dias = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-21']
    activos.forEach((j, i) => { dias.forEach((d, k) => { if ((i + k) % 3 !== 0 && i < 12) asistencias.push({ jugador_id: j.id, fecha: d }) }) })
    const porDiaSemana: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    for (const a of asistencias) porDiaSemana[new Date(a.fecha + 'T12:00:00').getDay()]++
    const mensualidades = activos.map((j, i) => ({ jugador_id: j.id, mes: 9, anio: 2026, monto: 35000, estado: i % 4 === 0 ? 'pendiente' : 'pagado' }))
    const morosos = activos.filter((_, i) => i % 4 === 0)
    const movimientos = [
      ...Array.from({ length: 10 }, (_, i) => ({ tipo: 'ingreso', monto: 35000, categoria: 'mensualidad', fecha: `2026-09-${String(2 + i).padStart(2, '0')}`, descripcion: '' })),
      { tipo: 'ingreso', monto: 105000, categoria: 'arriendo_mesa', fecha: '2026-09-05', descripcion: '' },
      { tipo: 'ingreso', monto: 60000, categoria: 'clase_particular', fecha: '2026-09-12', descripcion: '' },
      { tipo: 'ingreso', monto: 5000, categoria: 'inscripcion_torneo', fecha: '2026-09-12', descripcion: '' },
      { tipo: 'gasto', monto: 180000, categoria: 'arriendo', fecha: '2026-09-01', descripcion: '' },
      { tipo: 'gasto', monto: 55000, categoria: 'premio_liga', fecha: '2026-09-10', descripcion: '' },
      { tipo: 'gasto', monto: 24000, categoria: 'materiales', fecha: '2026-09-15', descripcion: '' },
      { tipo: 'gasto', monto: 12000, categoria: 'marketing', fecha: '2026-09-18', descripcion: '' },
      // Dos meses más, para ver el mes a mes.
      { tipo: 'ingreso', monto: 410000, categoria: 'mensualidad', fecha: '2026-08-03', descripcion: '' },
      { tipo: 'gasto', monto: 240000, categoria: 'arriendo', fecha: '2026-08-01', descripcion: '' },
      { tipo: 'ingreso', monto: 380000, categoria: 'mensualidad', fecha: '2026-07-03', descripcion: '' },
      { tipo: 'gasto', monto: 210000, categoria: 'arriendo', fecha: '2026-07-01', descripcion: '' },
    ]
    const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos = movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    const desglose = (tipo: string) => movimientos.filter(m => m.tipo === tipo).reduce((d, m) => ({ ...d, [m.categoria]: (d[m.categoria] ?? 0) + m.monto }), {} as Record<string, number>)
    const datos = {
      jugadores, activos, movimientos, ingresos, gastos,
      desgloseIngresos: desglose('ingreso'), desgloseGastos: desglose('gasto'),
      asistencias, promedioAsist: Math.round(asistencias.length / dias.length), torneos: [{ nombre: 'Copa Primavera' }],
      morosos, mensualidades, diasConAsist: dias.length, porDiaSemana,
      ingresosPrev: 410000, gastosPrev: 240000, asistPrev: 140, tituloPrev: 'Agosto 2026',
    }
    const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
    const analisis = analizarGeneral(datos, fmt)
    const { marcaDelClub } = await import('@/lib/pdf/papel')
    const marca = await marcaDelClub({ nombre: 'Spinhouse', logo_url: null })
    marca.acento = [219, 39, 119] // un club con color propio, para ver cómo se ve
    const doc = await construirReporteGeneral({
      marca, periodo: 'Q3 2026', generado: '12-09-2026', datos, analisis, nombreCategoria: c => ({ mensualidad: 'Mensualidad', arriendo_mesa: 'Arriendo de mesa', clase_particular: 'Clase particular', inscripcion_torneo: 'Inscripción torneo', arriendo: 'Arriendo', premio_liga: 'Premio de liga', materiales: 'Materiales', marketing: 'Marketing y redes' }[c] ?? c),
    })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    const salida = process.env.PDF_PREVIEW_DIR
    if (salida) writeFileSync(join(salida, 'reporte-general-preview.pdf'), Buffer.from(doc.output('arraybuffer')))
  })
})
