'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { esEstadoTarea, ordenarTareas, tareaVisible, type EstadoTarea } from '@/lib/domain/tareas'

export type Tarea = {
  id: string
  texto: string
  estado: EstadoTarea
  completadaEn: string | null
  creadaEn: string
}

const textoSchema = z.string().trim().min(1, 'Escribe algo').max(300, 'La tarea es demasiado larga')

/**
 * La lista de pendientes de la plataforma, ya filtrada y ordenada.
 *
 * Es UNA lista compartida entre los superadmin: son dos personas anotando lo
 * mismo, no cada uno la suya. Por eso no se filtra por autor.
 *
 * El filtro de las 12 horas se aplica acá y no en SQL para que la regla viva
 * en un solo lugar (`src/lib/domain/tareas.ts`) y se pueda testear sin base de
 * datos. Son decenas de filas, no miles: no vale la pena partir la regla en
 * dos por ahorrar bytes de red.
 */
export async function listarTareas(): Promise<{ error?: string; tareas?: Tarea[] }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  const { data, error } = await admin.from('tareas')
    .select('id,texto,estado,completada_en,creada_en')
  if (error) return { error: 'No se pudieron cargar las tareas' }

  const ahora = new Date()
  const visibles = ordenarTareas((data ?? []).filter(t => tareaVisible(t, ahora)))
  return {
    tareas: visibles.map(t => ({
      id: t.id,
      texto: t.texto,
      estado: t.estado as EstadoTarea,
      completadaEn: t.completada_en,
      creadaEn: t.creada_en,
    })),
  }
}

export async function crearTarea(texto: string): Promise<{ error?: string; id?: string }> {
  const { error: authErr, supabase } = await requireSuperadmin()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const parsed = textoSchema.safeParse(texto)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Queda registrado quién la anotó. El id sale de la sesión, nunca del
  // cliente.
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  // El estado inicial no se manda: lo pone el DEFAULT de la tabla
  // ('sin_realizar'). Un solo lugar define cuál es el estado por defecto.
  const { data, error } = await admin.from('tareas')
    .insert({ texto: parsed.data, creada_por: user?.id ?? null })
    .select('id').single()
  if (error) return { error: 'No se pudo crear la tarea' }

  revalidatePath('/superadmin/tareas')
  return { id: data.id }
}

export async function cambiarEstadoTarea(params: { id: string; estado: string }): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }
  if (!esEstadoTarea(params.estado)) return { error: 'Estado inválido' }

  const admin = createAdminClient()
  // `completada_en` no se toca desde acá — la sella el trigger de la base
  // según el estado, para que el reloj de las 12 horas no dependa de que cada
  // camino de escritura se acuerde de actualizarlo.
  const { error, count } = await admin.from('tareas')
    .update({ estado: params.estado }, { count: 'exact' })
    .eq('id', params.id)
  if (error) return { error: 'No se pudo actualizar la tarea' }
  if (!count) return { error: 'Esa tarea ya no existe' }

  revalidatePath('/superadmin/tareas')
  return {}
}

export async function editarTextoTarea(params: { id: string; texto: string }): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const parsed = textoSchema.safeParse(params.texto)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const admin = createAdminClient()
  const { error, count } = await admin.from('tareas')
    .update({ texto: parsed.data }, { count: 'exact' })
    .eq('id', params.id)
  if (error) return { error: 'No se pudo guardar el cambio' }
  if (!count) return { error: 'Esa tarea ya no existe' }

  revalidatePath('/superadmin/tareas')
  return {}
}

export async function borrarTarea(id: string): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const admin = createAdminClient()
  const { error, count } = await admin.from('tareas')
    .delete({ count: 'exact' }).eq('id', id)
  if (error) return { error: 'No se pudo borrar la tarea' }
  if (!count) return { error: 'Esa tarea ya no existe' }

  revalidatePath('/superadmin/tareas')
  return {}
}
