import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

export const solicitudSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  rut: z.string().min(7, 'RUT inválido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  club_id: z.string().uuid('Club inválido'),
  codigo: z.string().min(1, 'Código de invitación requerido'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type SolicitudInput = z.infer<typeof solicitudSchema>
