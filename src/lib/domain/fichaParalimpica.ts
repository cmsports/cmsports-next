export type ModalidadParalimpica = 'sentado' | 'de_pie' | 'intelectual'

export const MODALIDADES_PARALIMPICAS = [
  { valor: 'sentado', etiqueta: 'Sentado (clases 1–5)', clases: [1, 2, 3, 4, 5] },
  { valor: 'de_pie', etiqueta: 'De pie (clases 6–10)', clases: [6, 7, 8, 9, 10] },
  { valor: 'intelectual', etiqueta: 'Discapacidad intelectual (clase 11)', clases: [11] },
] as const

export function validarClaseParalimpica(modalidad: string | null, clase: number | null): string | null {
  if (modalidad === null && clase === null) return null
  const opcion = MODALIDADES_PARALIMPICAS.find(m => m.valor === modalidad)
  if (!opcion) return 'Selecciona la modalidad de la clasificación deportiva.'
  if (clase === null) return null // Clasificación pendiente, sin inventar una clase.
  if (!Number.isInteger(clase) || !(opcion.clases as readonly number[]).includes(clase)) {
    return 'La clase debe corresponder a la modalidad: sentado 1–5, de pie 6–10 o intelectual 11.'
  }
  return null
}

export function requiereApoderado(fechaNacimiento: string | null, fechaFirma: string): boolean {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return true
  const [anio, mes, dia] = fechaNacimiento.split('-').map(Number)
  const [anioFirma, mesFirma, diaFirma] = fechaFirma.split('-').map(Number)
  let edad = anioFirma - anio
  if (mesFirma < mes || (mesFirma === mes && diaFirma < dia)) edad--
  return edad < 18
}

export type FichaParalimpica = {
  modalidad: ModalidadParalimpica | null
  clase_deportiva: number | null
  necesidades_accesibilidad: string | null
  actualizado_en: string
}

export type ConsentimientoSalud = {
  id: string
  otorgado: boolean
  fecha: string
  creado_en: string
  firmado_por: 'jugador' | 'apoderado'
  nombre_firmante: string
  respaldo: string
  registrado_por_nombre: string | null
}
