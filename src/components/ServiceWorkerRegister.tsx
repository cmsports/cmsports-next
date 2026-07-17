'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

function clearPrivateCaches(registration?: ServiceWorkerRegistration) {
  const worker = navigator.serviceWorker.controller || registration?.active
  worker?.postMessage({ type: 'CLEAR_PRIVATE_DATA' })
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    let registration: ServiceWorkerRegistration | undefined
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((result) => { registration = result })
      .catch(() => {})

    const supabase = createClient()
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const previousUser = sessionStorage.getItem('cmsports-sw-user')
      const currentUser = session?.user.id || ''
      if (event === 'SIGNED_OUT' || (previousUser && previousUser !== currentUser)) {
        clearPrivateCaches(registration)
      }
      if (currentUser) sessionStorage.setItem('cmsports-sw-user', currentUser)
      else sessionStorage.removeItem('cmsports-sw-user')
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return null
}
