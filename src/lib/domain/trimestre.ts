export function trimestreActual(fecha?: Date): string {
  const d = fecha ?? new Date()
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}-${d.getFullYear()}`
}
