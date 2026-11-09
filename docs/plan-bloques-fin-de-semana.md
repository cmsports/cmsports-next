# Plan: bloques de fin de semana (sábado y domingo)

Estado (2026-11-09): **boceto construido en local, sin commitear y sin tocar la base.**
Decisiones del usuario: sábado y domingo; los bloques de fin de semana ofrecen
recuperación; el sábado cuenta como una sesión normal.

Revisado por 20 críticos independientes; las correcciones ya están aplicadas.
La migración `320_bloques_fin_de_semana.sql` es un borrador sin aplicar.

**Orden obligatorio para subirlo:**
1. Fase 0 contra la base viva (texto de `registrar_clase_extraordinaria`,
   `dias_canonicos_jugador`, trigger de `jugadores`; hay dos archivos "100" en el repo).
2. Pegar la 320 y correr sus verificaciones (0 filas, 4 columnas, los 3 permisos en `false`).
3. `npm run build` local contra esa base y probar en **Demostración TDM**.
4. Recién ahí el push: el código nuevo pide `entrena_sab`/`entrena_dom`, y sin la
   migración la lista de Jugadores, la ficha y Finanzas quedan rotas.

**Pendiente de decisión:** la cifra "horas por semana" del reporte de profesores
divide por días hábiles/5 y con horas de sábado queda algo inflada.

Este cambio afecta a: **Asociación TDM Buin y Paine** (club en producción).
Pero el código es compartido con Demostración, Unión San Bernardo, Paine y Spinhouse,
así que el diseño tiene que dejar a todos igual que hoy mientras no creen un bloque
de fin de semana.

## 1. Qué encontré

El bloqueo **no está en la base**: `bloques_horario.dia_semana` ya acepta
`'sab'` y `'dom'` (CHECK de la migración 073). Está en el código, y es de dos
tipos distintos:

**A. Bloqueos directos (lo que el usuario ve)**
- `DIAS` en `src/lib/domain/horario.ts` tiene solo lun–vie. De ahí sale la
  grilla, el modal "Nuevo grupo", el selector de la ficha del jugador y las
  solicitudes.
- `guardarGrupo` en `src/app/actions/horario.ts:294` valida
  `['lun','mar','mie','jue','vie']` y devuelve "Día inválido".

**B. Supuestos escondidos de "el club no abre el fin de semana"**
Esto es lo grave: aunque se destrabe A, el sábado se crearía y **no funcionaría
en el resto del sistema**, y casi nada avisaría.

| Dónde | Qué asume | Qué pasaría con un bloque de sábado |
|---|---|---|
| `diaDesdeFecha()` devuelve `null` sáb/dom | "No hay clases" | Asistencia no muestra grupos, dashboard-profesor vacío, "Día sin clase" rechaza la fecha, cupos y recuperaciones lo ignoran |
| `diasHabiles()` (`historialAsistencia.ts`) | solo lun–vie | Una falta del sábado **nunca se cuenta**; el % de asistencia ignora el sábado |
| `diasHabilesDelMes()` (`reportesMes.ts`) | solo lun–vie | **Las horas del profesor que dicta el sábado no entran al reporte mensual** (sueldos) |
| `fechasDeSemanaChile()` | solo lun–vie | Cambiar a alguien de grupo con sábado no mueve la asistencia de la semana |
| Columnas `entrena_lun..vie` (espejo, migración 111) | 5 días | Un jugador que solo entrena sábado queda **"sin horario"** en Jugadores, Finanzas e Inasistencias. El trigger lo recalcula en silencio, no se puede arreglar a mano |
| RPC `registrar_clase_extraordinaria` (mig. 100) | `ARRAY[NULL,'lun'..'vie',NULL]` | Lanza "El club no abre los fines de semana" |
| RPC de cupos/recuperaciones (226, 231) | idem | Sábado sin cupos ni recuperaciones |
| `jugador_horario_historial` | 5 columnas `entrena_*` | Bitácora sin sábado (hoy no la lee nadie, ver comentario en `horario.ts:650`) |
| Reportes PDF/Excel, `PanelRankingAsistencia`, `jugadorExport`, `finanzas` (`diasDeClase`) | arreglos lun–vie | Sábado omitido en exportes y en "días de clase" del reporte del jugador |

**Lo que ya está bien:** `diaSemanaDeFecha()`, `DIA_ORDEN`, los mapas de
nombres de `asistenciaPorBloque.ts` y `panoramaAsistencia.ts`, y
`bloque_excepciones` ya manejan `sab`/`dom`.

**La trampa más peligrosa:** `diaDesdeFecha(hoy) === null` se usa en
`iniciosDeInscripcion` y `horario.ts:569` como sinónimo de "es fin de semana, no
retrocedas la inscripción ni muevas asistencias de la semana cerrada". Si solo
se hace que `diaDesdeFecha` devuelva `sab`, ese guard **deja de proteger** y un
cambio de grupo hecho un sábado volvería a reescribir la semana cerrada (es el
bug que el comentario de `horario.ts:108-113` ya documenta). Hay que separar los
dos conceptos: "qué día de la semana es" vs "es día hábil".

## 2. Decisiones que necesito del usuario antes de construir

1. **¿Sábado y domingo, o solo sábado?** Recomiendo agregar los dos al modelo
   (cuesta casi lo mismo hacerlo una vez), pero mostrar en la grilla solo las
   columnas que tengan bloques. Así Buin sigue viendo lun–vie hasta que cree uno.
2. **¿Los bloques de fin de semana ofrecen recuperación de clases?** Hoy
   `ocurrencias()` solo recorre lun–vie. Si se incluye el sábado, un alumno que
   falta un martes podría recuperar en un sábado. Puede ser lo que quieren o no.
3. **¿Cuántas sesiones consume?** Confirmar que el sábado cuenta como una clase
   normal del plan (descuenta sesión como cualquier otra). No cambia plata, pero
   conviene dejarlo escrito.

## 3. Diseño (lo recomendado)

- **Una sola fuente de verdad para los días**: `DIAS` pasa a tener los 7 días
  (más `esHabil`), y cada pantalla filtra a los días que realmente usa.
- **Separar dos funciones**: `diaDesdeFecha` (devuelve `sab`/`dom` también) y
  `esDiaHabil(fecha)` (el guard de "semana cerrada"). Todo uso actual de
  `=== null` como "fin de semana" se migra a `esDiaHabil`.
- **Espejo del jugador**: agregar `entrena_sab` y `entrena_dom` a `jugadores` y
  a `jugador_horario_historial`, y actualizar `dias_canonicos_jugador`,
  `aplicar_dias_jugador` y el trigger de la 111 para que los calculen.
  Alternativa descartada: dejar el espejo en 5 días. Es más barata pero rompe
  "sin horario" para quien solo entrena sábado.
- **Nada de `if (club_id === ...)`** y nada en `club_config`: un bloque de
  sábado es *dato* (una fila), no configuración. El comportamiento por defecto
  de Buin no cambia porque no hay filas de sábado.
- **Grilla**: columnas Sáb/Dom aparecen solo si hay bloques ese día o con un
  botón "+ Fin de semana". Hoy ya son 5 columnas apretadas.

## 4. Fases

Cada fase se puede subir sola y no cambia el comportamiento de Buin hasta la
última, porque no existe ningún bloque de fin de semana mientras no se cree uno.

### Fase 0 — Verificar contra la base (solo lectura)
El repo va atrás de la base (migraciones 255–259 no están en el repo). Antes de
escribir SQL, sacar de producción el texto **vivo** de estas funciones:
`registrar_clase_extraordinaria`, los RPC de cupos/recuperaciones,
`dias_canonicos_jugador`, `aplicar_dias_jugador`, `jugadores_dias_solo_desde_bloques`,
`sync_dias_tras_*`, y cualquier función que use `extract(dow ...)`.
```sql
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid) ~* 'entrena_vie|extract\(\s*(i?dow)|''vie''';
```
Confirmar también que no existe ningún bloque `sab`/`dom` hoy
(`SELECT dia_semana, count(*) FROM bloques_horario GROUP BY 1;`).

### Fase 1 — Dominio, con pruebas (sin cambio visible)
- `horario.ts`: `DIAS` de 7, `esDiaHabil`, `diaDesdeFecha` con sab/dom.
- Migrar los usos de `=== null`: `iniciosDeInscripcion`, `horario.ts:569`,
  `estadoDiaSinClase`, `marcarDiaSinClase`, `cuposDia.ts`, `AsistenciaPanel`,
  `dashboard-profesor`.
- `diasHabiles` y `diasHabilesDelMes`: incluir sáb/dom (solo devuelven días que
  tienen programación, así que quien no tiene sábado no recibe filas nuevas).
- `fechasDeSemanaChile`: lunes a domingo.
- Pruebas: extender `horario.test.ts` y las de `historialAsistencia`/`reportesMes`
  con casos de sábado, **incluido el caso "cambio de grupo un sábado no reescribe
  la semana cerrada"**.

### Fase 2 — Migración (manual, con los dos portazos)
Una migración nueva, empezando con `_migracion_nueva(...)` y
`_migracion_para_todos_los_clubes('cambia el esquema, no toca filas')` (es
esquema y funciones, no filas):
- Columnas `entrena_sab`, `entrena_dom` (default `false`) en `jugadores` y
  `jugador_horario_historial`.
- Reescribir `dias_canonicos_jugador`, `aplicar_dias_jugador` y el trigger.
- Quitar el `NULL` de sáb/dom en `registrar_clase_extraordinaria` y en los RPC de
  cupos/recuperaciones que corresponda (según decisión 2).
- Verificación: `espejo_desalineado = 0` y conteo de jugadores igual al de antes
  (ningún jugador existente cambia, porque nadie tiene bloque de fin de semana).
- Revisar que las tablas que escuchan en vivo sigan en `supabase_realtime`
  (no se agregan tablas nuevas, así que no debería haber cambio).

### Fase 3 — Pantallas
- `guardarGrupo`: aceptar sab/dom; mensajes de error con el nombre del día.
- Grilla semanal, modal "Nuevo grupo", ficha del jugador, solicitudes,
  `TarjetaOcupacion`, `PanelCupos`, `PanelReportes`, `mi-horario`.
- `jugadores/page.tsx` (`sinHorario`, filtro de días), `jugadorExport`.
- `finanzas/page.tsx` `diasDeClase`, `reportesMes-excel`, PDFs.
- Mover los arreglos copiados (`['lun','mar',...]`) a `DIAS` para que sea un solo
  lugar; ya hay cuatro copias del mismo arreglo.

### Fase 4 — Prueba end-to-end **en Demostración TDM, no en Buin**
1. Crear un bloque de sábado.
2. Inscribir a un jugador desde su perfil → ver que `entrena_sab` se refleja.
3. Pasar lista un sábado → ver que aparece el grupo y que la asistencia queda con
   `estado = 'presente'`.
4. Dejar un sábado sin lista → ver que cuenta como falta después de vencido.
5. Reporte mensual del profesor → ver que las horas del sábado suman.
6. "Día sin clase" sobre un sábado.
7. Mover un jugador de grupo **un sábado** → verificar que no reescribe la
   semana cerrada.
8. Dar de baja el bloque → historial y asistencia previa intactos.
Solo cuando todo pase, el usuario crea el bloque real en Buin.

## 5. Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Romper el guard de "semana cerrada" | `esDiaHabil` separado + prueba específica |
| Sábado dictado y no pagado al profesor | `diasHabilesDelMes` en Fase 1 + paso 5 de la prueba |
| Faltas de sábado invisibles | `diasHabiles` en Fase 1 + paso 4 |
| Jugador "sin horario" por el espejo | Columnas nuevas + trigger en Fase 2 |
| Repetir/pegar mal la migración | Portazos del CLAUDE.md; es idempotente por diseño |
| Que otro club vea columnas vacías de fin de semana | La grilla las oculta si no hay bloques |
| Funciones vivas distintas al repo | Fase 0 obligatoria antes de escribir SQL |

## 6. Estimación de alcance

~25 archivos de `src/` y 1 migración. Lo delicado son ~6 puntos
(guard de semana cerrada, asistencia, reporte de horas, espejo, 2 RPC); el resto
es mecánico: cambiar un arreglo de 5 días por `DIAS`.
