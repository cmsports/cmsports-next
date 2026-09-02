# Plan maestro de implementación — Spinhouse

**Cliente:** Centro Deportivo SPH SpA · RUT 65.223.036-9
**Marca:** SpinHouse (@spinhouseacademy · www.spinhouse.cl)
**Sede:** José Ananías 128, Macul, Santiago. Sede única.
**Contraparte:** Cristhian Carrasco — Co-Fundador y Head Coach, ITTF Nivel II
**Padrón:** 140 jugadores · 7 entrenadores
**Disciplina:** Tenis de mesa convencional y paralímpico
**`club_id`:** `2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41`

**Este plan es solo para Spinhouse.** Buin (`ec1ef215-…`) está en producción con
plata y gente real. El criterio que gobierna todo lo que sigue: **ningún cambio
para Spinhouse puede alterar una sola pantalla, regla o fila de Buin.**

---

## Índice

**Parte I — Fundamentos**
1. Cómo leer y usar este plan
2. Estado verificado del sistema (con evidencia)
3. Los tres actores y lo que cada uno viene a hacer

**Parte II — Arquitectura**
4. `club_config`: qué es y por qué bloquea todo lo demás
5. El modelo de datos nuevo
6. Matriz de permisos: rol × funcionalidad × dato

**Parte III — Las tres vistas, una por una**
7. Vista Administrador
8. Vista Entrenador
9. Vista Jugador y Apoderado
10. El flujo de toma y suelta de bloques, en detalle

**Parte IV — Calidad**
11. La pirámide de pruebas de este proyecto
12. Pruebas de lógica
13. Pruebas de humo
14. Pruebas de vistas y de botones
15. Pruebas visuales
16. Pruebas de simulación
17. Pruebas de permisos
18. Aceptación manual por rol (UAT)

**Parte V — Ejecución**
19. Fases, entregables y criterios de salida
20. Riesgos
21. Preguntas abiertas al club
22. Definición de "hecho"

---

# Parte I — Fundamentos

## 1. Cómo leer y usar este plan

Este documento tiene tres audiencias y cada una entra por una puerta distinta.

| Si sos… | Leé | Podés saltarte |
|---|---|---|
| **El club (Cristhian)** | Partes I y III, y la sección 21 | Parte II y IV |
| **Quien programa** | Todo, en orden | Nada |
| **Quien prueba y recibe** | Partes III y IV, sobre todo la 18 | Parte II |

**Convenciones que se usan en todo el documento:**

- ✅ **Existe** — está construido y funcionando; se enciende y se usa.
- 🔧 **Adaptar** — existe pero está escrito para Buin; se convierte en dato.
- 🔨 **Construir** — no existe.
- ⚠️ **Riesgo** — algo que puede salir mal y hay que vigilar.
- 🔒 **Bloqueante** — no se puede avanzar sin resolverlo antes.

**Regla de oro del documento:** cada afirmación sobre lo que el sistema hace hoy
salió de leer el código, y lleva su archivo al lado. Donde no pude comprobar
algo, lo digo. Un plan que afirma de memoria produce exactamente los errores que
este plan existe para evitar.

---

## 2. Estado verificado del sistema

Todo lo de esta sección se verificó leyendo el repositorio el 2026-09-02.

### 2.1 Lo que hay

| Dimensión | Cifra verificada |
|---|---|
| Migraciones SQL | 239 archivos; la última es la **247** |
| Pruebas automatizadas | **1065 pruebas en 91 archivos**, todas en verde |
| Rutas de pantalla (`page.tsx`) | 69 |
| Componentes | 40 en `src/components/` + subcarpetas |
| Módulos activables por club | 21 (`src/lib/domain/modulos.ts`) |
| Roles de aplicación | 4: `superadmin`, `admin`, `profesor`, `jugador` |

### 2.2 El blindaje de Buin ya está puesto

Las migraciones **246** y **247** se aplicaron y verificaron en producción el
2026-09-02. Desde entonces:

- Toda migración declara su club con `_migracion_para_club('<nombre>')`, que
  verifica que exista y devuelve su `club_id` sin que nadie lo escriba a mano.
- Un trigger sobre `movimientos`, `jugadores`, `asistencia` y `mensualidades`
  aborta la transacción entera si una migración que declaró un club toca la
  fila de otro.
- Fuera de una migración el trigger es inerte: sale en su primera línea.

**Verificado en vivo:** declarar Buin e intentar tocar una fila de Club
Demostración TDM abortó con el mensaje esperado; sin club declarado, la
escritura normal de Buin pasó sin que el trigger se enterara.

### 2.3 El hallazgo que reordena la Parte IV

**No existe ninguna infraestructura de pruebas de interfaz.**

`vitest.config.ts` declara:

```ts
test: {
  include: ['src/**/*.test.ts'],
  environment: 'node',
}
```

Y `package.json` **no tiene** `@testing-library/react`, ni `jsdom`, ni
`playwright`, ni `@vitejs/plugin-react`. Consecuencias exactas:

- Las 1065 pruebas son de **lógica pura** sobre archivos `.ts`. Ninguna monta un
  componente, ninguna hace clic en un botón, ninguna mira una pantalla.
- Los archivos `.tsx` —o sea, **todas las vistas**— no tienen ni una sola
  prueba automatizada.
- Lo que el usuario pidió como "pruebas de botones, pruebas visuales, pruebas de
  vistas" hoy **no se puede escribir**. Hay que construir la infraestructura
  primero, y eso es una fase del plan, no un detalle.

### 2.4 Lo que este proyecto sí sabe hacer bien: las pruebas que leen el código

Hay una tradición valiosa acá que conviene nombrar, porque la Parte IV la
extiende en vez de reemplazarla. Tres pruebas no comprueban una función:
**recorren el código fuente y hacen cumplir una regla.**

| Prueba | Qué hace cumplir | Por qué nació |
|---|---|---|
| `src/lib/escrituras-revisadas.test.ts` | Ninguna escritura a Supabase puede ignorar su `{ error }` | 8 de los 33 hallazgos de la auditoría del 2026-08-26; migraciones 213 y 214 repusieron jugadores a mano |
| `src/lib/auth/rutas-protegidas.test.ts` | Ninguna `page.tsx` puede quedar fuera de las listas del middleware | Tres veces quedó una pantalla sin protección de servidor |
| `src/lib/migraciones-numeracion.test.ts` | Dos migraciones no comparten número | Dos ramas eligen el mismo número a la vez |

Este patrón es barato, no necesita navegador y **caza la clase entera del bug,
no la instancia**. Es la herramienta correcta para varias de las garantías que
Spinhouse necesita, y la Parte IV lo usa cinco veces más.

### 2.5 Lo que ya está construido específicamente para Spinhouse

Tres módulos se hicieron para este club en agosto y están aplicados:

| Módulo | Migraciones | Qué hace |
|---|---|---|
| `recuperar_clases` | 226, 231, 233 | El alumno avisa que no va; si avisa con 24 h o más conserva el crédito, que caduca a los 30 días |
| `asistencia_profes` | 227 | El profesor marca que estuvo; el club cuenta horas |
| `feedback_profes` | 228, 232 | El alumno le escribe al profesor, con nombre o anónimo, con anonimato real |

Más la **232**, que creó la sede `spinhouse` (antes sus bloques decían "Buin").

**El módulo `recuperar_clases` es el precedente directo del flujo de toma y
suelta de la sección 10.** Ya resolvió la mitad diaria del problema; falta la
mitad estructural.

---

## 3. Los tres actores y lo que cada uno viene a hacer

Un plan por pantallas produce pantallas. Un plan por personas produce un sistema
que se usa. Antes de las vistas, quiénes son.

### 3.1 El administrador — Cristhian

**Uno solo.** Es a la vez dueño, Head Coach y quien cobra. Entra al sistema
entre clase y clase, muchas veces desde el teléfono.

**Lo que viene a hacer, en orden de frecuencia real:**

1. Ver quién debe y mandarle el recordatorio.
2. Registrar un pago que le llegó por transferencia.
3. Decidir si abre, cierra o divide un horario.
4. Inscribir o mover a un alumno de bloque.
5. Cerrar el mes: cuánto entró, cuánto salió, cuánto le toca a cada entrenador.

**Lo que le duele hoy y el formulario nombra:** "registro manual de pagos", "la
morosidad por olvido", "la carga administrativa de avisar uno por uno".

**Criterio de diseño para su vista:** cada una de esas cinco cosas tiene que
poder empezarse en **un toque desde el dashboard**. Si necesita tres pantallas
para saber quién debe, la pantalla está mal.

### 3.2 El entrenador — los siete

**Siete personas**, con niveles distintos de comodidad con la tecnología. Entran
**en la cancha, de pie, con el teléfono en una mano y una pelota en la otra.**

**Lo que vienen a hacer:**

1. Pasar la lista de los que llegaron. Todos los días, varias veces.
2. Ver a quién le toca su clase de hoy, dónde y a qué hora.
3. Marcar que ellos estuvieron (horas trabajadas).
4. Anotar algo técnico de un alumno.
5. Reubicar a alguien que pidió recuperar.

**Restricción física que manda sobre todo lo demás:** están **de pie, con poca
luz, con las manos ocupadas y con el ruido de la sala.** Objetivos duros:

- Pasar lista de 16 alumnos: **menos de 30 segundos y sin scroll horizontal**.
- Botones de al menos **44 × 44 px** (mínimo táctil accesible).
- **Nada que dependa de precisión de dedo.** Nada de menús desplegables anidados.
- Que funcione **con la pantalla del teléfono en la mano**, no apoyado.

**Lo que NO tiene que ver:** plata. Un entrenador de Spinhouse no pone precios ni
ve morosidad, salvo que el club diga lo contrario. Eso ya está resuelto en el
sistema por rol.

### 3.3 El jugador y su apoderado — los 140

**El grupo más grande y el que menos entra.** Y acá hay una distinción que el
sistema hoy no hace y que Spinhouse obliga a hacer:

> **De los 140, una parte importante son menores.** El que usa la cuenta no es
> necesariamente el que juega. El apoderado paga, autoriza y recibe los avisos;
> el niño entrena. **Son dos personas con dos necesidades distintas detrás de la
> misma cuenta.**

**Lo que vienen a hacer:**

| Quién | Qué |
|---|---|
| Apoderado | Ver cuánto debe y pagar · Avisar que el niño no va · Ver el calendario · Autorizar el uso de imagen |
| Jugador (adulto o juvenil) | Ver su horario · Avisar que no va · Ver dónde recuperar · Ver su ranking y su progreso · Escribirle al profe |

**Criterio de diseño:** esta vista se usa **una o dos veces al mes**, desde el
teléfono, por alguien que no recuerda cómo funcionaba. Todo tiene que ser
evidente sin instrucciones. **Si necesita un tutorial, está mal diseñada.**

### 3.4 El recorrido crítico de cada uno

Un solo recorrido por actor que, si falla, el sistema no sirve. Estos tres son
los que la sección 13 convierte en pruebas de humo.

| Actor | Recorrido crítico |
|---|---|
| Administrador | Entrar → ver morosos → registrar un pago → que el saldo baje y quede el rastro |
| Entrenador | Entrar → ver la clase de hoy → pasar lista → que quede guardada |
| Jugador | Entrar → ver su horario → avisar que no va → recibir el crédito |

---

# Parte II — Arquitectura

## 4. `club_config`: qué es y por qué bloquea todo lo demás

### 4.1 El problema, sin jerga

Hoy el sistema sabe **prender y apagar módulos completos** por club:
Torneos sí, Liga no, Feedback sí. Eso vive en `clubes.modulos_habilitados` y
funciona.

Lo que **no** sabe hacer es que dos clubes usen el mismo módulo **con reglas
distintas**. Ejemplos reales de este proyecto:

| Regla | Buin | Spinhouse |
|---|---|---|
| Cómo se calcula el cupo de un bloque | número escrito a mano | mesas × jugadores por mesa |
| Cómo se cobra la mensualidad | monto libre por jugador | plan (frecuencia × tipo) |
| Cuándo se bloquea a un moroso | nunca, es manual | a los 30 días |
| Puntaje de la liga | 3 victoria / 1 derrota | 2 / 1 / 0 |

Sin un mecanismo, la única forma de programar eso es:

```ts
// ❌ Esto es lo que NO se puede hacer.
if (clubId === '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41') {
  cupo = mesas * 4
} else {
  cupo = bloque.cupo_maximo
}
```

Ese `if` está **prohibido por `CLAUDE.md`**, y la razón es concreta: ata a los
dos clubes al mismo archivo. Cada vez que Spinhouse pida algo, hay que editar
código que Buin usa todos los días, y cada edición es una oportunidad de romper
producción. Multiplicado por las **quince** partidas a construir, es deuda que
se paga con incidentes.

### 4.2 La solución

Una tabla donde las diferencias son **filas**, no código:

```
club_config
  club_id      uuid    →  clubes(id)
  clave        text
  valor        jsonb
  actualizado_en timestamptz
  PRIMARY KEY (club_id, clave)
```

Y un catálogo único en `src/lib/domain/clubConfig.ts` —el mismo patrón que
`modulos.ts`, que ya demostró servir— donde cada clave declara su tipo, sus
opciones válidas y **su valor por defecto**.

El código pasa a verse así:

```ts
// ✅ Sin nombres de club. Buin y Spinhouse leen la misma línea.
const modo = config('cupos.modo')          // 'numero' | 'por_mesas'
const cupo = modo === 'por_mesas' ? mesas * porMesa : bloque.cupo_maximo
```

### 4.3 Las cuatro reglas que hacen que esto no se convierta en otro enredo

1. **El default es el comportamiento actual de Buin.** Un club sin ninguna fila
   en `club_config` se comporta exactamente como hoy. Esto es lo que permite
   introducir la tabla **sin cambiar nada de lo que ya anda**, y es el criterio
   de aceptación: la suite de 1065 pruebas pasa sin modificarse.
2. **Se lee por función de dominio, nunca a mano.** Una sola `configDelClub()`
   con caché. Nadie consulta la tabla suelta.
3. **Clave desconocida = default.** Nunca revienta por una clave que todavía no
   existe, igual que `esModulo()` descarta lo que no conoce.
4. **La tabla guarda elecciones, no comportamientos.** Si una diferencia no se
   puede expresar como un valor, **no va acá**: va como módulo aparte. Meter
   lógica en `jsonb` es reinventar el `if` con más pasos.

### 4.4 El catálogo inicial

Solo las claves que alguien pidió de verdad. No se inventan variantes por
adelantado.

| Clave | Opciones | Default (= Buin hoy) | Spinhouse | Quién la lee |
|---|---|---|---|---|
| `cupos.modo` | `numero`, `por_mesas` | `numero` | `por_mesas` | §5.1 |
| `cupos.por_mesa_grupal` | entero 1–8 | `4` | `4` | §5.1 |
| `cupos.por_mesa_particular` | entero 1–4 | `2` | `2` | §5.1 |
| `mensualidad.modo` | `monto_libre`, `por_plan` | `monto_libre` | `por_plan` | §5.2 |
| `morosidad.dias_aviso` | entero, `0` = nunca | `0` | `15` | §7.4 |
| `morosidad.dias_bloqueo` | entero, `0` = nunca | `0` | `30` | §7.4 |
| `retencion.faltas_alerta` | entero, `0` = nunca | `0` | `3` | §8.5 |
| `retencion.dias_inactivo` | entero, `0` = nunca | `0` | `60` | §7.4 |
| `liga.puntos_victoria` | entero | `3` | `2` | §5.4 |
| `liga.puntos_derrota` | entero | `1` | `1` | §5.4 |
| `liga.desempate` | lista ordenada | `['pg','ds','sf','directo']` | `['directo','ds','dt','sorteo']` | §5.4 |
| `inscripcion.autoservicio` | `off`, `pide_aprobacion`, `directo` | `off` | `pide_aprobacion` | §10 |

⚠️ **Cada `0` de la columna "Default" es deliberado y es lo que protege a Buin.**
Un umbral de morosidad en `0` significa "nunca bloquear", que es lo que Buin
hace hoy. Si alguien pone el default en `30` "porque parece razonable", **Buin
empieza a bloquear alumnos al día siguiente.**

### 4.5 Quién puede editar la configuración

**Superadmin, por ahora.** Hay claves que cambian plata (`mensualidad.modo`) y
otras inocuas. Empezar cerrado y abrir después es reversible; al revés no.

⚠️ Cambiar `morosidad.dias_bloqueo` **no es** un cambio de configuración
cualquiera: bloquea personas. Lleva confirmación explícita, deja rastro en
`audit_log`, y la sección 7.4 exige un mes de marcha en seco antes de encenderlo.

---

## 5. El modelo de datos nuevo

### 5.1 🔨 Mesas — el cambio estructural

**Lo que pide el formulario, textual:**

> "El cupo de cada bloque depende del número de mesas disponibles en la sede y de
> la modalidad: máximo 4 jugadores por mesa en clases grupales, 1 o 2 por mesa en
> particulares, y las mesas destinadas a arriendo libre no pueden asignarse a
> clases en el mismo horario. El sistema debe impedir sobrepasar ese cupo."

**Lo que hay hoy:** `bloques_horario` tiene `cupo_maximo` y `cupo_libres`, dos
enteros que alguien escribe a mano (migración 073). Ningún concepto de mesa.

**Lo que hay que entender antes de programar:** no es "agregar un campo mesas".
Son tres reglas encadenadas.

1. **El cupo se deriva.** `cupo = mesas_asignadas × jugadores_por_mesa(modalidad)`.
   Deja de ser un dato que se escribe y pasa a ser un cálculo.
2. **Las mesas son un recurso finito compartido en el tiempo.** Dos bloques que
   se solapan no pueden sumar más mesas que las que tiene la sede. Esto es un
   problema de **solapamiento de intervalos**, no de conteo.
3. **El arriendo compite por el mismo recurso.** Una mesa arrendada de 19:00 a
   20:00 no está disponible para la clase de 19:00 a 20:30.

**Es un NÚMERO, no una lista.** ⚠️ La primera versión de esto (migración 249)
modeló cada mesa como una fila y cada bloque como una lista de mesas concretas
—"Adultos del martes usa la 3, la 7 y la 9"—. **Se descartó a los veinte minutos
de aplicarla**, y vale la pena dejar escrito por qué:

- **Nadie iba a hacer ese trabajo.** Asignar mesas concretas a cada bloque de
  cada día es media hora de clicks para un dato que se resuelve hablando en la
  sala.
- **No era lo que se pidió.** El formulario dice, textual: "el cupo de cada
  bloque depende **del número** de mesas disponibles en la sede". Del número, no
  de cuáles.

Lo que se perdió es poder decir "tu clase es en la mesa 3". El club no lo pidió.
Si algún día hiciera falta, se agrega encima sin deshacer nada: una lista de
mesas concretas es un detalle de una cantidad, no al revés.

**Tablas (migración 251):**

```
sede_mesas       club_id, sede, cantidad, notas
                 PRIMARY KEY (club_id, sede)     ← una fila por sede

bloques_horario  + mesas int   NULLABLE

mesa_arriendos   club_id, sede, fecha, hora_inicio, hora_fin,
                 mesas, arrendatario, movimiento_id
```

⚠️ **`bloques_horario.mesas` es nullable y eso es lo que deja a Buin intacto.**
`NULL` significa "este bloque no usa el modelo de mesas" y su cupo sigue saliendo
de `cupo_maximo`. Un default de `0` habría dejado todos los bloques de todos los
clubes en cupo cero apenas alguien encendiera el modo.

**Las preguntas que hay que poder responder**, resueltas en
`src/lib/domain/mesas.ts` como funciones puras:

```
mesasEnUso(usos, franja)      → cuántas ocupadas a esa hora
mesasLibres({total, usos, …}) → cuántas quedan
puedeUsarMesas({…})           → si cabe, y si no, con qué mensaje
```

`excluirId` en las tres: un bloque que se está editando no compite consigo
mismo, o cambiarle las mesas diría siempre "no hay lugar".

⚠️ **La validación va en la base, no en la pantalla.** El formulario dice "el
sistema debe impedir sobrepasar ese cupo", y una comprobación en el navegador no
impide nada: dos personas inscribiendo al mismo tiempo pasan las dos. Es el mismo
razonamiento por el que `con_derecho` lo calcula `cancelar_bloque_dia` y no el
cliente. Detalle de concurrencia en §10.6.

### 5.2 🔨 Planes de mensualidad

**Lo que hay hoy:** la cuota es un número libre por jugador
(`jugadores.mensualidad`), y `mensualidades.ts` explica por qué, textual:

> "El profe define cada cuota a mano —hay de $7.000, de $30.000, de $50.000— y
> ninguna tabla puede adivinarlas."

Eso es correcto **para Buin**. Spinhouse cobra distinto: frecuencia semanal ×
tipo de clase → tarifa. Eso sí es una tabla.

```
planes_club      club_id, nombre, frecuencia_semanal, tipo_clase,
                 monto, vigente_desde, vigente_hasta, activo

jugadores        + plan_id uuid → planes_club   (nullable)
```

**La regla que protege a Buin:** si `mensualidad.modo = 'monto_libre'` (el
default), `plan_id` se ignora por completo y todo funciona como hoy. Un club sin
planes no ve la palabra "plan" en ninguna pantalla.

🔒 **Bloqueante:** el detalle de planes y valores "se entregará junto con el
padrón de jugadores en la carga inicial". **Sin ese dato no se puede emitir una
sola mensualidad.** Hay que pedirlo ahora, no cuando toque.

### 5.3 🔨 Campos nuevos de la ficha, y la Ley 21.719

| Campo | Tipo | Visible para | Estado |
|---|---|---|---|
| Categoría por edad (U11…senior) | derivado de `fecha_nacimiento` | todos | 🔧 §5.5 |
| Nivel interno | `iniciacion` / `intermedio` / `competitivo` | todos | 🔨 |
| Federado | ✅ ya existe (`jugadores.federado`) | todos | ✅ |
| N.º de licencia FECHITEME | texto | staff | 🔨 |
| Club de origen | ✅ ya existe (`club_procedencia`) | staff | ✅ |
| Mano hábil | `diestro` / `zurdo` | staff | 🔨 |
| Estilo de juego | texto corto | staff | 🔨 |
| Material (madera y gomas) | texto | staff | 🔨 |
| Observaciones técnicas | texto largo | **solo staff** | 🔨 |
| Clase deportiva paralímpica | texto corto | **solo staff** | 🔨 🔒 |
| Necesidades de accesibilidad | texto largo | **solo staff** | 🔨 🔒 |
| Autorización de uso de imagen | booleano + fecha + quién firmó | staff | 🔨 🔒 |

🔒 **Alerta legal, no técnica.**

La **Ley 21.719 rige desde el 2026-12-01** — en tres meses. `docs/plan-ley-21719.md`
ya está escrito, y la memoria del proyecto registra que hoy hay **30 menores de
14 años y 54 fichas con datos de salud, con cero registro de consentimiento**.

Dos de estos campos son **categorías especiales de datos**: clase deportiva
paralímpica y necesidades de accesibilidad **son datos de salud**. Y la
autorización de uso de imagen es, literalmente, un registro de consentimiento.

> **Spinhouse es el primer club donde el consentimiento tiene que estar desde el
> diseño de la ficha, no parchado después.** Estos campos se construyen junto con
> el registro de consentimiento del plan de la ley, o no se construyen.

Requisitos mínimos que van con estos campos:

- **Quién** dio el consentimiento (el apoderado, con su nombre), **cuándo**, y
  **para qué** (uso de imagen en redes ≠ tratamiento de datos de salud: son dos
  consentimientos distintos y se registran por separado).
- **Revocable**: el apoderado tiene que poder retirarlo, y el sistema tiene que
  dejar de usar la foto cuando lo haga.
- **Visible para el titular**: el apoderado ve qué autorizó, desde su vista (§9.6).

### 5.4 🔨 La liga de temporada

**El bloqueante duro:** `liga_fechas.numero` tiene
`CHECK (numero BETWEEN 1 AND 5)` (migración 013). La liga de Buin es una jornada
de mesa donde la 5.ª fecha es de ajuste; la de Spinhouse es una temporada de 11.
No son la misma cosa con otro número.

| Requisito de Spinhouse | Estado hoy |
|---|---|
| 5 divisiones de 12 (Honor, Primera, Segunda, Tercera, Cuarta) | ✅ `liga_divisiones.capacidad_max` |
| Todos contra todos a 1 rueda | ✅ `generarRoundRobin` |
| Al mejor de 5 sets | ✅ `esResultadoBo5Valido` |
| **11 fechas** | ❌ tope en 5 |
| **Puntaje 2 / 1 / 0** | ❌ hoy 3 / 1 |
| **Desempate: directo → dif. sets → dif. tantos → sorteo** | ❌ hoy PG → DS → SF → directo |
| **Tantos a favor y en contra** | ❌ `liga_partidos` guarda solo `sets_a`/`sets_b` |
| Playoffs entre los 4 primeros en jornada final | ❌ |
| Ascensos y descensos directos (suben 1.º y 2.º, bajan 11.º y 12.º), sin promoción | ❌ |
| Zonas pintadas en la tabla | ❌ |
| Próxima fecha de cada jugador con su horario | ❌ |
| Precio diferenciado socio / externo | ⚠️ hay pagos, sin precio por tipo |

**La buena noticia, y es grande:** el motor que Spinhouse pide **ya existe y está
probado**. `src/lib/domain/oficial-ittf.ts` implementa exactamente 2 al ganador,
1 al perdedor de partido jugado, 0 al que no se presenta, con desempates por
ratio de juegos y de puntos, y `oficial_partidos.sets` es un `jsonb` que guarda
los parciales de cada set — de donde salen los tantos.

**Recomendación de arquitectura:** no bifurcar el módulo `liga` con banderas ni
crear un "módulo liga Spinhouse". Reutilizar su estructura (divisiones, fixture,
pagos), **cambiarle el motor de puntaje por el de `oficial-ittf.ts`**, y leer el
puntaje y el orden de desempate de `club_config`. Buin se queda con sus defaults
y su tabla no cambia en un solo punto.

Precedente de playoffs configurables, reciente y aplicable:
`223_liga_futbol_playoffs_config.sql`.

### 5.5 🔧 Categorías por edad y por nivel

`src/lib/domain/esquemaCategorias.ts` ya resolvió este problema exacto para
`/solicitudes`: sacó cinco `if (clubId === CLUB_BUIN_ID)` y los reemplazó por una
tabla `POR_CLUB`. **Agregar Spinhouse es una entrada, no una pantalla.**

Pero hay un detalle de modelado que importa: Spinhouse cruza **dos ejes**.

- **Edad:** U11, U13, U15, U17/U19, adulto, senior — se calcula solo desde
  `fecha_nacimiento`, igual que `categoriaBuinPorFechaNacimiento`.
- **Nivel:** iniciación, intermedio, competitivo — lo pone el entrenador.

⚠️ **Son dos columnas, no una.** Concatenarlas en `jugadores.categoria`
("U15-competitivo") hace imposible filtrar por una sola, y ese filtro es
justamente el que arma los grupos y el que la vista del entrenador usa todo el
tiempo.

### 5.6 🔨 Índice de fuerza (Elo)

> "un ranking calculado partido a partido según la fuerza del rival (índice tipo
> Elo o Bradley-Terry, que el club ya utiliza en su archivo de partidos). […] Se
> pide que cada resultado registrado en la plataforma actualice ese índice y que
> la ficha del jugador muestre su evolución."

**No reemplaza al ranking actual.** `rankingInterno.ts` premia el **puesto**
alcanzado en cada torneo (100 al campeón, 90 al finalista). Son dos rankings con
dos propósitos: uno premia resultados de torneo, el otro mide fuerza.

**Recomendación: Elo con K configurable.** Se actualiza partido a partido como el
club pide, y no obliga a recalcular la historia entera cada noche.
Bradley-Terry es más justo pero recalcula todo el historial.

```
ranking_elo        club_id, jugador_id, elo, partidos, actualizado_en
ranking_elo_hist   club_id, jugador_id, fecha, partido_ref, elo_antes,
                   elo_despues, rival_id, rival_elo, resultado
```

El historial no es opcional: es lo que dibuja la curva de la ficha (§9.5) y lo
que permite recalcular si algún día se corrige un resultado mal cargado.

🔒 **Hay que importar el archivo de partidos que Spinhouse ya tiene**, o el
índice arranca en cero y no significa nada durante el primer semestre.
`188_ranking_saldo_inicial.sql` es el precedente de cómo se hace eso sin
inventar datos.

### 5.7 🔧 Categorías financieras

`src/app/finanzas/page.tsx:51-52` tiene los dos arrays escritos duro. Spinhouse
necesita agregar:

**Ingresos:** clases particulares · arriendo de mesas (distinto de arriendo de
cancha) · venta de artículos (gomas, maderas, pelotas) · auspicios
**Gastos:** premios de torneos y liga · marketing y redes sociales

⚠️ **Las categorías de Buin no se tocan.** Los movimientos históricos ya están
guardados con esas claves y renombrarlas rompe todos los reportes anteriores.

---

## 6. Matriz de permisos: rol × funcionalidad × dato

Esta matriz es normativa: **es la especificación de la sección 17**, que la
convierte en pruebas.

| Funcionalidad | Admin | Entrenador | Jugador / Apoderado |
|---|---|---|---|
| Ver padrón completo | ✅ | ✅ solo sus grupos | ❌ |
| Ver ficha: datos personales | ✅ | ✅ sus alumnos | ✅ solo la suya |
| Ver ficha: bloque técnico | ✅ | ✅ | ❌ **nunca** |
| Ver ficha: datos de salud / paralímpicos | ✅ | ✅ | ✅ solo la suya |
| Editar ficha | ✅ | ⚠️ solo campos técnicos | ❌ |
| Ver montos y morosidad | ✅ | ❌ | ✅ solo lo suyo |
| Registrar un pago | ✅ | ❌ | ❌ |
| Poner o cambiar precios | ✅ | ❌ | ❌ |
| Pasar lista | ✅ | ✅ sus bloques | ❌ |
| Marcar sus propias horas | ✅ (de cualquiera) | ✅ solo las suyas | ❌ |
| Crear y editar bloques | ✅ | ⚠️ configurable | ❌ |
| Asignar mesas | ✅ | ❌ | ❌ |
| Inscribir a un alumno en un bloque | ✅ | ✅ | ⚠️ según `inscripcion.autoservicio` |
| **Soltar** una inscripción | ✅ | ✅ | ⚠️ según config |
| Cancelar una clase de una fecha | ✅ | ✅ | ✅ **la suya** |
| Asignar una recuperación | ✅ | ✅ | ❌ |
| Ver quién más está en su bloque | ✅ | ✅ | ❌ **nunca** |
| Escribir feedback al alumno | ✅ | ✅ | ❌ |
| Escribirle al profesor | ❌ | ❌ | ✅ **solo a los suyos** |
| Leer feedback recibido | ⚠️ sin autor | ✅ sin autor | — |
| Cargar resultados | ✅ | ✅ | ❌ |
| Ver su índice de fuerza | ✅ todos | ✅ sus alumnos | ✅ el suyo |
| Ver la tabla de la liga | ✅ | ✅ | ✅ |
| Configurar el club | ❌ superadmin | ❌ | ❌ |

**Tres reglas que ya están implementadas y no se tocan:**

1. **El jugador no ve inscripciones ajenas.** La migración 101 se lo prohíbe. El
   panel de recuperación devuelve **cuántos** lugares quedan, nunca **quiénes**
   faltan. Esa puerta no se reabre — ni siquiera "para que vea con quién entrena".
2. **El anonimato del feedback es real.** `feedback_profesores` tiene **una sola
   política**: la del alumno sobre lo suyo. El profesor y el admin no leen la
   tabla; la leen por `feedback_de_profesores()`, que devuelve el autor en NULL
   cuando es anónimo. **Tampoco el admin ve al autor** — en un club chico, un
   admin que puede ver quién escribió qué vacía la palabra "anónimo".
3. **El alumno solo opina de SU profesor.** La RLS exige que el profesor le haga
   clases, no solo que sea del mismo club (migración 232).

⚠️ **La RLS de Postgres filtra filas, no columnas.** No hay forma de entregarle
la fila al profesor con el `jugador_id` escondido. Por eso el anonimato se
resuelve con una función y no con una política, y por eso borrar va por
`borrar_feedback_profesor()`: con una política de DELETE, un
`DELETE … RETURNING jugador_id` desde la API devolvería justo el dato que el
anonimato niega. **Cualquier campo nuevo que sea sensible por columna necesita el
mismo tratamiento.**

---

# Parte III — Las tres vistas

Cada vista se describe con la misma estructura: qué ve al entrar, pantalla por
pantalla, y qué se le agrega para Spinhouse.

## 7. Vista Administrador

### 7.1 Lo que ve hoy al entrar

Menú de admin (`src/app/layout-app.tsx:28-48`): Dashboard · Jugadores · Torneo
Externo · Torneo Interno · Torneo oficial · Ranking · Liga · Asistencia ·
Feedbacks · Cupos/bloques · Calendario · Finanzas · Central de Pago · tiendas ·
Bibliografía · Libro del profe.

El dashboard trae KPIs de `dashboard_kpis()`: activos, ingresos, gastos, morosidad
—que desde la migración 209 no cuenta a los bloqueados—, solicitudes pendientes,
inactivos, asistencia de hoy, desglose de gastos por categoría.

### 7.2 🔨 Dashboard: las tres tarjetas nuevas

Van **debajo** de los KPIs actuales. El dashboard de Buin no se reordena.

**Tarjeta 1 — Ocupación por bloque horario**

Una barra por franja, ordenadas por día y hora. Cada barra muestra
`inscritos / cupo` y el porcentaje.

Codificación por color, que es información y no decoración:

| Ocupación | Color | Qué significa para el club |
|---|---|---|
| < 50 % | gris | Evaluar cerrar o fusionar |
| 50–85 % | verde | Sano |
| 86–99 % | ámbar | Se está llenando; preparar el siguiente |
| 100 % | rojo | Lleno; evaluar abrir o dividir |

> **Por qué así:** el formulario dice que este indicador existe para "decidir
> cuándo abrir, cerrar o dividir un horario y cómo asignar entrenadores". Un
> número suelto no soporta esa decisión; el color contra el umbral sí.

**Tarjeta 2 — Altas y bajas del mes (retención)**

Tres números y un neto: **entraron · se fueron · reingresaron → neto**.

🔒 **Requiere una definición del club antes de programarse.** Hoy el sistema
tiene dos cosas que no son lo mismo:

- `bloque_jugadores.vigente_hasta` — dejó un grupo (puede haberse cambiado a otro)
- `jugadores.estado` — activo o bloqueado

Ninguna de las dos es "se fue del club". **Pregunta 3 de la sección 21.**

**Tarjeta 3 — Ingresos por línea de negocio**

Dona con las categorías propias de §5.7. Sale sola una vez que existan.

### 7.3 🔨 Finanzas: pestaña de Márgenes

- **Margen por línea de negocio** — ingresos menos costos atribuibles.
- **Margen por bloque** — ingresos del bloque menos el costo de sus entrenadores.
  🔒 Necesita **tarifa por hora del entrenador**, que hoy no existe en ninguna
  tabla. Pregunta 6 de la sección 21.
- **Liquidación mensual por entrenador** — horas dictadas por tipo × tarifa.
- **Proyección de caja del mes siguiente** — cuotas emitidas × morosidad histórica.

⚠️ **Advertencia que va escrita en la propia pantalla, no solo en este documento.**

`asistencia_profesores` (migración 227) **no congela los minutos al marcar**. La
auditoría de agosto lo dejó documentado en un `COMMENT ON TABLE` con esta
condición exacta: las horas son **para control, no para liquidar sueldos**. Si el
horario de un bloque cambia, las horas de meses pasados se recalculan solas.

> **Consecuencia práctica: pagar con ese número significa que cambiar un horario
> cambia lo que se pagó el mes pasado.** Antes de que esta pantalla liquide un
> solo peso, hay que congelar los minutos al momento de marcar. Mientras eso no
> esté, la pantalla muestra las horas con un cartel que dice que son
> referenciales.

### 7.4 🔨 Retención y morosidad automáticas

Tres reglas, ninguna existe hoy. Los umbrales viven en `club_config` (§4.4).

| Regla | Umbral Spinhouse | Qué hace |
|---|---|---|
| Inasistencias consecutivas | 3 | Alerta al entrenador y al admin, con botón para escribirle al apoderado |
| Deuda — aviso | 15 días | Aviso previo al apoderado |
| Deuda — bloqueo | 30 días | Bloqueo automático de la cuenta |
| Sin asistencia ni pago | 60 días | Marcar `inactivo` para que no distorsione el padrón |

⚠️ **Esto toca plata y toca personas. Es el cambio más delicado del plan
completo.** Un umbral mal calculado bloquea a un alumno que está al día, y quien
se entera es el alumno, en la puerta, delante de sus compañeros.

**Las cuatro condiciones que van juntas, no por separado:**

1. **Marcha en seco de un mes.** Una pantalla que dice *"a quiénes bloquearía
   hoy y por qué"* **sin bloquear a nadie**, revisada por Cristhian durante un
   mes completo antes de encender nada. Si en ese mes aparece un solo falso
   positivo, no se enciende: se corrige y se cuenta otro mes.
2. **Fechas con `fechaChile()`, jamás `current_date`.** `current_date` da UTC y
   descuadra el día. En Chile eso significa bloquear a alguien un día antes de
   tiempo. Está registrado como bug conocido del proyecto.
3. **Rastro en `audit_log`.** Todo bloqueo automático deja quién, cuándo, por
   qué y con qué saldo. Es la misma exigencia que tiene cualquier operación
   financiera, y es lo que salvó la recuperación de julio.
4. **Reversible en un clic.** El admin desbloquea sin buscar nada, desde el mismo
   aviso.

**Estado `inactivo`:** hoy `toggleEstadoJugador` solo maneja `activo` y
`bloqueado`. Hay que agregar el tercero, y **cuidado**: `dashboard_kpis()` y
`v_morosos` filtran por `estado = 'activo'`, así que introducir un estado nuevo
cambia denominadores en todo el dashboard si no se revisan esas consultas. Es
exactamente el bug que la migración 209 tuvo que arreglar.

### 7.5 🔨 Cupos/bloques: el tablero de mesas

La pantalla que más cambia. Detalle completo en §10.

### 7.6 Resumen de la vista Administrador

| Pantalla | Cambio | Estado |
|---|---|---|
| `/dashboard` | 3 tarjetas nuevas | 🔨 |
| `/finanzas` | Pestaña Márgenes + categorías propias | 🔨 🔧 |
| `/mensualidades` | Modo por plan | 🔨 |
| `/horario` | Tablero de mesas | 🔨 |
| `/jugadores/[id]` | Bloques Deportivo, Técnico, Historial | 🔨 |
| `/liga` | Temporada, playoffs, zonas | 🔨 |
| `/calendario` | Filtros por tipo + vista pública | 🔨 |
| Alertas de retención | Nuevo | 🔨 |

---

## 8. Vista Entrenador

**El principio que gobierna esta vista entera: está de pie, con el teléfono en
una mano.** Todo lo que sigue se subordina a eso.

### 8.1 Lo que ve hoy al entrar

`/dashboard-profesor` (229 líneas) muestra exactamente lo que necesita al llegar:
qué le toca hoy, dónde, a qué hora, y quiénes son sus alumnos de esos grupos.

El comentario del archivo explica una decisión de diseño que conviene respetar:

> "Antes traía además el total de alumnos del club, las evaluaciones pendientes y
> una lista de quiénes no venían hace cinco días. Nada de eso le sirve para
> entrar a la cancha."

**Esa decisión se mantiene.** Todo lo que se agregue a esta vista tiene que pasar
la prueba de "¿le sirve para entrar a la cancha?".

### 8.2 🔨 Pasar lista, optimizado para la mano

Objetivo duro: **16 alumnos en menos de 30 segundos, de pie.**

| Requisito | Valor | Por qué |
|---|---|---|
| Área táctil por alumno | ≥ 44 × 44 px | Mínimo accesible; dedo, no puntero |
| Gesto para marcar presente | **un toque en toda la fila** | No un checkbox chico al costado |
| Scroll | solo vertical | Nunca horizontal en el teléfono |
| Confirmación | inmediata y visible | Verde al instante, sin esperar red |
| Sin red | la marca se guarda y se reintenta | La sala tiene mala señal |
| Deshacer | toque de nuevo | Sin diálogo de confirmación |
| Contador | "12 de 16" fijo arriba | Sabe cuánto le falta sin contar |

⚠️ **La tabla de asistencia guarda faltas, no solo presencias.** Toda consulta
nueva filtra `estado = 'presente'`. Olvidarlo no da error: da un número más alto
que el real y nadie lo nota.

⚠️ **`registrado_por` en `asistencia` tiene la FK rota.** Nunca escribir esa
columna: rompió las tres vías de registro. Está documentado como bug conocido.

### 8.3 🔨 Marcar sus horas

Ya existe (migración 227), en `/asistencia` → pestaña **Profesores**, con dos
vistas: *Marcar el día* y *Horas del mes*.

⚠️ **El punto frágil conocido:** `get_my_profesor_id()` enlaza `perfiles` con
`profesores` **por el correo**. Si los correos no coinciden, el profe ve la
pestaña pero no puede marcar. La pantalla lo detecta y lo dice con un mensaje
claro en vez del error crudo de Postgres.

🔒 **Con 7 entrenadores, esto hay que verificarlo uno por uno antes de entregar.**
La migración 227 trae la consulta que lo dice:

```sql
-- Devuelve puede_marcarse = false para los que tienen el correo distinto
-- entre su ficha de profesor y su cuenta de usuario.
```

Los que salgan en `false` hay que emparejarlos **antes** de avisarle al club, o
siete personas se encuentran con una pantalla que no funciona el primer día.

### 8.4 🔨 Su clase de hoy, con las mesas

El dashboard del profesor gana: qué mesas tiene asignadas su bloque de hoy, y el
objetivo o plantilla de la sesión — que **ya existe** en el módulo técnico
(`tecnico_planes`, `tecnico_sesiones`). Es enlazar, no construir.

### 8.5 🔨 Alerta de 3 inasistencias

Aparece en su dashboard, no en un informe que hay que ir a buscar:

> ⚠️ **Matías Rojas** lleva 3 clases seguidas sin venir.
> [ Escribirle al apoderado ]

El botón abre WhatsApp con el mensaje redactado. `linkWhatsApp()` ya existe y ya
normaliza los teléfonos chilenos en cualquier formato.

### 8.6 ✅ Feedback: las dos direcciones

- **Del profe al alumno** — `feedback` (`ModalCrearFeedback`), ya existe.
- **Del alumno al profe** — `feedback_profes` (migraciones 228, 232), ya existe,
  con anonimato real.

**No hay nada que construir acá.** Solo encender los módulos y explicárselo a los
siete entrenadores, que es lo que de verdad cuesta.

### 8.7 Resumen de la vista Entrenador

| Pantalla | Cambio | Estado |
|---|---|---|
| `/dashboard-profesor` | Mesas + plantilla + alertas | 🔨 |
| `/asistencia` → Pasar lista | Optimización táctil | 🔨 |
| `/asistencia` → Profesores | Encender + emparejar correos | ✅ 🔒 |
| `/horario` → Recuperaciones | Ya existe | ✅ |
| `/feedbacks` | Ya existe en ambas direcciones | ✅ |
| `/jugadores/[id]` | Bloque técnico editable | 🔨 |

---

## 9. Vista Jugador y Apoderado

**Se usa una o dos veces al mes, desde el teléfono, por alguien que no recuerda
cómo funcionaba.** Todo tiene que ser evidente sin instrucciones.

### 9.1 Lo que ve hoy

Menú de jugador (`layout-app.tsx:76-90`): Mi perfil · Mi Estado de Cuenta ·
Central de Pago · Asistencia · Mis Feedbacks · Mi horario · Ranking · Calendario ·
tiendas · Bibliografía.

`/mi-horario` (150 líneas) muestra los grupos en los que entrena. El comentario
del archivo:

> "A propósito no muestra compañeros, cupos ni los demás grupos del club: solo
> dónde y cuándo le toca ir. La base lo respalda desde la 101, así que esto no es
> una pantalla que esconde datos sino una que ya no los recibe."

### 9.2 🔨 La distinción apoderado / jugador

El sistema hoy tiene **una cuenta por jugador**. Con 140 alumnos y una parte
importante de menores, hay que decidir cómo se modela.

**Tres opciones, con su costo:**

| Opción | Cómo | Costo | Riesgo |
|---|---|---|---|
| **A. Una cuenta, dos secciones** | La misma cuenta muestra "Lo tuyo" y "Lo del apoderado" | Bajo | El niño ve la deuda |
| **B. Cuenta del apoderado con varios hijos** | Un apoderado, N jugadores | Alto — toca autenticación | El más correcto |
| **C. Marcar la cuenta como "de apoderado"** | Un booleano cambia qué se muestra primero | Medio | Intermedio |

**Recomendación: C para la primera vuelta, B como objetivo.** C resuelve el 90 %
del problema real (que el apoderado vea primero lo que le importa) sin tocar
autenticación, que es la parte del sistema donde un error deja gente afuera.

🔒 **Requiere decisión del club.** Un hermano menor y uno mayor en el mismo club
es el caso que decide: con A y C, el apoderado necesita dos cuentas.

### 9.3 ✅🔨 Mi horario, y avisar que no voy

**Ya funciona** (migraciones 226, 231, 233). Lo que hay que mejorar es cómo se ve.

Estado actual del flujo:
- El alumno ve sus clases de las **próximas dos semanas**.
- Avisa que no va a una fecha concreta, con un motivo.
- Con **24 horas o más** de anticipación conserva el crédito; con menos, lo pierde.
- El crédito **caduca a los 30 días** de la clase perdida.
- Un feriado **no** da crédito.
- El saldo lo calcula `saldos_recuperacion()`, en un solo lugar que las dos
  pantallas consultan — antes el alumno y el profe veían saldos distintos.

**Lo que hay que hacer amigable:**

El alumno tiene que entender **antes de tocar el botón** qué va a pasar. Hoy la
diferencia entre conservar y perder el crédito depende de una cuenta de horas que
él no ve.

```
┌──────────────────────────────────────────────┐
│  Martes 9 de septiembre · 19:00              │
│  Grupo Competitivo · Mesa 3                  │
│                                              │
│  ✓ Si avisas ahora, conservas el derecho     │
│    a recuperar esta clase.                   │
│    Faltan 4 días y 6 horas.                  │
│                                              │
│  [ No voy a poder ir ]                       │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Miércoles 3 de septiembre · 19:00           │
│                                              │
│  ⚠ Faltan menos de 24 horas (quedan 6 h).    │
│    Si avisas ahora, tu lugar queda libre      │
│    para otro, pero PIERDES la recuperación.  │
│                                              │
│  [ Avisar igual ]  [ Mejor no ]              │
└──────────────────────────────────────────────┘
```

⚠️ El texto del segundo caso importa tanto como el código. "Pierdes la
recuperación" en la pantalla evita el reclamo por WhatsApp al día siguiente.

### 9.4 ✅🔨 Dónde recuperar

**Ya funciona, con un hallazgo caro ya corregido** que conviene tener presente
porque explica cómo hay que probar esta vista.

De la auditoría de agosto, hallazgo 10, severidad **Alta**:

> `disponibles` excluía los bloques donde el alumno ya estaba, pero no filtraba
> por grupo. **Un alumno de Adultos veía diez opciones para recuperar y las diez
> eran de Menores.**

Se arregló con `bloquesDondeRecuperar()`, con prueba. Y la conclusión de la
auditoría es la lección de este plan entero:

> "Nueve hallazgos salieron de leer el código, y el décimo —de severidad alta—
> saltó a los diez segundos de mirar la pantalla con una cuenta de alumno."

**Por eso la sección 18 existe.** Ninguna cantidad de pruebas automatizadas
reemplaza entrar con una cuenta de cada rol.

**Decisión vigente del club (2026-08-28):** el alumno **no se asigna solo**. Ve
qué hay libre, lo pide por WhatsApp, y el profe lo mete desde `/horario` →
*Recuperaciones*. Eso fue deliberado: evita que dos alumnos tomen el mismo lugar
en el mismo segundo. La §10.6 propone cómo hacerlo autoservicio **sin** perder esa
garantía.

### 9.5 🔨 Mi progreso

Bloque nuevo en `/perfil`:

- **Mi índice de fuerza**, con su curva en el tiempo.
- **Mis últimos partidos**: rival, resultado, cuánto subió o bajó el índice.
- **Mi posición** en el ranking del club y en su división de la liga.
- **Mi asistencia** del mes, en porcentaje.

El formulario pide esto explícitamente: *"para que el entrenador y el apoderado
vean el progreso"*.

⚠️ **Cuidado con el marco.** Un índice que baja, mostrado sin contexto a un niño
de 11 años, es una pantalla que hace daño. La curva se acompaña de los partidos
que la explican, y para categorías menores se puede configurar que muestre solo
la tendencia y no el número. **Pregunta abierta para el club.**

### 9.6 🔨 Mis autorizaciones

Pantalla nueva, exigida por la Ley 21.719 (§5.3):

- Qué autorizó (uso de imagen, tratamiento de datos de salud), cuándo y quién.
- Botón para **revocar**.
- Qué datos tiene el club sobre el titular.

Esto no es una funcionalidad opcional: es el registro de consentimiento que hoy
no existe para ninguna de las 54 fichas con datos de salud.

### 9.7 Resumen de la vista Jugador

| Pantalla | Cambio | Estado |
|---|---|---|
| `/mi-horario` | Textos claros de crédito | ✅ 🔨 |
| `/mi-horario` → Recuperar | Ya existe, mejorar visual | ✅ 🔨 |
| `/perfil` → Mi progreso | Índice, partidos, curva | 🔨 |
| `/perfil` → Mis autorizaciones | Consentimiento | 🔨 🔒 |
| `/estado-cuenta` | Plan en vez de monto suelto | 🔨 |
| `/feedbacks` | Ya existe | ✅ |
| `/liga` | Tabla y su próxima fecha | 🔨 |
| Vista de apoderado | Decisión pendiente | 🔒 |

---

## 10. El flujo de toma y suelta de bloques, en detalle

Esta sección desarrolla lo que el club describe como el corazón de su operación.
La analogía con la **toma de ramos universitaria** es exacta y conviene usarla,
porque trae resueltos treinta años de problemas conocidos.

### 10.1 El diccionario

| Universidad | Spinhouse | Tabla |
|---|---|---|
| Ramo / sección | Bloque horario | `bloques_horario` |
| Toma de ramos | Inscripción a un bloque | `bloque_jugadores` |
| Baja de un ramo | Cierre de la inscripción | `bloque_jugadores.vigente_hasta` |
| Cupo de la sección | Mesas × jugadores por mesa | `bloques_horario.mesas` + config |
| Tope de horario | Dos bloques que se solapan | validación nueva |
| Prerrequisito | Nivel y categoría del alumno | `jugadores.nivel` + `categoria` |
| Período de toma | Ventana de inscripción | config |
| Lista de espera | Cola cuando está lleno | 🔨 |
| Justificar inasistencia | Avisar que no va ese día | `bloque_cupos_dia` tipo `libera` |
| Recuperar en otra sección | Tomar un cupo suelto | `bloque_cupos_dia` tipo `toma` |

### 10.2 Los dos niveles, que no hay que confundir

Este es el error de diseño más fácil de cometer acá, y ya está resuelto bien en
el código actual. Vale la pena dejarlo escrito.

**Nivel 1 — Estructural: "en qué grupos estoy este semestre"**
Vive en `bloque_jugadores`. Cambia pocas veces al año. Determina la mensualidad,
el horario y la lista de asistencia de todas las semanas.

**Nivel 2 — Diario: "este martes no voy"**
Vive en `bloque_cupos_dia`. Cambia todo el tiempo. **No toca la inscripción.**

El comentario de la migración 226 lo explica mejor que cualquier reformulación:

> "Por qué una tabla nueva y no `bloque_jugadores`: esa tabla dice a qué grupos
> pertenece alguien, y cancelar UN martes no es dejar el grupo. Cerrarle la
> vigencia lo sacaría del horario, de la lista de asistencia de todos los martes
> siguientes y de la ficha."

⚠️ **Nunca resolver una cancelación de un día cerrando la vigencia.** Es el bug
que la 226 existe para no cometer.

### 10.3 Las reglas de vigencia, que ya mordieron

Tres bugs históricos de este proyecto viven en esta mecánica. Están registrados y
hay que respetarlos:

1. **`bloque_jugadores` guarda las inscripciones cerradas.** Toda consulta de "en
   qué grupos está hoy" lleva `.is('vigente_hasta', null)`. **El olvido no falla:**
   la consulta sin filtro es SQL válido, no da error y pinta una etiqueta
   plausible. El 2026-08-20, el filtro por grupo del módulo de feedback salió sin
   ese filtro y **19 jugadores aparecían en grupos que ya habían dejado**.

2. **Cerrar vigencia = ayer, nunca hoy.** Cerrar con la fecha de hoy no saca a
   nadie. Causó el caso Sofía y jugadores en dos bloques a la vez.

3. **Alta y baja el mismo día invierten la vigencia.** `cierreISO()` = "ayer"
   choca si el alta fue hoy mismo. No es corrupción; es el orden de las
   operaciones.

### 10.4 Las validaciones de la toma

Cuando alguien —admin, entrenador o el propio alumno— intenta inscribir en un
bloque, **la base** valida, en este orden:

| # | Validación | Mensaje al usuario |
|---|---|---|
| 1 | El bloque existe y está activo | "Ese grupo ya no está disponible." |
| 2 | El bloque está vigente en la fecha | "Ese grupo no está funcionando en esa fecha." |
| 3 | No está ya inscrito (vigente) | "Ya estás en ese grupo." |
| 4 | **Hay cupo** (mesas × por_mesa − inscritos) | "Ese grupo está lleno. Quedan 0 lugares." + lista de espera |
| 5 | **No se topa** con otro bloque suyo | "Se te cruza con Competitivo Adultos, martes 19:00." |
| 6 | El nivel y la categoría calzan | "Ese grupo es de Menores y tú estás en Adultos." |
| 7 | El plan lo permite (frecuencia) | "Tu plan es de 2 veces por semana y ya tienes 2." |
| 8 | No está bloqueado por morosidad | "Tu cuenta está bloqueada por un pago pendiente." |

⚠️ **Las ocho van en la base.** Una validación en el navegador es una comodidad
para el usuario, no una garantía: dos personas inscribiendo al mismo tiempo pasan
las dos comprobaciones de cliente y las dos escriben.

⚠️ **Los mensajes son parte de la especificación, no decoración.** "Error de
validación" obliga a llamar al club por WhatsApp; "se te cruza con Competitivo
Adultos, martes 19:00" se resuelve solo. Cada mensaje dice **qué pasó** y **qué
hacer**.

### 10.5 La suelta

| Quién suelta | Efecto | Regla |
|---|---|---|
| Admin o entrenador | `vigente_hasta = ayer` | Libera el cupo desde hoy |
| Alumno (si se le permite) | Igual, con aviso al staff | Según `inscripcion.autoservicio` |

⚠️ **Soltar un bloque no cambia lo ya cobrado.** Es la regla de plata del
proyecto: *"la plata de un mes cerrado no cambia"*. Si el alumno sale a mitad de
mes, la cuota emitida sigue emitida; la baja afecta al mes siguiente. Cualquier
otra cosa hay que decidirla con el club **explícitamente**.

⚠️ **Y borrar a un jugador no borra sus movimientos:** `eliminar_jugador_atomico`
los deja con `jugador_id = NULL` (migración 127). Eso no se revierte.

### 10.6 Concurrencia: el último cupo

**El problema, en concreto.** Dos apoderados, mismo bloque, un lugar libre, mismo
segundo:

```
t=0ms   Apoderado A lee: "queda 1 lugar"   ✓
t=5ms   Apoderado B lee: "queda 1 lugar"   ✓
t=50ms  A inserta su inscripción           → 17 de 16
t=55ms  B inserta la suya                  → 18 de 16
```

Las dos comprobaciones pasaron. **Las dos eran correctas cuando se hicieron.**
Ninguna cantidad de validación en el navegador arregla esto.

**La solución: una función atómica en la base**, que es el mismo patrón que el
proyecto ya usa para toda operación financiera (`registrar_pago_*`,
`registrar_movimiento_financiero_atomico`).

```sql
CREATE FUNCTION inscribir_en_bloque(p_bloque uuid, p_jugador uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Bloqueo de fila sobre el BLOQUE, no sobre la inscripción.
  --    Serializa a los que compiten por el mismo cupo y solo a ellos.
  PERFORM 1 FROM bloques_horario WHERE id = p_bloque FOR UPDATE;

  -- 2. Recién ahora se cuenta. Nadie más puede insertar mientras tanto.
  -- 3. Las ocho validaciones de §10.4.
  -- 4. El INSERT.
END;
$$;
```

**Por qué `FOR UPDATE` sobre el bloque y no sobre otra cosa:** es la fila que
representa el recurso escaso. Bloquearla serializa exactamente a quienes compiten
por ese cupo, y a nadie más. Bloquear la tabla entera frenaría inscripciones en
bloques distintos sin razón.

> **Esto es lo que permite hacer el autoservicio seguro.** La decisión del club de
> agosto —que el alumno no se asigne solo— se tomó porque no había esta garantía.
> Con la función atómica, el autoservicio deja de ser riesgoso, y por eso
> `inscripcion.autoservicio` es una clave de configuración: el club elige cuándo
> encenderlo, y puede empezar en `pide_aprobacion`.

### 10.7 Lista de espera

Cuando el bloque está lleno:

1. El alumno se anota en la cola, con su posición visible ("eres el 3.º").
2. Cuando alguien suelta, **el primero de la cola recibe el aviso**.
3. Tiene una ventana para confirmar (configurable, por defecto 24 h).
4. Si no confirma, pasa al siguiente.

⚠️ **La cola no inscribe sola.** Un alumno inscrito automáticamente en un horario
que ya no le sirve genera una falta y un reclamo. **Avisa y espera confirmación.**

### 10.8 El tablero de mesas (`/horario`)

La pantalla donde el admin y el entrenador ven todo esto.

```
        SPINHOUSE · Martes 9 de septiembre        8 mesas
  ─────────────────────────────────────────────────────────
        M1    M2    M3    M4    M5    M6    M7    M8
  17:00 ███   ███   ███   ███   ░░░   ░░░   ▓▓▓   ▓▓▓
  18:00 ███   ███   ███   ███   ░░░   ░░░   ▓▓▓   ▓▓▓
  19:00 ▒▒▒   ▒▒▒   ▒▒▒   ▒▒▒   ▒▒▒   ▒▒▒   ░░░   ░░░
  20:00 ▒▒▒   ▒▒▒   ▒▒▒   ▒▒▒   ▒▒▒   ▒▒▒   ░░░   ░░░

  ███ Iniciación U13    12/16 · Alejandro
  ▒▒▒ Competitivo       18/24 · Cristhian + auxiliar
  ▓▓▓ Arriendo libre    reservado
  ░░░ Libre
```

**Lo que esta pantalla hace posible y hoy es imposible:**

- Ver de un vistazo que a las 19:00 sobran 2 mesas → cabe otro grupo.
- Ver que a las 17:00 hay 4 mesas arrendadas → no se puede abrir nada más.
- Detectar que un bloque tiene mesas asignadas pero pocos inscritos.

Es **información densa**, así que las reglas de la §15 aplican con fuerza: el
color codifica el tipo de uso, no adorna; y tiene que leerse en el teléfono del
entrenador tanto como en el computador del admin.

---

# Parte IV — Calidad

## 11. La pirámide de pruebas de este proyecto

### 11.1 Dónde estamos

| Nivel | Hoy | Objetivo |
|---|---|---|
| Lógica de dominio | **1065 pruebas, 91 archivos** ✅ | Mantener y extender |
| Meta-pruebas sobre el código | 3 archivos ✅ | Llevar a 8 |
| Integración con la base | **0** ❌ | Las funciones atómicas y la RLS |
| Componentes y botones | **0** ❌ | Los recorridos críticos |
| Extremo a extremo por rol | **0** ❌ | 3 recorridos |
| Visual | **0** ❌ | Las pantallas densas |
| Aceptación manual | informal | Listas firmadas por rol |

### 11.2 La infraestructura que falta

🔒 **Esto es un entregable, no un supuesto.** Sin esto, las secciones 14, 15 y 16
no se pueden ejecutar.

```bash
npm install -D @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

```bash
npm install -D @playwright/test && npx playwright install chromium
```

Y `vitest.config.ts` pasa a tener **dos proyectos**, para que las pruebas de
lógica sigan corriendo rápido en Node y no arrastren un DOM que no necesitan:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      {
        // Lo que ya existe. No se toca: mismo include, mismo entorno.
        test: { name: 'dominio', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        // Lo nuevo. Solo .tsx, para que quede claro qué es una prueba de vista.
        test: {
          name: 'vistas',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/lib/test/setup-vistas.ts'],
        },
      },
    ],
  },
})
```

⚠️ **Criterio de aceptación de este paso, y es estricto:** después de instalarlo,
`npm test` sigue dando **1065 pruebas en verde sin modificar ni un archivo de
prueba existente**. Si alguna prueba de dominio cambia de resultado, la
configuración está mal.

### 11.3 Qué se prueba en cada nivel

**Regla para no duplicar esfuerzo:** cada cosa se prueba en el nivel **más barato**
que la pueda demostrar.

| Si querés demostrar… | Probalo en… | No en… |
|---|---|---|
| Que un cálculo da bien | Lógica pura | Un navegador |
| Que un botón llama a la función correcta | Componente | Extremo a extremo |
| Que la RLS no deja ver datos ajenos | Integración con la base | La pantalla |
| Que el recorrido completo funciona | Extremo a extremo | — |
| Que nadie olvidó una regla al escribir código nuevo | **Meta-prueba** | Revisión humana |

---

## 12. Pruebas de lógica

Funciones puras, sin base ni navegador. Es donde este proyecto ya es fuerte.

### 12.1 Cupos y mesas — `src/lib/domain/mesas.test.ts`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | 4 mesas, grupal, 4 por mesa | cupo = 16 |
| 2 | 2 mesas, particular, 2 por mesa | cupo = 4 |
| 3 | 0 mesas asignadas | cupo = 0, no `null` ni error |
| 4 | Mesa arrendada 19:00–20:00, clase 19:00–20:30 | **se solapa**, no disponible |
| 5 | Arriendo 19:00–20:00, clase 20:00–21:00 | **no se solapa** (borde exacto) |
| 6 | Arriendo 19:00–20:00, clase 18:00–21:00 | se solapa (contiene) |
| 7 | Dos bloques, misma hora, piden 5 y 5 de 8 mesas | rechaza el segundo |
| 8 | Mesa desactivada a mitad de semana | deja de contar desde esa fecha |

⚠️ **El caso 5 es el que se escribe mal.** El solapamiento de intervalos con
bordes iguales es un error clásico: `fin_a > inicio_b AND inicio_a < fin_b` es
correcto; con `>=` una clase que empieza justo cuando termina el arriendo queda
bloqueada sin razón.

### 12.2 Elo — `src/lib/domain/elo.test.ts`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Dos de 1500, gana A | A sube exactamente lo que B baja |
| 2 | 1200 le gana a 1800 | A sube mucho, B baja mucho |
| 3 | 1800 le gana a 1200 | Movimiento mínimo |
| 4 | Suma total del sistema | **Constante** tras cualquier partido |
| 5 | Jugador nuevo sin partidos | Arranca en el valor inicial configurado |
| 6 | Mismo par, 100 partidos alternados | Converge, no diverge |
| 7 | Walkover | No mueve el índice (configurable) |
| 8 | K distinto para menores | Se aplica el K de su categoría |

⚠️ **El caso 4 es el invariante que caza casi todo.** Si la suma cambia, el
cálculo está mal, sin importar qué otro test pase. Es el mismo tipo de prueba que
`reportesMes.invariantes.test.ts` ya usa en este proyecto.

### 12.3 Liga — `src/lib/domain/ligaTemporada.test.ts`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | 12 jugadores, 1 rueda | **11 fechas**, 66 partidos |
| 2 | Cada jugador | 11 partidos, uno por fecha |
| 3 | Ningún par se repite | 0 repeticiones |
| 4 | Puntaje 2/1/0 | Victoria 2, derrota jugada 1, no presentación 0 |
| 5 | Empate a puntos | Desempata por **resultado directo** |
| 6 | Empate triple | Mini-tabla entre los tres empatados |
| 7 | Empate total | Llega a sorteo sin reventar |
| 8 | Top 4 | Playoffs en el orden correcto |
| 9 | 1.º y 2.º | Suben; 11.º y 12.º bajan; sin promoción |
| 10 | **Con la config de Buin (3/1)** | **Da el mismo resultado que hoy** |

⚠️ **El caso 10 es el que protege a Buin** y es innegociable: la prueba
existente de `liga.test.ts` tiene que seguir pasando **sin modificarse**.

### 12.4 Toma y suelta — `src/lib/domain/inscripcion.test.ts`

Las ocho validaciones de §10.4, cada una en su caso positivo y su negativo. Más:

| # | Caso | Resultado esperado |
|---|---|---|
| 9 | Alta y baja el mismo día | No invierte la vigencia (bug conocido) |
| 10 | Cerrar vigencia con hoy | Rechazado: tiene que ser ayer |
| 11 | Consulta sin `vigente_hasta IS NULL` | La meta-prueba de §14.4 la caza |
| 12 | Soltar a mitad de mes | La cuota emitida no cambia |

### 12.5 Morosidad y retención — `src/lib/domain/retencion.test.ts`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Umbral en `0` | **Nunca bloquea** (protege a Buin) |
| 2 | Deuda de 29 días, umbral 30 | No bloquea |
| 3 | Deuda de 30 días exactos | Bloquea |
| 4 | Deuda de 30 días, ya pagó | No bloquea |
| 5 | Cálculo a las 23:00 en Chile | Usa el día chileno, no el UTC |
| 6 | 3 faltas seguidas | Alerta |
| 7 | 2 faltas, 1 presente, 1 falta | **No** alerta: no son consecutivas |
| 8 | 3 faltas con feriado en medio | El feriado no rompe la racha |

⚠️ **El caso 5 es el bug de la hora UTC**, que ya mordió antes en este proyecto.

---

## 13. Pruebas de humo

**Qué son:** el conjunto mínimo que responde *"¿está prendido?"* después de cada
despliegue. Rápidas y sobre lo que no puede fallar nunca.

**Cuándo corren:** después de cada despliegue y después de cada migración.
**Cuánto duran:** menos de 2 minutos.
**Si una falla:** se revierte. No se investiga con el sistema arriba.

| # | Humo | Cómo se verifica |
|---|---|---|
| 1 | La app carga | `/login` responde 200 |
| 2 | Se puede entrar con cada rol | 3 sesiones abren |
| 3 | Cada rol aterriza donde debe | admin→`/dashboard`, profe→`/dashboard-profesor`, jugador→`/perfil` |
| 4 | El dashboard trae datos | `dashboard_kpis()` responde sin error |
| 5 | Se ve la lista de jugadores | > 0 filas para el admin |
| 6 | Se puede abrir pasar lista | El bloque de hoy aparece |
| 7 | El horario del alumno carga | `/mi-horario` muestra sus bloques |
| 8 | **Buin sigue igual** | Los KPIs de Buin dan lo mismo que antes del despliegue |
| 9 | Las migraciones aplicadas coinciden | `_migraciones_aplicadas` tiene lo esperado |
| 10 | El trigger de guardia está inerte | Una escritura normal pasa |

⚠️ **El humo 8 es específico de este proyecto y es el más importante de los
diez.** Cada despliegue de algo de Spinhouse tiene que demostrar que Buin no se
movió. Es barato: guardar los KPIs antes, compararlos después.

---

## 14. Pruebas de vistas y de botones

Requieren la infraestructura de §11.2.

### 14.1 Qué se prueba de un componente

**No** que se vea lindo — eso es la §15. Acá se prueba **comportamiento**:

1. Con datos, muestra los datos.
2. Sin datos, muestra un vacío útil (no una pantalla en blanco).
3. Cargando, lo dice.
4. Con error, lo dice **y ofrece reintentar**.
5. El botón llama a la función correcta, con los argumentos correctos.
6. El botón se deshabilita mientras la acción corre (doble clic).
7. Lo que el rol no puede hacer, **no aparece**.

⚠️ **El punto 6 no es teórico.** Un doble clic en "Registrar pago" sin
deshabilitar el botón registra el pago dos veces. En una pantalla de plata, eso es
un incidente.

### 14.2 Pasar lista — `AsistenciaPanel.test.tsx`

| # | Caso | Comprobación |
|---|---|---|
| 1 | 16 alumnos | Se listan los 16 |
| 2 | Toque en una fila | Marca presente y se ve al instante |
| 3 | Segundo toque | Deshace |
| 4 | Contador | "1 de 16" tras el primer toque |
| 5 | Área táctil | Cada fila mide ≥ 44 px de alto |
| 6 | Falla de red | Cartel claro + reintento, la marca no se pierde |
| 7 | Doble toque rápido | Un solo registro, no dos |
| 8 | Bloque sin alumnos | "Nadie inscrito en este grupo todavía" |
| 9 | Día futuro | No deja marcar |
| 10 | Rol jugador | No ve el panel |

### 14.3 Avisar que no voy — `PanelRecuperarClases.test.tsx`

| # | Caso | Comprobación |
|---|---|---|
| 1 | Con más de 24 h | Dice que **conserva** el derecho |
| 2 | Con menos de 24 h | Dice que **pierde** la recuperación, y lo dice antes |
| 3 | Confirmar con menos de 24 h | Pide confirmación explícita |
| 4 | Ya avisó | No ofrece avisar de nuevo |
| 5 | Feriado | No ofrece la clase o explica que no da crédito |
| 6 | Saldo 0 | Lo dice; no muestra opciones falsas |
| 7 | Opciones de recuperación | **Solo de su mismo grupo** (hallazgo 10) |
| 8 | No ve compañeros | Solo el número de lugares libres |
| 9 | Sin teléfono del club | El botón de WhatsApp no aparece |

⚠️ **El caso 7 es el hallazgo de severidad alta de la auditoría.** Ahora tiene
prueba de lógica; con esto tiene también prueba de vista.

### 14.4 🔨 Meta-pruebas nuevas

Extienden la tradición de §2.4. Baratas, sin navegador, y cazan la clase entera
del bug.

| Meta-prueba | Qué hace cumplir | Bug que previene |
|---|---|---|
| `vigencia-en-consultas.test.ts` | Toda consulta a `bloque_jugadores` lleva `.is('vigente_hasta', null)` o está en la lista de excepciones con su motivo | Los 19 jugadores en grupos que ya habían dejado |
| `asistencia-filtra-presente.test.ts` | Toda consulta nueva a `asistencia` filtra `estado` | Porcentajes inflados |
| `realtime-declarado.test.ts` | Toda tabla en `useEnVivo` está publicada en `supabase_realtime` | Pantallas mudas (migraciones 121 y 142) |
| `sin-club-id-en-codigo.test.ts` | Ningún UUID de club aparece en `src/` | El `if` por club prohibido |
| `fecha-chile.test.ts` | Ningún `new Date().toISOString()` para fechas de negocio | El bug de la hora UTC |

⚠️ **`realtime-declarado` merece énfasis.** Suscribirse a una tabla que no está
publicada **no da error**: se conecta, queda escuchando y no llega nada nunca.
Mordió dos veces, y la segunda dejó `movimientos`, `perfiles` y
`credencial_visible` mudas — se cobraba una clase extra y Finanzas no se
enteraba. Consulta para verificar:

```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
```

---

## 15. Pruebas visuales

### 15.1 Qué se captura

No todas las pantallas. Las que **cambian de forma según los datos**, que son
donde una regresión visual se cuela:

| Pantalla | Estados a capturar |
|---|---|
| Tablero de mesas | Vacío · medio · lleno · con arriendos |
| Dashboard admin | Con datos · sin datos · con morosos |
| Pasar lista | 0 · 1 · 16 · 40 alumnos |
| Ficha del jugador | Completa · mínima · con datos paralímpicos |
| Tabla de la liga | Fecha 1 · fecha 6 · con zonas pintadas |
| Mi horario | Sin bloques · 1 · 5 bloques |

### 15.2 En cuántos tamaños

| Perfil | Tamaño | Quién |
|---|---|---|
| Teléfono | 375 × 812 | **Entrenador y apoderado — el caso principal** |
| Tablet | 768 × 1024 | Admin en la sala |
| Escritorio | 1440 × 900 | Admin en la oficina |

Y en **tema claro y oscuro**, porque el sistema tiene `ThemeToggle`.

⚠️ **El teléfono no es un tamaño secundario acá.** El entrenador y el apoderado
—147 de las 148 personas que van a usar esto— entran desde el teléfono. Si algo
solo se ve bien en escritorio, está roto para casi todos.

### 15.3 Reglas que se comprueban, no que se opinan

Éstas se pueden verificar automáticamente y no dependen del gusto:

| # | Regla | Cómo se mide |
|---|---|---|
| 1 | Nada de scroll horizontal | `document.body.scrollWidth <= innerWidth` |
| 2 | Contraste de texto ≥ 4.5:1 | Auditoría automática |
| 3 | Área táctil ≥ 44 px | Medir los botones |
| 4 | Ningún texto cortado | Sin `overflow` no intencional |
| 5 | Foco visible al tabular | Recorrido con teclado |
| 6 | Tablas anchas con su propio scroll | El cuerpo no se mueve |
| 7 | Todo en español | Meta-prueba que busca texto en inglés |

---

## 16. Pruebas de simulación

**Qué son:** correr el sistema con datos realistas durante un período simulado y
comprobar que los números cierran. Este proyecto ya usa la técnica
(`oficial-simulacion-40.test.ts`, `torneos-simulacion.test.ts`).

### 16.1 Un mes de Spinhouse

**Escenario:** 140 alumnos, 7 entrenadores, 8 mesas, 4 semanas.

| # | Invariante que tiene que cerrar |
|---|---|
| 1 | Ningún bloque supera su cupo, ningún día |
| 2 | Ninguna mesa está en dos lugares a la vez |
| 3 | Cada crédito de recuperación se emitió por una cancelación con derecho |
| 4 | Créditos emitidos − usados − caducados = saldo |
| 5 | Suma de mensualidades emitidas = suma de lo esperado por plan |
| 6 | Ingresos − gastos = resultado del mes |
| 7 | Nadie bloqueado tiene deuda menor al umbral |
| 8 | Nadie con deuda mayor al umbral quedó sin bloquear |
| 9 | El total del padrón activo cuadra con altas − bajas |
| 10 | Cada hora liquidada tiene su marca de asistencia |

### 16.2 Una temporada de liga

**Escenario:** 5 divisiones × 12, 11 fechas, playoffs, ascensos.

| # | Invariante |
|---|---|
| 1 | Cada jugador juega 11 partidos, ni uno más |
| 2 | Ningún par se repite |
| 3 | Suma de puntos = 2 × partidos jugados |
| 4 | Suma de sets a favor = suma de sets en contra |
| 5 | Suma de tantos a favor = suma de tantos en contra |
| 6 | Suben exactamente 2 por división, bajan exactamente 2 |
| 7 | El campeón de Honor no asciende a ningún lado |
| 8 | El último de Cuarta no desciende a ningún lado |
| 9 | Con la config de Buin, la tabla da idéntico a hoy |

⚠️ **Los invariantes 4 y 5 son los que cazan errores de carga de resultados.**
Si no cierran, alguien registró un partido mal y la tabla está mintiendo.

### 16.3 Estrés de la toma

**Escenario:** 50 personas intentan el último cupo en el mismo segundo.

| # | Invariante |
|---|---|
| 1 | **Exactamente una** queda inscrita |
| 2 | Las otras 49 reciben "el grupo está lleno" |
| 3 | Ninguna recibe un error crudo de Postgres |
| 4 | El cupo final es exactamente el máximo, nunca máximo + 1 |
| 5 | Las 49 quedan en lista de espera si la pidieron |

Esta es la prueba que valida §10.6. **Sin ella, el autoservicio no se enciende.**

---

## 17. Pruebas de permisos

La matriz de §6 convertida en pruebas. Es la sección que impide una filtración.

### 17.1 Por ruta

Extiende `rutas-protegidas.test.ts`, que ya existe:

| # | Caso | Esperado |
|---|---|---|
| 1 | Jugador entra a `/finanzas` por URL | Redirigido |
| 2 | Jugador entra a `/dashboard` | Redirigido |
| 3 | Entrenador entra a `/finanzas` | Redirigido |
| 4 | Entrenador entra a `/credenciales` | Redirigido — muestra contraseñas en texto plano |
| 5 | Sin sesión, cualquier ruta privada | A `/login` |
| 6 | Toda `page.tsx` está en alguna lista | La prueba existente lo garantiza |
| 7 | Ruta de un módulo apagado | Bloqueada **también por URL directa** |

⚠️ **El caso 7 ya falló antes:** el sidebar escondía la entrada, pero la URL
directa abría la pantalla igual. Se arregló para cuatro módulos; la prueba impide
que vuelva.

### 17.2 Por dato (RLS)

Se prueban contra la base, con un usuario real de cada rol:

| # | Caso | Esperado |
|---|---|---|
| 1 | Jugador consulta `bloque_jugadores` de otro | 0 filas |
| 2 | Jugador consulta `movimientos` ajenos | 0 filas |
| 3 | Entrenador consulta montos | 0 filas o sin la columna |
| 4 | Admin de Spinhouse consulta jugadores de Buin | **0 filas** |
| 5 | Admin de Spinhouse consulta `audit_log` de Buin | **0 filas** |
| 6 | Profesor lee `feedback_profesores` directo | **0 filas** (una sola política) |
| 7 | Admin llama `feedback_de_profesores()` con anónimo | Autor en `NULL` |
| 8 | `DELETE … RETURNING jugador_id` sobre feedback | Rechazado |
| 9 | Alumno le escribe a un profe que no le hace clases | Rechazado |

⚠️ **Los casos 6, 7 y 8 son el anonimato.** Si alguno falla, la palabra
"anónimo" en la pantalla es mentira, y eso es peor que no haber ofrecido el
anonimato.

⚠️ **Los casos 4 y 5 son el aislamiento entre clubes.** Hoy pasan: de 171
políticas RLS, 148 filtran por club. La prueba los congela como regresión.

⚠️ **Auditar contando `CREATE POLICY` en las migraciones da falsos positivos.**
Así nacieron tres fugas inventadas en una auditoría anterior: una política creada
en la 016 puede estar reemplazada en la 041. **Para saber el estado real hay que
consultar `pg_policies` en la base**, no leer el historial de migraciones.

---

## 18. Aceptación manual por rol (UAT)

> "Nueve hallazgos salieron de leer el código, y el décimo —de severidad alta—
> saltó a los diez segundos de mirar la pantalla con una cuenta de alumno."
> — auditoría de Spinhouse, agosto 2026

**Ninguna cantidad de pruebas automatizadas reemplaza entrar con una cuenta de
cada rol.** Esta sección es obligatoria antes de cada entrega, no opcional.

### 18.1 Cómo se ejecuta

- **Tres cuentas reales**, una por rol, en datos de prueba de Spinhouse.
- **Desde el teléfono** para entrenador y jugador. No desde el computador.
- Cada punto se marca ✅ o ❌ **con captura** si falla.
- **Un solo ❌ frena la entrega.** No hay "lo vemos después".

### 18.2 Lista del Administrador

- [ ] Entro y el dashboard carga en menos de 3 segundos
- [ ] Veo cuántos deben y quiénes, sin cambiar de pantalla
- [ ] Registro un pago y el saldo baja al instante
- [ ] El pago quedó en `audit_log`
- [ ] Veo la ocupación de cada bloque con su color
- [ ] Abro el tablero de mesas y entiendo qué está ocupado sin que me expliquen
- [ ] Asigno una mesa a un bloque y el cupo cambia solo
- [ ] Intento asignar una mesa ya arrendada y el sistema me lo impide con un mensaje claro
- [ ] Inscribo a un alumno en un bloque lleno y me lo impide
- [ ] Veo altas y bajas del mes
- [ ] Veo ingresos por línea de negocio
- [ ] Emito las mensualidades del mes y los montos calzan con los planes
- [ ] Exporto a Excel y el archivo abre bien
- [ ] **Entro con la cuenta de Buin y todo está exactamente igual que antes**

### 18.3 Lista del Entrenador — **desde el teléfono, de pie**

- [ ] Entro y veo mi clase de hoy sin buscar
- [ ] Veo dónde es y qué mesas tengo
- [ ] Paso lista de 16 alumnos en **menos de 30 segundos**
- [ ] Cada toque responde al instante
- [ ] Me equivoco, toco de nuevo y se deshace
- [ ] Voy a un rincón con mala señal, marco, y no se pierde
- [ ] Marco mis horas del día
- [ ] Veo mis horas del mes
- [ ] Recibo la alerta de un alumno con 3 faltas
- [ ] Le escribo al apoderado desde esa alerta, con el mensaje ya redactado
- [ ] Escribo un feedback a un alumno
- [ ] Leo lo que me escribieron **y no veo quién lo escribió si era anónimo**
- [ ] Asigno una recuperación a un alumno que la pidió
- [ ] **No veo montos, ni morosidad, ni precios en ninguna pantalla**
- [ ] Nada me obliga a hacer scroll horizontal

### 18.4 Lista del Jugador y Apoderado — **desde el teléfono**

- [ ] Entro y entiendo qué hacer sin que me expliquen
- [ ] Veo mi horario de la semana
- [ ] Veo cuánto debo y hasta cuándo
- [ ] Aviso que no voy a una clase de la semana que viene
- [ ] **Antes de confirmar, la pantalla me dice si conservo o pierdo la recuperación**
- [ ] Aviso con menos de 24 h y me lo advierte antes de confirmar
- [ ] Veo mi saldo de recuperaciones y cuándo caduca
- [ ] Veo dónde puedo recuperar, y **todas las opciones son de mi nivel**
- [ ] **No veo quiénes son mis compañeros de grupo, en ninguna pantalla**
- [ ] Le escribo al profe de forma anónima
- [ ] Borro lo que escribí y desaparece
- [ ] Veo mi índice de fuerza y su curva
- [ ] Veo mi posición en la liga y mi próxima fecha
- [ ] Veo qué autoricé y puedo revocarlo
- [ ] **No veo el bloque técnico de mi ficha**
- [ ] Todo está en español, sin una palabra en inglés

### 18.5 Lista de no-regresión de Buin

**La más importante de las cuatro.** Se corre con una cuenta de Buin después de
cada entrega de Spinhouse.

- [ ] El dashboard muestra los mismos KPIs que antes
- [ ] Los bloques muestran su cupo como número, sin mencionar mesas
- [ ] Las mensualidades siguen con monto libre; no aparece la palabra "plan"
- [ ] Nadie se bloqueó solo
- [ ] La tabla de la liga da los mismos puntos que antes (3/1)
- [ ] Las categorías de finanzas son las de siempre
- [ ] Las categorías de jugador son PENECA…MASTER J
- [ ] La sede dice "Buin (Aníbal Pinto 158)" y "Paine", sin Spinhouse
- [ ] Ninguna pantalla nueva de Spinhouse aparece en el menú
- [ ] Los reportes de meses cerrados dan los mismos totales

---

# Parte V — Ejecución

## 19. Fases, entregables y criterios de salida

Cada fase tiene un **criterio de salida verificable**. No se pasa a la siguiente
sin cumplirlo.

### Fase 0 — Blindaje y configuración 🔒

| Ítem | Estado |
|---|---|
| A2 · `_migracion_para_club()` — migración 246 | ✅ aplicada y verificada |
| A3 · Trigger de guardia — migración 247 | ✅ aplicada y verificada |
| **C1 · `club_config` + catálogo + `configDelClub()`** — migración 248 | ✅ escrita, pendiente de aplicar |
| **Infraestructura de pruebas de UI (§11.2)** | 🔨 pendiente |

**Criterio de salida:**
1. ✅ `npm test` da **1098 en verde (1065 + 33 nuevas) sin modificar ninguna
   prueba existente**; `tsc` y `eslint` limpios.
2. ✅ Un club sin filas en `club_config` se comporta **idéntico** a hoy — es lo
   que comprueban los 33 casos, uno por cada default.
3. 🔨 `npm run test:vistas` corre y pasa con al menos una prueba de ejemplo.

Lo que quedó construido en C1:

| Archivo | Qué es |
|---|---|
| `supabase/migrations/248_club_config.sql` | La tabla, su RLS, el trigger de sello y el alta en `supabase_realtime` |
| `src/lib/domain/clubConfig.ts` | El catálogo único, hermano de `modulos.ts`: 11 claves con su tipo, su rango y su default |
| `src/lib/domain/clubConfig.test.ts` | 33 pruebas; las primeras congelan cada default uno por uno |
| `src/lib/supabase/clubConfig.ts` | `configDelClub()`, la única puerta a la tabla, con caché declarando su origen |

### Fase 1 — La operación diaria

1. Encender módulos y cargar padrón, bloques, profesores, mesas.
2. **Emparejar los correos de los 7 entrenadores** (§8.3). 🔒
3. Categorías propias (§5.5) y financieras (§5.7).
4. **Mesas y cupo derivado** (§5.1), con validación en la base.
5. Tipo de clase y rol del entrenador (principal / auxiliar).
6. **Planes de mensualidad** (§5.2). 🔒 bloqueado por el insumo del club.
7. Campos de ficha **junto con el consentimiento** (§5.3). 🔒
8. Pasar lista optimizado (§8.2).

**Criterio de salida:** las tres listas de UAT (§18.2–18.4) pasan completas, y la
de no-regresión de Buin (§18.5) también.

### Fase 2 — Decidir con datos

9. Tres tarjetas del dashboard (§7.2).
10. Reglas de retención y morosidad (§7.4), **en marcha en seco**.
11. Recordatorios de cobro a un clic.
12. Márgenes y liquidación (§7.3) — **solo si se congelaron las horas**.

**Criterio de salida:** un mes completo de marcha en seco **sin un solo falso
positivo** antes de encender el bloqueo automático.

### Fase 3 — Lo competitivo

13. Índice de fuerza + importación del histórico (§5.6).
14. Liga de temporada (§5.4).
15. Formatos de torneo: 2 ruedas → consolación → suizo.
16. Exportación CSV/JSON y calendario público.

**Criterio de salida:** la simulación de temporada (§16.2) cierra sus 9
invariantes, incluido el 9 que protege a Buin.

### Fase 4 — Terceros y autoservicio

17. Autoservicio de inscripción (§10.6) — **requiere la prueba de estrés (§16.3)**.
18. Lista de espera (§10.7).
19. Torneos por equipos y dobles — módulo propio.
20. WhatsApp automático — con proveedor y costo decidido.
21. API pública, solo si el CSV/JSON no alcanzó.

---

## 20. Riesgos

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| 1 | Saltarse C1 y escribir `if` por club | **Crítica** | La meta-prueba `sin-club-id-en-codigo` lo hace fallar |
| 2 | El bloqueo automático bloquea a quien está al día | **Crítica** | Un mes de marcha en seco; reversible en un clic; rastro en `audit_log` |
| 3 | Liquidar sueldos con horas que se recalculan | **Alta** | Congelar los minutos antes de liquidar; cartel en la pantalla mientras tanto |
| 4 | Datos de salud sin consentimiento | **Alta** (legal) | Los campos se construyen con el registro de consentimiento o no se construyen |
| 5 | Reescribir la liga en vez de configurarla | Alta | Reutilizar `oficial-ittf.ts`; el invariante 9 de §16.2 |
| 6 | Una migración de Spinhouse toca Buin | Alta | **Ya mitigado**: migraciones 246 y 247, verificadas |
| 7 | Los 7 correos de entrenadores no calzan | Media | Verificar uno por uno antes de entregar |
| 8 | Suscribirse a una tabla no publicada en realtime | Media | La meta-prueba `realtime-declarado` |
| 9 | Consulta sin `vigente_hasta IS NULL` | Media | La meta-prueba `vigencia-en-consultas` |
| 10 | El índice de fuerza desmotiva a un menor | Media | Config para mostrar solo tendencia; decisión del club |
| 11 | La vista del apoderado no calza con hermanos | Media | Decidir A/B/C antes de la Fase 1 |
| 12 | El teléfono del entrenador no aguanta la pantalla | Media | Pruebas visuales a 375 px, obligatorias |
| 13 | Las migraciones se pegan a mano, sin CI | Media | `_migracion_nueva` + `_migracion_para_club` |
| 14 | Auditar RLS leyendo migraciones da falsos positivos | Baja | Consultar `pg_policies`, no el historial |

---

## 21. Preguntas abiertas al club

Las dos primeras bloquean la Fase 1.

| # | Pregunta | Bloquea | Por qué importa |
|---|---|---|---|
| 1 | 🔒 **Planes, valores vigentes y padrón completo** | Fase 1 | Sin esto no se emite una sola mensualidad |
| 2 | 🔒 **Cuántas mesas tiene la sede, y cuáles se reservan a arriendo en qué franjas** | Fase 1 | Sin ese número el cupo derivado no se calcula |
| 3 | **¿Qué es una "baja"?** ¿Dejó de pagar, dejó de asistir, o avisó que se va? | Tarjeta de retención | Son tres números distintos |
| 4 | **¿Elo o Bradley-Terry?** ¿Y el archivo histórico de partidos? | Fase 3 | Sin histórico el índice no significa nada el primer semestre |
| 5 | **¿Un apoderado con dos hijos necesita una cuenta o dos?** | Vista del jugador | Decide entre las opciones A, B y C de §9.2 |
| 6 | **Tarifa por hora de cada entrenador** | Márgenes | Sin ella no hay margen por bloque ni liquidación |
| 7 | **¿Quién paga los mensajes de WhatsApp, y con qué proveedor?** | Fase 4 | Única partida que no depende solo de nosotros |
| 8 | **¿Cómo se recoge el consentimiento de datos paralímpicos, y quién firma por un menor?** | Fase 1 | Ley 21.719, rige el 2026-12-01 |
| 9 | **¿Un menor debe ver su índice de fuerza bajar?** | Vista del jugador | Decisión pedagógica, no técnica |
| 10 | **¿El alumno puede inscribirse solo, o siempre pasa por el profe?** | Fase 4 | Define `inscripcion.autoservicio` |

---

## 22. Definición de "hecho"

Una partida está terminada cuando **todas** estas se cumplen. No es una lista de
deseos: es el criterio con el que se acepta o se rechaza.

- [ ] La lógica tiene pruebas, incluidos los casos borde de §12
- [ ] La vista tiene pruebas de comportamiento (§14)
- [ ] Los permisos tienen prueba por ruta y por dato (§17)
- [ ] Pasa las pruebas de humo (§13)
- [ ] Si toca datos, la simulación cierra sus invariantes (§16)
- [ ] Las capturas visuales están aprobadas en teléfono, tablet y escritorio, en ambos temas
- [ ] La lista de UAT del rol correspondiente pasa completa (§18)
- [ ] **La lista de no-regresión de Buin pasa completa (§18.5)**
- [ ] La migración lleva `_migracion_nueva` y `_migracion_para_club`
- [ ] Toda escritura revisa su `{ error }`
- [ ] La pantalla usa `useEnVivo` y `cachedFetch` declarando sus tablas
- [ ] Las tablas que escucha están en `supabase_realtime`
- [ ] Toda fecha usa `fechaChile()`
- [ ] No hay ningún `club_id` escrito duro en `src/`
- [ ] Todo el texto está en español
- [ ] `npm test` en verde, sin pruebas modificadas para que pase

---

## Lo que este plan deliberadamente no propone

- **No propone tocar Buin.** Ni una pantalla, ni un default, ni una categoría
  financiera existente.
- **No propone renombrar lo ya guardado.** Los movimientos históricos de Buin
  conservan sus claves; los reportes anteriores los leen.
- **No propone ningún `if` por club en código compartido.** Si algo no cabe en
  `club_config`, va como módulo aparte.
- **No propone la API pública en la primera vuelta.** El CSV/JSON cubre el caso
  que el club describió.
- **No propone tocar el módulo técnico ni el de torneo oficial.** Los dos sirven
  tal cual y son de lo mejor que tiene el sistema.
- **No propone encender el bloqueo automático sin un mes de marcha en seco**, por
  mucho que el club lo pida antes.
