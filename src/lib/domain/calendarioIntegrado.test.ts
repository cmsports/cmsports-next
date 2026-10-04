import { describe, expect, it } from 'vitest'
import { clasesDelMes, partidosPropiosDelMes, rangoMesCalendario, sumarDiasCalendario, type InscripcionCalendario, type ActividadCalendario, type PartidoCalendario } from './calendarioIntegrado'
const inscripcion: InscripcionCalendario = { vigente_desde: '2026-10-12', vigente_hasta: null, bloques_horario: { id: 'bloque', club_id: 'spin', nombre: 'Clase', sede: 'Sede', dia_semana: 'lun', hora_inicio: '18:00', hora_fin: '19:00', vigente_desde: '2026-01-01', vigente_hasta: null, activo: true } }
describe('agenda integrada', () => {
  it('respeta inicio de matrícula, feriados, suspensiones y club', () => {
    const feriado = { fecha: '2026-10-19', tipo: 'feriado' } as ActividadCalendario
    expect(clasesDelMes('2026-10', 'spin', [inscripcion], [feriado]).map(c => c.fecha)).toEqual(['2026-10-12','2026-10-26'])
    expect(clasesDelMes('2026-10', 'otro', [inscripcion], [])).toEqual([])
    expect(clasesDelMes('2026-10', 'spin', [inscripcion], [{ ...feriado, tipo: 'suspension' }]).map(c => c.fecha)).toEqual(['2026-10-12','2026-10-26'])
  })
  it('respeta fin de horario, desactivación y fin de matrícula', () => {
    expect(clasesDelMes('2026-10', 'spin', [{ ...inscripcion, vigente_hasta: '2026-10-15' }], []).map(c => c.fecha)).toEqual(['2026-10-12'])
    expect(clasesDelMes('2026-10', 'spin', [{ ...inscripcion, bloques_horario: { ...inscripcion.bloques_horario!, vigente_hasta: '2026-10-15' } }], []).map(c => c.fecha)).toEqual(['2026-10-12'])
    expect(clasesDelMes('2026-10', 'spin', [{ ...inscripcion, bloques_horario: { ...inscripcion.bloques_horario!, activo: false } }], [])).toEqual([])
  })
  it('no duplica clases y conserva la fecha en cambio de mes', () => {
    expect(clasesDelMes('2026-10', 'spin', [inscripcion, inscripcion], [])).toHaveLength(3)
    expect(sumarDiasCalendario('2026-12-31', 1)).toBe('2027-01-01')
    expect(rangoMesCalendario('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
})

const partido: PartidoCalendario = { id:'p',jugador_a_id:'alumno',jugador_b_id:'oponente',arbitro_id:'arbitro',dia_offset:1,bloque_horario:'16:30:00',ligas:{ nombre:'Liga',club_id:'spin' },liga_fechas:{ fecha:'2026-09-30',numero:2 },liga_divisiones:{nombre:'Honor'},liga_mesas:{numero:3} }
describe('partidos propios del calendario', () => {
  it('incluye solo jugador o árbitro vinculados, su día/hora/mesa y no enlaza ruta admin', () => {
    const [propio] = partidosPropiosDelMes('2026-10','spin','alumno',[partido])
    expect(propio).toMatchObject({fecha:'2026-10-01',hora_inicio:'16:30',lugar:'Mesa 3'})
    expect(propio.titulo).toContain('Tu partido')
    expect(propio.enlace).toBeUndefined()
    expect(partidosPropiosDelMes('2026-10','spin','arbitro',[partido])[0].titulo).toContain('Tu arbitraje')
    expect(partidosPropiosDelMes('2026-10','spin','companero',[partido])).toEqual([])
    expect(partidosPropiosDelMes('2026-10','otro','alumno',[partido])).toEqual([])
    expect(partidosPropiosDelMes('2026-09','spin','alumno',[partido])).toEqual([])
  })
  it('un partido sin hora permanece pendiente sin inventar un horario', () => {
    expect(partidosPropiosDelMes('2026-10','spin','alumno',[{...partido,bloque_horario:null}])[0]).toMatchObject({hora_inicio:null,descripcion:'Horario pendiente de confirmación.'})
  })
})
