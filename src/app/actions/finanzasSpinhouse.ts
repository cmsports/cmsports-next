'use server'

import { z } from 'zod'
import { requireAdminClub } from '@/lib/auth/require'
import { TIPOS_FINANZAS, type DatosFinanzasSpinhouse } from '@/lib/domain/finanzasSpinhouse'

const periodo = z.object({ mes: z.number().int().min(1).max(12), anio: z.number().int().min(2000).max(2100) })
const tarifa = z.object({ profesorId: z.uuid(), tipoClase: z.enum(TIPOS_FINANZAS), rol: z.enum(['principal', 'auxiliar']), desde: z.string().regex(/^\d{4}-\d{2}-01$/), montoHora: z.number().int().min(0).max(10000000) })
const asistencia = z.object({ asistenciaId: z.uuid(), minutos: z.number().int().min(1).max(1440), tipoClase: z.enum(TIPOS_FINANZAS), rol: z.enum(['principal', 'auxiliar']), seCobraAparte: z.boolean() })
const asignacion = z.object({ movimientoId: z.uuid(), bloqueId: z.uuid().nullable() })

// Las funciones SQL comprueban sesión, club y módulo de nuevo. No aceptan clubId del navegador.
async function llamar(nombre: string, parametros: Record<string, unknown>) {
  const auth = await requireAdminClub()
  if (auth.error) return { error: auth.error }
  // Funciones añadidas por la 293; se incorporan al tipo generado al aplicar la migración.
  const rpc = auth.supabase.rpc.bind(auth.supabase) as unknown as (nombre: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  const { data, error } = await rpc(nombre, parametros)
  if (error) return { error: error.message }
  if (data === null) return { error: 'La operación no devolvió un resultado confirmado' }
  return { data }
}

export async function cargarFinanzasSpinhouse(input: { mes: number; anio: number }): Promise<{ error: string } | { data: DatosFinanzasSpinhouse }> {
  const parsed = periodo.safeParse(input)
  if (!parsed.success) return { error: 'Periodo inválido' }
  const result = await llamar('spinhouse_finanzas_datos', { p_mes: parsed.data.mes, p_anio: parsed.data.anio })
  if ('error' in result && result.error) return { error: result.error }
  return { data: result.data as DatosFinanzasSpinhouse }
}
export async function guardarTarifaSpinhouse(input: z.infer<typeof tarifa>) {
  const parsed = tarifa.safeParse(input)
  if (!parsed.success) return { error: 'Revisa profesor, tarifa, tipo, rol y fecha de vigencia' }
  const d = parsed.data
  return llamar('spinhouse_finanzas_tarifa', { p_profesor: d.profesorId, p_tipo: d.tipoClase, p_rol: d.rol, p_desde: d.desde, p_monto: d.montoHora })
}
export async function confirmarHorasSpinhouse(input: z.infer<typeof asistencia>) {
  const parsed = asistencia.safeParse(input)
  if (!parsed.success) return { error: 'Revisa los minutos y datos de la sesión' }
  const d = parsed.data
  return llamar('spinhouse_finanzas_confirmar_horas', { p_asistencia: d.asistenciaId, p_minutos: d.minutos, p_tipo: d.tipoClase, p_rol: d.rol, p_cobro_aparte: d.seCobraAparte })
}
export async function asignarIngresoSpinhouse(input: z.infer<typeof asignacion>) {
  const parsed = asignacion.safeParse(input)
  if (!parsed.success) return { error: 'Movimiento o bloque inválido' }
  return llamar('spinhouse_finanzas_asignar', { p_movimiento: parsed.data.movimientoId, p_bloque: parsed.data.bloqueId })
}
export async function liquidarEntrenadorSpinhouse(input: { profesorId: string; mes: number; anio: number }) {
  const parsed = periodo.extend({ profesorId: z.uuid() }).safeParse(input)
  if (!parsed.success) return { error: 'Profesor o periodo inválido' }
  return llamar('spinhouse_finanzas_liquidar', { p_profesor: parsed.data.profesorId, p_mes: parsed.data.mes, p_anio: parsed.data.anio })
}
