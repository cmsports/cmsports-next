import { describe, expect, it } from 'vitest'
import { calcularLiquidacion, calcularMargenes, proyectarCaja, lineaNegocioFinanciera, type SesionFinanciera } from './finanzasSpinhouse'

const sesion: SesionFinanciera = { asistencia_id: 'a', profesor_id: 'p', profesor_nombre: 'Ana', bloque_id: 'b', bloque_nombre: 'Adultos', fecha: '2026-09-05', minutos: 90, tipo_clase: 'adultos', rol: 'auxiliar', se_cobra_aparte: false }
const tarifa = { profesor_id: 'p', tipo_clase: 'adultos', rol: 'auxiliar', desde: '2026-09-01', monto_hora: 15001 }

describe('liquidación de Spinhouse', () => {
  it('elige la tarifa vigente por tipo y rol, redondea cada sesión y no aplica cambios futuros', () => {
    const result = calcularLiquidacion([sesion], [tarifa, { ...tarifa, desde: '2026-08-01', monto_hora: 999 }, { ...tarifa, rol: 'principal', monto_hora: 90000 }, { ...tarifa, desde: '2026-10-01', monto_hora: 30000 }])
    expect(result.total).toBe(22502)
    expect(result.detalles[0].monto_hora).toBe(15001)
    expect(result.pendientes).toEqual([])
  })
  it('mantiene pendiente una sesión sin horas congeladas o sin tarifa, sin asumir costo cero', () => {
    expect(calcularLiquidacion([{ ...sesion, minutos: null }], [tarifa]).pendientes).toHaveLength(1)
    expect(calcularLiquidacion([sesion], [{ ...tarifa, rol: 'principal' }]).pendientes).toHaveLength(1)
  })
  it('permite tarifas explícitas de cero', () => {
    expect(calcularLiquidacion([sesion], [{ ...tarifa, monto_hora: 0 }])).toMatchObject({ pendientes: [], total: 0 })
  })
  it('descuenta costos copiados de la liquidación aunque la tarifa vigente cambie', () => {
    const cerrada = calcularLiquidacion([sesion], [tarifa]).detalles
    const margen = calcularMargenes([{ id: 'i', categoria: 'mensualidad', descripcion: '', monto: 40000, bloque_id: 'b', linea: 'adultos' }], cerrada)
    expect(margen.bloques[0]).toMatchObject({ ingresos: 40000, costo: 22502, margen: 17498 })
  })
  it('no reparte ingresos sin asignación entre grupos', () => {
    const margen = calcularMargenes([{ id: 'i', categoria: 'mensualidad', descripcion: '', monto: 30000, bloque_id: null, linea: null }], calcularLiquidacion([sesion], [tarifa]).detalles)
    expect(margen.bloques.find(b => b.clave === 'sin_asignar')).toMatchObject({ ingresos: 30000, costo: 0 })
    expect(margen.bloques.find(b => b.clave === 'b')?.ingresos).toBe(0)
  })
})
describe('margen por línea de negocio', () => {
  it('une ingresos de mensualidad con costos de todas las modalidades de planes', () => {
    const modalidades = ['grupal','competitivo','adultos','paralimpico']
    const costos = modalidades.map((tipo_clase, i) => ({ ...sesion, asistencia_id: String(i), tipo_clase, monto_hora: 10000, costo: 1000 }))
    const margen = calcularMargenes([{ id: 'i', categoria: 'mensualidad', descripcion: '', monto: 15000, bloque_id: null, linea: null }], costos)
    expect(margen.lineas).toEqual([{ clave: 'mensualidad', nombre: 'mensualidad', ingresos: 15000, costo: 4000, margen: 11000 }])
  })
  it('une particulares y arriendos con sus ingresos sin depender de la asignación', () => {
    const costos = [{ ...sesion, tipo_clase: 'particular', se_cobra_aparte: true, monto_hora: 10000, costo: 1500 }, { ...sesion, asistencia_id: 'arr', tipo_clase: 'arriendo', monto_hora: 10000, costo: 2000 }]
    const ingresos = [
      { id: 'i', categoria: 'clase_particular', descripcion: '', monto: 10000, bloque_id: null, linea: null },
      { id: 'a', categoria: 'arriendo_mesa', descripcion: '', monto: 4000, bloque_id: null, linea: null },
      { id: 'b', categoria: 'arriendo_cancha', descripcion: '', monto: 5000, bloque_id: 'b', linea: 'adultos' },
    ]
    const margen = calcularMargenes(ingresos, costos)
    expect(margen.lineas.find(l => l.clave === 'clase_particular')).toMatchObject({ ingresos: 10000, costo: 1500, margen: 8500 })
    expect(margen.lineas.find(l => l.clave === 'arriendo')).toMatchObject({ ingresos: 9000, costo: 2000, margen: 7000 })
  })
  it('asignar ingreso a un bloque no cambia su categoría de negocio', () => {
    const margen = calcularMargenes([{ id: 'i', categoria: 'mensualidad', descripcion: '', monto: 30000, bloque_id: 'b', linea: 'particular' }], [{ ...sesion, tipo_clase: 'particular', se_cobra_aparte: true, monto_hora: 10000, costo: 1500 }])
    expect(margen.lineas.find(l => l.clave === 'mensualidad')).toMatchObject({ ingresos: 30000, costo: 0 })
    expect(margen.lineas.find(l => l.clave === 'clase_particular')).toMatchObject({ ingresos: 0, costo: 1500 })
    expect(margen.bloques[0]).toMatchObject({ ingresos: 30000, costo: 1500, margen: 28500 })
  })
  it('particular incluida en plan descuenta costo de mensualidad y conserva cobro congelado', () => {
    const detalle = { ...sesion, tipo_clase: 'particular', se_cobra_aparte: false, monto_hora: 10000, costo: 1500 }
    const margen = calcularMargenes([{ id: 'i', categoria: 'mensualidad', descripcion: '', monto: 30000, bloque_id: null, linea: null }], [detalle])
    expect(margen.lineas).toEqual([{ clave: 'mensualidad', nombre: 'mensualidad', ingresos: 30000, costo: 1500, margen: 28500 }])
  })
  it('clase grupal cobrada aparte usa negocio clase extra y falta flag histórico impide liquidar', () => {
    const margen = calcularMargenes([{ id: 'i', categoria: 'clase_extraordinaria', descripcion: '', monto: 5000, bloque_id: null, linea: null }], [{ ...sesion, tipo_clase: 'grupal', se_cobra_aparte: true, monto_hora: 10000, costo: 1500 }])
    expect(margen.lineas).toEqual([{ clave: 'clase_extraordinaria', nombre: 'clase_extraordinaria', ingresos: 5000, costo: 1500, margen: 3500 }])
    expect(calcularLiquidacion([{ ...sesion, se_cobra_aparte: null }], [tarifa]).pendientes).toHaveLength(1)
  })
  it('conserva torneos, liga, venta y categorías desconocidas', () => {
    for (const categoria of ['inscripcion_torneo','inscripcion_liga','venta_articulos','auspicio','otra_categoria']) expect(lineaNegocioFinanciera(categoria)).toBe(categoria)
  })
})
describe('proyección de caja con evidencia', () => {
  it('pondera por monto, excluye exentos y el mes actual, y cruza diciembre', () => {
    const result = proyectarCaja([
      { mes: 11, anio: 2026, monto: 30000, estado: 'pagado' },
      { mes: 11, anio: 2026, monto: 10000, estado: 'pendiente' },
      { mes: 11, anio: 2026, monto: 50000, estado: 'exento' },
      { mes: 12, anio: 2026, monto: 900000, estado: 'pendiente' },
      { mes: 1, anio: 2027, monto: 20000, estado: 'pendiente' },
      { mes: 5, anio: 2026, monto: 999999, estado: 'pendiente' },
    ], 12, 2026)
    expect(result).toMatchObject({ morosidad: 0.25, emitido: 20000, proyectado: 15000 })
  })
  it('no inventa una previsión si faltan cuotas o historial', () => {
    expect(proyectarCaja([], 9, 2026).proyectado).toBeNull()
    expect(proyectarCaja([{ mes: 10, anio: 2026, monto: 20000, estado: 'pendiente' }], 9, 2026).proyectado).toBeNull()
  })
})
