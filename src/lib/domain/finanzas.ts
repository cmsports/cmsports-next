// Acá vivían siete funciones de KPIs financieros (calcularResumen, calcularCOA,
// calcularKpis y compañía). Ninguna pantalla las llamaba: Finanzas y Reportes
// hacen sus sumas inline sobre los datos que ya trajeron, y estas quedaron como
// una segunda implementación que nadie ejecutaba —el peor lugar donde puede
// vivir una regla de negocio, porque parece la oficial y no lo es.
//
// Antes que ellas vivió acá montoPorPlan(), que deducía la cuota del plan de
// sesiones: se borró por lo mismo y porque la cuota la pone el profe a mano.

export function formatCLP(monto: number | null | undefined): string {
  return (monto ?? 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}
