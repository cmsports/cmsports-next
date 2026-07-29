import { redirect } from 'next/navigation'

// Modulo Clases retirado: ningun club lo usa. Se deja el redirect para que un
// link viejo o un bookmark no queden en 404.
export default function Page() {
  redirect('/dashboard')
}
