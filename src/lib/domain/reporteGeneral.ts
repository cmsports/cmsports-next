// El análisis del Reporte General: de los datos crudos del período a las
// cifras, los hallazgos y las listas que se imprimen. Vive acá y no en la
// pantalla porque lo usan dos lados (la vista previa y el PDF) y porque así
// se puede probar sin levantar Supabase.

import { ETIQUETAS } from './categoriasFinanzas'

const catLabel = ETIQUETAS

export type Tono = 'bien' | 'ojo' | 'mal' | 'info' | 'neutro'
export type Dato = { etiqueta: string; valor: string; detalle?: string; tono: Tono }
export type Hallazgo = { texto: string; tono: Tono }

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function analizarGeneral(p: any, fmt: (n: number) => string) {
  const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '—')
  const mayor = (d: Record<string, number>) => Object.entries(d || {}).sort((a, b) => b[1] - a[1])[0]
  const nombreCat = (c: string) => catLabel[c] || c

  const balance = p.ingresos - p.gastos
  const balancePrev = (p.ingresosPrev ?? 0) - (p.gastosPrev ?? 0)
  const activos = p.activos.length
  const inactivos = p.jugadores.length - activos

  const impagas = (p.mensualidades || []).filter((m: any) => m.estado === 'pendiente' || m.estado === 'atrasado')
  const deudaPeriodo = impagas.reduce((s: number, m: any) => s + (m.monto || 0), 0)
  const cobrado = (p.mensualidades || []).filter((m: any) => m.estado === 'pagado').reduce((s: number, m: any) => s + (m.monto || 0), 0)
  const emitido = cobrado + deudaPeriodo
  const cobranza = emitido > 0 ? Math.round((cobrado / emitido) * 100) : 0

  const asistPorJug = new Map<string, number>()
  for (const a of (p.asistencias || [])) asistPorJug.set(a.jugador_id, (asistPorJug.get(a.jugador_id) ?? 0) + 1)
  const sinVenir = p.activos.filter((j: any) => !asistPorJug.has(j.id))
  const morososQueVienen = p.morosos.filter((j: any) => (asistPorJug.get(j.id) ?? 0) > 0).length
  const ocupacion = activos > 0 ? Math.round((p.promedioAsist / activos) * 100) : 0

  const conClase = (Object.entries(p.porDiaSemana || {}) as [string, number][]).filter(([, v]) => v > 0)
  const diaFuerte = [...conClase].sort((a, b) => b[1] - a[1])[0]
  const diaFlojo = [...conClase].sort((a, b) => a[1] - b[1])[0]

  const topIngreso = mayor(p.desgloseIngresos)
  const topGasto = mayor(p.desgloseGastos)
  const varia = (actual: number, previo: number) => {
    if (!previo) return { texto: 'sin período anterior con qué comparar', sube: true }
    const v = Math.round(((actual - previo) / Math.abs(previo)) * 100)
    return { texto: `${v >= 0 ? '+' : ''}${v}% vs ${p.tituloPrev}`, sube: v >= 0, pct: v }
  }
  const vBalance = varia(balance, balancePrev)
  const vIngresos = varia(p.ingresos, p.ingresosPrev ?? 0)
  const vGastos = varia(p.gastos, p.gastosPrev ?? 0)
  const vAsist = varia(p.asistencias.length, p.asistPrev ?? 0)

  // Solo entra el hallazgo que el dato justifica. Si no hay nada que decir, se
  // dice eso mismo: un reporte que no afirma nada es peor que uno corto.
  const hallazgos: Hallazgo[] = []
  if (balance < 0) hallazgos.push({ texto: `El período cerró con resultado negativo: los gastos superaron a los ingresos en ${fmt(Math.abs(balance))}.`, tono: 'mal' })
  else if ((p.ingresosPrev ?? 0) > 0 && !vBalance.sube) hallazgos.push({ texto: `El resultado disminuyó ${vBalance.texto}, aunque el período cerró con saldo positivo.`, tono: 'ojo' })
  if (topIngreso && p.ingresos > 0 && topIngreso[1] / p.ingresos > 0.5)
    hallazgos.push({ texto: `${nombreCat(topIngreso[0])} representa el ${pct(topIngreso[1], p.ingresos)} de los ingresos: existe una alta dependencia de una sola fuente.`, tono: 'ojo' })
  if (topGasto && p.gastos > 0)
    hallazgos.push({ texto: `${nombreCat(topGasto[0])} concentra el ${pct(topGasto[1], p.gastos)} de los gastos (${fmt(topGasto[1])}).`, tono: 'neutro' })
  if (deudaPeriodo > 0)
    hallazgos.push({ texto: `Quedan ${fmt(deudaPeriodo)} pendientes de cobro en ${impagas.length} cuotas: se recaudó el ${cobranza}% de lo emitido.`, tono: cobranza >= 90 ? 'ojo' : 'mal' })
  if (morososQueVienen > 0)
    hallazgos.push({ texto: `${morososQueVienen} de los ${p.morosos.length} jugadores con cuotas pendientes asisten regularmente a entrenar.`, tono: 'ojo' })
  if (sinVenir.length > 0)
    hallazgos.push({ texto: `${sinVenir.length} jugadores activos (${pct(sinVenir.length, activos)} del plantel) no registran asistencia en el período.`, tono: 'mal' })
  if ((p.asistPrev ?? 0) > 0 && !vAsist.sube)
    hallazgos.push({ texto: `La asistencia disminuyó ${vAsist.texto}.`, tono: 'mal' })
  if (diaFuerte && diaFlojo && diaFuerte[0] !== diaFlojo[0] && diaFlojo[1] * 2 < diaFuerte[1])
    hallazgos.push({ texto: `${DIAS_SEMANA[+diaFuerte[0]]} concentra ${diaFuerte[1]} asistencias y ${DIAS_SEMANA[+diaFlojo[0]]} solo ${diaFlojo[1]}: hay capacidad disponible en ese horario.`, tono: 'info' })
  if (hallazgos.length === 0)
    hallazgos.push({ texto: 'Sin cuotas pendientes, sin jugadores ausentes en todo el período y con resultado positivo.', tono: 'bien' })

  const plata: Dato[] = [
    { etiqueta: 'Ingresos', valor: fmt(p.ingresos), detalle: vIngresos.texto, tono: 'bien' },
    { etiqueta: 'Gastos', valor: fmt(p.gastos), detalle: vGastos.texto, tono: 'mal' },
    { etiqueta: 'Resultado', valor: fmt(balance), detalle: `antes: ${fmt(balancePrev)}`, tono: balance >= 0 ? 'bien' : 'mal' },
    { etiqueta: 'Principal ingreso', valor: topIngreso ? nombreCat(topIngreso[0]) : '—', detalle: topIngreso ? `${fmt(topIngreso[1])} · ${pct(topIngreso[1], p.ingresos)} del total` : 'sin ingresos', tono: 'bien' },
    { etiqueta: 'Principal gasto', valor: topGasto ? nombreCat(topGasto[0]) : '—', detalle: topGasto ? `${fmt(topGasto[1])} · ${pct(topGasto[1], p.gastos)} del total` : 'sin gastos', tono: 'mal' },
    { etiqueta: 'Cobranza del período', valor: `${cobranza}%`, detalle: `${fmt(cobrado)} de ${fmt(emitido)} emitido`, tono: cobranza >= 90 ? 'bien' : cobranza >= 70 ? 'ojo' : 'mal' },
    { etiqueta: 'Por cobrar', valor: fmt(deudaPeriodo), detalle: `${impagas.length} cuotas · ${p.morosos.length} jugadores`, tono: deudaPeriodo > 0 ? 'mal' : 'bien' },
    { etiqueta: 'Deja cada alumno', valor: activos > 0 ? fmt(Math.round(p.ingresos / activos)) : '—', detalle: activos > 0 ? `y cuesta ${fmt(Math.round(p.gastos / activos))}` : 'sin activos', tono: 'info' },
    { etiqueta: 'Margen por alumno', valor: activos > 0 ? fmt(Math.round(balance / activos)) : '—', detalle: `sobre ${activos} activos`, tono: balance >= 0 ? 'bien' : 'mal' },
  ]

  const gente: Dato[] = [
    { etiqueta: 'Plantel activo', valor: String(activos), detalle: `${p.jugadores.length} fichas en total`, tono: 'info' },
    { etiqueta: 'Fuera del plantel', valor: String(inactivos), detalle: 'inactivos, retirados o suspendidos', tono: inactivos > 0 ? 'ojo' : 'bien' },
    { etiqueta: 'Días con clase', valor: String(p.diasConAsist), detalle: 'días con asistencia registrada', tono: 'info' },
    { etiqueta: 'Asistencias', valor: String(p.asistencias.length), detalle: vAsist.texto, tono: vAsist.sube ? 'bien' : 'mal' },
    { etiqueta: 'Promedio por clase', valor: `${p.promedioAsist} jugadores`, detalle: `ocupación ${ocupacion}% del plantel`, tono: ocupacion >= 50 ? 'bien' : ocupacion >= 30 ? 'ojo' : 'mal' },
    { etiqueta: 'No vinieron nunca', valor: String(sinVenir.length), detalle: activos > 0 ? `${pct(sinVenir.length, activos)} de los activos` : '—', tono: sinVenir.length > 0 ? 'mal' : 'bien' },
    { etiqueta: 'Día más fuerte', valor: diaFuerte ? DIAS_SEMANA[+diaFuerte[0]] : '—', detalle: diaFuerte ? `${diaFuerte[1]} asistencias` : 'sin registros', tono: 'info' },
    { etiqueta: 'Día más flojo', valor: diaFlojo ? DIAS_SEMANA[+diaFlojo[0]] : '—', detalle: diaFlojo ? `${diaFlojo[1]} asistencias` : 'sin registros', tono: 'ojo' },
    { etiqueta: 'Competencia', valor: `${p.torneos.length} torneos`, detalle: p.torneos.length > 0 ? p.torneos.map((t: any) => t.nombre).slice(0, 2).join(' · ') : 'ninguno en el período', tono: 'info' },
  ]

  return { balance, balancePrev, activos, deudaPeriodo, impagas, cobranza, asistPorJug, sinVenir, morososQueVienen, ocupacion, hallazgos, plata, gente, pct }
}


