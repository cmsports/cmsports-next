import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

describe('el perfil muestra y refresca la ficha que se edita', () => {
  const pagina = leer('src/app/perfil/page.tsx')
  const form = leer('src/components/configuracion/PerfilPersonalConfig.tsx')
  const accion = leer('src/app/actions/club.ts')

  it('trae los mismos campos del ingreso, no solo el nombre', () => {
    expect(pagina).toContain('fecha_nacimiento')
    expect(pagina).toContain('contacto_emergencia_nombre')
    expect(pagina).toContain('talla_polera')
    expect(pagina).toContain('Mis datos')
  })

  it('se refresca sola cuando cambia la ficha', () => {
    expect(pagina).toMatch(/useEnVivo\(\[\s*'jugadores'/)
  })

  it('Auth, perfiles y ficha reciben el mismo nombre compuesto de una vez', () => {
    expect(accion).toContain('nombreDesdePartes(data) || data.nombre')
    expect(accion).toContain('user_metadata: { ...user.user_metadata, nombre }')
    expect(accion).toContain('.from(\'perfiles\').update({ nombre, email })')
  })

  it('el formulario avisa que el correo también es el acceso', () => {
    expect(form).toContain('usuario con el que entras')
    expect(form).toContain('refetchPerfil')
    expect(form).toContain('invalidarPorTabla(\'jugadores\')')
  })
})
