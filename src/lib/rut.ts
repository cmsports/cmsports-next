export function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length <= 1) return clean
  return clean.slice(0, -1) + '-' + clean.slice(-1)
}
