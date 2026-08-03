import { describe, expect, it } from 'vitest'
import { iniciosDeInscripcion } from './horario'

// La semana del 27 al 31 de julio de 2026 (lun a vie).
const SEMANA = { lun: '2026-07-27', mar: '2026-07-28', mie: '2026-07-29', jue: '2026-07-30', vie: '2026-07-31' }

const JUE = { id: 'b-jue', dia_semana: 'jue', hora_inicio: '17:00' }
const VIE = { id: 'b-vie', dia_semana: 'vie', hora_inicio: '17:00' }

describe('iniciosDeInscripcion', () => {
  it('una inscripción nueva arranca hoy, no antes', () => {
    const r = iniciosDeInscripcion({ hoy: '2026-07-31', semana: SEMANA, salen: [], entran: [VIE] })
    expect(r.get('b-vie')).toBe('2026-07-31')
  })

  it('inscribir un viernes no lo da por inscrito desde el lunes', () => {
    // El bug que inventaba faltas: lun, mar, mie y jue vencidos y sin lista.
    const r = iniciosDeInscripcion({ hoy: '2026-07-31', semana: SEMANA, salen: [], entran: [VIE] })
    expect(r.get('b-vie')).not.toBe('2026-07-27')
  })

  it('mover de día dentro de la semana en curso alcanza el día nuevo', () => {
    // Viernes 31: lo pasan de jueves a viernes. El jueves ya ocurrió esta
    // semana y su asistencia se traslada, así que la inscripción tiene que
    // cubrir el viernes... que es hoy.
    const r = iniciosDeInscripcion({ hoy: '2026-07-31', semana: SEMANA, salen: [JUE], entran: [VIE] })
    expect(r.get('b-vie')).toBe('2026-07-31')
  })

  it('mover a un día que ya pasó esta semana retrocede hasta ese día', () => {
    // Viernes 31: lo pasan de viernes a miércoles. El miércoles 29 ya pasó,
    // pero es de esta misma semana y su asistencia se mueve ahí.
    const MIE = { id: 'b-mie', dia_semana: 'mie', hora_inicio: '17:00' }
    const r = iniciosDeInscripcion({ hoy: '2026-07-31', semana: SEMANA, salen: [VIE], entran: [MIE] })
    expect(r.get('b-mie')).toBe('2026-07-29')
  })

  // El caso que se escapó: el domingo `fechasDeSemanaChile` devuelve la semana
  // que YA terminó, así que retroceder ahí es reescribir historia cerrada.
  it('un domingo no retrocede a la semana que ya terminó', () => {
    const r = iniciosDeInscripcion({ hoy: '2026-08-02', semana: SEMANA, salen: [JUE], entran: [VIE] })
    expect(r.get('b-vie')).toBe('2026-08-02')
    expect(r.get('b-vie')).not.toBe('2026-07-31')
  })

  it('un sábado tampoco', () => {
    const r = iniciosDeInscripcion({ hoy: '2026-08-01', semana: SEMANA, salen: [JUE], entran: [VIE] })
    expect(r.get('b-vie')).toBe('2026-08-01')
  })

  it('cambiar de horario, no de día, no retrocede nada', () => {
    // Sale jue 17:00, entra jue 19:00: es otro horario, no la misma clase movida.
    const OTRO = { id: 'b-jue-tarde', dia_semana: 'jue', hora_inicio: '19:00' }
    const r = iniciosDeInscripcion({ hoy: '2026-07-31', semana: SEMANA, salen: [JUE], entran: [OTRO] })
    expect(r.get('b-jue-tarde')).toBe('2026-07-31')
  })

  it('los bloques que entran sin pareja que salga arrancan hoy', () => {
    const r = iniciosDeInscripcion({ hoy: '2026-07-31', semana: SEMANA, salen: [JUE], entran: [VIE, { id: 'b-lun', dia_semana: 'lun', hora_inicio: '09:00' }] })
    expect(r.get('b-lun')).toBe('2026-07-31')
  })
})
