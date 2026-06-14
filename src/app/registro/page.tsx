'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { enviarSolicitud } from '@/app/actions/auth'
import { XCircle, PartyPopper, Send } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function RegistroForm() {
  const searchParams = useSearchParams()
  const clubId = searchParams.get('club')
  const codigo = searchParams.get('code')

  const [clubNombre, setClubNombre] = useState('')
  const [valido, setValido] = useState<boolean | null>(null)
  const [form, setForm] = useState({ nombre: '', rut: '', email: '', telefono: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [enviado, setEnviado] = useState(false)
  const [serverError, setServerError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    async function verificar() {
      if (!clubId || !codigo) { setValido(false); return }
      const { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('codigo', codigo).eq('activa', true).single()
      if (!inv) { setValido(false); return }
      setValido(true)
      const { data: club } = await supabase.from('clubes').select('nombre').eq('id', clubId).single()
      if (club) setClubNombre(club.nombre)
    }
    verificar()
  }, [clubId, codigo])

  async function enviar() {
    setErrors({})
    setServerError('')

    if (!form.nombre.trim()) {
      setErrors(prev => ({ ...prev, nombre: 'El nombre es obligatorio' }))
      return
    }
    if (!form.rut.trim() || form.rut.length < 7) {
      setErrors(prev => ({ ...prev, rut: 'RUT inválido' }))
      return
    }

    setEnviando(true)
    const result = await enviarSolicitud({
      ...form,
      club_id: clubId!,
      codigo: codigo!,
    })

    if (result.error) {
      setServerError(result.error)
      setEnviando(false)
      return
    }

    setEnviado(true)
    setEnviando(false)
  }

  if (valido === null) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <Skeleton width="200px" height="1.5rem" />
    </div>
  )

  if (valido === false) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-5">
      <Card className="max-w-[400px] w-full text-center py-8">
        <EmptyState
          icon={XCircle}
          title="Link inválido"
          description="Este link de invitación no es válido o ha expirado. Contacta al administrador del club."
        />
      </Card>
    </div>
  )

  if (enviado) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-5">
      <Card className="max-w-[400px] w-full text-center py-8">
        <EmptyState
          icon={PartyPopper}
          title="¡Solicitud enviada!"
          description="El administrador del club revisará tu solicitud y te contactará pronto."
        />
      </Card>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-5">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-7">
          <div className="w-16 h-16 bg-gradient-to-br from-[var(--purple)] to-[var(--purple-light)] rounded-2xl flex items-center justify-center font-extrabold text-[22px] text-white mx-auto mb-4">CM</div>
          <div className="text-[26px] font-extrabold text-[var(--text)]">CmSports</div>
          <div className="text-sm text-[var(--text-muted)] mt-1.5">{clubNombre}</div>
        </div>

        <Card>
          <div className="mb-1 text-base font-semibold text-[var(--text)]">Solicitud de ingreso</div>
          <div className="text-sm text-[var(--text-muted)] mb-5">Completa tus datos para unirte al club</div>

          {serverError && (
            <div className="bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-lg px-3.5 py-2.5 text-sm text-[var(--red)] mb-3.5">
              {serverError}
            </div>
          )}

          <div className="space-y-3.5">
            <Input
              label="Nombre completo *"
              placeholder="Ej: Carlos Muñoz"
              value={form.nombre}
              onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
              error={errors.nombre}
            />
            <Input
              label="RUT *"
              placeholder="12.345.678-9"
              value={form.rut}
              onChange={e => setForm(prev => ({ ...prev, rut: e.target.value }))}
              error={errors.rut}
            />
            <Input
              label="Email"
              type="email"
              placeholder="tu@email.com"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
            />
            <Input
              label="Teléfono"
              type="tel"
              placeholder="+56 9 1234 5678"
              value={form.telefono}
              onChange={e => setForm(prev => ({ ...prev, telefono: e.target.value }))}
            />
            <Button
              onClick={enviar}
              loading={enviando}
              icon={Send}
              className="w-full"
              size="lg"
            >
              {enviando ? 'Enviando...' : 'Enviar solicitud →'}
            </Button>
          </div>
          <div className="text-center mt-3.5 text-xs text-[var(--text-muted)]/50">
            Tu solicitud será revisada por el administrador del club
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function RegistroPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <Skeleton width="200px" height="1.5rem" />
      </div>
    }>
      <RegistroForm />
    </Suspense>
  )
}
