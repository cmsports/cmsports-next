'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { loginSchema } from '@/lib/validations/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin() {
    setErrors({})
    setServerError('')

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      parsed.error.issues.forEach(issue => {
        if (issue.path[0]) fieldErrors[issue.path[0] as string] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setServerError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-[400px] px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[var(--purple)] to-[var(--purple-light)] rounded-2xl flex items-center justify-center font-extrabold text-[22px] text-white mx-auto mb-4">CM</div>
          <div className="text-[28px] font-extrabold text-[var(--text)]">CmSports</div>
          <div className="text-sm text-[var(--text-muted)] mt-1.5">Club Unión San Bernardo</div>
        </div>
        <Card>
          {serverError && (
            <div className="bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-lg px-3.5 py-2.5 text-sm text-[var(--red)] mb-3.5">
              {serverError}
            </div>
          )}
          <div className="space-y-3.5">
            <Input
              label="Email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              error={errors.email}
            />
            <Input
              label="Contraseña"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              error={errors.password}
            />
            <Button
              onClick={handleLogin}
              loading={loading}
              className="w-full"
              size="lg"
            >
              {loading ? 'Ingresando...' : 'Ingresar →'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
