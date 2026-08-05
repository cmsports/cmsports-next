// Registro único de campos exportables de un jugador. Excel y PDF leen de
// acá — así ninguno de los dos inventa su propio formato para lo mismo
// (un booleano, una fecha, la mensualidad) y quedan siempre consistentes.
//
// credencial_visible (contraseñas en texto plano) y las URLs firmadas de
// foto no tienen entrada acá a propósito: no son datos que deban poder
// terminar en un archivo exportado, así que no existen como opción.

import { grupoLabel, sedeLabel } from '@/lib/domain/sedeGrupo'
import { SIN_CUOTA } from '@/lib/domain/mensualidades'

export type GrupoCampoId = 'basico' | 'contacto' | 'deportivo' | 'membresia' | 'federado' | 'emergencia' | 'tallas'

export type ContextoExportJugadores = {
  estadoPago: Record<string, string>
  asistenciaHoy: Set<string>
  conDocumento: Set<string>
}

export type CampoJugador = {
  id: string
  etiqueta: string
  grupo: GrupoCampoId
  porDefecto: boolean
  texto: (j: any, ctx: ContextoExportJugadores) => string
  /** Solo si el valor debe quedar numérico/crudo en Excel (ver mensualidad). Si falta, Excel usa `texto`. */
  valorExcel?: (j: any, ctx: ContextoExportJugadores) => string | number
}

export const GRUPOS_CAMPOS_JUGADOR: { id: GrupoCampoId; etiqueta: string }[] = [
  { id: 'basico',     etiqueta: 'Datos básicos' },
  { id: 'contacto',   etiqueta: 'Contacto y personal' },
  { id: 'deportivo',  etiqueta: 'Deportivo' },
  { id: 'membresia',  etiqueta: 'Membresía y pago' },
  { id: 'federado',   etiqueta: 'Federación' },
  { id: 'emergencia', etiqueta: 'Contacto de emergencia' },
  { id: 'tallas',     etiqueta: 'Tallas' },
]

export function calcularEdad(fechaNacimiento: string | null | undefined): number | null {
  if (!fechaNacimiento) return null
  const anio = parseInt(fechaNacimiento.slice(0, 4))
  if (Number.isNaN(anio)) return null
  return new Date().getFullYear() - anio
}

const diasEntrenamiento = (j: any) =>
  ['lun', 'mar', 'mie', 'jue', 'vie'].filter(d => j[`entrena_${d}`]).join('-') || 'sin horario'

const fechaLegible = (f: string | null | undefined) =>
  f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CL') : ''

const ESTADO_PAGO_LABEL: Record<string, string> = {
  pagado: 'Al día', pendiente: 'Pendiente', atrasado: 'Atrasado',
}

export const CAMPOS_JUGADOR: CampoJugador[] = [
  // Datos básicos
  { id: 'nombre', etiqueta: 'Nombre', grupo: 'basico', porDefecto: true, texto: j => j.nombre || '' },
  { id: 'rut', etiqueta: 'RUT', grupo: 'basico', porDefecto: true, texto: j => j.rut || '' },
  { id: 'estado', etiqueta: 'Estado', grupo: 'basico', porDefecto: true, texto: j => j.estado === 'activo' ? 'Activo' : 'Bloqueado' },
  { id: 'edad', etiqueta: 'Edad', grupo: 'basico', porDefecto: false, texto: j => { const e = calcularEdad(j.fecha_nacimiento); return e === null ? '' : String(e) } },

  // Contacto y personal
  { id: 'email', etiqueta: 'Email', grupo: 'contacto', porDefecto: true, texto: j => j.email || '' },
  { id: 'telefono', etiqueta: 'Teléfono', grupo: 'contacto', porDefecto: true, texto: j => j.telefono || '' },
  { id: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', grupo: 'contacto', porDefecto: false, texto: j => fechaLegible(j.fecha_nacimiento) },
  { id: 'direccion', etiqueta: 'Dirección', grupo: 'contacto', porDefecto: false, texto: j => j.direccion || '' },
  { id: 'comuna', etiqueta: 'Comuna', grupo: 'contacto', porDefecto: false, texto: j => j.comuna || '' },
  { id: 'indicaciones_medicas', etiqueta: 'Indicaciones médicas', grupo: 'contacto', porDefecto: false, texto: j => j.indicaciones_medicas || '' },

  // Deportivo
  { id: 'categoria', etiqueta: 'Categoría', grupo: 'deportivo', porDefecto: true, texto: j => j.categorias?.length ? j.categorias.join(' · ') : (j.categoria || '') },
  { id: 'grupo', etiqueta: 'Grupo', grupo: 'deportivo', porDefecto: true, texto: j => grupoLabel(j.grupo) },
  { id: 'sede', etiqueta: 'Sede', grupo: 'deportivo', porDefecto: true, texto: j => sedeLabel(j.sede) },
  { id: 'horario', etiqueta: 'Horario', grupo: 'deportivo', porDefecto: true, texto: j => j.horario || '' },
  { id: 'dias', etiqueta: 'Días', grupo: 'deportivo', porDefecto: true, texto: j => diasEntrenamiento(j) },
  { id: 'presente_hoy', etiqueta: 'Presente hoy', grupo: 'deportivo', porDefecto: false, texto: (j, ctx) => ctx.asistenciaHoy.has(j.id) ? 'Sí' : 'No' },

  // Membresía y pago
  { id: 'tipo_plan', etiqueta: 'Plan', grupo: 'membresia', porDefecto: false, texto: j => j.tipo_plan ? j.tipo_plan.charAt(0).toUpperCase() + j.tipo_plan.slice(1) : '' },
  { id: 'entrenamientos_por_semana', etiqueta: 'Entrenamientos/semana', grupo: 'membresia', porDefecto: false, texto: j => j.tipo_plan === 'libre' ? 'Libre acceso' : (j.entrenamientos_por_semana ? String(j.entrenamientos_por_semana) : '') },
  {
    id: 'mensualidad', etiqueta: 'Mensualidad', grupo: 'membresia', porDefecto: true,
    texto: j => j.mensualidad != null ? `$${Number(j.mensualidad).toLocaleString('es-CL')}` : SIN_CUOTA,
    valorExcel: j => j.mensualidad ?? '',
  },
  { id: 'estado_pago', etiqueta: 'Pago del mes', grupo: 'membresia', porDefecto: false, texto: (j, ctx) => ESTADO_PAGO_LABEL[ctx.estadoPago[j.id] || ''] || '—' },

  // Federación
  { id: 'federado', etiqueta: 'Federado', grupo: 'federado', porDefecto: false, texto: j => j.federado ? 'Sí' : 'No' },
  { id: 'formulario_federado', etiqueta: 'Formulario federado', grupo: 'federado', porDefecto: false, texto: (j, ctx) => ctx.conDocumento.has(j.id) ? 'Entregado' : 'Pendiente' },

  // Contacto de emergencia
  { id: 'contacto_emergencia_nombre', etiqueta: 'Contacto de emergencia', grupo: 'emergencia', porDefecto: false, texto: j => j.contacto_emergencia_nombre || '' },
  { id: 'contacto_emergencia_telefono', etiqueta: 'Teléfono de emergencia', grupo: 'emergencia', porDefecto: false, texto: j => j.contacto_emergencia_telefono || '' },

  // Tallas
  { id: 'talla_polera', etiqueta: 'Talla polera', grupo: 'tallas', porDefecto: false, texto: j => j.talla_polera || '' },
  { id: 'talla_short', etiqueta: 'Talla short', grupo: 'tallas', porDefecto: false, texto: j => j.talla_short || '' },
]

export const CAMPOS_JUGADOR_POR_DEFECTO: string[] = CAMPOS_JUGADOR.filter(c => c.porDefecto).map(c => c.id)

/** Filtra por ids seleccionados, preservando el orden del registro. Ids que ya no existan se ignoran. */
export function camposDesdeIds(ids: string[]): CampoJugador[] {
  const set = new Set(ids)
  return CAMPOS_JUGADOR.filter(c => set.has(c.id))
}
