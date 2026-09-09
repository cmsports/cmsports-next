# Plan — Las cuatro modalidades de torneo (Spinhouse)

**Alcance: solo Spinhouse** (`2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41`).
Buin (`ec1ef215-…`) corre torneos en producción **con el mismo motor**, así que
el criterio que gobierna todo lo que sigue es más estricto de lo habitual:

> Un torneo de Buin creado ayer, abierto mañana, tiene que comportarse **byte por
> byte** como hoy. No parecido: igual.

Escrito leyendo el código el 2026-09-09. Cada afirmación sobre lo que el sistema
hace hoy lleva su archivo y su línea. Donde no pude comprobar algo, lo digo.

---

## 0. Lo que se pidió

El módulo de Torneos pasa a tener **cuatro** modalidades. La que existe hoy deja
de ser "el torneo" y pasa a ser una de las cuatro, con nombre propio:

| # | Modalidad | Estado |
|---|---|---|
| 1 | **Torneo tradicional** — fase de grupos + llave de eliminación | ✅ existe, es todo lo que hay |
| 2 | **Liguilla** (todos contra todos) de **una y de dos ruedas** | 🔨 |
| 3 | **Eliminación directa con cuadro de consolación** — "para que nadie juegue un solo partido" | 🔨 |
| 4 | **Por equipos** — 4 individuales + 1 dobles, o 5 individuales | 🔨 |

### Decisiones tomadas (2026-09-09)

| Decisión | Qué se resolvió |
|---|---|
| **Dónde va el selector** | **Solo en Torneo Externo.** Torneo Interno se queda como está hoy: siempre tradicional, sin selector |
| **El BYE en la consolación** | **Entra igual.** Quien recibió BYE y pierde en 2.ª ronda cae a la consolación en la ronda que le corresponda (§2.3b) |
| **Sistemas por equipos** | **Los dos**, elegibles por torneo: Swaythling (5 individuales) y Corbillon (4 + dobles) |

⚠️ **"Solo en Externo" es una restricción de servidor, no de formulario.**
Esconder el selector en `/torneos/page.tsx` no impide nada: `crearTorneo` es una
Server Action y recibe lo que le manden. **La Action rechaza cualquier modalidad
distinta de `'grupos'` cuando `tipo === 'interno'`**, y el formulario de internos
simplemente no la muestra. Es el mismo razonamiento por el que el cupo por mesas
se valida en la base y no en el navegador.

Esto suma un candado sobre Buin que no estaba previsto y que conviene nombrar:
**el torneo interno —el que Buin más usa, con sus categorías y géneros— queda
literalmente fuera del alcance de este plan.** El módulo sigue haciendo falta
igual, porque Buin también corre torneos externos.

---

## 1. Estado verificado del motor actual

### 1.1 Interno y externo son el mismo motor

No son dos módulos: son **una tabla con una columna `tipo`** y una sola pantalla.

| Qué | Dónde |
|---|---|
| Listado "Torneo Externo" → `/torneos` | `src/app/layout-app.tsx:30` |
| Listado "Torneo Interno" → `/torneos-internos` | `src/app/layout-app.tsx:31` |
| **Los dos navegan a la misma pantalla** | `torneos/page.tsx:166` y `torneos-internos/page.tsx:294`, ambos `router.push('/torneos/${t.id}')` |
| Los dos crean con la misma Action | `crearTorneo` en `src/app/actions/torneos.ts:116` |
| Lo que los distingue | `torneos.tipo` = `'interno'` \| `'externo'` (migración 055) |
| Lo único que hoy cambia por tipo | el 3er lugar (`torneos.ts:516`) y si se pide club de procedencia (`:2445`) |

**Consecuencia para este plan:** no existe "el módulo de torneo externo" como
cosa separable. Cualquier modalidad nueva se escribe en código que Buin usa todos
los días, y el aislamiento tiene que ser explícito (§3).

### 1.2 La modalidad ya tiene su columna, vacía y esperando

```ts
// src/app/actions/torneos.ts:147 — dentro de crearTorneo
formato: 'grupos',
```

`torneos.formato` **se escribe con `'grupos'` fijo en cada torneo y no la lee
nadie.** Verificado: cero `select` que la mencione en `actions/torneos.ts` ni en
`torneos/[id]/page.tsx`.

Esto es el mejor regalo del diseño actual:

- La columna **ya existe** — no hace falta crearla.
- **Todas las filas de todos los clubes ya dicen `'grupos'`** — no hace falta
  migrar un solo dato, ni inventar un default y rezar.
- El nombre ya es el correcto.

> La migración 262 (formato de partido) tuvo que agregar dos columnas con
> `DEFAULT 'bo5'` y comprobar que el default quedara puesto. Acá el dato ya está
> escrito desde el primer torneo. **La migración de la Fase A es un `CHECK`, no
> un `UPDATE`.**

### 1.3 El flujo de hoy, y dónde se bifurca

```
inscripcion
   └─ cerrarInscripcionYGenerarGrupos   (actions/torneos.ts:1297)
        └─ fase 'grupos'  — round robin dentro de cada grupo
             └─ sincronizarLlaves       (actions/torneos.ts:1438)
                  └─ avance → 32vos → … → semis → [tercer_lugar] → final
                       └─ finalizarTorneo (:1766)
```

`CONFIG.FASES_ORDEN = ['avance','32vos','16vos','8vos','cuartos','semis','final']`
(`src/lib/config.ts:18`). La fase `'avance'` **está reservada y nunca se generó**
— lo dice el comentario de `calcularNumGrupos` en `torneos.ts`.

**Los dos puntos de bifurcación son exactamente esos dos:**
`cerrarInscripcionYGenerarGrupos` (qué partidos se crean al cerrar inscripción) y
`sincronizarLlaves` (qué viene después de los grupos). Toda modalidad nueva entra
por ahí y por ningún otro lado.

### 1.4 Ladrillos que ya existen y que este plan reusa

Esto es la mitad del trabajo, ya hecho y probado:

| Función | Qué hace | Para qué sirve acá |
|---|---|---|
| `generarRoundRobin(ids)` | todos contra todos, 1 rueda | **Liguilla** (§4.2) |
| `calcularStatsGrupo(...)` | pts, PG, PP, ratios de sets y puntos | tabla de la liguilla |
| `perdedorDePartido(p)` | el que no ganó, o `null` | **Consolación** (§4.3) |
| `derivarTercerLugar(semis)` | los dos perdedores de semis | precedente exacto de "cuadro que se llega perdiendo" |
| `fasesParaMostrar(presentes)` | intercala `tercer_lugar` antes de la final | **el molde para intercalar fases de consolación** |
| `construirBracketPorRanking(...)` | cuadro con siembra y BYEs | **Eliminación directa** (§4.3) |
| `calcularTamanoBracket(n)` | potencia de 2 que cubre a `n` | ídem |

> `derivarTercerLugar` y `fasesParaMostrar` merecen subrayado. El sistema **ya
> resolvió una vez** el problema "una fase a la que se llega perdiendo, que no
> está en el camino del cuadro y que igual hay que mostrar en el orden correcto".
> El cuadro de consolación es ese mismo problema, siete veces más grande.

### 1.5 El esquema real de un partido

```
torneo_partidos
  torneo_id, grupo_id, fase, orden,
  jugador_a, jugador_b, ganador,
  sets_a, sets_b, puntos_a, puntos_b,
  slot_a_grupo_id, slot_a_posicion, slot_b_grupo_id, slot_b_posicion,
  creado_en
```

Tres cosas que mandan sobre el diseño:

1. **Un partido tiene exactamente dos lados**, y cada lado es **un jugador**.
   Esto es lo que hace caro el dobles y el formato por equipos (§4.4).
2. **Hay un índice único sobre `(torneo_id, fase, orden)`** — se deduce del manejo
   de `23505` en `actions/torneos.ts:452`, que existe porque dos llaves pueden
   terminar a la vez e intentar crear el mismo partido siguiente. Toda fase nueva
   necesita su propio nombre, o dos cuadros distintos colisionan en el mismo slot.
3. Los `slot_*` permiten un partido cuyo rival todavía no se conoce, pero
   **apuntan a un grupo y una posición** (`slot_a_grupo_id`, `slot_a_posicion`).
   No saben expresar "el perdedor del partido X", que es lo que la consolación
   necesita.

### 1.6 🔴 El `CHECK` que nadie conoce

Este es el hallazgo más importante del plan y el que puede tumbar una entrega.

`torneo_partidos` tiene una restricción `torneo_partidos_fase_check` **que no
está en ninguna migración del repo**. Entró desde fuera (entre la 255 y la 259) y
se descubrió recién al intentar insertar la fase `'tercer_lugar'`:

```
ERROR 23514: new row for relation "torneo_partidos"
violates check constraint "torneo_partidos_fase_check"
```

La migración **260** resolvió eso sin adivinar: lee la expresión vigente con
`pg_get_constraintdef()`, la conserva tal cual y le **agrega** el valor nuevo
(`supabase/migrations/260_fase_tercer_lugar_permitida.sql:23-59`).

> **Las tres modalidades nuevas insertan fases que hoy no existen** — `liguilla`,
> `cons_*`, `encuentro`. Las tres van a chocar contra ese CHECK, y el choque
> ocurre **en la primera inserción real, no al aplicar la migración**. La 260 es
> el molde obligatorio: leer, conservar, agregar. Nunca reescribir la lista.

Antes de la Fase A hay que **pegar esto en el SQL Editor y leer qué dice hoy**:

```sql
SELECT pg_get_constraintdef(oid) AS check_actual
FROM pg_constraint
WHERE conrelid = 'public.torneo_partidos'::regclass
  AND conname = 'torneo_partidos_fase_check';
```

---

## 2. Las modalidades, estudiadas

### 2.1 Torneo tradicional — lo que ya existe

Grupos de 3 por defecto (`CONFIG.TORNEO_JUGADORES_POR_GRUPO`), clasifican 1.º y
2.º, y el cuadro se arma por ranking de clasificados con cabezas de serie y BYEs.
Mínimo 4 jugadores, máximo 32 grupos / 64 clasificados.

**No se toca.** Lo único que cambia es que ahora tiene nombre en la pantalla.

### 2.2 Liguilla — todos contra todos, una o dos ruedas

**La regla es simple y el motor ya está.** Todos juegan contra todos; gana el que
queda arriba en la tabla. No hay llave.

- **Una rueda:** cada par se enfrenta una vez → `n(n-1)/2` partidos.
- **Dos ruedas:** ida y vuelta → `n(n-1)` partidos.

⚠️ **La cuenta de partidos es el riesgo real de esta modalidad**, y hay que
mostrarla en pantalla antes de generar:

| Jugadores | 1 rueda | 2 ruedas |
|---:|---:|---:|
| 6 | 15 | 30 |
| 8 | 28 | 56 |
| 10 | 45 | 90 |
| **12** | **66** | **132** |
| 16 | 120 | 240 |

Doce jugadores a dos ruedas son **132 partidos**. A ~20 min por partido y 4 mesas,
son once horas de mesa. Eso no es un bug, pero un club que elige "2 ruedas" sin
ver el número se entera el día del torneo.

> **Decisión de diseño:** el selector muestra el total calculado en vivo —
> *"12 inscritos · 2 ruedas · **132 partidos**"*— antes de dejar cerrar la
> inscripción. Es la misma lógica del aviso de `mesas`: la validación que importa
> es la que se ve antes de apretar.

**Lo que hay que resolver:**

1. **Cómo se guarda.** Una liguilla es conceptualmente **un solo grupo con
   todos**. La opción barata y correcta: crear **un** `torneo_grupos` con los N
   inscritos y usar `generarRoundRobin` — la tabla de posiciones sale gratis de
   `calcularStatsGrupo`, ya probada.
2. **La segunda rueda.** `generarRoundRobin` devuelve pares `[a, b]`. La vuelta
   es el mismo listado con los lados invertidos y un `orden` corrido. En tenis de
   mesa no hay localía, pero **el lado importa igual**: `jugador_a` saca primero
   en el marcador. Invertir es lo correcto y es una línea.
3. **Si termina en la tabla o hay playoff.** Pregunta 3 de §8.
4. **Los desempates.** `calcularStatsGrupo` ya desempata por ratio de sets y de
   puntos. Para una liguilla larga el club puede querer el **enfrentamiento
   directo** primero. Es exactamente el orden que Spinhouse pidió para su liga
   (`plan-spinhouse-maestro.md` §5.4). Va como configuración, no como código.

**Costo: bajo.** Es la modalidad que más reusa y la que menos toca.

### 2.3 Eliminación directa con cuadro de consolación

**El propósito declarado manda sobre el diseño:** *"para que nadie juegue un solo
partido"*. Todo lo que sigue se subordina a eso.

El cuadro principal es eliminación directa normal. Los que pierden **caen a un
segundo cuadro** en vez de irse a la casa, y ese cuadro tiene su propio campeón.

**Lo que hay que decidir, y no es un detalle:**

#### a) ¿Quién entra a la consolación?

| Variante | Quién entra | Consecuencia |
|---|---|---|
| **Solo perdedores de la 1.ª ronda** | los que caen en R1 | Lo estándar. **Cumple el propósito.** Barato |
| Perdedores de R1 y R2 | dos oleadas | El cuadro de consolación necesita byes propios; se complica |
| Doble eliminación completa | todos, hasta perder dos veces | Otro torneo. **Fuera de alcance** |

**Recomendación: solo perdedores de la 1.ª ronda.** Cumple exactamente lo pedido
—nadie juega un solo partido— con el cuadro más simple posible.

#### b) 🔴 El problema de los BYE, que es el que muerde

Un cuadro de 16 con 11 inscritos tiene 5 BYEs. Quien recibe un BYE **no juega la
1.ª ronda**: entra directo a la 2.ª. Si pierde ahí:

> **jugó exactamente un partido, y no entra a la consolación porque no perdió en
> primera ronda.** El torneo incumple su única promesa, con el jugador que más
> derecho tenía a reclamar: el que fue sembrado arriba.

Esto **no falla, no da error y no se ve en ninguna prueba de lógica**. Se ve el
día del torneo, en la cara de un chico de 12 años.

✅ **Decidido (2026-09-09): el perdedor de R2 que venía de BYE entra a la
consolación**, en la ronda que le corresponda.

Es la única salida que cumple la promesa sin depender de que el número de
inscritos sea redondo. Las otras dos quedaron descartadas y conviene dejar por
qué, para no rediscutirlas:

- *No repartir BYEs y jugar una ronda previa de `avance`.* Conceptualmente más
  limpio —`CONFIG.FASES_ORDEN` ya reserva `'avance'` para exactamente esto y
  nunca se usó—, pero rehace el armado del cuadro, que hoy funciona.
- *Aceptar la excepción y avisarla en pantalla.* Honesto, pero incumple lo que el
  club pidió.

**Cómo se implementa, en concreto.** La regla no es "los perdedores de R1": es
**todo el que quede eliminado habiendo jugado un solo partido**. Formulada así se
programa sola y no tiene casos raros:

```
al cerrar un partido del cuadro principal:
  perdedor = perdedorDePartido(partido)        // ya existe, torneos.ts:68
  si perdedor y partidosJugados(perdedor) == 1 → va a consolación
```

⚠️ **Y por eso `perdedorDePartido()` devolviendo `null` importa.** Un partido
resuelto por BYE no tiene perdedor —la función ya lo contempla—, así que un BYE
nunca manda a nadie al cuadro de consuelo por accidente.

**La prueba de este formato es la promesa del formato:** simular 11, 16 y 23
inscritos y comprobar que **ningún jugador terminó con un solo partido**.

#### c) Las fases nuevas

El cuadro de consolación necesita nombres de fase propios (§1.5, el índice único):
`cons_8vos`, `cons_cuartos`, `cons_semis`, `cons_final`. Y `fasesParaMostrar()`
tiene que aprender a ponerlas **después** del cuadro principal, igual que hoy
intercala `tercer_lugar` antes de la final.

Todas chocan con el `CHECK` de §1.6.

**Costo: medio.** El bracket ya existe; lo nuevo es el segundo cuadro, la regla de
entrada y la pantalla que muestra dos llaves sin marear.

### 2.4 Por equipos — Swaythling y Corbillon

**Son dos sistemas distintos**, aunque el formulario del club los nombre juntos.
Confirmado contra la fuente, no citado de memoria:

#### Sistema Swaythling Cup — 5 individuales

- **3 jugadores por equipo**: A, B, C contra X, Y, Z.
- **Orden fijo: A-X · B-Y · C-Z · A-Y · B-X.**
- Al mejor de 5 partidos: **el encuentro termina apenas un equipo gana 3.**
- Cada jugador juega dos veces, salvo C y Z que juegan una.

#### Sistema Corbillon Cup — 4 individuales + 1 dobles

- **2 a 4 jugadores por equipo** (con 2 alcanza — por eso es el más usado).
- **Orden fijo: A-X · B-Y · DOBLES · A-Y · B-X.**
- Al mejor de 5: termina apenas un equipo gana 3.
- **Los del dobles pueden ser distintos de los del individual.**

> Que con **dos** jugadores se pueda formar equipo no es trivia: es la razón por
> la que este sistema se usa tanto en clubes chicos. Para un club de 140 alumnos
> donde armar tríos es difícil, Corbillon es probablemente el que de verdad se va
> a jugar.

✅ **Decidido (2026-09-09): se implementan los dos**, y cada torneo por equipos
declara cuál usa (`torneo_encuentros.sistema`).

El costo extra sobre hacer solo Corbillon es bajo, y vale la pena decir por qué:
**el dobles obliga igual a agregar `jugador_a2`/`jugador_b2`** (§4.4), que es la
parte cara del esquema. Con eso puesto, Swaythling es el mismo motor con una
lista de emparejamientos distinta y sin dobles. Son dos filas en un catálogo:

```ts
swaythling: { partidos: ['A-X','B-Y','C-Z','A-Y','B-X'], dobles: null,  minJugadores: 3 }
corbillon:  { partidos: ['A-X','B-Y','DOBLES','A-Y','B-X'], dobles: 2, minJugadores: 2 }
```

⚠️ **El orden de los partidos es fijo por reglamento y no se configura.** Va en el
catálogo como constante, con su fuente citada al lado. Si alguien lo "mejora"
más adelante, el torneo deja de ser Swaythling.

#### 🔴 Por qué esta modalidad no cabe en el modelo actual

`torneo_partidos` tiene **dos lados y cada lado es un jugador** (§1.5). El formato
por equipos rompe eso en tres lugares a la vez:

| Lo que hace falta | Por qué no cabe hoy |
|---|---|
| Un **equipo** como participante | Todo el modelo inscribe `jugadores` |
| Un **encuentro** entre dos equipos, contenedor de 5 partidos | No existe la jerarquía; un partido cuelga del torneo o del grupo |
| Un **dobles**: 4 jugadores en un partido | Solo hay `jugador_a` y `jugador_b` |
| La **alineación**: quién es A, B y C en este encuentro | No existe |
| El encuentro **se corta en 3-0 o 3-1** | Hoy todo partido generado se juega |

Esto ya estaba anticipado en `docs/plan-spinhouse-implementacion.md` §3.8:

> *"equipos es el más caro con diferencia […] Es un módulo propio, no una opción
> del selector de formato."*

**Ese hallazgo sigue siendo correcto y este plan lo respeta.** Desde la pantalla
va a ser "una de las cuatro modalidades", porque es lo que el club pidió; **por
dentro es un módulo con sus propias tablas**, y por eso va última y sola.

⚠️ **Y arrastra al resto del sistema.** El supuesto "un partido es entre dos
jugadores" no vive solo en la tabla: lo asumen el ranking interno, el marcador en
vivo, los exportes a Excel y PDF, y la ficha del jugador. Un partido de dobles
que llegue a `rankingInterno.ts` sin que nadie lo haya pensado va a sumar puntos
raros o reventar. **Cada uno de esos consumidores hay que revisarlo uno por uno**,
y es lo que hace que esta modalidad valga por las otras dos juntas.

**Costo: alto.** Tablas nuevas, alineación, corte anticipado, dobles, y una
revisión de todo lo que hoy lee partidos.

---

## 2.5 Las cabezas de serie en cada modalidad

Pregunta que hay que responder antes de programar, porque decide qué se reusa.

### Qué hacen hoy

`torneo_cabezas_serie` es una lista **numerada** de jugadores por torneo
(migración 045). Se usa en **dos momentos distintos**:

1. **Al armar los grupos** — `seedingSerpenteo` pone las cabezas al principio de
   la lista y la serpentina las reparte **una por grupo**, así no se cruzan en la
   fase de grupos.
2. **Al armar la llave** — `construirBracketPorRanking` ancla cada cabeza en su
   esquina (`RankeadoParaBracket.cabezaNumero`) y los BYE caen en los mejores
   seeds.

Hoy hay un tope, escrito **dos veces** (`actions/torneos.ts:1338` y `:1487`):
*"Hay N cabezas para M grupos. Debe existir como máximo una cabeza por grupo."*

### Qué se reusa de `construirBracketPorRanking`

La función tiene **dos capas**, y solo una es general:

| Capa | Qué hace | ¿Sirve sin grupos? |
|---|---|---|
| **Núcleo** | `calcularTamanoBracket` + sembrado **bit-reversal** (`posicionesSembradas`); los BYE caen solos en los mejores seeds | ✅ **tal cual** |
| `separarMitades` | el 2.º de un grupo va a la mitad opuesta de su 1.º | ❌ no aplica |
| `emparejarPrimeroContraSegundo` | un ganador de grupo enfrenta a un 2.º | ❌ no aplica |
| backstop de choque | dos del mismo grupo no comparten llave inicial | ❌ no aplica |

**Hipótesis a confirmar con una prueba antes de darla por buena:** si en
eliminación directa cada jugador entra con un `grupoIdx` propio y `posicion: 1`,
las tres capas de grupos **no encuentran nada que ajustar y se vuelven no-ops
solas**, dejando el bit-reversal puro **sin tocar una línea de la función**.
Deducido leyendo el código, no ejecutándolo. Si se confirma, la Fase C no
necesita un armador de cuadro propio.

### Modalidad por modalidad

| Modalidad | Cabezas de serie | Tope |
|---|---|---|
| **Tradicional** | como hoy | 1 por grupo *(sin cambio)* |
| **Liguilla** | **no se usan** | — |
| **Elim. + consolación** | **sí, y pesan más que hoy** | potencia de 2: 2, 4, 8, 16 |
| **Por equipos** | sí, pero **de equipos** | potencia de 2 |

**La liguilla no lleva editor de cabezas**, y no por ahorrar: con todos contra
todos **la siembra no cambia un solo resultado**. A lo sumo ordena el calendario
para que el clásico no caiga en la fecha 1, que es espectáculo y no deporte. Si
el club lo pide, se agrega después como orden del fixture — nunca como siembra.

⚠️ **En eliminación directa la siembra importa MÁS que en el torneo tradicional.**
Es contraintuitivo y por eso conviene dejarlo escrito: hoy los grupos ya hacen de
filtro —dos favoritos se reparten en grupos distintos y llegan a la llave desde
lados opuestos—, así que sembrar la llave corrige poco. **Sin grupos, el cuadro
se arma directo desde la inscripción**: sin siembra, los dos mejores pueden
cruzarse en primera ronda y uno cae al cuadro de consolación en la primera hora.

⚠️ **El tope de `actions/torneos.ts:1338` y `:1487` está atado a los grupos** y no
significa nada en un cuadro directo. Pasa a ser el estándar de siembra por
potencias de 2. El `CHECK (numero between 1 and 32)` de la tabla ya lo permite.

### 🔴 En equipos, la tabla actual no sirve

```sql
create table public.torneo_cabezas_serie (
  torneo_id  uuid not null references public.torneos(id) on delete cascade,
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  numero     integer not null check (numero between 1 and 32),
  primary key (torneo_id, jugador_id)
);
```

`jugador_id` es **`not null`, con FK a `jugadores` y parte de la clave primaria**.
En un torneo por equipos **se siembra el equipo, no el jugador**: el mejor equipo
no es necesariamente el del mejor jugador. No hay forma de meter un equipo ahí
sin romper la FK o inventar un jugador falso, que sería peor.

**Sale con una tabla hermana** (Fase D), y nada de lo existente cambia:

```
torneo_equipos_cabezas   torneo_id, equipo_id → torneo_equipos, numero
```

El editor `CabezasSerieEditor.tsx` se reusa cambiándole de qué lista saca los
candidatos —jugadores inscritos o equipos inscritos—, no duplicándolo.

---

## 3. Dónde vive la modalidad

### 3.1 La modalidad es del torneo, no del club

Distinción que ordena todo:

- **Qué modalidad tiene ESTE torneo** → dato del torneo → **`torneos.formato`**.
  No es configuración: dos torneos del mismo club, el mismo mes, pueden ser uno
  liguilla y otro por equipos.
- **Si el club VE el selector** → sí/no por club → **módulo**, el mecanismo que
  ya existe (`src/lib/domain/modulos.ts`, 27 módulos, `modulos_habilitados`).

`club_config` **no** es el lugar acá: CLAUDE.md reserva esa tabla para valores
—un número, una opción, un sí/no— y "qué modalidades existen" no es un valor del
club sino una capacidad del producto.

### 3.2 Dos módulos, no uno

| Módulo | Enciende | Por qué aparte |
|---|---|---|
| `torneos_modalidades` | Liguilla + Eliminación con consolación | Mismo motor, mismas tablas, mismo `/torneos/[id]` |
| `torneos_equipos` | Por equipos | Tablas propias, pantalla propia, otro concepto de participante |

Separarlos permite entregar liguilla y consolación **sin esperar** a equipos, que
es cuatro veces más grande. Y sigue el criterio que `modulos.ts` ya aplica en sus
27 entradas: se separa cuando cambia **de dónde sale** algo, no cuando agrega un
campo.

### 3.3 Lo que protege a Buin

Cinco candados, y ninguno es opcional:

0. **El torneo interno queda fuera, y lo hace cumplir el servidor.** Es el
   candado más grande y salió de la decisión de §0: la pantalla que Buin más usa
   —torneos internos, con sus categorías y géneros— no cambia en absoluto. La
   Action rechaza una modalidad no tradicional si `tipo === 'interno'`.
1. **`formato = 'grupos'` es el default y ya está escrito en cada fila.** Un
   torneo sin modalidad declarada es tradicional. No hay caso "sin valor".
2. **Sin el módulo, no hay selector.** Buin crea torneos exactamente con el
   formulario de hoy: nombre, fecha, cuota, bo3/bo5.
3. **La bifurcación se lee del torneo, nunca del club.** Ni un
   `if (clubId === '2d8e…')` en `actions/torneos.ts`. Si aparece uno, el diseño
   está mal.
4. **Una prueba que lo hace cumplir**, del estilo que este repo ya usa tres veces
   (`escrituras-revisadas.test.ts`, `rutas-protegidas.test.ts`,
   `migraciones-numeracion.test.ts`): recorrer `src/app/actions/torneos.ts` y
   `src/lib/domain/torneos*.ts` y **fallar si aparece un UUID de club literal**.
   Barata, y caza la clase entera del bug.

### 3.4 Cómo se elige, en pantalla

Al apretar **Nuevo torneo** en Torneo Externo, el modal que ya existe
(`src/app/torneos/page.tsx:252-290` — nombre, fecha, cuota, `SelectorFormato`)
gana el tipo de torneo **arriba de todo**, antes del nombre.

**El orden no es estético.** La modalidad decide qué campos vienen abajo; puesta
al final, el formulario cambia de forma después de estar lleno.

| Modalidad | Campos extra | Selector de sets |
|---|---|---|
| Tradicional | — | dos: grupos y llave *(como hoy)* |
| Liguilla | una rueda / ida y vuelta | **uno solo** |
| Elim. + consolación | — | dos: cuadro principal y consolación |
| Por equipos | Swaythling / Corbillon | **uno solo** |

⚠️ **`SelectorFormato` no sirve tal cual y hay que adaptarlo.** Hoy pregunta los
sets por fase con las etiquetas fijas *"Fase de grupos"* y *"Llave (playoffs)"*
(`src/components/torneos/SelectorFormato.tsx:57-63`). **En una liguilla no existe
ninguna de las dos**, y en un torneo por equipos tampoco. El componente pasa a
recibir qué fases tiene la modalidad, en vez de asumir dos.

⚠️ **El contador de partidos NO va en este modal.** Al crear el torneo todavía no
hay inscritos —el propio modal dice que "los jugadores se inscriben el día del
torneo en la mesa de inscripción"—, así que el número no existe. El aviso
*"12 inscritos · 2 ruedas · 132 partidos"* de §2.2 va **al cerrar la
inscripción**, que es donde se sabe la cifra y donde todavía se puede echar pie
atrás. En el modal solo va la advertencia genérica de que dos ruedas duplican.

### 3.5 La modalidad se congela al cerrar la inscripción

Cambiar la modalidad con partidos ya generados invalida todo lo jugado — el mismo
razonamiento por el que la 262 dice que el formato bo3/bo5 "no se puede cambiar
sin invalidar los marcadores ya cargados".

**Regla:** editable mientras `fase = 'inscripcion'`; a partir de ahí, de solo
lectura y con el motivo escrito en la pantalla.

---

## 4. Modelo de datos

### 4.1 Fase A — la modalidad (migración 263)

```sql
-- torneos.formato ya existe y ya dice 'grupos' en todas las filas.
-- Esto NO agrega la columna ni migra datos: solo declara qué valores valen.
ALTER TABLE public.torneos
  DROP CONSTRAINT IF EXISTS torneos_formato_check;
ALTER TABLE public.torneos
  ADD CONSTRAINT torneos_formato_check
  CHECK (formato IN ('grupos', 'liguilla', 'eliminacion_consolacion', 'equipos'));

ALTER TABLE public.torneos
  ALTER COLUMN formato SET DEFAULT 'grupos';
```

⚠️ **Antes del `CHECK`, comprobar que no haya filas fuera de la lista.** Si algún
torneo viejo tiene `formato` en `NULL` o con otro texto, el `ADD CONSTRAINT`
falla y voltea la transacción. Se verifica primero y se normaliza si hace falta:

```sql
SELECT formato, count(*) FROM public.torneos GROUP BY formato;
```

Más `ruedas smallint NOT NULL DEFAULT 1 CHECK (ruedas IN (1,2))` para la liguilla.

### 4.2 Fase B — liguilla

**Sin tablas nuevas.** Un `torneo_grupos` con todos los inscritos, partidos con
`fase = 'liguilla'`. Lo único de esquema es ampliar el `CHECK` de §1.6 con el
método de la 260.

### 4.3 Fase C — consolación

**Sin tablas nuevas.** Fases `cons_*` en `torneo_partidos`, ampliando el mismo
`CHECK`. Lo que sí hace falta es saber **de qué partido viene** cada jugador del
cuadro de consolación: hoy los `slot_*` apuntan a un grupo y una posición, no a
"el perdedor del partido X". Dos columnas nullable lo resuelven:

```sql
ALTER TABLE public.torneo_partidos
  ADD COLUMN IF NOT EXISTS origen_a_partido_id uuid REFERENCES torneo_partidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen_b_partido_id uuid REFERENCES torneo_partidos(id) ON DELETE SET NULL;
```

Nullable y sin default: un partido del cuadro principal las deja en `NULL` y no se
entera de que existen.

### 4.4 Fase D — equipos

Tablas propias, ninguna existente cambia de forma:

```
torneo_equipos            id, torneo_id, nombre, club_procedencia, orden
torneo_equipo_jugadores   equipo_id, jugador_id, orden   -- el orden es A/B/C
torneo_equipos_cabezas    torneo_id, equipo_id, numero   -- siembra DE EQUIPOS (§2.5)
torneo_encuentros         id, torneo_id, fase, orden,
                          equipo_a_id, equipo_b_id,
                          sistema ('swaythling' | 'corbillon'),
                          puntos_a, puntos_b, ganador_equipo_id
torneo_partidos           + encuentro_id  uuid NULL
                          + jugador_a2, jugador_b2  uuid NULL   -- el dobles
```

`torneo_equipos_cabezas` es hermana de `torneo_cabezas_serie` y **no la reemplaza**:
la existente tiene `jugador_id not null` con FK a `jugadores` dentro de su clave
primaria, así que un equipo no entra ahí de ninguna forma (§2.5).

`jugador_a2`/`jugador_b2` **nullable** es lo que deja intacto todo lo demás: un
partido individual los deja en `NULL` y cualquier consulta de hoy sigue leyendo
`jugador_a` y `jugador_b` como siempre.

⚠️ **La alineación (quién es A, B, C) se declara por encuentro, no por equipo.**
Un mismo equipo puede alinear distinto en dos encuentros del mismo torneo, y esa
es justamente la decisión táctica del sistema. `torneo_equipo_jugadores.orden` es
la alineación **por defecto**; el encuentro guarda la suya.

---

## 5. Las fases de ejecución

Cada una entrega algo usable sola y no depende de la siguiente.

### Fase A — El andamiaje (sin cambio de comportamiento) ✅ 2026-09-09

**Entregada.** Migraciones 263 y 264 aplicadas en producción; `npm test` en
**1399 verdes sin modificar ninguna prueba existente**, typecheck limpio, lint
sin errores nuevos y `next build` completo.

Lo que quedó fuera a propósito, con el motivo:

- **Congelar la modalidad al cerrar la inscripción (§3.5).** No hay nada que
  congelar: la modalidad solo se elige al crear el torneo y **no existe ninguna
  pantalla que la edite después**. El candado se construye cuando exista la
  puerta; hoy sería código muerto.
- **Mostrar la modalidad en la ficha del torneo.** Con todos los torneos en
  `grupos`, mostrarla diría "Tradicional" en cada ficha de Buin, que es ruido.
  Va en la Fase B, y solo cuando la modalidad **no** es la tradicional.


1. Leer el `CHECK` real de `torneo_partidos.fase` (§1.6) y anotarlo.
2. Migración 263: `CHECK` de `formato` + `ruedas`, previa verificación de filas.
3. Catálogo `src/lib/domain/modalidadTorneo.ts` — nombre, explicación, mínimo de
   jugadores y si admite ruedas. Mismo patrón que `marcador.ts` con `FORMATOS`.
4. Módulos nuevos en `modulos.ts` con su comentario de por qué van aparte.
5. Selector **solo en el formulario de Torneo Externo** (`src/app/torneos/page.tsx`)
   y **solo con el módulo encendido**. `torneos-internos/page.tsx` no se toca.
6. **La validación en `crearTorneo`**, que es la que de verdad manda:
   `tipo === 'interno'` con una modalidad distinta de `'grupos'` se rechaza con
   error, aunque el formulario no la ofrezca. Una Server Action recibe lo que le
   manden.
7. La modalidad se muestra en la ficha del torneo y se congela al cerrar (§3.5).
8. La prueba anti-`if` de §3.3.

**Criterio de salida:**

- La suite entera pasa **sin modificar una sola prueba**.
- Un torneo de Buin creado antes y después de la Fase A se comporta idéntico.
- Un torneo **interno** de cualquier club sigue siendo tradicional, y la Action lo
  hace cumplir aunque alguien mande otra cosa a mano.

### Fase B — Liguilla de una y dos ruedas

`cerrarInscripcionYGenerarGrupos` bifurca: un grupo con todos y round robin ×N.
Sin llave. Tabla de posiciones con `calcularStatsGrupo`. Contador de partidos en
vivo en el selector (§2.2).

**Criterio de salida:** una liguilla de 8 a 1 rueda genera 28 partidos y la tabla
ordena igual que un grupo de hoy.

### Fase C — Eliminación directa con consolación

Cuadro principal desde la inscripción (sin grupos), consolación con los perdedores
de R1 **más los de R2 que venían de BYE** (§2.3b). Fases `cons_*`.
`fasesParaMostrar()` aprende a ordenarlas. Siembra por potencias de 2 (§2.5).

**Primer paso, antes de escribir el armador:** confirmar con una prueba la
hipótesis de §2.5 —que con `grupoIdx` propio y `posicion: 1` las tres capas de
grupos de `construirBracketPorRanking` se vuelven no-ops y queda el bit-reversal
puro—. Si se confirma, no hace falta armador propio. Si no, se extrae el núcleo a
una función aparte y las tres capas quedan donde están.

**Criterios de salida:**

- Simulación con 11, 16 y 23 inscritos donde **se comprueba que ningún jugador
  terminó con un solo partido.** Es la promesa del formato, así que es la prueba
  del formato.
- Con 16 inscritos y 4 sembrados, los seeds 1 y 2 **no pueden cruzarse antes de
  la final** del cuadro principal.

### Fase D — Por equipos

Tablas nuevas, alineación por encuentro, corte en 3, dobles. Y la revisión uno por
uno de todo lo que hoy lee partidos (§2.4).

**Criterio de salida:** un encuentro 3-0 deja los partidos 4 y 5 sin jugar y no
rompe ningún reporte; el ranking no cuenta un dobles como individual.

---

## 6. Riesgos

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| 1 | **El `CHECK` desconocido** de `torneo_partidos.fase` voltea la primera inserción real | **Alta** | Leerlo antes; ampliarlo con el método de la 260, nunca reescribirlo |
| 2 | **Buin usa el mismo motor a diario.** Toda modalidad se escribe en su código | **Alta** | `formato='grupos'` por default, módulo apagado, prueba anti-`if` |
| 3 | **El BYE deja a alguien con un solo partido** en el formato que promete lo contrario | **Alta** | §2.3b: decidir antes de programar; la prueba de la Fase C lo comprueba |
| 4 | **Equipos rompe "un partido son dos jugadores"** en ranking, marcador, exportes | **Alta** | Módulo aparte, última fase, revisión uno por uno |
| 5 | Liguilla de 2 ruedas: 132 partidos que nadie contó | Media | Contador en vivo antes de cerrar la inscripción |
| 6 | El índice único `(torneo_id, fase, orden)` hace colisionar dos cuadros | Media | Nombres de fase propios para consolación |
| 7 | Se cambia la modalidad con partidos jugados | Media | Congelar al cerrar inscripción (§3.5) |
| 8 | Las migraciones se pegan a mano y se pueden repetir | Media | `_migracion_nueva` + `_migracion_para_club('Spinhouse')` |
| 9 | **El tope de cabezas de serie está escrito dos veces** (`actions/torneos.ts:1338` y `:1487`). Cambiarlo en uno y olvidar el otro deja el torneo aceptando una siembra al crear los grupos y rechazándola al armar la llave | Media | Extraerlo a una sola función que reciba la modalidad. Es el mismo error que `modulos.ts` documenta en su cabecera: la regla copiada en tres lados se desincronizó |
| 10 | `src/types/database.ts` tiene una tabla `partidos` que **nadie usa** (68 usos de `torneo_partidos`, 0 de `partidos`) | Baja | No confiar en el archivo de tipos; verificar contra la base |

⚠️ **Riesgo 8, detalle que hay que confirmar:** `_migracion_para_club()` exige el
**nombre exacto** del club en la tabla `clubes`. Hay que verificarlo antes de
escribir la primera migración — el UUID conocido es
`2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41`, pero el nombre puede ser "Spinhouse",
"SpinHouse" o "Centro Deportivo SPH SpA".

---

## 7. Lo que este plan deliberadamente no propone

- **No propone tocar el torneo tradicional.** Ni el reparto de grupos, ni la
  siembra, ni el 3er lugar, ni el ranking.
- **No propone doble eliminación completa.** El club pidió consolación, que es
  otra cosa y es más barata.
- **No propone sistema suizo.** Está en `plan-spinhouse-implementacion.md` §3.8,
  pero no se pidió acá y se apoya en el índice de fuerza, que hoy no existe.
- **No toca ranking ni Elo.** Queda fuera por decisión explícita, salvo la
  revisión defensiva de la Fase D para que un dobles no entre por la ventana.
- **No propone un `if (club_id === '2d8e…')` en ningún archivo compartido.**

---

## 8. Preguntas abiertas

Las tres de §0 quedaron cerradas el 2026-09-09. Queda esto.

| # | Pregunta | Bloquea | Por qué importa |
|---|---|---|---|
| 1 | 🔒 **¿El nombre exacto de Spinhouse en `clubes`?** | Fase A | `_migracion_para_club()` aborta si no calza. Se resuelve con el SQL de §6, riesgo 8 |
| 2 | **Liguilla: ¿termina en la tabla, o los mejores juegan un playoff?** | Fase B | Cambia si hay llave después |
| 3 | **Liguilla: ¿el desempate es por enfrentamiento directo o por ratio de sets?** | Fase B | Hoy es ratio; la liga de Spinhouse pidió directo primero |
| 4 | **Equipos: ¿los equipos son de un club o pueden ser mixtos?** | Fase D | Define si `club_procedencia` es del equipo o del jugador |
| 5 | **Equipos: ¿cuántos partidos suma un encuentro al historial del jugador?** | Fase D | Toca el ranking, que hoy está fuera de alcance |

Ninguna bloquea la Fase A salvo la 1, y esa se responde con una consulta.
**Las 2 y 3 se pueden decidir con el club mientras la Fase A se programa.**

---

## Fuentes de las reglas

- Sistema Swaythling Cup (5 individuales, orden A-X · B-Y · C-Z · A-Y · B-X):
  [World Table Tennis Championships / Swaythling Cup — Wikipedia](https://en.wikipedia.org/wiki/Swaythling_Cup)
- Sistema Corbillon Cup (4 individuales + 1 dobles, orden A-X · B-Y · dobles ·
  A-Y · B-X, 2 a 4 jugadores por equipo):
  [ITTF Handbook for Tournament Referees](https://www.tabletennisengland.co.uk/content/uploads/2026/05/HTR-2021-final.pdf) ·
  [Corbillon Cup System Match Score Sheet — Table Tennis England](https://www.tabletennisengland.co.uk/content/uploads/2023/07/Corbillon-Cup-System-Match-Score-Sheet.docx)
- Formatos y costo en tiempo de mesa:
  [Table tennis tournament formats — JudgeMate](https://www.judgemate.com/en/guides/table-tennis-tournament-formats-explained)
