import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Igual que reporte-general-pdf.preview.test.ts: arma el informe del jugador
// con datos inventados y lo deja en PDF_PREVIEW_DIR para mirarlo.

vi.stubGlobal('fetch', async (url: string) => {
  const ruta = join(process.cwd(), 'public', String(url))
  if (!existsSync(ruta)) return { ok: false } as Response
  const buf = readFileSync(ruta)
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response
})

describe('informe del jugador v2', () => {
  it('se arma con datos de prueba y se deja en disco para mirarlo', async () => {
    const { construirReporteJugador } = await import('./reporte-jugador-pdf')
    const { marcaDelClub } = await import('@/lib/pdf/papel')
    const marca = await marcaDelClub({ nombre: 'Spinhouse', logo_url: null })
    marca.acento = [219, 39, 119]
    // 90 días hasta el 12-09-2026, clases martes, miércoles y jueves.
    const asistio = new Set<string>()
    const desde = '2026-06-15', hasta = '2026-09-12'
    const sumar = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10) }
    let k = 0
    for (let d = desde; d <= hasta; d = sumar(d, 1), k++) {
      const dow = new Date(d + 'T12:00:00Z').getUTCDay()
      if ([2, 3, 4].includes(dow) && k % 5 !== 0 && k % 7 !== 3) asistio.add(d)
    }
    const doc = await construirReporteJugador({
      marca, generado: '12-09-2026', periodo: 'últimos 90 días',
      jugador: {
        nombre: 'Agustín Pérez', categoria: 'Adultos', estado: 'activo', edad: 37, rut: '16.789.123-4', telefono: '+56 9 9006 3352', email: 'agustin@correo.cl', fechaNacimiento: '1989-08-16',
        plan: { tipo: 'mensual', mensualidad: 35000, horario: '19:00–20:30', dias: ['Martes', 'Miércoles', 'Jueves'], entrenamientosSemana: 3 },
        contactoEmergencia: { nombre: 'Carolina Pérez', telefono: '+56 9 1234 5678' },
        asistencia: { desde, hasta, asistio, diasDeClase: [2, 3, 4] },
        mensualidades: [
          { mes: 9, anio: 2026, monto: 35000, estado: 'pendiente' },
          { mes: 8, anio: 2026, monto: 35000, estado: 'pagado', fecha_pago: '2026-08-04' },
          { mes: 7, anio: 2026, monto: 35000, estado: 'pagado', fecha_pago: '2026-07-06' },
          { mes: 6, anio: 2026, monto: 35000, estado: 'pagado', fecha_pago: '2026-06-02' },
        ],
        rankings: [{ categoria: 'Adultos', rank: 3, total: 24, pts: 118, victorias: 9, jugados: 12 }],
        torneos: [{ nombre: 'Copa Primavera', fecha: '2026-09-05', estado: 'finalizado' }, { nombre: 'Torneo Invierno', fecha: '2026-07-19', estado: 'finalizado' }],
        ligas: [{ liga: 'Liga Individual SpinHouse 2026', division: 'Primera División' }],
      },
    })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    const salida = process.env.PDF_PREVIEW_DIR
    if (salida) writeFileSync(join(salida, 'reporte-jugador-preview.pdf'), Buffer.from(doc.output('arraybuffer')))
  })
})
