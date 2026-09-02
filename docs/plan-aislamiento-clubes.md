# Plan maestro — Aislamiento entre clubes

Documento de estudio y plan. Escrito sobre la estructura real del código: cada
cifra de acá salió de contar sobre los archivos, no de estimar.

**El problema:** hoy el sistema atiende a un club de verdad (Buin) y varios de
demostración. Se vienen clubes nuevos con **formas distintas de funcionar** —
otra manera de tomar asistencia, Khipu, reglas propias. El riesgo no es que un
club vea los datos de otro; es que **el trabajo hecho para un club rompa a otro**.

**El objetivo:** que Buin quede blindado, y que cada club nuevo pueda funcionar
distinto sin tocar el código que hace andar a los demás.

---

## 1. Diagnóstico: qué está bien y qué no

Lo primero es separar tres cosas que se confunden bajo la palabra "aislamiento",
porque el estado de cada una es completamente distinto.

| Capa | Pregunta que responde | Estado hoy |
|---|---|---|
| **Datos** | ¿Un club puede *ver* los datos de otro? | **Sólido, sin pendientes** |
| **Comportamiento** | ¿Dos clubes pueden funcionar *distinto*? | **No existe** |
| **Proceso** | ¿Un cambio para un club puede *dañar* a otro? | **Sin protección** |

La preocupación que motivó este documento es la tercera, y es la correcta. Pero
la segunda es la que va a doler primero, porque es la que aparece apenas el
primer club diga "nosotros la asistencia la tomamos distinto".

### 1.1 Datos — mejor de lo esperado

Conté las 171 políticas RLS de las 203 migraciones:

- **148 filtran por club** (`club_id = get_my_club_id()` o equivalente)
- **7 filtran solo por rol**
- El resto son de superadmin o de tablas deliberadamente globales

El helper `get_my_club_id()` existe desde `001_rls_policies.sql:29`, o sea desde
el primer día. **Esto no hay que construirlo, ya está.**

Una primera pasada de este análisis reportó tres fugas —`audit_log`,
`club_photos` y `configuracion_empresa`— contando las sentencias `CREATE POLICY`
a lo largo de las migraciones. **Las tres eran falsos positivos**, y el error de
método vale la pena dejarlo escrito: las migraciones son un libro contable, no
una foto. Una política creada en la 016 puede estar reemplazada en la 041, y
contar los `CREATE` sin seguir los `DROP` posteriores describe un pasado que ya
no existe.

Al seguir la historia completa de cada una:

| Tabla | Estado real | Dónde se resolvió |
|---|---|---|
| `audit_log` | **Ya filtra por club.** `audit_log_admin_select` (solo rol) fue reemplazada por `audit_log_tenant_select`, que exige `club_id = get_my_club_id()` salvo para superadmin. | `041_rls_auditoria_integridad.sql:99-108` |
| `club_photos` | **Cerrada por completo** (`FOR ALL USING (false)`). Es una tabla huérfana de un diseño viejo, sin una sola referencia en el código; `fotos_galeria` es la vigente y sí tiene `club_id`. | `133_cerrar_club_photos_huerfana.sql` |
| `configuracion_empresa` | **No es un club.** Son los datos legales de la empresa que opera CmSports y factura a los clubes; por eso no lleva `club_id`, por eso tiene una sola fila forzada por índice único, y por eso su política es solo superadmin. Funciona como fue diseñada. | `123_configuracion_empresa.sql` |

Y hay un dato que ordena todo lo demás: la migración 133 dice que se encontró
**"en la auditoría de aislamiento entre clubes pedida tras el incidente de la
migración 089"**. O sea, esta auditoría ya se hizo una vez y cerró lo que había.

**Conclusión: el aislamiento de datos no tiene trabajo pendiente conocido.** Las
7 políticas que hoy no filtran por club son legítimas (superadmin, banco de fotos
compartido, tablas cerradas). Todo el esfuerzo de este plan va a las otras dos
capas.

### 1.2 Comportamiento — acá está el hoyo

Existe `clubes.modulos_habilitados` (`026_modulos_club.sql`), con catálogo único
en `src/lib/domain/modulos.ts:14`. Sirve para **prender y apagar** módulos:
Torneos sí, Liga no, Feedback sí.

**Pero prender/apagar es lo único que sabe hacer.** No hay forma de decir "el
club A toma asistencia por RUT en kiosco y el club B la toma a mano desde el
celular del profe". Hoy eso solo se puede lograr de una forma: con un `if` sobre
el `club_id` metido en el código común. Y eso es exactamente lo que hay que
evitar, porque es lo que a los tres clubes los deja atados al mismo archivo.

Este es el vacío central del documento. Todo lo demás es plomería conocida.

### 1.3 Proceso — sin ninguna barrera

- **36 migraciones** tienen el UUID de Buin escrito adentro
- **23 migraciones** llevan el nombre de un club en el archivo
  (`182_corregir_rut_dv_buin.sql`, `174_datos_piloto_3meses_spinhouse.sql`, …)
- Existe una tabla llamada **`tienda_buin_productos`**: el nombre de un club
  dentro del esquema global
- Dos archivos de código tienen el UUID de Buin escrito duro:
  `src/app/solicitudes/page.tsx` y `src/lib/domain/clubSlug.ts`

Y sobre todo eso: **las migraciones se pegan a mano en el SQL Editor**. No hay
runner, no hay CI, no hay revisión. La única barrera existente es
`_migracion_nueva()`, que impide correr **dos veces la misma** migración — pero
no impide correr **en el club equivocado** una migración correcta.

> Esa distinción es todo el punto de este plan. La 089 destruyó datos reales por
> repetición y por eso nació `_migracion_nueva`. La próxima va a destruir datos
> por *destinatario equivocado*, y para eso todavía no hay portazo.

---

## 2. Los cinco principios

**1. El club se declara, no se asume.** Toda migración dice a qué club apunta,
en su primera línea, y la base la aborta si el destino no calza.

**2. La diferencia entre clubes es dato, no código.** Si el club B toma
asistencia distinto, eso se configura en una fila, no en un `if (club_id ===
'ec1ef...')`. Un `if` por club es deuda que se paga multiplicada.

**3. Buin es el club que no se toca.** Es el único en producción con plata y
gente real. Cualquier cambio pensado para otro club **empieza** demostrando que
no altera a Buin.

**4. Lo que no está en la configuración, no varía.** Un club nuevo hereda el
comportamiento por defecto. No se inventa una variante hasta que alguien la pida
de verdad.

**5. Nada silencioso.** Si un cambio va a tocar a un club, se dice en voz alta y
se confirma antes. Vale para las personas y vale para la IA.

---

## 3. La barrera de confirmación (pedido explícito)

> *"que la IA que trabaje tenga que preguntar si estás seguro que estos cambios
> se subirán al club tanto"*

Esto no puede quedar en una buena intención: tiene que ser mecánico. Va en tres
capas, de la más blanda a la más dura.

### Capa 1 — Regla en `CLAUDE.md` (le habla a la IA)

Se agrega una sección que obliga a **declarar el club destino y esperar
confirmación** antes de escribir una migración, tocar un RPC de plata o
modificar código compartido. El formato de la pregunta queda fijo:

```
Este cambio afecta a: Asociación TDM Buin y Paine (club en producción)
Toca: supabase/migrations/208_x.sql, src/lib/domain/asistencia.ts
¿Confirmas que va a ese club?
```

Es la capa más importante porque es la única que actúa **antes** de que el
código exista.

### Capa 2 — Encabezado obligatorio en cada migración

Toda migración nueva declara su destino junto al portazo que ya existe:

```sql
BEGIN;
SELECT _migracion_nueva('208_nombre_del_archivo');
SELECT _migracion_para_club('Asociación TDM Buin y Paine');
-- ... el resto ...
COMMIT;
```

`_migracion_para_club(nombre)` hace tres cosas:

1. Verifica que ese club exista; si no, lanza excepción y aborta todo
2. Devuelve su `club_id`, para que la migración lo use **sin escribirlo a mano**
   (adiós a los 36 UUID pegados)
3. Deja el club declarado en la sesión (`SET LOCAL`), habilitando la capa 3

Para migraciones que sí son para todos, existe la variante explícita
`_migracion_para_todos_los_clubes()` — que no es el default, es una decisión que
alguien tuvo que escribir.

### Capa 3 — El portazo real: la base rechaza el club equivocado

Un trigger liviano sobre las tablas que más duelen —`movimientos`, `jugadores`,
`asistencia`, `mensualidades`— que solo se activa cuando hay un club declarado
en la sesión:

```
Si hay club declarado Y la fila que se escribe es de otro club → EXCEPCIÓN
```

Fuera de una migración la variable no está puesta, el trigger no hace nada y no
cuesta un peso en el uso normal. Pero si una migración declara Buin y por un
copy-paste intenta escribir una fila de San Bernardo, **la transacción entera se
cae** — igual que hizo `_migracion_nueva` con las repeticiones.

Esta capa es la que convierte la regla en garantía. Las capas 1 y 2 dependen de
que alguien las respete; la 3 no depende de nadie.

---

## 4. Configuración por club: el reemplazo de los `if`

`modulos_habilitados` responde *qué* módulos hay. Falta responder *cómo*
funciona cada uno. Se agrega una tabla hermana:

```
club_config    club_id, clave, valor (jsonb), actualizado_en
               PK (club_id, clave)
```

Y un catálogo único en `src/lib/domain/clubConfig.ts` —mismo patrón que
`modulos.ts`, que ya demostró servir— donde cada clave declara su **valor por
defecto** y sus opciones válidas. Ejemplos de las diferencias que ya se saben:

| Clave | Opciones | Default |
|---|---|---|
| `asistencia.modo` | `kiosco_rut`, `manual_profe`, `mixto` | `mixto` (lo de Buin hoy) |
| `asistencia.dia_sin_registro` | `falta`, `pendiente` | `falta` (regla vigente) |
| `mensualidades.cobro_desde` | `matricula`, `mes_calendario` | `mes_calendario` |
| `pagos.khipu` | `off`, `dev`, `prod` | `off` |

Las tres reglas que hacen que esto funcione y no se convierta en otro enredo:

1. **El default es el comportamiento actual de Buin.** Un club sin ninguna fila
   en `club_config` se comporta exactamente como hoy. Eso hace que la tabla se
   pueda introducir sin cambiar nada de lo que ya anda.
2. **Se lee por función de dominio, nunca a mano.** Una sola
   `configDelClub(clubId)` con caché, igual que `useModulos`. Nadie consulta la
   tabla suelta.
3. **Clave desconocida = default.** Nunca revienta por una clave que todavía no
   existe, igual que `esModulo()` descarta lo que no conoce.

> **Lo que esta tabla NO es:** un lugar para meter lógica. Si una diferencia
> entre clubes no se puede expresar como un valor, entonces no va acá — va como
> módulo aparte. La tabla guarda *elecciones*, no *comportamientos*.

---

## 5. Plan de implementación

### Fase A — Barrera de proceso (protege a Buin desde el día uno) ✅ hecha

**A1 · Regla de confirmación en `CLAUDE.md`** — ✅ hecha
La capa 1 de la sección 3. Es texto, no toca la base, y desde que se escribe ya
protege. **Es el primer entregable y no depende de nada.**

**A2 · `_migracion_para_club()` + encabezado obligatorio** — ✅
`246_migracion_declara_su_club.sql`, siguiendo el molde de `_migracion_nueva`.
Recibe el **nombre** del club, no el UUID: un UUID mal copiado se ve igual de
bien que uno correcto. Devuelve el `club_id` para no volver a escribirlo a mano,
y lo deja en la sesión con `set_config(..., is_local => true)` — **nunca `SET` a
secas**, porque el pooler de Supabase reutiliza la conexión y la variable
quedaría pegada, haciendo que el trigger de A3 rechace escrituras normales de la
app. Incluye la variante explícita `_migracion_para_todos_los_clubes(motivo)`,
con el motivo obligatorio.

**A3 · Trigger de club declarado** — ✅
`247_guardia_club_declarado.sql`. La capa 3, sobre `movimientos`, `jugadores`,
`asistencia` y `mensualidades`. En `UPDATE` mira `OLD` **y** `NEW`: sacar una
fila de Buin y meter una ajena son el mismo error. Una fila con `club_id IS NULL`
pasa — no es "la fila de otro club", que es lo único que este trigger atajaba.
El archivo trae escrito el `DISABLE TRIGGER` de emergencia, antes de necesitarlo.

**Criterio de aceptación:** una migración de prueba que declara un club e intenta
escribir en otro tiene que abortar; y con la variable sin poner, las operaciones
normales de la app no cambian en nada. **Las dos pruebas están al final de la
247, listas para pegar; se revierten solas con `ROLLBACK`.**

> **Aplicadas y verificadas en producción (2026-09-02).** Las dos pruebas de
> arriba se corrieron en el SQL Editor: el portazo abortó una escritura de
> Buin sobre una fila de Club Demostración TDM con el mensaje exacto ("Club
> equivocado... No se ejecutó nada"), y sin club declarado la escritura normal
> de Buin pasó (`UPDATE 1`) sin que el trigger se enterara. **Buin está
> blindado.**

### Fase B — (eliminada)

Existía para tapar tres fugas de datos que resultaron ser falsos positivos: las
tres ya estaban resueltas por las migraciones 041, 123 y 133. Ver la sección 1.1.
No hay trabajo pendiente en la capa de datos.

### Fase C — Configuración por club

**C1 · Tabla `club_config` + catálogo + `configDelClub()`** — ✅ escrita
Migración **248**, más `src/lib/domain/clubConfig.ts` (el catálogo, hermano de
`modulos.ts`) y `src/lib/supabase/clubConfig.ts` (el lector con caché).
Sin cambiar ningún comportamiento: todos los defaults son lo que Buin hace hoy,
y la tabla se crea vacía.

**Criterio de aceptación cumplido:** la suite pasó de 1065 a **1098 pruebas
(+33, todas nuevas) sin modificar ni un archivo existente**; `tsc` y `eslint`
limpios. Los 33 casos incluyen el que congela cada default uno por uno, así que
cambiar el `0` de `morosidad.dias_bloqueo` rompe la prueba a propósito.

Dos decisiones que valen la pena registrar:
- **El fallback ante un error de red es el default**, no lo último que se vio.
  Es al revés que `useModulos`, que ante un error muestra todos los módulos
  —ahí lo permisivo es mostrar de más—. Acá lo seguro es lo contrario: no
  encender solo un bloqueo por morosidad ni cambiar solo un cálculo de plata.
- **`normalizarValor` nunca lanza.** Del otro lado hay una tabla que alguien
  edita a mano; un `'30'` con comillas y un `30` se ven casi iguales en el
  editor de Supabase. Ante cualquier duda, el default.

> **Pendiente: la 248 no está aplicada todavía.** Hasta que se pegue en el SQL
> Editor, el catálogo existe pero no hay tabla que leer —`configDelClub()`
> devuelve los defaults, que es justamente el comportamiento actual, así que
> nada se rompe mientras tanto.

**C2 · Primera clave real: `asistencia.modo`**
Se migra el módulo de asistencia a leer la config en vez de asumir. Buin queda en
su modo actual por default. Es el piloto que prueba que el mecanismo sirve.

**C3 · El resto de las claves, a demanda.** No se inventan variantes por
adelantado: cada clave nace cuando un club pide algo distinto de verdad
(principio 4).

### Fase D — Limpieza de lo que ya está pegado

**D1 · Sacar el UUID de Buin del código.** Los dos archivos:
`src/app/solicitudes/page.tsx` y `src/lib/domain/clubSlug.ts`.

**D2 · Renombrar `tienda_buin_productos`.** Es una tabla global con nombre de
club. Pasa a `tienda_profe_productos` (que es lo que la clave del módulo
`tienda_buin` ya significa: "tienda del profe", según `modulos.ts:26`).

**D3 · Convención de nombres para migraciones de un solo club.** Prefijo
explícito en el archivo, para que se vea sin abrirlo:
`208_club_buin_ranking_sub13.sql`.

> D2 y D3 son cosmética con fondo: mientras el esquema tenga nombres de club
> adentro, cada club nuevo va a copiar ese vicio.

---

## 6. Orden y dependencias

```
A1 (regla CLAUDE.md) ── independiente, se puede hacer hoy
        │
A2 (_migracion_para_club) ──> A3 (trigger)
        │
        └──> D1, D2, D3 (limpieza, usa la función nueva)

(Fase B eliminada: no había fugas que tapar)

C1 (club_config) ──> C2 (asistencia) ──> C3 (a demanda)
```

**Primer entregable útil: A1 solo.** Es texto y ya protege.
**Segundo: A2 + A3**, que es el bloque que deja a Buin realmente blindado.

C se puede empezar en paralelo, pero **conviene que A esté listo antes**: la Fase
C toca código compartido, que es justamente lo que A protege.

---

## 7. Las pruebas que definen "aislado"

| Prueba | Qué demuestra |
|---|---|
| Migración declara club A, escribe fila de club B → **aborta** | La capa 3 funciona |
| Sin club declarado, la app opera normal | El trigger no molesta en producción |
| Admin de club A consulta `audit_log` → **solo ve el suyo** | Sigue valiendo como prueba de regresión (ya pasa hoy, migración 041) |
| Club sin filas en `club_config` → se comporta idéntico a hoy | Los defaults son seguros |
| La suite completa pasa sin modificarse tras C1 | La config no cambió conducta |
| Cambiar `asistencia.modo` en club B → **Buin no se entera** | C2 aisló de verdad |
| `grep` del UUID de Buin en `src/` → **cero resultados** | D1 completo |

---

## 8. Decisiones abiertas

1. **¿El trigger de la capa 3 cubre solo 4 tablas o todas?** Cuatro cubre donde
   duele (plata, gente, asistencia, cuotas) con costo casi nulo. Todas es más
   seguro pero toca 28 tablas con `club_id`.
   *Recomendación: empezar con las cuatro y ampliar si aparece un caso.*

2. **¿`club_config` con `jsonb` o con columnas tipadas?** `jsonb` es flexible y
   no necesita migración por cada clave nueva; columnas dan validación de la
   base. *Recomendación: `jsonb` + validación en el catálogo TS, igual que
   `modulos.ts` hace hoy.*

3. **¿Quién edita `club_config`?** ¿El admin del club, o solo el superadmin? Hay
   claves que cambian plata (`mensualidades.cobro_desde`) y otras inocuas.
   *Recomendación: superadmin por ahora; es reversible.*

4. **¿Qué pasa con los clubes de demostración?** Spinhouse, Demo TDM y Juez MET2
   tienen datos de prueba mezclados en migraciones globales. ¿Se limpian, se
   dejan, o se marcan con una bandera `es_demo`?

---

## 9. Riesgos, por gravedad

1. **El trigger de A3 mal escrito frena la app.** Toca las tablas más calientes
   del sistema. La prueba "sin club declarado, la app opera normal" no es
   burocracia: es la red. Se prueba en un club de demostración antes que en Buin.

2. **La Fase C toca código compartido.** Migrar asistencia a leer configuración
   modifica un módulo que Buin usa todos los días. Por eso C2 va después de A, y
   por eso el criterio es que los tests pasen **sin modificarse**.

3. **La barrera de confirmación se vuelve ruido y se ignora.** Si pregunta por
   todo, nadie la lee. Solo debe dispararse en migraciones, RPC de plata y código
   compartido — no al arreglar un color.

4. **Un club nuevo pide algo que no cabe en una clave de configuración.** Va a
   pasar. Ahí la respuesta correcta es un módulo aparte, no un `if` sobre
   `club_id`. La tentación de escribir el `if` es el riesgo real de todo este
   plan.

5. **Auditar contando `CREATE POLICY` da falsos positivos.** Así nacieron las
   tres fugas inventadas de la sección 1.1. Las migraciones son un libro
   contable: para saber el estado real de una política hay que seguir sus `DROP`
   posteriores, o mejor, consultar `pg_policies` en la base. Vale para cualquier
   auditoría futura de este proyecto.
