// Aviso semanal de respaldo: aparece cada domingo y no se va hasta que se
// descarga el respaldo completo.
//
// ponytail: la fecha del último respaldo vive en localStorage, así que es por
// navegador. Si algún día hay más de una persona con cuenta superadmin y hay
// que saber quién respaldó y cuándo, esto pasa a una tabla.
export const CLAVE_ULTIMO_RESPALDO = 'cmsports:ultimo-respaldo'

// Domingo de la semana en curso (o el mismo día, si hoy es domingo), en
// formato YYYY-MM-DD. Ojo con `new Date(iso)`: se interpreta como UTC, que es
// justo lo que corre el día en Chile — por eso el mediodía.
export function domingoDeLaSemana(hoyISO: string): string {
  const d = new Date(`${hoyISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

export function tocaRespaldar(ultimoRespaldo: string | null, hoyISO: string): boolean {
  if (!ultimoRespaldo) return true
  return ultimoRespaldo < domingoDeLaSemana(hoyISO)
}

export function diasDesde(ultimoRespaldo: string, hoyISO: string): number {
  const ms = new Date(`${hoyISO}T12:00:00Z`).getTime() - new Date(`${ultimoRespaldo}T12:00:00Z`).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}
