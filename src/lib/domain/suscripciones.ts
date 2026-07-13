export type EstadoPlan = 'prueba' | 'activo' | 'suspendido' | 'cancelado'

export function sumarMesesISO(fecha: string, meses = 1): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const indiceMes = mes - 1 + meses
  const anioDestino = anio + Math.floor(indiceMes / 12)
  const mesDestino = ((indiceMes % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate()
  return `${anioDestino}-${String(mesDestino + 1).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`
}

export function hoyISO(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

export function planVencido(estado: EstadoPlan | string | null, proximoVencimiento: string | null, hoy = hoyISO()): boolean {
  return estado === 'activo' && !!proximoVencimiento && proximoVencimiento <= hoy
}

export function diasParaVencimiento(proximoVencimiento: string, hoy = hoyISO()): number {
  const a = Date.parse(`${hoy}T00:00:00Z`)
  const b = Date.parse(`${proximoVencimiento}T00:00:00Z`)
  return Math.ceil((b - a) / 86_400_000)
}

