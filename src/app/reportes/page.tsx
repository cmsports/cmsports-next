import { redirect } from 'next/navigation'

/**
 * `/reportes` era una copia vieja del reporte que hoy vive en la pestaña
 * Reportes de Finanzas: mismas cinco categorías, otro generador de PDF y sin
 * el ojito que oculta los montos. No estaba en el menú, pero seguía accesible
 * escribiendo la URL (proxy.ts la permite), así que había dos versiones del
 * mismo reporte que mantener en paralelo.
 *
 * Se deja la ruta viva como redirección para no romper un enlace guardado.
 */
export default function ReportesRedirect() {
  redirect('/finanzas?tab=reportes')
}
