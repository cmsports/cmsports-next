import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import LandingPublica from '@/components/landing/LandingPublica'

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-landing',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CMsports — Gestión deportiva para clubes',
  description:
    'Sistema de gestión para clubes y asociaciones: plantel, asistencia, finanzas, torneos y reportes en un solo lugar.',
}

export default function Home() {
  return (
    <div className={manrope.variable}>
      <LandingPublica />
    </div>
  )
}
