// Configuración de Sentry para el runtime de Node (servidor).
// Se ejecuta desde src/instrumentation.ts al iniciar el servidor.
// Sin DSN configurado no hace nada: la app funciona igual.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Solo reporta desde producción y solo si hay DSN — nada en local/dev.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === 'production',
  // 10% de las trazas de performance, para no agotar la cuota del plan gratis.
  tracesSampleRate: 0.1,
})
