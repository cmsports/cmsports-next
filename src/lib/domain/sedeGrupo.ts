// Sedes y grupos de entrenamiento de la Asociación Buin.
// El valor guardado en la base es la clave corta; el label es lo que se muestra.

export const SEDES = [
  { value: 'buin',  label: 'Buin (Aníbal Pinto 158)' },
  { value: 'paine', label: 'Paine (Centro deportivo Fátima)' },
  { value: 'ambos', label: 'Ambos centros' },
] as const

export const GRUPOS = [
  { value: 'MEN', label: 'MEN — Menores' },
  { value: 'ADU', label: 'ADU — Adultos' },
] as const

export function sedeLabel(sede: string | null | undefined): string {
  if (!sede) return '—'
  return SEDES.find(s => s.value === sede)?.label ?? sede
}

export function grupoLabel(grupo: string | null | undefined): string {
  if (!grupo) return '—'
  return GRUPOS.find(g => g.value === grupo)?.label ?? grupo
}

// Quien entrena en "ambos" también aparece al filtrar por Buin o por Paine.
export function entrenaEnSede(sedeJugador: string | null | undefined, sedeBuscada: string): boolean {
  if (!sedeJugador) return false
  if (sedeJugador === sedeBuscada) return true
  return sedeJugador === 'ambos' && (sedeBuscada === 'buin' || sedeBuscada === 'paine')
}
