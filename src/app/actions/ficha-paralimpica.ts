'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePerfil, requireStaffClub } from '@/lib/auth/require'
import { fechaChile } from '@/lib/domain/fechaChile'
import { esUuid } from '@/lib/domain/uuid'
import { validarClaseParalimpica, type ConsentimientoSalud, type FichaParalimpica, type ModalidadParalimpica } from '@/lib/domain/fichaParalimpica'

async function moduloHabilitado(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase.from('clubes').select('modulos_habilitados').eq('id', clubId).maybeSingle()
  if (error) return 'No se pudo verificar el módulo de ficha paralímpica.'
  return data?.modulos_habilitados?.includes('ficha_paralimpica') ? null : 'La ficha paralímpica no está habilitada para este club.'
}

export async function cargarFichaParalimpica(jugadorId: string) {
  const auth = await requirePerfil()
  if (auth.error) return { error: auth.error }
  if (!esUuid(jugadorId)) return { error: 'Jugador no válido.' }
  const { perfil } = auth
  if (!['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '') && perfil.jugador_id !== jugadorId) {
    return { error: 'Acceso denegado.' }
  }
  const supabase = auth.supabase as unknown as SupabaseClient
  const moduloError = await moduloHabilitado(supabase, perfil.club_id)
  if (moduloError) return { error: moduloError }
  const [ficha, consentimientos] = await Promise.all([
    supabase.from('jugador_ficha_paralimpica')
      .select('modalidad,clase_deportiva,necesidades_accesibilidad,actualizado_en')
      .eq('jugador_id', jugadorId).eq('club_id', perfil.club_id).maybeSingle(),
    supabase.from('jugador_consentimientos_salud')
      .select('id,otorgado,fecha,creado_en,firmado_por,nombre_firmante,respaldo,registrado_por_nombre')
      .eq('jugador_id', jugadorId).eq('club_id', perfil.club_id)
      .order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
  ])
  if (ficha.error || consentimientos.error) return { error: 'No se pudo cargar la ficha paralímpica: ' + (ficha.error?.message ?? consentimientos.error?.message) }
  return { ficha: ficha.data as FichaParalimpica | null, consentimientos: (consentimientos.data ?? []) as ConsentimientoSalud[] }
}

export async function guardarFichaParalimpica(params: {
  jugadorId: string
  modalidad: ModalidadParalimpica | null
  claseDeportiva: number | null
  necesidadesAccesibilidad: string
}) {
  const auth = await requireStaffClub()
  if (auth.error) return { error: auth.error }
  if (!esUuid(params.jugadorId)) return { error: 'Jugador no válido.' }
  const validacion = validarClaseParalimpica(params.modalidad, params.claseDeportiva)
  if (validacion) return { error: validacion }
  if (params.necesidadesAccesibilidad.trim().length > 2000) return { error: 'Las necesidades de accesibilidad admiten hasta 2000 caracteres.' }
  const supabase = auth.supabase as unknown as SupabaseClient
  const moduloError = await moduloHabilitado(supabase, auth.clubId)
  if (moduloError) return { error: moduloError }
  const { data, error } = await supabase.rpc('guardar_ficha_paralimpica', {
    p_jugador_id: params.jugadorId, p_modalidad: params.modalidad,
    p_clase_deportiva: params.claseDeportiva, p_necesidades_accesibilidad: params.necesidadesAccesibilidad,
  })
  if (error) return { error: error.message }
  if (data !== params.jugadorId) return { error: 'No se pudo confirmar que la ficha se guardara.' }
  return { success: true }
}

export async function registrarConsentimientoSalud(params: {
  jugadorId: string
  otorgado: boolean
  fecha: string
  firmadoPor: 'jugador' | 'apoderado'
  nombreFirmante: string
  respaldo: string
}) {
  const auth = await requireStaffClub()
  if (auth.error) return { error: auth.error }
  if (!esUuid(params.jugadorId)) return { error: 'Jugador no válido.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fecha) || params.fecha > fechaChile()) return { error: 'La fecha de la firma no es válida o es futura.' }
  if (typeof params.otorgado !== 'boolean' || !['jugador', 'apoderado'].includes(params.firmadoPor)) return { error: 'La firma no es válida.' }
  if (params.nombreFirmante.trim().length < 3 || params.nombreFirmante.trim().length > 160) return { error: 'Indica el nombre de quien firmó (3–160 caracteres).' }
  if (params.respaldo.trim().length < 3 || params.respaldo.trim().length > 1000) return { error: 'Indica dónde se conserva el respaldo de la firma (3–1000 caracteres).' }
  const supabase = auth.supabase as unknown as SupabaseClient
  const moduloError = await moduloHabilitado(supabase, auth.clubId)
  if (moduloError) return { error: moduloError }
  const { data, error } = await supabase.rpc('registrar_consentimiento_salud', {
    p_jugador_id: params.jugadorId, p_otorgado: params.otorgado, p_fecha: params.fecha,
    p_firmado_por: params.firmadoPor, p_nombre_firmante: params.nombreFirmante, p_respaldo: params.respaldo,
  })
  if (error) return { error: error.message }
  if (!data) return { error: 'No se pudo confirmar el registro de la firma.' }
  return { success: true }
}
