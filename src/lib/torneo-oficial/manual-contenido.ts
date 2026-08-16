/** Manual in-app del torneo oficial. Una sola fuente para las pestañas. */

export type BloqueManual = {
  id: string
  titulo: string
  resumen?: string
  parrafos: string[]
  pasos?: string[]
  notas?: string[]
}

export const MANUAL_USO: BloqueManual[] = [
  {
    id: 'mapa',
    titulo: 'El mapa en 30 segundos',
    resumen: 'Tres pantallas. El resto son botones de esas tres.',
    parrafos: [
      'Torneo oficial no es el torneo del club. Acá se arma un campeonato de verdad: varias categorías, grupos ITTF, llaves y un mural para la pared.',
      'Hay tres niveles, siempre en este orden:',
    ],
    pasos: [
      'Campeonato = el fin de semana entero (sede, mesas, sábado y domingo). Se crea en Torneo oficial → + Nuevo campeonato.',
      'Evento = una categoría (ej. Juvenil Varones). Vive dentro del campeonato. Cada una tiene su lista, sus grupos y su llave.',
      'Partido = un cruce. Se carga con sets, W.O. o retiro. El ranking del grupo y la llave se actualizan solos.',
    ],
    notas: [
      'Si te perdés: lista de campeonatos → entrá al campeonato → entrá al evento (la categoría).',
    ],
  },
  {
    id: 'antes',
    titulo: 'Antes de que llegue gente',
    parrafos: [
      'Esto se hace en casa, no el sábado a las 8:00. Si el campeonato y las categorías ya existen, el día del torneo solo es inscribir, programar y jugar.',
    ],
    pasos: [
      'En Torneo oficial pulsá + Nuevo campeonato. Nombre claro (ej. 2do Zonal Individual MET2), sede, zona, fecha de inicio y de término.',
      'Entrá al campeonato. Arriba a la derecha: + Evento / categoría. Una ficha por cada cuadro que se juega (categoría + damas/varones + mejor de 3/5/7).',
      'En cada evento, Día y cuadro: fecha de juego (sábado o domingo) y tamaño de llave (8, 16, 32 o 64). Si no caben todos los 1° y 2° de grupo, la app arma una pre-llave (avance / 1/64). Automático = 2×grupos, sin pre-llave.',
      'Volvé al campeonato. Programación de mesas: cuántas mesas hay, Min/grupo (en un zonal suele ser 70), Min/llave, hora de inicio. Guardar config.',
      'Si hay almuerzo o inauguración, + Bloque (receso / apertura / premiación), Guardar bloques. Esos huecos no se pisan con partidos.',
    ],
  },
  {
    id: 'inscripcion',
    titulo: 'Inscribir jugadores',
    parrafos: [
      'Entrá al evento (la categoría) y pulsá 🪑 Inscripción. Ahí está la mesa. Podés mezclar lista pegada y alta a mano: todo cae en la misma lista.',
    ],
    pasos: [
      'Opción A — pegar o subir: CSV, TSV o Excel. Si las columnas se llaman nombre, asociación, código/ID, ranking (aunque el título esté un poco sucio), las reconoce. Si el Excel tiene muchas hojas, busca la de jugadores.',
      'Opción B — uno por uno: Nombre del jugador + Asociación (opc.) y + Inscribir. Sirve para los que llegan a última hora o para corregir a alguien.',
      'Revisá la lista de abajo. Duplicados se omiten. Mínimo 4 jugadores para formar grupos.',
      'Cabezas de serie: opcionales. Si la lista trae ranking, podés sugerir cabezas. Si no, las elegís a mano. Se guardan al cerrar la inscripción.',
      'Cuando la lista está: Cerrar inscripción · generar grupos. La app arma grupos de 3 o 4 (nunca de 2) y reparte las cabezas.',
    ],
    notas: [
      'Si la vista previa de la lista se ve rara (el nombre cayó en la columna de ID), no importes: corregí el encabezado o cargá esos pocos a mano.',
      'La inscripción se cierra al formar grupos. Después no se agregan jugadores a ese evento.',
    ],
  },
  {
    id: 'programa',
    titulo: 'Armar el mural (el programa del día)',
    parrafos: [
      'El programa se arma en el campeonato, no en cada categoría. Así un jugador que está en dos eventos no queda a la misma hora en dos mesas.',
    ],
    pasos: [
      'Elegí el día (sábado / domingo) si el zonal dura dos jornadas.',
      'Confirmá mesas, Min/grupo, Min/llave y hora de inicio. Guardar config.',
      'Pulsá Auto-programar campeonato. Cada grupo se sienta en una mesa ~70 minutos (los tres o cinco partidos de ese grupo, en orden ITTF). Las llaves usan Min/llave.',
      'Mirá el tablero hora × mesa. Si un partido no cupo, el mensaje te dice que subas mesas o bajes minutos.',
      'PDF mural = la grilla para pegar en la pared. PDF lista = el listado partido por partido. El código vivo (arriba, al lado de las fechas) es el link para jugadores: /torneo-oficial/vivo/CODIGO. Se actualiza solo.',
    ],
    notas: [
      'Si aparece la caja amarilla de conflictos: mismo jugador o misma mesa a la misma hora. Cambiá hora/mesa en el evento, pestaña Programa, o volvé a auto-programar.',
      'Un receso no programado se come partidos: guardalo como bloque especial antes de auto-programar.',
    ],
  },
  {
    id: 'grupos',
    titulo: 'Jugar la fase de grupos',
    parrafos: [
      'Entrá al evento → pestaña Grupos. Cada tarjeta es un grupo. Adentro están los partidos, en el orden en que se juegan.',
    ],
    pasos: [
      'Cargá el resultado con sets (ej. 11-8 9-11 11-6 11-4) o abrí el marcador en vivo si hay tablet.',
      'Si alguien no se presentó: W.O., con motivo (lesión, no llegó, etc.) y alcance (solo este partido, todo el evento, o todo el campeonato).',
      'Si se retira a mitad: Retiro. Los sets que sí se jugaron quedan; el resto no se inventa como partido completo.',
      'La tabla del grupo se calcula sola: 2 puntos al ganador, 1 al que jugó y perdió, 0 al W.O./retiro. Empate: puntos → ratio de sets → ratio de puntos (pelotas).',
      'Cuando el grupo tiene 1° y 2° definidos, esos dos están listos para la llave. No hace falta esperar a que terminen todos los grupos para ir mirando, pero la llave completa se arma al sincronizar.',
    ],
  },
  {
    id: 'llaves',
    titulo: 'Llaves, pre-llave y final',
    parrafos: [
      'Pestaña Llaves. 1° de grupo cruza con 2° de otro grupo. Las cabezas van a los huecos ITTF (no se enfrentan en primera ronda si se puede evitar).',
    ],
    pasos: [
      'Si elegiste un cuadro más chico que 2×grupos, primero se juega Avance (pre-llave / 1/64). Los ganadores llenan la llave principal. Esperá a que terminen los grupos: la app no arma la pre-llave a medias.',
      'Pulsá ↻ Sincronizar llaves si no apareció sola. Reiniciar llaves borra cruce y resultados de playoff; los grupos no se tocan.',
      'Modo de sorteo (fijo / sorteo de 2.os / serpiente) se elige en el evento antes de armar. Fijo es el de siempre: 1° vs 2° de otro grupo, con semillas.',
      'Semis: al cerrar las dos se crea el partido de 3.er lugar. El campeón y el bronce quedan marcados en la ficha del evento.',
      'En un cruce de llave también vale W.O. / retiro, con motivo.',
    ],
  },
  {
    id: 'dia',
    titulo: 'El día del torneo (checklist)',
    parrafos: ['Orden que conviene no saltarse.'],
    pasos: [
      '08:00 — Imprimí el PDF mural y colgalo. Compartí el link vivo (el código del campeonato) en el grupo de WhatsApp.',
      'Mesa de inscripción abierta solo en las categorías que todavía no formaron grupos. Los tardíos se agregan a mano.',
      'Arranque: los grupos juegan en su mesa el bloque de ~70 min. Un juez de mesa anota sets en la app o en la tablet.',
      'Al cerrar grupos: sincronizá llaves. Si hay avance, se juega eso antes de 32avos / 16avos.',
      'Llaves en las mesas libres. Si un jugador está en dos categorías, el programa ya intentó no chocarlos; si choca, lo ves en amarillo.',
      'Final + 3.er lugar. PDF de llaves si hace falta. Archivar el campeonato cuando terminó, para que no ensucie la lista.',
    ],
  },
  {
    id: 'exportar',
    titulo: 'PDFs, Excel y tablet',
    parrafos: [
      'Nada de esto reemplaza la app: son para la pared, la federación o el celular del jugador.',
    ],
    pasos: [
      'Campeonato: PDF mural (grilla) y PDF lista.',
      'Evento → Grupos / Llaves / Programa: botones PDF y Excel (dump, no es el libro de 22 hojas).',
      'Marcador en vivo: desde el partido, si el club tiene el módulo técnico. Sirve en la mesa; al cerrar, el resultado vuelve al evento.',
      'Sanciones: pestaña Sanciones del evento. Amarilla / roja / etc., a mano o copiadas del marcador.',
    ],
  },
  {
    id: 'no-hace',
    titulo: 'Qué no hace esta pantalla',
    parrafos: [
      'Para no buscar botones que no existen:',
    ],
    pasos: [
      'No es el torneo interno del club (ese está en Torneos). Acá no se cobra inscripción ni se pide RUT.',
      'No hay equipos ni doble eliminación.',
      'No hay catálogo de árbitros: el nombre del juez se escribe en el partido, texto libre.',
      'No clona el Excel de 22 hojas. El Excel de acá es un respaldo. El mural y las llaves se operan en la app.',
    ],
  },
]

export const MANUAL_REGLAS: BloqueManual[] = [
  {
    id: 'para-que',
    titulo: 'Para qué son estas reglas',
    parrafos: [
      'Son las bases con las que esta app arma un torneo individual (tipo zonal MET2). Siguen el Manual del Juez General ITTF, no el reglamento del club.',
      'Si una categoría se juega distinto (otro formato de sets, otro tamaño de cuadro), se configura en ese evento. El resto de categorías no se enteran.',
    ],
  },
  {
    id: 'estructura',
    titulo: 'Cómo se arma el torneo',
    parrafos: [
      'Un campeonato puede tener varios eventos (categorías). Cada evento hace su propio camino: inscripción → grupos → (a veces avance) → llaves → campeón y 3.er lugar.',
      'En grupos clasifican 1° y 2°. Con N grupos hay 2N clasificados. Si eso no entra en el cuadro elegido (8, 16, 32 o 64), los de más juegan una pre-llave (avance) y el ganador entra al cuadro.',
    ],
    notas: [
      'Ejemplo: 20 grupos → 40 clasificados. Un cuadro de 32 no les alcanza: hace falta avance. Un cuadro automático usa 64 y rellena con BYE.',
    ],
  },
  {
    id: 'grupos-reglas',
    titulo: 'Grupos',
    parrafos: [
      'Tamaño: de a 3, a veces 4. Nunca de 2. La cantidad de grupos es la parte entera de (inscritos ÷ 3). Ejemplo: 40 jugadores → 13 grupos.',
      'Cabezas de serie: una por grupo, si las marcaste. El resto se reparte al azar (sin dos cabezas juntas).',
    ],
    pasos: [
      'Grupo de 3, orden de juego: 1 vs 3, después 1 vs 2, después 2 vs 3. (El 1 descansa el último partido.)',
      'Grupo de 4: el orden ITTF de 6 partidos (no se inventa uno “más cómodo”).',
      'Todos contra todos dentro del grupo. No hay “el 3 no juega”.',
    ],
  },
  {
    id: 'puntos',
    titulo: 'Puntos y desempate (lo que define 1° y 2°)',
    parrafos: [
      'Esto no es 2-0 como en el torneo del club. Acá el que juega y pierde también suma.',
    ],
    pasos: [
      'Ganador del partido: 2 puntos.',
      'Perdedor de un partido jugado completo: 1 punto.',
      'Perdedor por W.O. o retiro (partido incompleto): 0 puntos.',
      'Si hay empate entre dos o más, solo se mira el subgrupo de empatados, en este orden: 1) puntos de partido, 2) ratio de sets ganados/perdidos, 3) ratio de puntos (pelotas) ganados/perdidos.',
    ],
    notas: [
      'No se desempata “a ojímetro” ni por ranking de la lista. La tabla lo resuelve. Si aún así queda imposible de separar, hay que revisar sets cargados: casi siempre falta un resultado.',
    ],
  },
  {
    id: 'partido',
    titulo: 'El partido: sets, W.O. y retiro',
    parrafos: [
      'El formato (mejor de 3, 5 o 7) lo elige el evento. Un set se gana a 11, con 2 de diferencia, como siempre.',
    ],
    pasos: [
      'Jugado: se cargan los sets hasta que alguien llega a los games del formato (2, 3 o 4).',
      'W.O. (walkover): el partido no se juega. Hay que decir por qué, y hasta dónde vale (este partido, todo el evento, o todo el campeonato). El rival gana; el ausente suma 0 en el grupo.',
      'Retiro: se empezó a jugar y uno no puede seguir. Quedan los sets que sí se jugaron. También pide motivo y alcance.',
      'BYE: hueco sin rival. Avanza solo; no se “marca” a mano.',
    ],
  },
  {
    id: 'llave-reglas',
    titulo: 'La llave (cuadro)',
    parrafos: [
      'Eliminación directa. El 1° de un grupo no se cruza con el 2° del mismo grupo en la primera ronda.',
      'Las semillas (cabezas, o los 1° de grupo) van a posiciones fijas del cuadro ITTF, para que las mejores no se encuentren en 16avos si el cuadro está bien armado.',
    ],
    pasos: [
      'Fijo: 1° vs 2° de otro grupo, con semillas. Es el modo por defecto.',
      'Sorteo de 2.os: los 1° quedan fijos; los 2° se sortean en los huecos libres.',
      'Serpiente: se van cruzando en zigzag (A1 con el último 2°, B1 con el siguiente, etc.).',
      'Pre-llave (avance): solo si el cuadro es más chico que la cantidad de clasificados. Se juega cuando todos los grupos de ese evento ya tienen 1° y 2°.',
      '3.er lugar: partido aparte cuando terminan las dos semis. No es “el que pierde la final es tercero”.',
    ],
  },
  {
    id: 'programa-reglas',
    titulo: 'Mesas y horarios',
    parrafos: [
      'Un grupo completo se programa como un bloque en una mesa (en el zonal, ~70 minutos). No se intercalan partidos de otro grupo en esa mesa durante el bloque.',
      'Las llaves se programan partido a partido, con Min/llave.',
      'Un jugador no puede estar en dos mesas a la misma hora. Una mesa no puede tener dos partidos a la misma hora. Si pasa, la app lo marca como conflicto.',
    ],
    notas: [
      'La hora de Chile es la que vale (no UTC). Las fechas del campeonato y del evento se miran en día chileno.',
    ],
  },
  {
    id: 'sanciones-reglas',
    titulo: 'Sanciones y alcance',
    parrafos: [
      'Además del W.O./retiro, se puede anotar una sanción (amarilla, roja, etc.) en la pestaña Sanciones, ligada a un jugador y opcionalmente a un partido.',
    ],
    pasos: [
      'Alcance partido: vale solo para ese cruce.',
      'Alcance evento: queda fuera de esa categoría (ej. Juvenil Varones).',
      'Alcance campeonato: queda fuera de todas las categorías de ese fin de semana.',
    ],
  },
  {
    id: 'publico',
    titulo: 'Lo que ve el público',
    parrafos: [
      'El link /torneo-oficial/vivo/CODIGO muestra el mural del día, sin login. Se refresca cada 15 segundos. No muestra plata ni datos de club: solo programa y resultados que ya están cargados.',
    ],
  },
]
