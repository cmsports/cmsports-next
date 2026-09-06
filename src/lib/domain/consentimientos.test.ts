import { describe, expect, it } from 'vitest'
import {
  estadoEn,
  firmaVigenteEn,
  etiquetaTipo,
  type Consentimiento,
} from './consentimientos'

const autoriza = (fecha: string, creadoEn?: string): Consentimiento =>
  ({ tipo: 'uso_imagen', otorgado: true, fecha, creadoEn })
const revoca = (fecha: string, creadoEn?: string): Consentimiento =>
  ({ tipo: 'uso_imagen', otorgado: false, fecha, creadoEn })

describe('estado del consentimiento', () => {
  it('sin ninguna fila no dice ni sí ni no', () => {
    // "sin_registro" no es "revocado": a este alumno nadie le preguntó todavía,
    // y tratarlo como una negativa esconde el trabajo que falta hacer.
    expect(estadoEn([], 'uso_imagen', '2026-09-06')).toBe('sin_registro')
  })

  it('una autorización vale desde su fecha en adelante', () => {
    const filas = [autoriza('2026-03-10')]
    expect(estadoEn(filas, 'uso_imagen', '2026-03-10')).toBe('autorizado')
    expect(estadoEn(filas, 'uso_imagen', '2026-09-06')).toBe('autorizado')
  })

  it('y NO vale antes de su fecha', () => {
    expect(estadoEn([autoriza('2026-03-10')], 'uso_imagen', '2026-03-09')).toBe('sin_registro')
  })

  it('la revocación posterior manda de ahí en adelante', () => {
    const filas = [autoriza('2026-03-10'), revoca('2026-08-01')]
    expect(estadoEn(filas, 'uso_imagen', '2026-09-06')).toBe('revocado')
  })

  // ── La razón de ser de toda la tabla ────────────────────────────────────
  //
  // Con una casilla booleana este caso no tiene respuesta: revocar en agosto
  // pisa el valor y en marzo aparece un `false` que es mentira. Es la
  // diferencia entre "publicamos con permiso y después lo retiró" —correcto— y
  // "publicamos sin permiso" —un problema—.
  it('reconstruye si había permiso el día en que se publicó la foto', () => {
    const filas = [autoriza('2026-03-10'), revoca('2026-08-01')]
    expect(estadoEn(filas, 'uso_imagen', '2026-04-15')).toBe('autorizado')
    expect(estadoEn(filas, 'uso_imagen', '2026-08-02')).toBe('revocado')
  })

  it('el día mismo de la revocación ya cuenta como revocado', () => {
    const filas = [autoriza('2026-03-10'), revoca('2026-08-01')]
    expect(estadoEn(filas, 'uso_imagen', '2026-08-01')).toBe('revocado')
  })

  it('vuelve a autorizar después de haber revocado', () => {
    const filas = [autoriza('2026-01-05'), revoca('2026-03-01'), autoriza('2026-06-20')]
    expect(estadoEn(filas, 'uso_imagen', '2026-02-01')).toBe('autorizado')
    expect(estadoEn(filas, 'uso_imagen', '2026-04-01')).toBe('revocado')
    expect(estadoEn(filas, 'uso_imagen', '2026-09-06')).toBe('autorizado')
  })

  it('no le importa el orden en que vengan las filas', () => {
    // Las mismas tres del caso anterior, barajadas: tiene que dar lo mismo.
    const desordenadas = [revoca('2026-03-01'), autoriza('2026-06-20'), autoriza('2026-01-05')]
    expect(estadoEn(desordenadas, 'uso_imagen', '2026-09-06')).toBe('autorizado')
    expect(estadoEn(desordenadas, 'uso_imagen', '2026-04-01')).toBe('revocado')
  })

  it('ignora los consentimientos de otro tipo', () => {
    const filas: Consentimiento[] = [
      { tipo: 'otra_cosa', otorgado: false, fecha: '2026-09-01' },
      autoriza('2026-03-10'),
    ]
    expect(estadoEn(filas, 'uso_imagen', '2026-09-06')).toBe('autorizado')
  })
})

describe('dos firmas el mismo día', () => {
  // El apoderado firma en la mañana y se arrepiente en la tarde. Sin la hora,
  // cuál gana depende del orden en que la base devuelva las filas — o sea del
  // azar, en algo que hay que poder defender.
  it('gana la que se cargó después', () => {
    const filas = [
      autoriza('2026-05-04', '2026-05-04T09:00:00Z'),
      revoca('2026-05-04', '2026-05-04T17:30:00Z'),
    ]
    expect(estadoEn(filas, 'uso_imagen', '2026-05-04')).toBe('revocado')
  })

  it('y da lo mismo en qué orden lleguen', () => {
    const filas = [
      revoca('2026-05-04', '2026-05-04T17:30:00Z'),
      autoriza('2026-05-04', '2026-05-04T09:00:00Z'),
    ]
    expect(estadoEn(filas, 'uso_imagen', '2026-05-04')).toBe('revocado')
  })

  it('sin hora en alguna de las dos, se queda con la primera que vio', () => {
    // No es la respuesta ideal, es la honesta: no hay con qué decidir. Cambiar
    // de opinión según el orden en que llegaron las filas sería peor que
    // quedarse quieto, porque daría dos resultados distintos para el mismo dato.
    const filas = [autoriza('2026-05-04'), revoca('2026-05-04')]
    expect(estadoEn(filas, 'uso_imagen', '2026-05-04')).toBe('autorizado')
  })
})

describe('firmaVigenteEn', () => {
  it('devuelve la fila entera, para poder mostrar la fecha', () => {
    const filas = [autoriza('2026-03-10'), revoca('2026-08-01')]
    expect(firmaVigenteEn(filas, 'uso_imagen', '2026-09-06')?.fecha).toBe('2026-08-01')
  })

  it('null cuando todavía no había ninguna', () => {
    expect(firmaVigenteEn([autoriza('2026-03-10')], 'uso_imagen', '2026-01-01')).toBeNull()
  })
})

describe('etiquetas', () => {
  it('traduce las conocidas y deja pasar las que no', () => {
    expect(etiquetaTipo('uso_imagen')).toBe('Uso de imagen')
    expect(etiquetaTipo('inventado')).toBe('inventado')
  })
})
