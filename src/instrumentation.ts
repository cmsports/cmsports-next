// Next.js 16 ejecuta register() una vez al iniciar cada instancia del servidor.
// Aquí cargamos la config de Sentry según el runtime, y exponemos
// onRequestError para que los errores del servidor lleguen a Sentry.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
