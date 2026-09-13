import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Genera, con datos inventados, los reportes que no tienen preview propia:
// informe financiero del torneo, ranking, papeles de la fecha de liga, tabla
// de división, historial de bloque y panorama de asistencia. Corre con
// PDF_PREVIEW_DIR apuntando a una carpeta y deja ahí un PDF por reporte. Sin
// esa variable solo comprueba que cada uno se arma sin reventar.

vi.stubGlobal('fetch', async (url: string) => {
  const ruta = join(process.cwd(), 'public', String(url))
  if (!existsSync(ruta)) return { ok: false } as Response
  const buf = readFileSync(ruta)
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response
})

const salida = process.env.PDF_PREVIEW_DIR
const guardados: string[] = []

async function marcaDePrueba() {
  const { marcaDelClub } = await import('@/lib/pdf/papel')
  const marca = await marcaDelClub({ nombre: 'Spinhouse', logo_url: null })
  marca.acento = [219, 39, 119]
  return marca
}

// `doc.save` en node no tiene dónde guardar: se reemplaza por una escritura a
// disco (o nada), y se anota el nombre para comprobar que cada reporte salió.
async function capturarSave() {
  const { default: jsPDF } = await import('jspdf')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(jsPDF as any).API.save = function (this: { output: (t: string) => ArrayBuffer }, nombre: string) {
    guardados.push(nombre)
    if (salida) writeFileSync(join(salida, nombre.replace(/[^\w.áéíóúñÁÉÍÓÚÑ —-]/g, '_')), Buffer.from(this.output('arraybuffer')))
  }
}

const nombres = ['Agustín Pérez', 'Amanda González', 'Bruno González', 'Catalina Pérez', 'Cristóbal López', 'Diego Araya', 'Florencia Martínez', 'Gaspar Hernández', 'Josefa Morales', 'Lucas Martínez', 'Martín Espinoza', 'Renata López', 'Tomás Morales', 'Valentina Díaz']

describe('reportes varios v2', () => {
  it('informe financiero del torneo', async () => {
    await capturarSave()
    const { descargarInformeFinancieroPdf } = await import('./torneo-informe-pdf')
    await descargarInformeFinancieroPdf({
      torneoNombre: 'Copa Primavera', fecha: '05-09-2026', cuota: 5000, totalInscritos: 14, pagados: 11, recaudado: 55000,
      recaudadoEfectivo: 35000, recaudadoTransferencia: 20000, recaudadoPendienteSubir: 15000,
      jugadores: nombres.map((n, i) => ({ nombre: n, estado: i < 11 ? 'pagado' : i === 11 ? 'exento' : 'pendiente', metodoPago: i % 3 === 0 ? 'transferencia' : 'efectivo' })),
      premios: [{ lugar: '1° lugar', nombre: 'Agustín Pérez', monto: 20000 }, { lugar: '2° lugar', nombre: 'Diego Araya', monto: 10000 }, { lugar: '3° lugar', nombre: 'Renata López', monto: 5000 }],
      gastos: [{ tipo: 'Árbitros', monto: 8000 }, { tipo: 'Pelotas', monto: 6000 }],
      gastosRegistradosEnFinanzas: false, metodoPremio: 'efectivo',
    }, await marcaDePrueba())
    expect(guardados.at(-1)).toContain('Informe financiero')
  })

  it('ranking de una categoría', async () => {
    await capturarSave()
    const { exportarRankingPdf } = await import('./ranking-pdf')
    const filas = nombres.map((n, i) => ({ jugadorId: `j${i}`, nombre: n, pts: 240 - i * 17, victorias: 12 - i, derrotas: i, jugados: 12, torneos: 3 - (i % 2), rank: i + 1 }))
    // Un empate más abajo (5° compartido), para ver los puestos compartidos sin perder el podio.
    filas[5].pts = filas[4].pts; filas[5].rank = 5
    await exportarRankingPdf({ categoria: 'adultos', genero: 'mixto', filas }, { marca: await marcaDePrueba(), reiniciadoEn: '2026-03-01' })
    expect(guardados.at(-1)).toContain('ranking_')
  })

  it('papeles de una fecha de liga por jornadas', async () => {
    await capturarSave()
    const pdf = await import('./liga-jornada-pdf')
    const partido = (hora: string, mesa: number, a: number, b: number, arb: number, jugado = true) => ({
      hora, mesa, jugadorA: nombres[a], jugadorB: nombres[b], arbitro: nombres[arb],
      estado: jugado ? (a === 2 ? 'walkover' : 'finalizado') : 'programado',
      setsA: jugado ? 3 : null, setsB: jugado ? (a % 2) : null,
      parciales: jugado ? [[11, 7], [11, 9], [9, 11], [11, 5]] as Array<[number, number]> : null,
    })
    const jornada = {
      numero: 2,
      dias: [
        { fecha: '2026-09-19', divisiones: [
          { nombre: 'Honor', mesas: [1, 2, 3], partidos: [partido('15:00', 1, 0, 1, 4), partido('15:00', 2, 2, 3, 5), partido('15:00', 3, 4, 5, 0), partido('15:40', 1, 0, 2, 3), partido('15:40', 2, 1, 5, 4), partido('15:40', 3, 3, 4, 2, false)] },
          { nombre: 'Primera', mesas: [4, 5, 6], partidos: [partido('15:00', 4, 6, 7, 8), partido('15:00', 5, 8, 9, 6), partido('15:40', 4, 6, 9, 7, false), partido('15:40', 5, 7, 8, 9, false)] },
        ] },
        { fecha: '2026-09-20', divisiones: [
          { nombre: 'Segunda', mesas: [1, 2], partidos: [partido('11:00', 1, 10, 11, 12), partido('11:00', 2, 12, 13, 10), partido('11:40', 1, 10, 13, 11, false)] },
        ] },
      ],
    }
    const meta = { marca: await marcaDePrueba(), ligaNombre: 'Liga Individual SpinHouse 2026', pie: 'Espera máxima 15 minutos. Partidos al mejor de 5 sets. Consultas: +56 9 1234 5678' }
    await pdf.descargarJornadaPdf(jornada, meta)
    await pdf.descargarPlanillasJornadaPdf(jornada, meta)
    await pdf.descargarResultadosJornadaPdf(jornada, meta)
    expect(guardados.slice(-3).join('|')).toMatch(/Fecha 2/)
  })

  it('tabla de posiciones de una división', async () => {
    await capturarSave()
    const { descargarTablaDivisionPdf } = await import('./liga-tabla-pdf')
    const ranking = nombres.slice(0, 10).map((_, i) => ({ jugadorId: `j${i}`, pj: 9, pg: 9 - i, pp: i, pts: (9 - i) * 2, sf: 27 - i * 2, sc: i * 2 + 3, ds: 24 - i * 4, pf: 300 - i * 10, pc: 200 + i * 12, dp: 100 - i * 22 }))
    await descargarTablaDivisionPdf({ marca: await marcaDePrueba(), ligaNombre: 'Liga Individual SpinHouse 2026', nombreDivision: 'Honor', ranking, nombreDe: id => nombres[Number(id.slice(1))] })
    expect(guardados.at(-1)).toContain('tabla_Honor')
  })

  it('historial de un bloque', async () => {
    await capturarSave()
    const { exportarHistorialBloquePdf } = await import('./historial-bloque-pdf')
    const filas = []
    for (const fecha of ['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-15']) {
      for (let i = 0; i < 8; i++) if ((i + Number(fecha.slice(8))) % 3 !== 0) filas.push({ jugadorId: `j${i}`, jugadorNombre: nombres[i], fecha, bloqueId: 'b1', bloqueNombre: 'Menores A', horario: '17:00–18:30', sede: 'Sede Centro', inferido: false })
    }
    await exportarHistorialBloquePdf({ clubNombre: 'Spinhouse', marca: await marcaDePrueba(), bloqueNombre: 'Menores A', sede: 'Sede Centro', horario: '17:00–18:30', desde: '2026-09-01', hasta: '2026-09-15', filas })
    expect(guardados.at(-1)).toContain('historial_')
  })

  it('panorama de asistencia, masivo e individual', async () => {
    await capturarSave()
    const { exportarPanoramaPdf, exportarPanoramaIndividualPdf } = await import('./panorama-asistencia-pdf')
    const desde = '2026-08-17', hasta = '2026-09-12'
    const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
    const cals = nombres.slice(0, 10).map((n, i) => {
      const dias = []
      for (let d = new Date(desde + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
        const dow = d.getUTCDay()
        const grupo = i % 2 === 0 ? { dias: [1, 3, 5], nombre: 'Menores A' } : { dias: [2, 4], nombre: 'Adultos' }
        if (!grupo.dias.includes(dow)) continue
        const k = d.getUTCDate() + i
        dias.push({ fecha: d.toISOString().slice(0, 10), dia: DIAS[dow], estado: (k % 5 === 0 ? 'ausente' : k % 11 === 0 ? 'pendiente' : 'presente') as 'presente' | 'ausente' | 'pendiente', bloques: [grupo.nombre], bloqueIds: [grupo.nombre], extra: k % 13 === 0 })
      }
      return { jugador: { id: `j${i}`, nombre: n }, dias }
    })
    const meta = { clubNombre: 'Spinhouse', marca: await marcaDePrueba(), periodo: 'Últimas 4 semanas', desde, hasta }
    await exportarPanoramaPdf(cals, meta)
    await exportarPanoramaIndividualPdf(cals.slice(0, 2), meta)
    expect(guardados.slice(-2).join('|')).toContain('panorama_asistencia')
  })
})
