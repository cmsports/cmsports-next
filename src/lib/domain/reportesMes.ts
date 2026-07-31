// El reporte mensual del horario: cuántas horas dictó cada profesor y cuántas
// veces se dictó cada grupo.
//
// Todo se calcula recorriendo el mes fecha por fecha, nunca multiplicando
// semanas por días. Es más lento y es la única forma de que el número responda
// a la realidad: un mes con cinco martes tiene cinco clases y otro cuatro; un
// grupo que se cerró el 15 dictó hasta el 15; un profesor que entró el 10 cobra
// desde el 10; y un día marcado sin clase no se dictó aunque estuviera en el
// horario.
//
// Cada total viene con el detalle de qué lo compone y qué quedó afuera con su
// motivo. Sin eso, un número en una pantalla es solo una afirmación.

import { minutosDelDia } from '@/lib/domain/horario'
import { vigenteEn, type Vigencia } from '@/lib/domain/vigencia'

export type BloqueMes = Vigencia & {
  id: string
  nombre: string
  sede: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
  cupo_maximo: number
}

export type AsignacionProfesor = Vigencia & { bloque_id: string; profesor_id: string }
export type InscripcionMes     = Vigencia & { bloque_id: string; jugador_id: string }
export type DiaSuspendido      = { bloque_id: string; fecha: string; motivo: string | null }

/** Una clase que sí se dictó. */
export type ClaseDictada = { fecha: string; minutos: number }
/** Una que no, y por qué. El motivo es lo que se muestra en pantalla. */
export type ClaseOmitida = { fecha: string; motivo: string }

const NOMBRE_DIA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

/** Las fechas de lunes a viernes de un mes, en orden. `mes` va de 1 a 12. */
export function diasHabilesDelMes(anio: number, mes: number): string[] {
  const out: string[] = []
  const d = new Date(Date.UTC(anio, mes - 1, 1))
  while (d.getUTCMonth() === mes - 1) {
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** El día de la semana de una fecha ISO, en el código corto del horario. */
export function diaDe(fecha: string): string {
  return NOMBRE_DIA[new Date(fecha + 'T12:00:00Z').getUTCDay()]
}

export function duracionMin(b: BloqueMes): number {
  return Math.max(0, minutosDelDia(b.hora_fin) - minutosDelDia(b.hora_inicio))
}

export type ResumenGrupo = {
  bloque: BloqueMes
  dictadas: ClaseDictada[]
  /** Las que tocaban pero se marcaron sin clase. */
  suspendidas: ClaseOmitida[]
  /** Las que caían en el mes pero el grupo todavía no existía o ya había cerrado. */
  fueraDeVigencia: ClaseOmitida[]
  minutos: number
  /** Cuánta gente tiene hoy —no en el mes—: es un dato del presente. */
  inscritos: number
}

export type ResumenProfesor = {
  profesorId: string
  minutos: number
  /** Fechas distintas en las que dictó al menos una clase. */
  diasTrabajados: string[]
  porGrupo: {
    bloque: BloqueMes
    dictadas: ClaseDictada[]
    /** Lo que no le sumó, con el motivo ya redactado. */
    omitidas: ClaseOmitida[]
    minutos: number
  }[]
}

export type ReporteMes = {
  fechas: string[]
  grupos: ResumenGrupo[]
  profesores: ResumenProfesor[]
  minutosTotales: number
  clasesDictadas: number
  clasesSuspendidas: number
}

export function calcularReporteMes(params: {
  anio: number
  mes: number
  hoy: string
  bloques: BloqueMes[]
  asignaciones: AsignacionProfesor[]
  inscripciones: InscripcionMes[]
  suspensiones: DiaSuspendido[]
}): ReporteMes {
  const { anio, mes, hoy, bloques, asignaciones, inscripciones, suspensiones } = params
  const fechas = diasHabilesDelMes(anio, mes)

  const suspendidoEn = new Map<string, string | null>()
  for (const s of suspensiones) suspendidoEn.set(`${s.bloque_id}|${s.fecha}`, s.motivo)

  // Por profesor y por grupo se va acumulando en el mismo recorrido: son la
  // misma suma mirada de dos maneras, y hacerla dos veces las deja discrepar.
  const acumProf = new Map<string, Map<string, ClaseDictada[]>>()
  const omitProf = new Map<string, Map<string, ClaseOmitida[]>>()

  function anotar<T>(mapa: Map<string, Map<string, T[]>>, profesorId: string, bloqueId: string, valor: T) {
    let porBloque = mapa.get(profesorId)
    if (!porBloque) { porBloque = new Map(); mapa.set(profesorId, porBloque) }
    porBloque.set(bloqueId, [...(porBloque.get(bloqueId) ?? []), valor])
  }

  const grupos: ResumenGrupo[] = bloques.map(b => {
    const duracion = duracionMin(b)
    const delDia = fechas.filter(f => diaDe(f) === b.dia_semana)

    const dictadas: ClaseDictada[] = []
    const suspendidas: ClaseOmitida[] = []
    const fueraDeVigencia: ClaseOmitida[] = []

    for (const fecha of delDia) {
      if (!vigenteEn(b, fecha)) {
        fueraDeVigencia.push({
          fecha,
          motivo: b.vigente_hasta && fecha > b.vigente_hasta
            ? `el grupo cerró el ${b.vigente_hasta}`
            : `el grupo empezó el ${b.vigente_desde}`,
        })
        continue
      }

      const clave = `${b.id}|${fecha}`
      if (suspendidoEn.has(clave)) {
        const motivo = suspendidoEn.get(clave)
        const texto = motivo ? `marcado sin clase — ${motivo}` : 'marcado sin clase'
        suspendidas.push({ fecha, motivo: texto })
        // Al profesor le aparece igual, para que no parezca que le faltan horas
        // sin explicación.
        for (const a of asignaciones) {
          if (a.bloque_id === b.id && vigenteEn(a, fecha)) {
            anotar(omitProf, a.profesor_id, b.id, { fecha, motivo: texto })
          }
        }
        continue
      }

      dictadas.push({ fecha, minutos: duracion })
      for (const a of asignaciones) {
        if (a.bloque_id === b.id && vigenteEn(a, fecha)) {
          anotar(acumProf, a.profesor_id, b.id, { fecha, minutos: duracion })
        }
      }
    }

    return {
      bloque: b,
      dictadas,
      suspendidas,
      fueraDeVigencia,
      minutos: dictadas.length * duracion,
      inscritos: inscripciones.filter(i => i.bloque_id === b.id && vigenteEn(i, hoy)).length,
    }
  })

  const porId = new Map(bloques.map(b => [b.id, b]))
  const idsProfesores = [...new Set([...acumProf.keys(), ...omitProf.keys()])]

  const profesores: ResumenProfesor[] = idsProfesores.map(profesorId => {
    const dictadasDe = acumProf.get(profesorId) ?? new Map<string, ClaseDictada[]>()
    const omitidasDe = omitProf.get(profesorId) ?? new Map<string, ClaseOmitida[]>()
    const bloqueIds = [...new Set([...dictadasDe.keys(), ...omitidasDe.keys()])]

    const porGrupo = bloqueIds.flatMap(bloqueId => {
      const bloque = porId.get(bloqueId)
      if (!bloque) return []
      const dictadas = dictadasDe.get(bloqueId) ?? []
      return [{
        bloque,
        dictadas,
        omitidas: omitidasDe.get(bloqueId) ?? [],
        minutos: dictadas.reduce((s, c) => s + c.minutos, 0),
      }]
    }).sort((a, b) => b.minutos - a.minutos)

    const dias = new Set<string>()
    for (const g of porGrupo) for (const c of g.dictadas) dias.add(c.fecha)

    return {
      profesorId,
      minutos: porGrupo.reduce((s, g) => s + g.minutos, 0),
      diasTrabajados: [...dias].sort(),
      porGrupo,
    }
  }).sort((a, b) => b.minutos - a.minutos)

  return {
    fechas,
    grupos,
    profesores,
    minutosTotales: grupos.reduce((s, g) => s + g.minutos, 0),
    clasesDictadas: grupos.reduce((s, g) => s + g.dictadas.length, 0),
    clasesSuspendidas: grupos.reduce((s, g) => s + g.suspendidas.length, 0),
  }
}

export type ClaseDelDia = {
  bloque: BloqueMes
  profesorIds: string[]
  minutos: number
  inscritos: number
}

export type DiaMes = {
  fecha: string
  sedes: {
    sede: string
    clases: ClaseDelDia[]
    suspendidas: { bloque: BloqueMes; motivo: string }[]
  }[]
}

/**
 * El mismo reporte, reordenado día por día y, dentro de cada día, por sede.
 * Es la forma en que conviene mirarlo y exportarlo: por profesor o por grupo
 * salta de un día a otro sin orden cronológico.
 */
export function porDia(r: ReporteMes, asignaciones: AsignacionProfesor[]): DiaMes[] {
  const porFecha = new Map<string, Map<string, { clases: ClaseDelDia[]; suspendidas: { bloque: BloqueMes; motivo: string }[] }>>()

  function celda(fecha: string, sede: string) {
    let m = porFecha.get(fecha)
    if (!m) { m = new Map(); porFecha.set(fecha, m) }
    let c = m.get(sede)
    if (!c) { c = { clases: [], suspendidas: [] }; m.set(sede, c) }
    return c
  }

  for (const g of r.grupos) {
    for (const c of g.dictadas) {
      const profesorIds = asignaciones.filter(a => a.bloque_id === g.bloque.id && vigenteEn(a, c.fecha)).map(a => a.profesor_id)
      celda(c.fecha, g.bloque.sede).clases.push({ bloque: g.bloque, profesorIds, minutos: c.minutos, inscritos: g.inscritos })
    }
    for (const s of g.suspendidas) {
      celda(s.fecha, g.bloque.sede).suspendidas.push({ bloque: g.bloque, motivo: s.motivo })
    }
  }

  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, sedesMap]) => ({
      fecha,
      sedes: [...sedesMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sede, v]) => ({
          sede,
          clases: [...v.clases].sort((x, y) => x.bloque.hora_inicio.localeCompare(y.bloque.hora_inicio)),
          suspendidas: [...v.suspendidas].sort((x, y) => x.bloque.hora_inicio.localeCompare(y.bloque.hora_inicio)),
        })),
    }))
}

/** Horas con una decimal y coma, como se escriben acá. */
export function horas(minutos: number): string {
  const h = minutos / 60
  return (Math.round(h * 10) / 10).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Semanas del mes, contadas como los días hábiles sobre cinco.
 *
 * Julio 2026 tiene 23 días hábiles: 4,6 semanas. Dividir por "4 semanas" fijas
 * infla el promedio de todo mes que tenga más de 20 días hábiles.
 */
export function semanasDelMes(fechas: string[]): number {
  return fechas.length / 5
}
