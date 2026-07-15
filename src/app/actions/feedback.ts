'use server'

import { revalidatePath } from 'next/cache'
import { requirePerfil } from '@/lib/auth/require'

type GuardarFeedbackParams = {
  jugadorId: string
  evaluacionId?: string | null
  periodo: string
  feedback: string
  meta?: string | null
}

const PERIODO_VALIDO = /^Q[1-4]-\d{4}$/

export async function guardarFeedbackAction(params: GuardarFeedbackParams) {
  const { error: authError, supabase, perfil } = await requirePerfil()
  if (authError || !supabase || !perfil) return { error: authError || 'No autenticado' }
  if (!['admin', 'profesor'].includes(perfil.rol || '')) return { error: 'Acceso denegado' }

  const feedback = params.feedback.trim()
  const meta = params.meta?.trim() || null
  if (!params.jugadorId) return { error: 'Jugador no válido' }
  if (!PERIODO_VALIDO.test(params.periodo)) return { error: 'Período no válido' }
  if (!feedback) return { error: 'El feedback es obligatorio' }
  if (feedback.length > 5000) return { error: 'El feedback no puede superar 5.000 caracteres' }
  if (meta && meta.length > 2000) return { error: 'La meta no puede superar 2.000 caracteres' }

  const { data: jugador, error: jugadorError } = await supabase
    .from('jugadores')
    .select('id')
    .eq('id', params.jugadorId)
    .eq('club_id', perfil.club_id)
    .maybeSingle()

  if (jugadorError) return { error: `No se pudo validar al jugador: ${jugadorError.message}` }
  if (!jugador) return { error: 'El jugador no pertenece a tu club' }

  const datos = {
    feedback_profesor: feedback,
    meta_proximo_periodo: meta,
    // Si el informe cambia, el jugador debe confirmar nuevamente.
    firmado_alumno: false,
  }

  if (params.evaluacionId) {
    const { data: evaluacion, error: evaluacionError } = await supabase
      .from('evaluaciones_trimestrales')
      .select('id')
      .eq('id', params.evaluacionId)
      .eq('jugador_id', params.jugadorId)
      .eq('club_id', perfil.club_id)
      .maybeSingle()

    if (evaluacionError) return { error: `No se pudo validar la evaluación: ${evaluacionError.message}` }
    if (!evaluacion) return { error: 'La evaluación no pertenece a este jugador' }

    const { error } = await supabase
      .from('evaluaciones_trimestrales')
      .update(datos)
      .eq('id', params.evaluacionId)
      .eq('jugador_id', params.jugadorId)
      .eq('club_id', perfil.club_id)

    if (error) return { error: `No se pudo guardar el feedback: ${error.message}` }
  } else {
    const { error } = await supabase.from('evaluaciones_trimestrales').insert({
      club_id: perfil.club_id,
      jugador_id: params.jugadorId,
      periodo_trimestre: params.periodo,
      ...datos,
    })

    if (error) return { error: `No se pudo guardar el feedback: ${error.message}` }
  }

  revalidatePath(`/jugadores/${params.jugadorId}`)
  revalidatePath('/perfil')
  return { success: true }
}

export async function confirmarFeedbackAction(params: { evaluacionId: string }) {
  const { error: authError, supabase, perfil } = await requirePerfil()
  if (authError || !supabase || !perfil) return { error: authError || 'No autenticado' }
  if (perfil.rol !== 'jugador' || !perfil.jugador_id) return { error: 'Solo el jugador puede confirmar su feedback' }
  if (!params.evaluacionId) return { error: 'Evaluación no válida' }

  // La función SQL solo puede marcar como confirmado el feedback del jugador
  // autenticado. El cast local evita acoplar esta acción al archivo de tipos
  // generado mientras se despliega la migración.
  const confirmar = supabase.rpc as unknown as (
    nombre: string,
    args: { p_evaluacion_id: string },
  ) => Promise<{ error: { message: string } | null }>
  const { error } = await confirmar('confirmar_feedback_jugador', {
    p_evaluacion_id: params.evaluacionId,
  })

  if (error) return { error: `No se pudo confirmar el feedback: ${error.message}` }

  revalidatePath('/perfil')
  revalidatePath(`/jugadores/${perfil.jugador_id}`)
  return { success: true }
}
