import { z } from 'zod'

const UUID = z.string().uuid('Identificador inválido')
const MONTO = z.number().int('El monto debe ser entero').positive('El monto debe ser mayor a cero').max(2_147_483_647, 'El monto excede el máximo permitido')
const MES = z.number().int().min(1, 'Mes inválido').max(12, 'Mes inválido')
const ANIO = z.number().int().min(2000, 'Año inválido').max(2100, 'Año inválido')
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').refine(value => {
  const fecha = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(fecha.valueOf()) && fecha.toISOString().slice(0, 10) === value
}, 'Fecha inválida')

export const METODOS_PAGO = ['efectivo', 'transferencia'] as const
export const TIPOS_MOVIMIENTO = ['ingreso', 'gasto'] as const
export const CATEGORIAS_INGRESO = ['mensualidad', 'inscripcion_torneo', 'inscripcion_liga', 'arriendo_cancha', 'donacion', 'otro_ingreso'] as const
export const CATEGORIAS_GASTO = ['sueldo_profesor', 'sueldo_staff', 'arriendo_cancha', 'material_deportivo', 'servicios_basicos', 'mantenimiento', 'premio_torneo', 'otro_gasto'] as const

export const pagoLigaSchema = z.object({
  divisionId: UUID,
  jugadorId: UUID,
  montoTotal: MONTO,
  montoAbono: MONTO,
  fecha: FECHA,
  metodo: z.enum(METODOS_PAGO).optional(),
  nombreJugador: z.string().max(200).optional(),
  nombreLiga: z.string().max(200).optional(),
  idempotencyKey: UUID.optional(),
}).refine(data => data.montoAbono <= data.montoTotal, {
  message: 'El abono no puede superar el monto total',
  path: ['montoAbono'],
})

export const anularAbonoLigaSchema = z.object({
  pagoId: UUID,
  idempotencyKey: UUID.optional(),
})

export const pagoMensualidadSchema = z.object({
  jugadorId: UUID,
  jugadorNombre: z.string().max(200).optional(),
  mensualidadId: UUID.nullable(),
  mes: MES,
  anio: ANIO,
  monto: MONTO,
  metodo: z.enum(METODOS_PAGO),
  registradoPor: z.string().max(200).optional(),
  idempotencyKey: UUID.optional(),
})

export const generarMensualidadesSchema = z.object({
  jugadorIds: z.array(UUID).max(1000, 'Demasiados jugadores').transform(ids => [...new Set(ids)]),
  mes: MES,
  anio: ANIO,
})

export const mensualidadIdSchema = z.object({ mensualidadId: UUID })

export const revertirMensualidadSchema = z.object({
  mensualidadId: UUID,
  jugadorId: UUID.optional(),
  mes: MES.optional(),
  anio: ANIO.optional(),
  idempotencyKey: UUID.optional(),
})

export const movimientoSchema = z.object({
  tipo: z.enum(TIPOS_MOVIMIENTO),
  categoria: z.string().min(1, 'Categoría requerida'),
  descripcion: z.string().trim().min(1, 'Descripción requerida').max(500, 'Descripción demasiado larga'),
  monto: MONTO,
  fecha: FECHA,
  profesorId: UUID.optional(),
  mesCorrespondiente: MES.optional(),
  anioCorrespondiente: ANIO.optional(),
  idempotencyKey: UUID.optional(),
}).superRefine((data, ctx) => {
  const permitidas = data.tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO
  if (!(permitidas as readonly string[]).includes(data.categoria)) {
    ctx.addIssue({ code: 'custom', path: ['categoria'], message: 'Categoría incompatible con el tipo de movimiento' })
  }
  if ((data.mesCorrespondiente === undefined) !== (data.anioCorrespondiente === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['mesCorrespondiente'], message: 'Mes y año deben informarse juntos' })
  }
})

export function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Datos inválidos'
}
