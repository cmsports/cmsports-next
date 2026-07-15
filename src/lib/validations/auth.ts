import { z } from 'zod'

export const solicitudSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  rut: z.string().min(7, 'RUT inválido'),
  email: z.string().email('Email inválido'),
  telefono: z.string().optional().or(z.literal('')),
  club_id: z.string().uuid('Club inválido'),
  codigo: z.string().min(1, 'Código de invitación requerido'),
})
