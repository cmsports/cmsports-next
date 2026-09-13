import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Igual que reporte-general-pdf.preview.test.ts: arma el reporte de
// asistencia con datos inventados y lo deja en PDF_PREVIEW_DIR para mirarlo.

vi.stubGlobal('fetch', async (url: string) => {
  const ruta = join(process.cwd(), 'public', String(url))
  if (!existsSync(ruta)) return { ok: false } as Response
  const buf = readFileSync(ruta)
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response
})

const sumar = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10) }
const dow = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay()

function datosDePrueba() {
  const nombres = ['Agustín Pérez', 'Amanda González', 'Bruno González', 'Catalina Pérez', 'Cristóbal López', 'Diego Araya', 'Florencia Martínez', 'Gaspar Hernández', 'Josefa Morales', 'Lucas Martínez', 'Martín Espinoza', 'Renata López', 'Tomás Morales', 'Valentina Díaz', 'Vicente Silva', 'Antonia Rojas', 'Benjamín Castro', 'Emilia Soto']
  const grupos = [
    { nombre: 'Menores 17:00', horario: '17:00–18:30', sede: 'Sede Centro', dias: [1, 3, 5] },
    { nombre: 'Adultos 19:00', horario: '19:00–20:30', sede: 'Sede Centro', dias: [2, 3, 4] },
    { nombre: 'Competencia', horario: '20:30–22:00', sede: 'Sede Norte', dias: [1, 2, 4] },
  ]
  const activos = nombres.map((n, i) => ({ id: `j${i}`, nombre: n, categoria: i % 3 === 0 ? 'Menores' : 'Adultos', dias: grupos[i % 3].dias }))
  const desde = '2026-08-01', hasta = '2026-09-12'
  const porDia: Record<string, number> = {}
  const porDiaSemana: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  const porJugador: Record<string, { nombre: string; count: number }> = {}
  const historialDetallado: Array<{ jugadorNombre: string; fecha: string; bloqueNombre: string; horario: string; sede: string }> = []
  let k = 0
  for (let d = desde; d <= hasta; d = sumar(d, 1)) {
    activos.forEach((j, i) => {
      if (!j.dias.includes(dow(d))) return
      k++
      // Tres perfiles: constantes, intermitentes y dos que nunca vienen.
      const viene = i >= 16 ? false : i % 4 === 3 ? k % 3 === 0 : (k + i) % 6 !== 0
      if (!viene) return
      porDia[d] = (porDia[d] ?? 0) + 1
      porDiaSemana[dow(d)]++
      porJugador[j.id] = porJugador[j.id] ?? { nombre: j.nombre, count: 0 }
      porJugador[j.id].count++
      const g = grupos[i % 3]
      historialDetallado.push({ jugadorNombre: j.nombre, fecha: d, bloqueNombre: g.nombre, horario: g.horario, sede: g.sede })
    })
  }
  const totalAsist = Object.values(porDia).reduce((s, n) => s + n, 0)
  return { desde, hasta, totalAsist, totalPrev: Math.round(totalAsist * 0.86), tituloPrev: 'el período anterior', porDia, porDiaSemana, activos, porJugador, historialDetallado }
}

describe('reporte de asistencia v2', () => {
  it('evalúa el plantel contra los días de cada jugador', async () => {
    const { evaluarPlantel, analizarAsistencia } = await import('./reporte-asistencia-pdf')
    const p = datosDePrueba()
    const plantel = evaluarPlantel(p)
    expect(plantel).toHaveLength(18)
    // Los dos que nunca vienen quedan al final con 0.
    expect(plantel.slice(-2).map(j => j.clases)).toEqual([0, 0])
    // Nadie pasa del 100% ni tiene más esperadas que días del período.
    for (const j of plantel) { expect(j.pct).toBeLessThanOrEqual(100); expect(j.esperadas).toBeLessThanOrEqual(43) }
    const textos = analizarAsistencia(p).map(h => h.texto)
    expect(textos.some(t => t.includes('no asistieron ni una vez'))).toBe(true)
    expect(textos.some(t => t.includes('subieron un'))).toBe(true)
  })

  it('se arma con datos de prueba y se deja en disco para mirarlo', async () => {
    const { construirReporteAsistencia } = await import('./reporte-asistencia-pdf')
    const { marcaDelClub } = await import('@/lib/pdf/papel')
    const marca = await marcaDelClub({ nombre: 'Spinhouse', logo_url: null })
    marca.acento = [219, 39, 119]
    const doc = await construirReporteAsistencia({ marca, periodo: 'Agosto a septiembre 2026', generado: '12-09-2026', datos: datosDePrueba() })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3)
    const salida = process.env.PDF_PREVIEW_DIR
    if (salida) writeFileSync(join(salida, 'reporte-asistencia-preview.pdf'), Buffer.from(doc.output('arraybuffer')))
  })
})
