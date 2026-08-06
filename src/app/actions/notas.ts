'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/auth/require'
import { createAdminClient } from '@/lib/supabase/admin'
import { esAsignadoValido, type AsignadoA } from '@/lib/domain/tareas'

export type Nota = {
  id: string
  texto: string
  autor: AsignadoA
  creadaEn: string
}

const textoSchema = z.string().trim().min(1, 'Escribe algo').max(500, 'La nota es demasiado larga')

export async function listarNotas(): Promise<{ error?: string; notas?: Nota[] }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const admin = createAdminClient() as any
  const { data, error } = await admin.from('notas_superadmin')
    .select('id,texto,autor,creada_en')
    .order('creada_en', { ascending: false })
  if (error) return { error: 'No se pudieron cargar las notas' }

  return {
    notas: (data ?? []).map((n: any) => ({
      id: n.id,
      texto: n.texto,
      autor: n.autor as AsignadoA,
      creadaEn: n.creada_en,
    })),
  }
}

export async function crearNota(params: { texto: string; autor: string }): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const parsed = textoSchema.safeParse(params.texto)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (!esAsignadoValido(params.autor)) return { error: 'Autor inválido' }

  const admin = createAdminClient() as any
  const { error } = await admin.from('notas_superadmin')
    .insert({ texto: parsed.data, autor: params.autor })
  if (error) return { error: 'No se pudo guardar la nota' }

  revalidatePath('/superadmin/tareas')
  return {}
}

export async function borrarNota(id: string): Promise<{ error?: string }> {
  const { error: authErr } = await requireSuperadmin()
  if (authErr) return { error: authErr }

  const admin = createAdminClient() as any
  const { error, count } = await admin.from('notas_superadmin')
    .delete({ count: 'exact' }).eq('id', id)
  if (error) return { error: 'No se pudo borrar la nota' }
  if (!count) return { error: 'Esa nota ya no existe' }

  revalidatePath('/superadmin/tareas')
  return {}
}
