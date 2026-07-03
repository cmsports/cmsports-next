// Instrumentación del cliente (navegador). Next.js 16 lo ejecuta antes de la
// hidratación de React. Sin DSN no hace nada: la app funciona igual.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
})

// Permite a Sentry seguir las navegaciones del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
