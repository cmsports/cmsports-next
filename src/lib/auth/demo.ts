const DEMO_EMAIL = 'prueba@gmail.com'

export function esCuentaDemo(email: string | null | undefined): boolean {
  return email?.toLowerCase() === DEMO_EMAIL
}
