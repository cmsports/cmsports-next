'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'

export type Actividad = {
  id: string
  titulo: string
  nota: string | null
  fecha: string
  hora: string | null
  completada: boolean
  creadaEn: string
}

const tituloSchema = z.string().trim().min(1, 'Escribe un título').max(200, 'Título demasiado largo')
const notaSchema = z.string().max(1000, 'Nota demasiado larga').nullable()
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const horaSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida').nullable()

const PATH = '/superadmin/calendario'

export async function listarActividades(params: { desde: string; hasta: string }): Promise<{ error?: string; actividades?: Actividad[] }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  // ponytail: cast a any hasta regenerar tipos con la migración 129
  const admin = createAdminClient() as any
  const { data, error } = await admin.from('actividades_superadmin')
    .select('id,titulo,nota,fecha,hora,completada,creada_en')
    .gte('fecha', params.desde)
    .lte('fecha', params.hasta)
    .order('fecha')
    .order('hora', { nullsFirst: false })
  if (error) return { error: 'No se pudieron cargar las actividades' }

  return {
    actividades: (data ?? []).map((a: any) => ({
      id: a.id,
      titulo: a.titulo,
      nota: a.nota,
      fecha: a.fecha,
      hora: a.hora,
      completada: a.completada,
      creadaEn: a.creada_en,
    })),
  }
}

export async function crearActividad(params: {
  titulo: string; nota: string | null; fecha: string; hora: string | null
}): Promise<{ error?: string; id?: string }> {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const titulo = tituloSchema.safeParse(params.titulo)
  if (!titulo.success) return { error: titulo.error.issues[0].message }
  const fecha = fechaSchema.safeParse(params.fecha)
  if (!fecha.success) return { error: fecha.error.issues[0].message }
  const nota = notaSchema.safeParse(params.nota)
  if (!nota.success) return { error: nota.error.issues[0].message }
  const hora = horaSchema.safeParse(params.hora || null)
  if (!hora.success) return { error: hora.error.issues[0].message }

  const { data: { user } } = await supabase.auth.getUser()

  // ponytail: cast a any hasta regenerar tipos con la migración 129
  const admin = createAdminClient() as any
  const { data, error } = await admin.from('actividades_superadmin')
    .insert({
      titulo: titulo.data,
      nota: nota.data,
      fecha: fecha.data,
      hora: hora.data,
      creada_por: user?.id ?? null,
    })
    .select('id').single()
  if (error) return { error: 'No se pudo crear la actividad' }

  revalidatePath(PATH)
  return { id: data.id }
}

export async function editarActividad(params: {
  id: string; titulo: string; nota: string | null; fecha: string; hora: string | null
}): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const titulo = tituloSchema.safeParse(params.titulo)
  if (!titulo.success) return { error: titulo.error.issues[0].message }
  const fecha = fechaSchema.safeParse(params.fecha)
  if (!fecha.success) return { error: fecha.error.issues[0].message }
  const nota = notaSchema.safeParse(params.nota)
  if (!nota.success) return { error: nota.error.issues[0].message }
  const hora = horaSchema.safeParse(params.hora || null)
  if (!hora.success) return { error: hora.error.issues[0].message }

  // ponytail: cast a any hasta regenerar tipos con la migración 129
  const admin = createAdminClient() as any
  const { error, count } = await admin.from('actividades_superadmin')
    .update({ titulo: titulo.data, nota: nota.data, fecha: fecha.data, hora: hora.data }, { count: 'exact' })
    .eq('id', params.id)
  if (error) return { error: 'No se pudo guardar el cambio' }
  if (!count) return { error: 'Esa actividad ya no existe' }

  revalidatePath(PATH)
  return {}
}

export async function toggleActividad(id: string, completada: boolean): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  // ponytail: cast a any hasta regenerar tipos con la migración 129
  const admin = createAdminClient() as any
  const { error, count } = await admin.from('actividades_superadmin')
    .update({ completada }, { count: 'exact' })
    .eq('id', id)
  if (error) return { error: 'No se pudo actualizar' }
  if (!count) return { error: 'Esa actividad ya no existe' }

  revalidatePath(PATH)
  return {}
}

export async function borrarActividad(id: string): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  // ponytail: cast a any hasta regenerar tipos con la migración 129
  const admin = createAdminClient() as any
  const { error, count } = await admin.from('actividades_superadmin')
    .delete({ count: 'exact' }).eq('id', id)
  if (error) return { error: 'No se pudo borrar la actividad' }
  if (!count) return { error: 'Esa actividad ya no existe' }

  revalidatePath(PATH)
  return {}
}
