# Plan de implementación — Spinhouse

Respuesta al *Formulario de implementación · Respuestas de Spinhouse*
(Centro Deportivo SPH SpA, RUT 65.223.036-9, José Ananías 128, Macul).
Representante: Cristhian Carrasco, Co-Fundador y Head Coach (ITTF Nivel II).
140 jugadores, 7 entrenadores, sede única.

**Este plan es SOLO para Spinhouse** (`2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41`).
Buin (`ec1ef215-…`) es el club en producción con plata y gente real, y nada de
lo que está acá debe cambiarle una pantalla, una regla ni una fila.

Escrito leyendo el código, no de memoria. Lo que no pude comprobar está marcado
como tal.

---

## 0. El punto de partida incómodo

Spinhouse **no es un club más**. Es el primero que funciona distinto en casi
todo lo que importa:

| Dimensión | Buin | Spinhouse |
|---|---|---|
| Cupo de un bloque | un número entero | derivado de **mesas** disponibles |
| Mensualidad | monto libre por jugador | **plan** (frecuencia × tipo de clase) |
| Categorías | año de nacimiento (PENECA…MASTER J) | U11/U13/U15/U17/U19/adulto/senior **+ nivel** |
| Liga | 5 fechas, jornada de mesa | **11 fechas**, temporada, ascensos y descensos |
| Puntaje de liga | 3 victoria / 1 derrota | **2 victoria / 1 derrota / 0 no presentación** |
| Bloqueo del alumno | a mano | **automático por morosidad** (30 días) |
| Disciplina | convencional | convencional **y paralímpica** |
| Aviso al apoderado | link `wa.me` que alguien aprieta | **automático** |

`CLAUDE.md` prohíbe resolver esto con `if (club_id === '2d8e…')`, y tiene razón:
eso ata a los tres clubes al mismo archivo. Pero el mecanismo que reemplaza a
ese `if` —`club_config` y `_migracion_para_club()`, en
`docs/plan-aislamiento-clubes.md`— **todavía no está implementado**.

> **Conclusión que ordena todo el plan: la Fase 0 no es negociable.** Spinhouse
> es exactamente el club para el que se escribió el plan de aislamiento. Empezar
> por los requerimientos y dejar el aislamiento para después significa escribir
> los `if` que después habrá que sacar, con Buin en producción en el medio.

---

## 1. Lo que ya está construido y solo hay que encender

Esto no cuesta desarrollo: es marcar módulos en el panel del superadmin y cargar
los datos. Contadas una por una, el formulario pide **35 partidas**: **17 ya
funcionan**, **3 se resuelven configurando** (§2) y **15 hay que construirlas**
(§3).

| Lo que pide el formulario | Qué lo cubre hoy | Dónde |
|---|---|---|
| Panel de administración | Dashboard con KPIs, morosidad, gastos por categoría | `src/app/dashboard/page.tsx`, `dashboard_kpis()` |
| Ficha de jugador, padrón | Jugadores + documentos + foto + credenciales | `src/app/jugadores/`, `credencial_visible` |
| Asistencia de alumnos | Panel por bloque, histórico, panorama, exportes | `AsistenciaPanel`, `PanelRankingAsistencia` |
| Horario con cupos | `bloques_horario` + `bloque_jugadores` con vigencia | migración 073, `PanelCupos` |
| **Cancelar y recuperar clase** | ✅ ya hecho **para Spinhouse** | migraciones 226 y 231, módulo `recuperar_clases` |
| **Horas trabajadas del profe** | ✅ ya hecho **para Spinhouse** | migración 227, módulo `asistencia_profes` |
| **Feedback del alumno al profe** | ✅ ya hecho **para Spinhouse**, con anonimato real | migraciones 228 y 232, módulo `feedback_profes` |
| Mensualidades y cobranza | Emisión mensual, estado de cuenta, morosos | `MensualidadesPanel`, `estadoCuenta.ts` |
| Finanzas con rastro | RPC atómicos + `audit_log` | `registrar_pago_*`, `registrar_movimiento_financiero_atomico` |
| Torneos con grupos y llaves | Motor completo, siembra ITTF, byes | `torneos.ts`, `oficial-sorteo.ts` |
| **Torneo oficial ITTF** | Grupos con **2/1/0**, sets con parciales, desempates | `oficial-ittf.ts`, `oficial_partidos.sets jsonb` |
| Marcador en vivo y vista pública | `/vivo/[codigo]`, `/torneo-oficial/vivo/[codigo]` | módulo `tecnico` |
| Calendario de eventos | Tabla `eventos` con tipo, fecha y horario | `src/app/calendario/page.tsx` |
| **Plantilla de entrenamiento y objetivo del período** | Módulo técnico completo | `tecnico_planes`, `tecnico_jugador_objetivos`, `tecnico_sesiones` |
| Clases particulares cobradas aparte | `clases_extraordinarias` (cobro sí, agenda no) | migración 098 |
| Ranking interno por torneos | Por puesto alcanzado, acumulado | `rankingInterno.ts` |
| Exportes a Excel y PDF | 14 exportadores distintos | `src/lib/*-excel.ts`, `*-pdf.ts` |

**Hallazgo que vale plata:** el motor del **Torneo Oficial** ya implementa
exactamente el puntaje que Spinhouse pide para su liga —2 al ganador, 1 al
perdedor de partido jugado, 0 al que no se presenta— y ya guarda los parciales
de cada set en `oficial_partidos.sets` (jsonb). No hay que inventar ese motor:
hay que **conectarlo a la liga**.

---

## 2. Lo que existe pero está escrito para Buin

Acá no se construye: se convierte una constante en un dato. Es el trabajo que
`docs/plan-aislamiento-clubes.md` llama Fase C, y Spinhouse es su primer cliente.

### 2.1 Categorías — el patrón ya está inventado

`src/lib/domain/esquemaCategorias.ts` ya resolvió este problema para
`/solicitudes`: sacó cinco `if (clubId === CLUB_BUIN_ID)` y los reemplazó por
una tabla `POR_CLUB`. Agregar Spinhouse es **una entrada**, no una pantalla.

Spinhouse cruza dos ejes que hoy viven en un solo campo:

- **Edad** — U11, U13, U15, U17/U19, adulto, senior (se calcula solo desde
  `fecha_nacimiento`, igual que hace `categoriaBuinPorFechaNacimiento`)
- **Nivel** — iniciación, intermedio, competitivo (lo pone el entrenador)

Son dos cosas distintas y hay que guardarlas en dos columnas. Meterlas en
`jugadores.categoria` concatenadas ("U15-competitivo") hace imposible filtrar
por una sola, y ese filtro es justo el que arma los grupos.

### 2.2 Sedes

`src/lib/domain/sedeGrupo.ts` tiene el catálogo `SEDES` con Buin, Paine y —desde
la migración 232— `spinhouse`. Las pestañas ya se derivan del dato
(`sedesDe()`), así que Spinhouse ve las suyas y Buin no ve una pestaña vacía.
**Funciona, pero es la solución chica**: el catálogo sigue siendo una constante
en el código. Va a `club_config` en la Fase 0.

### 2.3 Categorías financieras

`src/app/finanzas/page.tsx:51-52` tiene los dos arrays escritos duro:

```
ingreso: mensualidad, matricula, inscripcion_torneo, inscripcion_liga,
         arriendo_cancha, donacion, otro_ingreso
gasto:   sueldo_profesor, sueldo_staff, arriendo_cancha, material_deportivo,
         servicios_basicos, mantenimiento, otro_gasto
```

Spinhouse pide además, como ingreso: **clases particulares**, **arriendo de
mesas** (distinto de arriendo de cancha), **venta de artículos** (gomas,
maderas, pelotas) y **auspicios**. Y como gasto: **premios de torneos y liga** y
**marketing y redes sociales**.

Las categorías de Buin **no se tocan**: los movimientos históricos ya están
guardados con esas claves y renombrarlas rompe todos los reportes anteriores. Se
agregan las de Spinhouse como catálogo por club.

### 2.4 El ranking interno

`rankingInterno.ts` premia el **puesto** alcanzado en cada torneo (100 al
campeón, 90 al finalista…). Spinhouse quiere eso **y además** un índice
partido a partido según la fuerza del rival. No es reemplazo, es un segundo
ranking: ver §3.6.

---

## 3. Lo que no existe y hay que construir

Ordenado por lo que cuesta y por lo que bloquea.

### 3.1 Mesas: el cupo deja de ser un número — **el cambio estructural**

Hoy `bloques_horario` tiene `cupo_maximo` y `cupo_libres`, dos enteros que
alguien escribe a mano (migración 073). Spinhouse dice algo distinto:

> *"El cupo de cada bloque depende del número de mesas disponibles en la sede y
> de la modalidad: máximo 4 jugadores por mesa en clases grupales, 1 o 2 por
> mesa en particulares, y las mesas destinadas a arriendo libre no pueden
> asignarse a clases en el mismo horario."*

Eso son **tres reglas nuevas**, no un número:

1. El cupo se **deriva**: `mesas_asignadas × jugadores_por_mesa(modalidad)`.
2. Las mesas son un **recurso finito compartido** en una franja horaria: dos
   bloques a la misma hora no pueden sumar más mesas que las que tiene la sede.
3. El **arriendo** compite por el mismo recurso. Una mesa arrendada de 19:00 a
   20:00 no está disponible para la clase de 19:00.

Esto necesita tablas propias (`sede_mesas`, `bloque_mesas`, `mesa_arriendos`) y
una función que responda "¿cuántas mesas libres hay en esta sede, este día, a
esta hora?" — que es la misma pregunta que responden hoy `cupos_libres_por_dia`
y `liga_mesas`, y de ahí sale el molde.

**Lo que no puede pasar:** que el sistema deje inscribir por sobre el cupo. El
formulario lo pide explícito ("el sistema debe impedir sobrepasar ese cupo"), y
la validación va **en la base**, no en la pantalla — por la misma razón que
`con_derecho` lo calcula `cancelar_bloque_dia` y no el navegador.

### 3.2 Tipo de clase y rol del entrenador

El bloque hoy no sabe **qué tipo de clase** es. Spinhouse tiene seis:

grupal por nivel · grupo competitivo (selección) · particular (1 o 2) ·
escuela de adultos · paralímpico · arriendo libre

Y de cada clase quiere saber: mesas asignadas, **entrenador principal y
auxiliar**, objetivo o plantilla de la sesión, y **si la clase descuenta de la
mensualidad o se cobra aparte**.

- `bloque_profesores` tiene clave `(bloque_id, profesor_id)` y **ninguna
  columna de rol**. Falta `rol text CHECK (rol IN ('principal','auxiliar'))`.
- "Objetivo o plantilla de la sesión" **ya existe** en el módulo técnico
  (`tecnico_planes`, `tecnico_sesiones`). Es enlazar, no construir.
- "Descuenta de la mensualidad o se cobra aparte" es la bisagra con Finanzas:
  define si la asistencia a ese bloque consume plan o genera un cobro. Hoy lo
  segundo se hace a mano en `clases_extraordinarias`.

### 3.3 Planes de mensualidad

Hoy la cuota es un número libre por jugador (`jugadores.mensualidad`), y
`mensualidades.ts` es explícito sobre por qué: *"El profe define cada cuota a
mano —hay de $7.000, de $30.000, de $50.000— y ninguna tabla puede adivinarlas."*

Spinhouse cobra **por plan**: frecuencia semanal × tipo de clase → tarifa. Eso
sí es una tabla. Necesita `planes_club` (nombre, frecuencia, tipo, monto,
vigencia) y `jugadores.plan_id`, **sin romper el monto libre de Buin**: si el
club no tiene planes, todo sigue igual que hoy.

> El detalle de planes y valores "se entregará junto con el padrón de jugadores
> en la carga inicial de datos". **Es un insumo bloqueante**: sin él no se puede
> emitir la primera mensualidad. Hay que pedirlo ahora, no cuando toque.

### 3.4 Reglas automáticas de retención y morosidad

Tres reglas, ninguna existe hoy:

| Regla | Qué hace | Estado hoy |
|---|---|---|
| 3 inasistencias consecutivas | alerta al entrenador y al admin, con opción de mensaje al apoderado | no existe |
| 30 días de deuda | **bloqueo automático**, con aviso a los 15 días | `toggleEstadoJugador` es manual (`activo`/`bloqueado`) |
| 60 días sin asistencia ni pago | marcar **inactivo** para que no distorsione el padrón | el estado `inactivo` no existe |

Dos advertencias que valen más que el código:

- **El bloqueo automático toca plata y toca personas.** Un umbral mal calculado
  bloquea a un alumno al día. La regla se calcula con `fechaChile()` —nunca
  `current_date`, que da UTC y descuadra el día— y **deja rastro en
  `audit_log`**, igual que cualquier operación financiera.
- **Los tres umbrales (3, 30, 15, 60) son configuración, no código.** Van a
  `club_config`. El próximo club va a querer 45 días.

### 3.5 Campos nuevos en la ficha — y la Ley 21.719

El formulario pide agregar: categoría federada por edad (se calcula sola),
**condición de federado y número de licencia FECHITEME**, club de origen, mano
hábil, estilo de juego, material (madera y gomas), nivel interno, grupo
asignado, **observaciones técnicas del entrenador (solo staff)**, **clase
deportiva paralímpica y necesidades de accesibilidad**, y **autorización de uso
de imagen del apoderado**.

De esos, `jugadores` ya tiene `fecha_nacimiento`, `federado` (booleano),
`club_procedencia`, `grupo` e `indicaciones_medicas`. Faltan el resto.

> **Alerta legal, no técnica.** La **Ley 21.719 rige desde el 2026-12-01** —en
> tres meses— y `docs/plan-ley-21719.md` ya está escrito. Dos de estos campos
> son categorías especiales de datos: **clase deportiva paralímpica y
> necesidades de accesibilidad son datos de salud**, y una parte importante de
> los 140 alumnos son menores. La **autorización de uso de imagen** es
> literalmente un registro de consentimiento.
>
> Spinhouse es el primer club donde el consentimiento tiene que estar **desde el
> diseño de la ficha**, no parchado después. Estos campos se construyen junto
> con el registro de consentimiento del plan de la ley, o no se construyen.

### 3.6 Ranking por índice de fuerza (Elo / Bradley-Terry)

> *"un ranking calculado partido a partido según la fuerza del rival (índice
> tipo Elo o Bradley-Terry, que el club ya utiliza en su archivo de partidos).
> […] Se pide que cada resultado registrado en la plataforma actualice ese
> índice y que la ficha del jugador muestre su evolución."*

Es un módulo nuevo y bien acotado: una función pura (fácil de testear), una
tabla de historial por jugador, y un enganche en el punto donde se cierra un
partido. Sirve para tres cosas que el club nombra: ordenar mejor que la posición
final, **sembrar cuadros**, y **ubicar a cada jugador en su división de la liga**.

Decisión abierta: **Elo** (incremental, simple, depende del orden de los
partidos) o **Bradley-Terry** (recalcula todo el historial, más justo, más caro).
Recomendación: **Elo con K configurable**, porque se actualiza partido a partido
como el club pide y no obliga a recalcular la historia entera cada noche.

También hay que **importar el archivo de partidos que Spinhouse ya tiene**, o el
índice arranca en cero y no significa nada el primer semestre.
`ranking_saldo_inicial` (migración 188) es el precedente de cómo se hace eso sin
inventar datos.

### 3.7 La liga — donde el modelo actual no alcanza

Esta es la parte que más se parece a lo que hay y menos sirve tal cual.

Spinhouse pide: **5 divisiones de 12 jugadores** (Honor, Primera, Segunda,
Tercera, Cuarta), todos contra todos a una rueda (**11 fechas**), al mejor de 5
sets, **playoffs entre los 4 primeros en una jornada final**, ascensos y
descensos directos (suben 1.º y 2.º, bajan 11.º y 12.º), **sin promoción**, e
**inscripción con precio diferenciado** para alumnos del club y externos.

Lo que hay hoy en el módulo `liga`:

| Requisito | Estado |
|---|---|
| Divisiones con capacidad | ✅ `liga_divisiones.capacidad_max` (migración 014) |
| Todos contra todos | ✅ `generarFixtureDivision` → `generarRoundRobin` |
| Al mejor de 5 sets | ✅ `esResultadoBo5Valido`, `determinarGanadorBo5` |
| **11 fechas** | ❌ **`liga_fechas.numero CHECK (numero BETWEEN 1 AND 5)`** (013) |
| **Puntaje 2 / 1 / 0** | ❌ hoy es **3 victoria / 1 derrota** (`liga.ts`) |
| **Orden de desempate** | ❌ hoy: Pts → PG → Dif.Sets → Sets a favor → directo. Spinhouse: Pts → **directo** → Dif.Sets → **Dif.Tantos** → sorteo |
| **Tantos a favor y en contra** | ❌ `liga_partidos` guarda solo `sets_a`/`sets_b`, sin parciales |
| Playoffs top 4 | ❌ no existe en la liga de tenis de mesa |
| Ascensos y descensos | ❌ no existe |
| Zona de playoff/ascenso/descenso en la tabla | ❌ |
| Próxima fecha con horario en la tabla | ❌ |
| Precio diferenciado socio/externo | ⚠️ hay pagos de liga, sin precio por tipo |

El `CHECK (numero BETWEEN 1 AND 5)` es un **bloqueante duro**: la liga de Buin es
una jornada de mesa donde la 5.ª fecha es de ajuste, y la de Spinhouse es una
temporada. No son la misma cosa con otro número.

**Recomendación de arquitectura:** no bifurcar el módulo `liga` con banderas.
Reutilizar su estructura (divisiones, fixture round-robin, pagos) y **cambiarle
el motor de puntaje por el que ya existe y está probado** en
`src/lib/domain/oficial-ittf.ts` —que hace 2/1/0, guarda `sets jsonb` con los
parciales y desempata por ratio de juegos y de puntos—, con el puntaje y el
orden de desempate leídos de `club_config`. Buin se queda con sus valores por
defecto y **su tabla no cambia en un solo punto**.

El precedente de playoffs configurables ya existe, y es reciente:
`223_liga_futbol_playoffs_config.sql`. Vale como molde.

### 3.8 Formatos de torneo que faltan

El manual del torneo oficial dice, textual: *"No hay equipos ni doble
eliminación"* (`src/lib/torneo-oficial/manual-contenido.ts:142`).

| Formato pedido | Estado |
|---|---|
| Liguilla (todos contra todos) de 1 rueda | ✅ `generarRoundRobin` |
| Liguilla de **2 ruedas** | ❌ (es una vuelta más sobre lo que ya hay: barato) |
| Eliminación directa | ✅ con siembra ITTF y byes |
| **Cuadro de consolación** | ❌ ("para que nadie juegue un solo partido") |
| **Sistema suizo** | ❌ (emparejamiento por puntaje, sin repetir rivales) |
| **Por equipos (Copa Swaythling)** | ❌ (4 individuales + 1 dobles, o 5 individuales) |

De los tres que faltan, **equipos es el más caro con diferencia**: hoy el modelo
entero asume que un partido es entre dos *jugadores* (`jugador_a_id`,
`jugador_b_id`). Un encuentro por equipos es un contenedor de 5 partidos con su
propio resultado, y además necesita **dobles**, que tampoco existe. Es un módulo
propio, no una opción del selector de formato.

El **suizo** se apoya bien en el índice de fuerza de §3.6: sin un ranking, el
emparejamiento suizo de la primera ronda es un sorteo.

### 3.9 Indicadores y reportes financieros nuevos

Del panel de administración:

- **Ocupación por bloque horario** — inscritos vs. cupo, con porcentaje. Directo
  una vez que existan las mesas (§3.1).
- **Altas y bajas del mes (retención)** — cuántos entraron, cuántos dejaron de
  asistir o de pagar, cuántos reingresaron. Hay que definir "baja" con el club:
  hoy el sistema tiene `bloque_jugadores.vigente_hasta` (dejó el grupo) y
  `estado` (bloqueado), que no son lo mismo.
- **Ingresos por línea de negocio** — sale solo de §2.3 (categorías propias).

De finanzas:

- **Margen por línea de negocio y por bloque** — ingresos del bloque menos el
  costo de sus entrenadores. Necesita **tarifa por hora del entrenador**, que
  hoy no existe.
- **Liquidación mensual por entrenador** — horas dictadas por tipo de clase ×
  tarifa. ⚠️ Las horas ya se registran (`asistencia_profesores`, migración 227),
  **pero la auditoría dejó escrito que son para control, no para liquidar**: no
  se congelan los minutos al marcar, así que cambiar el horario recalcula meses
  pasados. **Si esto va a pagar sueldos, hay que congelarlos primero.** Está
  documentado en el `COMMENT ON TABLE` con esa condición exacta.
- **Proyección de caja del mes siguiente** — cuotas emitidas × morosidad
  histórica.

### 3.10 Avisos automáticos por WhatsApp

> *"el canal real de comunicación del club; el correo casi no se lee"*

Hoy `src/lib/whatsapp.ts` arma links `wa.me` que **una persona tiene que
apretar**. No hay envío automático, y no lo hay porque enviar automático
requiere lo que la librería no tiene: un proveedor (Meta Cloud API o Twilio),
plantillas aprobadas por Meta, un número de empresa verificado, costo por
mensaje, y consentimiento del destinatario.

**Es la partida con más dependencia externa de todo el plan y la única que no
depende solo de nosotros.** Va al final, y va con una decisión comercial tomada
antes (quién paga los mensajes). Mientras tanto, la mitad barata —
**recordatorios que el club dispara con un clic desde una lista ya filtrada de
morosos**— se puede entregar en la Fase 2 con lo que ya existe.

### 3.11 Exportación e integración

- **CSV / JSON de partidos** (jugadores, rondas, sets): hay 14 exportadores a
  Excel y PDF, ninguno a CSV o JSON crudo. Es barato.
- **Acceso por API**: no existe ninguna API pública (`src/app/api/` son 9 rutas
  internas). Es un proyecto aparte con su propia autenticación. **Recomendación:
  empezar por el CSV/JSON**, que cubre el caso real que declaran ("alimentar su
  archivo de partidos sin transcribir a mano") sin abrir una superficie nueva.
- **Vista pública del calendario**, sin datos personales: el molde existe
  (`/vivo/[codigo]`, `/liga-futbol/publica/[codigo]`, `limites_publicos`).

---

## 4. Las fases

### Fase 0 — Aislamiento (bloqueante, protege a Buin)

Es `docs/plan-aislamiento-clubes.md` ejecutado, no reescrito.

- **A2** · `_migracion_para_club()` — ✅ aplicada en producción
  (`246_migracion_declara_su_club.sql`). La migración declara su destino y la
  base aborta si no calza. Adiós a los 36 UUID pegados a mano.
- **A3** · trigger de club declarado sobre `movimientos`, `jugadores`,
  `asistencia` y `mensualidades` — ✅ aplicada en producción
  (`247_guardia_club_declarado.sql`). **Verificado en vivo (2026-09-02):** el
  portazo abortó una escritura de Buin sobre una fila de otro club con el
  mensaje exacto, y sin club declarado la escritura normal de Buin pasó sin que
  el trigger se enterara.
- **C1** · tabla `club_config` + catálogo en `src/lib/domain/clubConfig.ts` +
  `configDelClub()` con caché. **Pendiente.** Criterio: la suite de tests pasa
  sin modificarse.

> **Buin está blindado.** Toda migración de acá en adelante —incluidas las de
> Spinhouse— lleva `_migracion_para_club('Asociación TDM Buin y Paine')` cuando
> es de Buin, o `_migracion_para_todos_los_clubes(motivo)` cuando de verdad es
> global. Falta C1 para que un club nuevo se comporte distinto sin un módulo
> aparte por cada diferencia.

*Sin esto, todo lo demás se escribe como `if` y hay que reescribirlo.*

### Fase 1 — La operación diaria

Es lo que Spinhouse usa todos los días y lo que permite cargar el padrón.

1. Encender los módulos que ya están (§1) y cargar padrón, bloques y profesores.
2. **Aplicar las migraciones 226 a 233**, que están escritas y pendientes.
3. Categorías propias (§2.1) y categorías financieras (§2.3), por `club_config`.
4. **Mesas y cupo derivado** (§3.1) — el cambio estructural, con la validación
   en la base.
5. **Tipo de clase + rol del entrenador** (§3.2).
6. **Planes de mensualidad** (§3.3). *Bloqueado por el insumo del club.*
7. Campos de ficha **junto con el consentimiento de la Ley 21.719** (§3.5).

### Fase 2 — Que el club decida con datos

8. Ocupación por bloque, altas/bajas, ingresos por línea (§3.9).
9. Reglas de retención y morosidad (§3.4), con umbrales en `club_config`.
10. Recordatorios de cobro **a un clic** desde la lista de morosos (§3.10).
11. Margen por línea y por bloque; liquidación por entrenador **solo si se
    congelan las horas primero** (§3.9).

### Fase 3 — Lo competitivo

12. **Índice de fuerza (Elo)** + importación del archivo histórico (§3.6).
13. **Liga de temporada**: 11 fechas, puntaje 2/1/0, parciales, desempates,
    playoffs, ascensos y descensos, precio diferenciado (§3.7).
14. Formatos de torneo: **2 ruedas → consolación → suizo** (§3.8).
15. Exportación CSV/JSON y calendario público (§3.11).

### Fase 4 — Lo que depende de terceros o no está decidido

16. **Torneos por equipos** (Copa Swaythling) + dobles — módulo propio (§3.8).
17. **WhatsApp automático** — con proveedor y costo decidido (§3.10).
18. **API pública** — si el CSV/JSON no alcanzó.

---

## 5. Plan visual

La app tiene navegación por rol (`src/app/layout-app.tsx`): admin, profesor,
alumno, y una barra móvil aparte. Cada entrada se enciende por módulo, así que
**Spinhouse ve un menú distinto sin que Buin vea uno solo diferente**.

### Pantallas que cambian

**`/horario` — Cupos/bloques.** Es donde más se nota el cambio. Hoy muestra
bloques con "12/16 inscritos". Con mesas pasa a mostrar la sede como un
**tablero de franjas horarias**: cuántas mesas hay, cuántas toma cada clase,
cuántas están arrendadas y cuántas quedan libres. El cupo deja de ser un número
escrito y pasa a ser el resultado visible de un reparto. Ya tiene una pestaña
nueva de Spinhouse (*Recuperaciones*); se suma **Mesas**.

**`/jugadores/[id]` — La ficha.** Gana tres bloques: **Deportivo** (mano hábil,
estilo, material, nivel, licencia FECHITEME, clase paralímpica), **Técnico**
(observaciones del entrenador y objetivo del período, visible solo al staff) e
**Historial competitivo** (partidos, resultados y la curva del índice de fuerza).
El bloque técnico y la curva son lo que el club pide que "el entrenador y el
apoderado vean".

**`/dashboard` — El panel.** Tres tarjetas nuevas: ocupación por bloque
(barras, una por franja), altas y bajas del mes (dos números y el neto), e
ingresos por línea de negocio (dona). Van **debajo** de los KPIs actuales: el
dashboard de Buin no se reordena.

**`/finanzas` — Reportes.** Pestaña nueva de **Márgenes**: por línea de negocio,
por bloque, y liquidación por entrenador. Con la advertencia de §3.9 escrita en
la propia pantalla mientras las horas no estén congeladas.

**`/liga` — La tabla.** Las tres zonas pintadas (playoff, ascenso, descenso), la
próxima fecha de cada jugador con su horario, y las columnas de tantos. Es la
pantalla que más mira el jugador durante la temporada.

**`/calendario`.** Filtros por tipo (jornadas de liga, torneos externos con
nómina, campamentos, clínicas, reuniones de apoderados, días sin actividad,
feriados) y **vista pública sin datos personales** para difusión.

### Criterios visuales

- **Español en toda la interfaz**, sin excepción.
- **Ninguna pantalla nueva sin `useEnVivo` y sin `cachedFetch` declarando sus
  tablas**, y **la tabla tiene que estar en `supabase_realtime`**: suscribirse a
  una que no está no da error, se queda escuchando y no llega nada nunca. Mordió
  dos veces (migraciones 121 y 142).
- Lo que Spinhouse agrega se muestra **junto** a lo de Buin, nunca en lugar de.
  Un módulo apagado es una entrada que no aparece, no una pantalla vacía.

---

## 6. Riesgos, por gravedad

1. **Saltarse la Fase 0.** Es el riesgo que se come a los demás. Cada
   requerimiento de Spinhouse es una diferencia con Buin, y sin `club_config`
   cada diferencia es un `if` sobre `club_id` en código que Buin usa todos los
   días.

2. **El bloqueo automático por morosidad bloquea a quien está al día.** Toca
   plata y toca personas. Se prueba en seco —una pantalla que dice *"a quiénes
   bloquearía hoy"* sin bloquear a nadie— durante un mes completo antes de
   encenderla.

3. **Liquidar sueldos con horas que se recalculan.** `asistencia_profesores` no
   congela los minutos. Pagar con ese número significa que cambiar un horario
   cambia lo que se pagó el mes pasado. **Congelar primero, liquidar después.**

4. **Los campos de salud sin consentimiento.** Clase deportiva y necesidades de
   accesibilidad son datos sensibles de personas, muchas menores de edad, y la
   Ley 21.719 rige desde el 2026-12-01. No es un campo de texto más.

5. **Reescribir la liga en vez de configurarla.** La tentación es hacer un
   módulo "liga Spinhouse". Eso duplica el fixture, el marcador y los pagos, y
   duplica también sus bugs. El motor 2/1/0 ya existe y está probado.

6. **Las migraciones se pegan a mano.** No hay runner ni CI. La 089 se corrió
   dos veces y destruyó plata real. Toda migración de este plan lleva el portazo
   `_migracion_nueva`, y desde la Fase 0 también `_migracion_para_club`.

7. **Numeración.** La última migración es la **245**; las nuevas arrancan en
   **246**. `src/lib/migraciones-numeracion.test.ts` falla si dos comparten
   número.

---

## 7. Lo que hay que preguntarle al club antes de empezar

1. **Planes y valores vigentes, y el padrón.** Bloquea la Fase 1 completa: sin
   esto no se puede emitir una mensualidad. El formulario dice que viene "en la
   carga inicial de datos" — hay que pedirlo ya.
2. **Cuántas mesas tiene la sede**, y cuáles se reservan a arriendo en qué
   franjas. Sin ese número, el cupo derivado no se puede calcular.
3. **Qué es una "baja"** para el indicador de retención: ¿dejó de pagar, dejó de
   asistir, o avisó que se va? Son tres números distintos.
4. **Elo o Bradley-Terry**, y **el archivo histórico de partidos** para no
   arrancar el índice en cero.
5. **Quién paga los mensajes de WhatsApp**, y con qué proveedor.
6. **Tarifa por hora de cada entrenador**, si se quiere el margen por bloque.
7. **Confirmación de que los datos paralímpicos se van a recoger con
   consentimiento escrito**, y quién lo firma cuando el alumno es menor.

---

## 8. Lo que este plan deliberadamente no propone

- **No propone tocar Buin.** Ni una pantalla, ni un default, ni una categoría
  financiera existente.
- **No propone renombrar lo que ya está guardado.** Las categorías de
  movimientos de Buin quedan como están; los reportes históricos las leen.
- **No propone un `if (club_id === '2d8e…')` en ningún archivo compartido.** Si
  algo no cabe en `club_config`, va como módulo aparte.
- **No propone la API pública en la primera vuelta.** El CSV/JSON cubre el caso
  que el club describió.
- **No propone congelar el módulo técnico ni el de torneo oficial**: los dos
  sirven tal cual y son de lo mejor que tiene el sistema.
