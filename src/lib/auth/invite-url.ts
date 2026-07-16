export function getInviteRedirectUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL no configurada')
  return new URL('/auth/callback?next=/crear-contrasena', appUrl).toString()
}
