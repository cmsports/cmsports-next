// Configuración de Sentry para el runtime Edge (proxy/middleware).
// Se ejecuta desde src/instrumentation.ts. Sin DSN no hace nada.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
})
