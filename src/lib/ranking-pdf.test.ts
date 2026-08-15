// El PDF del ranking no puede decir otra cosa que la pantalla del ranking.
// Mismo criterio que panorama-asistencia-pdf.test.ts: se leen los dos fuentes
// y se verifica que compartan las decisiones, en vez de que cada uno tenga su
// propia copia que se despega con el primer cambio.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

const pdf = leer('src/lib/ranking-pdf.ts')
const pantalla = leer('src/app/ranking/page.tsx')

describe('el PDF sale de la pantalla, no de un cálculo propio', () => {
  it('recibe las filas ya calculadas y no vuelve a sumar puntos', () => {
    // Si recalculara "parecido", el día que cambie la tabla de puntaje quedan
    // diciendo cosas distintas y no hay forma de saber cuál miente.
    expect(pdf).not.toContain('calcularRankingInterno')
    expect(pdf).not.toContain('puestosDelTorneo')
    expect(pdf).toContain('ResultadoJugadorRanking')
  })

  it('escribe los nombres igual que la pantalla', () => {
    // Las dos pasan por enBonito: en la base conviven "JORGE GONZALEZ NUÑEZ" y
    // "alejandro garces", y el papel y la app no pueden escribirlos distinto.
    for (const fuente of [pdf, pantalla]) {
      expect(fuente).toContain("from '@/lib/domain/nombreJugador'")
      expect(fuente).toContain('enBonito')
    }
  })

  it('usa la misma tabla de puntaje que la ayuda de la pantalla', () => {
    for (const fuente of [pdf, pantalla]) expect(fuente).toContain('TABLA_PUNTAJE')
  })

  it('arma el podio con la misma regla: un solo ganador claro', () => {
    // La pantalla no muestra podio si empatan varios arriba —pasa cuando casi
    // todos se fueron en grupos con los mismos 9 puntos—, y el SUB13 de Buin es
    // justamente ese caso: tres empatados en 240. Si el PDF usara otra regla,
    // el papel mostraría un campeón que la pantalla no reconoce.
    const regla = /oro\.length === 1 && plata\.length <= 1 && bronce\.length <= 1/
    expect(pdf).toMatch(regla)
    expect(pantalla).toMatch(regla)
  })

  it('agrupa por rank y no por posición en la lista', () => {
    // Tres empatados primeros son tres primeros: no hay segundo.
    for (const fuente of [pdf, pantalla]) {
      expect(fuente).toContain('f.rank === 1')
      expect(fuente).toContain('f.rank === 2')
      expect(fuente).toContain('f.rank === 3')
    }
  })
})

describe('el papel se lee solo', () => {
  it('la tabla lleva a todos, incluidos los del podio', () => {
    // En pantalla el podio los saca de la lista porque están ahí arriba a la
    // vista. En un papel que se lee de corrido, que el 1° no aparezca en la
    // tabla se lee como un error de la tabla.
    expect(pdf).toContain('ranking.filas.map')
    expect(pdf).not.toContain('filter(f => f.rank > 3)')
  })

  it('no usa emoji, que jsPDF no sabe dibujar', () => {
    // Las fuentes que trae jsPDF no tienen las medallas ni el 🏓 de la
    // pantalla: saldrían como cuadraditos en el mural del club.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    const sinComentarios = pdf.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(sinComentarios).not.toMatch(emoji)
  })

  it('dice de cuándo cuenta el ranking si hubo reinicio', () => {
    // Sin esa línea, un PDF post-reinicio parece el ranking histórico completo.
    expect(pdf).toContain('reiniciadoEn')
    expect(pdf).toContain('cuenta desde el')
  })
})

describe('lo puede bajar cualquiera', () => {
  it('el botón no está detrás de esAdmin', () => {
    // Es la misma tabla que el jugador ya tiene delante; el admin no es el
    // único que necesita mostrarla.
    const boton = pantalla.slice(pantalla.indexOf('onClick={handlePdf}'))
    expect(boton.slice(0, 400)).not.toContain('esAdmin')
  })

  it('exporta la categoría que se está mirando', () => {
    expect(pantalla).toContain('exportarRankingPdf(rankingActivo')
  })
})
