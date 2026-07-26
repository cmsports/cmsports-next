import { z } from 'zod'

export const solicitudSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  rut: z.string().min(7, 'RUT inválido'),
  email: z.string().email('Email inválido'),
  telefono: z.string().optional().or(z.literal('')),
  club_id: z.string().uuid('Club inválido'),
  codigo: z.string().min(1, 'Código de invitación requerido'),
  // El formulario los pide siempre; quien no tenga segundo o tercer apellido
  // escribe "no", así el club distingue "sin dato" de "no completó".
  nombres: z.string().min(2, 'Los nombres son obligatorios'),
  apellido1: z.string().min(1, 'El primer apellido es obligatorio'),
  apellido2: z.string().min(1, 'El segundo apellido es obligatorio'),
  apellido3: z.string().min(1, 'El tercer apellido es obligatorio'),
})
