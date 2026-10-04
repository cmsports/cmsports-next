/** Los importes son CLP enteros; ninguna cuota se reparte entre bloques implícitamente. */
export const TIPOS_FINANZAS = ['grupal', 'competitivo', 'particular', 'adultos', 'paralimpico', 'arriendo'] as const
export type TipoFinanzas = typeof TIPOS_FINANZAS[number]
export type SesionFinanciera = { asistencia_id: string; profesor_id: string; profesor_nombre: string; bloque_id: string; bloque_nombre: string; fecha: string; minutos: number | null; tipo_clase: string | null; rol: string | null; se_cobra_aparte: boolean | null }
export type TarifaFinanciera = { profesor_id: string; tipo_clase: string; rol: string; desde: string; monto_hora: number }
export type DetalleLiquidacion = SesionFinanciera & { monto_hora: number; costo: number }
export type IngresoFinanciero = { id: string; categoria: string; descripcion: string | null; monto: number; bloque_id: string | null; linea: string | null }
export type CuotaFinanciera = { mes: number; anio: number; monto: number | null; estado: string | null }
export type LiquidacionFinanciera = { id: string; profesor_id: string; profesor_nombre: string; total: number; minutos: number; detalles: DetalleLiquidacion[] }
export type DatosFinanzasSpinhouse = { sesiones: SesionFinanciera[]; tarifas: TarifaFinanciera[]; ingresos: IngresoFinanciero[]; cuotas: CuotaFinanciera[]; liquidaciones: LiquidacionFinanciera[]; profesores: { id: string; nombre: string }[]; bloques: { id: string; nombre: string; tipo_clase: string | null }[] }

export function calcularLiquidacion(sesiones: SesionFinanciera[], tarifas: TarifaFinanciera[]) {
  const detalles: DetalleLiquidacion[] = []
  const pendientes: { sesion: SesionFinanciera; motivo: string }[] = []
  for (const sesion of sesiones) {
    if (!sesion.minutos || !sesion.tipo_clase || !sesion.rol || (sesion.tipo_clase !== 'arriendo' && typeof sesion.se_cobra_aparte !== 'boolean')) {
      pendientes.push({ sesion, motivo: 'Falta confirmar duración, tipo de clase, rol y modalidad de cobro históricos' }); continue
    }
    const tarifa = tarifas.filter(t => t.profesor_id === sesion.profesor_id && t.tipo_clase === sesion.tipo_clase && t.rol === sesion.rol && t.desde <= sesion.fecha).sort((a, b) => b.desde.localeCompare(a.desde))[0]
    if (!tarifa) { pendientes.push({ sesion, motivo: 'Falta tarifa vigente para esta clase y rol' }); continue }
    detalles.push({ ...sesion, monto_hora: tarifa.monto_hora, costo: Math.round(sesion.minutos * tarifa.monto_hora / 60) })
  }
  return { detalles, pendientes, total: detalles.reduce((sum, d) => sum + d.costo, 0) }
}

/** La modalidad de clase determina la línea del costo; la categoría contable
 * determina la del ingreso. Asignar un bloque nunca reclasifica su negocio.
 * Arriendo de cancha y de mesa se consolidan en la línea Arriendo. */
export function lineaNegocioFinanciera(clave: string): string {
  switch (clave) {
    case 'grupal':
    case 'competitivo':
    case 'adultos':
    case 'paralimpico': return 'mensualidad'
    case 'particular': return 'clase_particular'
    case 'arriendo_mesa':
    case 'arriendo_cancha':
    case 'arriendo': return 'arriendo'
    default: return clave
  }
}

/** El cobro congelado distingue clases incluidas en planes de cobros aparte. */
export function lineaNegocioClase(tipo: string, cobroAparte: boolean | null): string {
  if (tipo === 'arriendo') return 'arriendo'
  if (cobroAparte === false) return 'mensualidad'
  if (cobroAparte === true) return tipo === 'particular' ? 'clase_particular' : 'clase_extraordinaria'
  return 'sin_linea_confirmada'
}

export function calcularMargenes(ingresos: IngresoFinanciero[], detalles: DetalleLiquidacion[]) {
  const bloques = new Map<string, { clave: string; nombre: string; ingresos: number; costo: number }>()
  const lineas = new Map<string, { clave: string; nombre: string; ingresos: number; costo: number }>()
  function fila(map: typeof bloques, clave: string, nombre: string) { if (!map.has(clave)) map.set(clave, { clave, nombre, ingresos: 0, costo: 0 }); return map.get(clave)! }
  for (const d of detalles) {
    fila(bloques, d.bloque_id, d.bloque_nombre).costo += d.costo
    const linea = lineaNegocioClase(d.tipo_clase!, d.se_cobra_aparte)
    fila(lineas, linea, linea === 'arriendo' ? 'Arriendo' : linea).costo += d.costo
  }
  for (const ingreso of ingresos) {
    const bloque = ingreso.bloque_id ?? 'sin_asignar'
    fila(bloques, bloque, bloques.get(bloque)?.nombre ?? (bloque === 'sin_asignar' ? 'Sin bloque asignado' : bloque)).ingresos += ingreso.monto
    const linea = lineaNegocioFinanciera(ingreso.categoria)
    fila(lineas, linea, linea === 'arriendo' ? 'Arriendo' : linea).ingresos += ingreso.monto
  }
  const salida = (map: typeof bloques) => [...map.values()].map(f => ({ ...f, margen: f.ingresos - f.costo }))
  return { bloques: salida(bloques), lineas: salida(lineas) }
}

/** Proyección del mes siguiente: cuotas emitidas × proporción histórica pagada (ponderada por monto). */
export function proyectarCaja(cuotas: CuotaFinanciera[], mes: number, anio: number) {
  const indice = (c: Pick<CuotaFinanciera, 'mes' | 'anio'>) => c.anio * 12 + c.mes
  const actual = anio * 12 + mes
  const historicas = cuotas.filter(c => indice(c) < actual && indice(c) >= actual - 6 && c.estado !== 'exento')
  const emitidoHistorico = historicas.reduce((s, c) => s + (c.monto ?? 0), 0)
  const pagadoHistorico = historicas.filter(c => c.estado === 'pagado').reduce((s, c) => s + (c.monto ?? 0), 0)
  const base = cuotas.filter(c => indice(c) === actual + 1 && c.estado !== 'exento')
  const emitido = base.reduce((s, c) => s + (c.monto ?? 0), 0)
  const tasaCobro = emitidoHistorico > 0 ? pagadoHistorico / emitidoHistorico : null
  return { emitido, cantidadCuotas: base.length, tasaCobro, morosidad: tasaCobro === null ? null : 1 - tasaCobro, proyectado: base.length && tasaCobro !== null ? Math.round(emitido * tasaCobro) : null, emitidoHistorico }
}
