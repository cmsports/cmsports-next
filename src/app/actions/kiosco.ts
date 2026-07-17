'use server'

import { z } from 'zod'
import { requireAdminClub } from '@/lib/auth/require'

export type KioscoAsistencia = {
  id: string
  club_id: string
  nombre: string
  activo: boolean
  creado_en: string
  rotado_en: string
  ultimo_uso_en: string | null
}

const kioscoSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe un nombre para el dispositivo').max(80),
  kioscoId: z.string().uuid().nullable().optional(),
})

export async function listarKioscosAction() {
  const { error, supabase } = await requireAdminClub()
  if (error) return { error, kioscos: [] as KioscoAsistencia[] }

  const { data, error: rpcError } = await supabase!.rpc('listar_kioscos_asistencia')
  if (rpcError) return { error: 'No se pudieron cargar los dispositivos', kioscos: [] as KioscoAsistencia[] }
  return { kioscos: (data || []) as KioscoAsistencia[] }
}

export async function crearORotarKioscoAction(input: { nombre: string; kioscoId?: string | null }) {
  const parsed = kioscoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error, supabase } = await requireAdminClub()
  if (error) return { error }

  const { data, error: rpcError } = await supabase!.rpc('crear_o_rotar_kiosco_asistencia', {
    p_nombre: parsed.data.nombre,
    p_kiosco_id: parsed.data.kioscoId || null,
  })
  if (rpcError || !data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'No se pudo autorizar el dispositivo' }
  }

  const resultado = data as { id?: unknown; club_id?: unknown; nombre?: unknown; token?: unknown }
  if (typeof resultado.id !== 'string' || typeof resultado.club_id !== 'string'
      || typeof resultado.nombre !== 'string' || typeof resultado.token !== 'string') {
    return { error: 'La autorización no entregó un token válido' }
  }

  return {
    kiosco: {
      id: resultado.id,
      clubId: resultado.club_id,
      nombre: resultado.nombre,
      token: resultado.token,
    },
  }
}

export async function revocarKioscoAction(kioscoId: string) {
  const parsed = z.string().uuid().safeParse(kioscoId)
  if (!parsed.success) return { error: 'Dispositivo inválido' }

  const { error, supabase } = await requireAdminClub()
  if (error) return { error }

  const { data, error: rpcError } = await supabase!.rpc('revocar_kiosco_asistencia', {
    p_kiosco_id: parsed.data,
  })
  if (rpcError || !data) return { error: 'No se pudo revocar el dispositivo' }
  return { ok: true }
}
