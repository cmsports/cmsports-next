/** Mensajes de PostgREST / Postgres al abrir el marcador tablet. */
export function traducirErrorMarcadorTecnico(raw: string | null | undefined): string {
  const m = String(raw || '').trim()
  if (!m) return 'No se pudo abrir el marcador técnico'

  const lower = m.toLowerCase()

  if (lower.includes('marcador_id') && (lower.includes('does not exist') || lower.includes('schema cache'))) {
    return 'Falta la columna marcador_id. Pegá la migración 156 (y 179 para el FK) en el SQL Editor.'
  }
  if (lower.includes('tecnico_partidos') && (lower.includes('does not exist') || lower.includes('schema cache'))) {
    return 'Falta la tabla del marcador técnico. Pegá la migración 175_tecnico_marcador_partidos en el SQL Editor.'
  }
  if (lower.includes('row-level security') || (lower.includes('violates') && lower.includes('policy'))) {
    return 'No hay permiso para crear el marcador técnico en este club.'
  }
  if (lower.includes('creado_por') && (lower.includes('foreign key') || lower.includes('violates'))) {
    return 'No se pudo vincular el marcador al usuario. Recargá la sesión e intentá de nuevo.'
  }
  if (lower.includes('formato') && lower.includes('check')) {
    return 'El formato del partido no es válido para el marcador (usa BO3, BO5 o BO7).'
  }
  if (lower.includes('not authenticated') || lower.includes('no autenticado')) {
    return 'Sesión vencida. Entrá de nuevo y abrí el marcador.'
  }
  if (lower.includes('acceso denegado')) {
    return 'Solo el admin del club puede abrir el marcador técnico.'
  }

  return m
}
