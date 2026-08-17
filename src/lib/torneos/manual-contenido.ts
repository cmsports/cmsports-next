/** Manual de uso y reglas de torneos club (interno / externo). Una sola fuente para la UI. */

export type TipoManualTorneo = 'interno' | 'externo'

export type BloqueManual = {
  subtitulo?: string
  items: string[]
}

export type SeccionManual = {
  id: string
  titulo: string
  resumen: string
  bloques: BloqueManual[]
}

export const MANUAL_VERSION = '16 de agosto de 2026'

export function introSegunTipo(tipo: TipoManualTorneo): { titulo: string; texto: string } {
  if (tipo === 'interno') {
    return {
      titulo: 'Torneo interno',
      texto: 'Es el torneo del club. Cada uno lleva categoría y género (varones, damas o mixto). Cuando lo finalizas, el puesto de cada jugador suma puntos al Ranking de esa categoría. Las visitas ya registradas también pueden jugar y suman igual.',
    }
  }
  return {
    titulo: 'Torneo externo',
    texto: 'Es el torneo abierto: pueden jugar socios y visitantes de otros clubes. No alimenta el Ranking. El club de procedencia se usa para no juntar, si se puede, a dos del mismo club en el mismo grupo. El visitante existe solo para este torneo: al finalizar, su ficha temporal se borra.',
  }
}

export const SECCIONES_MANUAL_TORNEOS: SeccionManual[] = [
  {
    id: 'interno-externo',
    titulo: 'Interno vs externo',
    resumen: 'Dos módulos, el mismo motor de grupos y llaves. Cambia quién se inscribe y si hay ranking.',
    bloques: [
      {
        subtitulo: 'Torneo interno (menú Torneo Interno)',
        items: [
          'Alimenta el Ranking del club. Los puntos se cargan cuando el torneo queda finalizado (o archivado después de terminar).',
          'Obligatorio: categoría y género (Varones, Damas o Mixto). Cada combinación arma su propio ranking. “Juvenil varones” no se mezcla con “Juvenil damas”.',
          'Puedes crear una categoría nueva (“MASTER Z”, etc.): queda en el selector para siempre y tiene su propio ranking, sin cambiar la ficha de nadie.',
          'En la mesa solo se elige de la lista: socios y visitas ya registradas. No se escribe un nombre nuevo a mano (eso duplicaba fichas y partía el ranking de la misma persona).',
          'Las visitas (ficha marcada como visita) juegan y suman ranking igual que un socio; no tienen cuenta en la app.',
        ],
      },
      {
        subtitulo: 'Torneo externo (menú Torneo Externo)',
        items: [
          'No suma puntos al Ranking.',
          'No pide categoría ni género.',
          'Puedes inscribir un socio del club o escribir un nombre nuevo: se crea una ficha temporal de visitante.',
          'Opcional: club de procedencia. El sistema evita, si hay cupo, que dos del mismo club caigan en el mismo grupo. Si un club trae más jugadores que grupos, el choque es inevitable y se permite.',
          'Al finalizar, las fichas de visitantes se borran (salvo que sigan en otro torneo). El nombre queda guardado en el historial de este torneo. Campeón y subcampeón se conservan un poco más porque el podio los referencia.',
        ],
      },
      {
        subtitulo: 'Lo que es igual en ambos',
        items: [
          'Fase de grupos + eliminación directa, cabezas, BYEs, mesa, pagos, premios, vista en vivo, Excel e informe financiero.',
          'Solo un administrador del mismo club crea y gestiona. Profesores y jugadores pueden mirar; no marcan resultados ni arman llaves.',
          'El Torneo oficial ITTF (menú aparte) es otro módulo, con otras reglas de juez y marcador.',
        ],
      },
    ],
  },
  {
    id: 'permisos-flujo',
    titulo: 'Quién puede qué y el flujo del torneo',
    resumen: 'Admin del club. El torneo recorre inscripción → grupos → playoffs → finalizado → (opcional) archivado.',
    bloques: [
      {
        items: [
          'Crear, inscribir, marcar ganadores, armar llaves, subir plata a Finanzas y finalizar: solo administrador del mismo club. Vale en la pantalla y en el servidor.',
          'Estados: En curso → Finalizado → Archivado. También puede quedar Cancelado si se elimina el flujo a medias, pero lo normal es archivar o borrar.',
          'Fases: Inscripción → Grupos → Playoffs (32avos / 16avos / octavos / cuartos / semis / final, según el tamaño) → Finalizado.',
          'Puede verse “Grupos + playoffs” a la vez: el cuadro aparece mientras siguen grupos abiertos. Es a propósito: las ramas ya completas se pueden jugar.',
          'Arriba, si hay varios torneos activos, aparecen como pestañas para saltar de uno a otro.',
        ],
      },
    ],
  },
  {
    id: 'crear',
    titulo: 'Cómo crear un torneo',
    resumen: 'Nombre, fecha y cuota. El interno pide además categoría y género.',
    bloques: [
      {
        subtitulo: 'Paso a paso',
        items: [
          'Entra a Torneo Interno o Torneo Externo.',
          'Pulsa Nuevo torneo (interno: botón violeta; externo: rojo).',
          'Nombre: no puede quedar vacío; se recortan espacios.',
          'Fecha: día real, formato fecha. Se guarda como día de Chile, no como UTC.',
          'Cuota de inscripción: entero ≥ $0. $0 = torneo gratis, no se crean pagos.',
          'Interno: elige categoría (o crea una) y Varones / Damas / Mixto. Sin eso no se crea.',
          'Al crear queda: formato grupos, estado En curso, fase Inscripción, inscripción abierta, cuota = precio de entrada, club del admin, código público tipo PAINE-01.',
        ],
      },
      {
        subtitulo: 'Después de crear',
        items: [
          'Se abre el torneo. Arriba está el código y el botón QR para la vista en vivo (sin cuenta).',
          'Pulsa Mesa inscripción e inscribe al menos 4 jugadores.',
          'Marca cabezas de serie si las hay (#1, #2, #3…).',
          'Cerrar inscripción · generar grupos. Recién ahí se juega.',
        ],
      },
    ],
  },
  {
    id: 'inscripcion',
    titulo: 'Inscripción y mesa',
    resumen: 'Todos entran a MESA. Mínimo 4 para cerrar. Un jugador no se inscribe dos veces.',
    bloques: [
      {
        items: [
          'Antes de generar grupos, todos viven en el grupo temporal MESA.',
          'Mínimo 4 inscritos para cerrar. Máximo práctico: 32 grupos (hasta 64 clasificados, 2 por grupo).',
          'Quitar de MESA saca al jugador de este torneo; no borra su ficha de socio. Un visitante externo que no está en otro torneo sí puede perder la ficha temporal.',
          'Si la cuota es $0, no hay registro de pago. Si es mayor, hay que elegir efectivo, transferencia o pendiente.',
          'Efectivo y transferencia quedan pagados con la fecha de hoy (Chile). Pendiente queda sin método ni fecha hasta que lo confirmes.',
          'Si falla el pago, la inscripción se revierte: no queda a medias.',
          'Un mismo jugador no puede estar dos veces en el mismo torneo.',
        ],
      },
      {
        subtitulo: 'Interno',
        items: [
          'Busca y elige de la lista. El botón de inscribir no anda si no hay una ficha elegida.',
          'Las visitas aparecen con etiqueta Visita para no confundirlas con un socio homónimo.',
        ],
      },
      {
        subtitulo: 'Externo',
        items: [
          'Si eliges un socio de la lista, se inscribe esa ficha.',
          'Si escribes un nombre y das Enter sin elegir, primero busca coincidencia exacta; si no hay, crea visitante (RUT opcional, categoría inicial principiante, 0 sesiones).',
          'Puedes indicar el club de procedencia. El sistema sugiere clubes ya usados en torneos de tu club para no escribir “Buin”, “buin” y “TDM Buin” como tres cosas distintas.',
        ],
      },
    ],
  },
  {
    id: 'cabezas',
    titulo: 'Cabezas de serie',
    resumen: 'Lista numerada #1, #2, #3… Máximo una por grupo. El número manda en el cuadro y en los BYE.',
    bloques: [
      {
        items: [
          'Se arman en la pantalla del torneo, antes de que se juegue cualquier llave.',
          'La numeración debe ser correlativa desde 1, sin huecos ni duplicados. El mismo jugador no ocupa dos números.',
          'Máximo una cabeza por grupo (estimado o ya creado). Si hay más cabezas que grupos, no se pueden generar los grupos.',
          'Al repartir grupos, las cabezas salen primero en orden de número; el resto serpentea detrás.',
          'Si una cabeza queda eliminada en grupos, no entra al cuadro. Las demás conservan su número.',
          'Mientras haya cambios de cabezas sin guardar, el armado automático del bracket se pausa.',
          'Cuando el cuadro ya tiene una llave jugada de verdad, las cabezas ya no se editan.',
        ],
      },
    ],
  },
  {
    id: 'grupos',
    titulo: 'Formación de grupos',
    resumen: 'Grupos de 3 o 4, nunca de 2. Mínimo 2 grupos. Todos contra todos dentro del grupo.',
    bloques: [
      {
        subtitulo: 'Cuántos grupos',
        items: [
          'Se elige mirando el cuadro que viene después, no solo el tamaño del grupo: entre los repartos que dejan grupos de 3 o 4, se toma el que deje menos BYEs en la llave.',
          'Nunca se arman grupos de 2. En un grupo de 2 clasifican los dos —porque clasifican 2 por grupo—, así que ese partido no decidiría nada más que el orden.',
          'Ejemplos: 6 jugadores → 2 grupos; 7 → 2; 9 → 3; 12 → 4; 24 → 8; 50 → 16; 100 → 32.',
          'Con 50, 64 o 100 jugadores el cuadro queda exacto, sin ningún BYE.',
          'Tope: 32 grupos, que alcanza justo para 100 jugadores.',
        ],
      },
      {
        subtitulo: 'Cómo se reparte',
        items: [
          'Interno: serpentina. Cabezas primero (una por grupo, en orden). El resto sigue el orden en que estaban: A→B→C y luego C→B→A.',
          'Externo: igual con cabezas, y además evita dos del mismo club en el mismo grupo mientras quepa. Si no cabe, reparte al grupo más liviano.',
          'Los grupos se llaman A, B, C… Z, AA, AB… Cada uno tiene un orden fijo para que el cuadro no dependa del abecedario.',
          'Dentro del grupo: todos contra todos, una vez cada pareja. Victoria = 2 puntos, derrota = 0. No hay empate en un partido: siempre hay ganador.',
          'No se mueve ni reordena a alguien de un grupo que ya tiene resultados.',
        ],
      },
    ],
  },
  {
    id: 'clasificacion',
    titulo: 'Clasificación de grupos y desempates',
    resumen: 'Clasifican exactamente el 1° y el 2°. No entran sets ni puntos de cada set.',
    bloques: [
      {
        items: [
          'Clasifican 2 por grupo: 1° y 2°. Nadie más.',
          'Se ordena por puntos (2 por victoria). Se muestran también partidos ganados y perdidos.',
        ],
      },
      {
        subtitulo: 'Orden de desempate (prioridad)',
        items: [
          '1) Más puntos.',
          '2) Si empatan exactamente dos, gana quien le ganó al otro (enfrentamiento directo).',
          '3) Si tres o más empatan en el corte que define los dos cupos, el admin elige el orden a mano (revisando papeletas). Eso se guarda en la base.',
          '4) Si hay un líder solo y tres o más pelean el segundo cupo: el líder queda 1° fijo y solo se elige el 2° entre los empatados.',
        ],
      },
      {
        subtitulo: 'Qué no se usa',
        items: [
          'Sets ganados o perdidos, diferencia de sets, puntos de cada set, diferencia de puntos. No forman parte de la clasificación de este módulo.',
          'El desempate manual solo se guarda si el grupo terminó todos sus partidos y los elegidos son realmente los empatados.',
          'Si ya se jugó la llave de ese grupo en playoffs, primero hay que corregir esa llave (o Volver a grupos) antes de cambiar el desempate.',
        ],
      },
    ],
  },
  {
    id: 'llaves',
    titulo: 'Armado de llaves: cuándo y cómo',
    resumen: 'El esqueleto aparece apenas hay grupos. Se rellena solo. El árbol no se vuelve a sembrar.',
    bloques: [
      {
        subtitulo: 'Cuándo aparece el cuadro',
        items: [
          'En cuanto existen grupos (y no hay un grupo “En preparación”), el sistema dibuja el esqueleto con cupos “Grupo X · 1°/2°”, aunque ese grupo todavía no termine.',
          'Cuando un grupo cierra, se rellena el nombre real en el cupo que ya tenía reservado. El árbol no cambia de forma.',
          'Las ramas que ya tienen ambos jugadores se pueden jugar aunque otros grupos sigan abiertos.',
          'Si una cabeza todavía no está en ningún grupo, el sistema espera a las cabezas antes de congelar mitades.',
          'Mientras nadie haya jugado una llave de verdad, el esqueleto se puede recalcular (por ejemplo si una cabeza que se asumía 1° termina 2°). En cuanto se juega un partido real de playoff, el árbol queda congelado.',
          'Puedes forzar el recálculo con Armar bracket ahora. Volver a grupos borra todas las llaves y deja los resultados de grupos intactos.',
        ],
      },
      {
        subtitulo: 'Tamaño del cuadro (siguiente potencia de 2)',
        items: [
          '4 clasificados (2 grupos) → semifinales.',
          '5 a 8 → cuartos.',
          '9 a 16 → octavos.',
          '17 a 32 → 16avos.',
          '33 a 64 → 32avos.',
          'Los huecos de la primera ronda se llenan con BYE. No hay una “llave de avance” aparte.',
        ],
      },
      {
        subtitulo: 'Prioridad de reglas (de más fuerte a más débil)',
        items: [
          '1) Nunca se enfrentan en la primera ronda dos jugadores del mismo grupo.',
          '2) El 1° y el 2° del mismo grupo quedan en mitades opuestas del cuadro (solo se cruzarían en la final).',
          '3) Separar a #1 y #2 en mitades opuestas (espejo estándar: #1 arriba, #2 abajo).',
          '4) Dar BYE primero a las cabezas de menor número (#1 antes que #2, etc.) y, a igualdad, a los 1° de grupo antes que a los 2°.',
          '5) Ubicar el resto de cabezas lo más cerca posible de su posición de espejo (#3 y #4 en cuartos distintos, #5–#8 en octavos distintos, y así).',
          '6) Preferir cruces 1° contra 2° de otro grupo. Si sobran 2° en una mitad, pueden jugar 2° contra 2°.',
          '7) Repartir grupos ya cerrados entre ambas mitades para que alguna rama se pueda jugar de inmediato.',
          'Si dos reglas chocan, gana la de número más bajo. Ejemplo: si poner a #1 y #2 en mitades opuestas obligaría a un 1° contra su propio 2°, se mueve la cabeza de número más alto y se conserva el cruce legal.',
        ],
      },
      {
        subtitulo: 'Árbol fijo después de la primera ronda',
        items: [
          'Ganador de las llaves 1 y 2 → siguiente llave 1. Ganador de 3 y 4 → siguiente llave 2. Nunca se vuelve a sembrar por ranking.',
          'La fase general del torneo avanza cuando esa ronda está completa y la siguiente ya tiene a todos los jugadores que le tocan.',
        ],
      },
    ],
  },
  {
    id: 'byes',
    titulo: 'Cómo funcionan los BYE',
    resumen: 'Avance automático. No se marcan a mano. Se pueden seguir moviendo hasta que la llave tenga rival real.',
    bloques: [
      {
        items: [
          'BYE = ese jugador no juega la ronda y pasa solo a la siguiente. En pantalla se ve un solo nombre y el sistema lo marca ganador al toque.',
          'Cantidad de BYE = tamaño del cuadro − cantidad de clasificados. Ejemplo: 3 grupos → 6 clasificados → cuadro de 8 → 2 BYE.',
          'Quién los recibe, en orden: cabezas de menor número; luego 1° de grupo; luego 2° solo si aún sobran BYE; a igualdad, el grupo que ya cerró; después el grupo de índice más bajo.',
          'No marques un BYE como partido ganado: el botón no aplica. “Los BYE avanzan automáticamente”.',
          'Un BYE sí se puede arrastrar a otra llave de la ronda inicial, porque no se considera “jugado de verdad” (no hubo rival). En cuanto esa persona ya disputó la ronda siguiente, el BYE deja de moverse.',
          'Si tras un arrastre una llave queda sin rival, esa persona pasa a tener BYE. Si ahora tiene rival, el partido vuelve a quedar pendiente.',
        ],
      },
    ],
  },
  {
    id: 'arrastre',
    titulo: 'Editar el cuadro a mano (arrastre)',
    resumen: 'En computador, ronda inicial no jugada. No se puede dejar a un grupo contra sí mismo.',
    bloques: [
      {
        items: [
          'Solo administrador, en computador, arrastrando cupos de la primera ronda.',
          'Se puede intercambiar entre cualquier llave de esa ronda (ya no hay obligación de quedarse en la misma mitad).',
          'No se editan cuartos, semis ni final: esas rondas siguen el árbol de ganadores.',
          'No se mueve una llave que ya se jugó de verdad (hay rival y hay ganador).',
          'No se puede dejar una llave vacía ni enfrentar a dos del mismo grupo.',
          'Las cabezas sí se pueden mover en esta ronda, mientras la llave no esté jugada. El sistema no las “traba” por ser cabeza.',
          'El cambio es atómico: si una parte falla, no se aplica nada. Queda registro de quién movió qué.',
        ],
      },
    ],
  },
  {
    id: 'resultados',
    titulo: 'Resultados, correcciones y Volver a grupos',
    resumen: 'El ganador tiene que ser uno de los dos. Corregir siempre desde la ronda más avanzada hacia atrás.',
    bloques: [
      {
        subtitulo: 'Marcar un partido',
        items: [
          'Elige al ganador entre los dos participantes. Un partido ya resuelto no se vuelve a marcar: se corrige.',
          'En playoffs, marcar y copiar al ganador a la siguiente llave es atómico: no queda el árbol a medias.',
          'No se marca un partido incompleto ni un BYE.',
          'Si hay un grupo En preparación, termina o elimínalo antes de cargar resultados de ese flujo.',
        ],
      },
      {
        subtitulo: 'Corregir grupos',
        items: [
          'El nuevo ganador debe ser del partido.',
          'Se recalculan puntos, ganados y perdidos, y se borra un desempate manual que haya quedado viejo.',
          'Si la rama de ese grupo ya se jugó en playoffs, corrige primero esas llaves (de adelante hacia atrás) o usa Volver a grupos.',
          'Después el sistema vuelve a poner a 1° y 2° en los cupos que ya tenía el árbol.',
        ],
      },
      {
        subtitulo: 'Corregir playoffs',
        items: [
          'Si la siguiente llave ya se jugó, corrige esa primero.',
          'La llave siguiente tiene que contener todavía al ganador anterior antes de reemplazarlo.',
          'Un torneo ya finalizado no admite esta corrección: hay que volver a un estado administrable.',
        ],
      },
      {
        subtitulo: 'Volver a grupos',
        items: [
          'Borra todos los partidos de playoffs.',
          'Conserva jugadores, grupos y resultados de grupos.',
          'Limpia las marcas de clasificados y deja la fase en Grupos.',
          'El cuadro se puede reconstruir desde los resultados vigentes. Sirve también si el esqueleto quedó mal antes de jugar llaves.',
        ],
      },
    ],
  },
  {
    id: 'tardios',
    titulo: 'Inscripciones tardías y grupos manuales',
    resumen: 'Solo antes de que se juegue una llave. MESA → grupo existente o grupo nuevo En preparación.',
    bloques: [
      {
        items: [
          'Después de que se juega un partido real de bracket, no se inscribe a nadie más.',
          'El tardío entra a MESA. El sistema intenta acomodarlo así:',
          'Si llega 1: al grupo con menos gente que aún tenga menos de 4 y no deje dos cabezas juntas. Se le crean partidos contra todos los que ya están.',
          'Si no hay destino válido, se queda en MESA hasta que haya más tardíos.',
          'Si llegan 2: se crea un grupo nuevo En preparación, sin partidos y sin entrar al cuadro. Cuando llega el 3°, entra a ese grupo; el admin pulsa Finalizar para crear los partidos.',
          'Si llegan 3 o más: grupos nuevos de hasta 4. Un grupo que quede con 2 sigue en preparación. Tres tardíos se quedan juntos; no se parten en 2+1.',
          'Nunca se pasan de 32 grupos. También se les puede poner número de cabeza mientras no exista llave jugada.',
        ],
      },
      {
        subtitulo: 'Reagrupar a mano',
        items: [
          'Si los tardíos se fueron uno a uno y quedaron repartidos: Crear grupo vacío → aparece En preparación → arrastra (computador) o Mover → grupo (móvil) a los 3 o 4 que quieras juntar.',
          'Ningún grupo involucrado puede tener resultados. Nadie pasa de 4. No pueden quedar dos cabezas. Los grupos de origen deben conservar al menos 3.',
          'El grupo en preparación no genera ni acepta resultados. Al Finalizar (2 a 4 jugadores) se crean los todos-contra-todos. Si sigue vacío, se cancela.',
          'Mientras exista un grupo En preparación, el bracket no se arma. Máximo un grupo en preparación a la vez.',
          'Limpiar grupos vacíos borra grupos sin jugadores y partidos sin jugar.',
        ],
      },
    ],
  },
  {
    id: 'vivo',
    titulo: 'Torneo en vivo (sin cuenta)',
    resumen: 'Link público /vivo/CODIGO y QR. El espectador elige su nombre. El club confirma las solicitudes.',
    bloques: [
      {
        items: [
          'En el encabezado del torneo: código + QR. Cualquiera abre el link sin iniciar sesión.',
          'Al entrar: “¿Quién eres?”. Elige su nombre de la lista de inscritos para ver de cerca su próximo partido, o mira como espectador si aún no hay grupos.',
          'Si no aparece: deja nombre y correo. Eso NO lo inscribe. Llega como solicitud; el club la revisa y lo mete desde la mesa si corresponde.',
          'El mismo correo no deja dos solicitudes pendientes para el mismo torneo. Hay límites automáticos contra spam (por minuto, código, identidad y club).',
          'Ojo: la solicitud valida el código, pero no comprueba si la inscripción sigue abierta. Si llega fuera de plazo, el admin la rechaza a mano.',
          'La vista se refresca sola cada 5 segundos: partidos en juego, tablas de grupo, y el cuadro cuando el torneo ya está en playoffs (mientras sigue en grupos, el público no ve el esqueleto a medio armar).',
          'Al finalizar, muestra al campeón. Si el espectador es el campeón, le sale el mensaje de felicitación.',
        ],
      },
    ],
  },
  {
    id: 'ranking',
    titulo: 'Ranking (solo torneos internos)',
    resumen: 'Puntos por puesto final, no por partidos ganados. Se actualizan al finalizar el torneo.',
    bloques: [
      {
        items: [
          'Solo cuentan torneos internos finalizados o archivados. Un torneo en curso no suma: el que hoy va en semis puede terminar campeón o 3-4.',
          'Cada torneo paga el puesto: 1° = 100, 2° = 90, 3-4 = 80, 5-8 = 60, 9-16 = 20, 17-32 = 10, fase de grupos (no clasificó) = 9. Perder no resta.',
          'Los dos que caen en semis son ambos 3-4 (nadie jugó un partido que los ordene). Los cuatro de cuartos son 5-8. Por eso el puntaje va en rangos.',
          'Un BYE no es un partido jugado: no suma victoria. El puesto sale de hasta dónde llegó en la llave.',
          'Los puntos se acumulan entre todos los torneos de esa categoría + género. Dos con los mismos puntos comparten puesto (1, 1, 3). Victorias y derrotas solo ordenan la lista dentro del empate.',
          'Jugar más torneos nunca baja a nadie: solo suma chances.',
          'El ranking que el club traía en papel entra como saldo inicial y se le suma lo que se juegue acá. Quien solo tiene saldo igual aparece en la tabla.',
          'Reiniciar ranking (admin) pone un corte de fecha: los torneos anteriores dejan de contar. El saldo en papel anterior a ese corte también se descarta.',
          'Borrar una categoría inventada puede llevarse su ranking y su saldo en papel. Pide confirmación si hay datos.',
        ],
      },
    ],
  },
  {
    id: 'finanzas',
    titulo: 'Pagos, Finanzas, premios y gastos',
    resumen: 'La cuota vive en el torneo. Subir a Finanzas es un paso aparte. Premios son gastos.',
    bloques: [
      {
        subtitulo: 'Control de pagos',
        items: [
          'Cada inscrito: pagado (efectivo o transferencia) o pendiente. No se duplica el pago del mismo jugador en el mismo torneo.',
          'El panel muestra inscritos, meta (inscritos × cuota), recaudado, efectivo, transferencias y saldo pendiente.',
          'Subir a Finanzas manda solo lo pagado que todavía no se había subido, separado por efectivo y transferencia. Se puede pulsar varias veces: cada vez sube lo nuevo.',
          'El movimiento es cantidad de jugadores × cuota, categoría inscripción de torneo, atado a este torneo. Si los pagos se marcaron pero falla Finanzas, el sistema lo dice explícito.',
          'Finalizar el torneo no exige que todos hayan pagado ni que haya premios.',
        ],
      },
      {
        subtitulo: 'Premios',
        items: [
          'Opcionales para 1°, 2° y 3°. Cada uno es un monto. Se indica si se pagó en efectivo o transferencia.',
          'Guardar premios los registra como gastos en Finanzas (RPC atómico, no se duplican con un doble clic). Los ingresos de inscripción se suben aparte, desde Control financiero.',
          'No hay partido por el tercer lugar en este módulo: el 3° del premio lo decides tú. El ranking igual trata a los dos semifinalistas como 3-4.',
        ],
      },
      {
        subtitulo: 'Gastos de gestión e informe',
        items: [
          'Puedes agregar gastos (arbitraje, agua, etc.). También van a Finanzas por RPC atómico.',
          'Con el torneo finalizado: Informe financiero (PDF) con inscritos, recaudado, premios y gastos. Antes de bajarlo puedes cargar gastos extra para que salgan en el PDF.',
          'Excel: desde que hay grupos, una hoja por fase, para respaldo de cancha.',
        ],
      },
    ],
  },
  {
    id: 'cierre',
    titulo: 'Finalizar, archivar y borrar',
    resumen: 'La final tiene que tener a los dos y un ganador. Archivar no toca Finanzas. Borrar sí.',
    bloques: [
      {
        items: [
          'Finalizar torneo aparece cuando la final está jugada. Guarda campeón, subcampeón, fecha de término, estado y fase Finalizado.',
          'Ahí es cuando el interno escribe el ranking.',
          'En externo, ahí se limpian las fichas temporales de visitantes.',
          'Archivar: sale de la lista activa, queda para consulta histórica. No borra ni descuenta movimientos de Finanzas. Un interno archivado sigue contando en el ranking (archivar no es anular).',
          'Desarchivar lo devuelve a la lista activa.',
          'Eliminar definitivo (después de archivar, o con confirmación fuerte): borra grupos, partidos, pagos y movimientos de Finanzas de ese torneo. Úsalo solo si quieres borrar el historial entero.',
        ],
      },
    ],
  },
  {
    id: 'checklist',
    titulo: 'Lista rápida y límites',
    resumen: 'Lo que hay que mirar antes de cada fase.',
    bloques: [
      {
        subtitulo: 'Antes de grupos',
        items: [
          'Nombre, fecha y cuota correctos. Interno: categoría y género.',
          'Mínimo 4 inscritos. Cabezas sin duplicados, correlativas, máximo una por grupo.',
          'Pagos bien marcados. MESA sin tardíos ni solicitudes sin resolver.',
        ],
      },
      {
        subtitulo: 'Antes de jugar llaves',
        items: [
          'Partidos de los grupos que van a cruzarse, completos. Empates múltiples resueltos.',
          'Sin grupo En preparación. Sin cambios de cabezas sin guardar.',
        ],
      },
      {
        subtitulo: 'Durante playoffs',
        items: [
          'Cruces legales (no mismo grupo). BYE automáticos. Árbol fijo. Correcciones de adelante hacia atrás.',
        ],
      },
      {
        subtitulo: 'Al cerrar',
        items: [
          'Final completa. Campeón y subcampeón. Pagos revisados. Subir a Finanzas. Premios y gastos si corresponden. Interno: verificar Ranking.',
        ],
      },
      {
        subtitulo: 'Límites',
        items: [
          'Mínimo 4 jugadores. Máximo 32 grupos / 64 clasificados. 2 clasificados por grupo.',
          'Cuota y premios ≥ $0. Una cabeza por grupo. Un grupo en preparación a la vez.',
          'Arrastre: computador, ronda inicial no jugada.',
        ],
      },
    ],
  },
]
