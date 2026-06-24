'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Mensualidades se fusionó como tab dentro de Finanzas. Esta ruta se
// mantiene solo para no romper enlaces/marcadores antiguos.
export default function MensualidadesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/finanzas?tab=mensualidades')
  }, [router])
  return null
}
