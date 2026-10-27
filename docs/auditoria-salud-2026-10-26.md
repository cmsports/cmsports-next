# Auditoría de salud — 26 de octubre de 2026

Alcance: repositorio completo (98.738 líneas en `src/`, 293 migraciones). **No se modificó ningún archivo de código ni se tocó la base.** Lo que sigue es lo medido, lo deducido y lo que no se pudo comprobar.

## 1. Veredicto

El software compila y pasa todo lo automático, pero eso no lo hace sano: las pruebas usan una base simulada y no detectaron el fallo de los torneos. La deuda real está en tres sitios: código de dos módulos que Buin no usa (~17% del código), una arquitectura que hace esperar de más a las pantallas, y un patrón de fallo en torneos que sigue sin causa probada.

| Chequeo | Resultado |
|---|---|
| `tsc --noEmit` | 0 errores |
| `vitest run` | 144 archivos, **1.890 pruebas, todas aprobadas** (50 s) |
| `eslint` | 0 errores, **817 advertencias** (603 son `any`, 92 `set-state-in-effect`, 59 variables sin usar) |
| `next build` (variables ficticias, como CI) | Aprobado, 64 páginas estáticas |
| Pruebas de la base real (RLS, triggers, realtime) | **No ejecutadas**: no hay acceso a la base desde aquí |
| Recorrido botón por botón en el navegador | **No ejecutado**: requiere sesión autenticada. Todo lo de botones es lectura de código |

## 2. Qué pasó en los torneos de Buin

> **Actualización 2026-10-27:** las tres hipótesis de esta sección quedaron **descartadas con pruebas** y la causa real es otra. Ver el Anexo 2 al final.

**Lo comprobado**

- El 2026-10-25, en TC A y TC B, al mover un jugador de grupo quedaron partidos "vs —" en el grupo de origen y faltaron los del destino. Se corrigió ese día (commit `3655203`/`1eba5bf`: los integrantes de después se arman en memoria y el `UPDATE` ahora verifica que movió una fila).
- El código con la lectura repetida (`miembrosAntes` y la relectura idéntica) **existía desde 2026-07-17 y 2026-08-24**. Los movimientos funcionaron durante meses con ese mismo código.
- La única cosa de infraestructura que cambió entre "andaba bien" y la falla: el **2026-10-03 se subió Next de 16.2.7 a 16.3.6**, dentro de un commit mezclado (`8d48bf2`) que además reescribió 1.227 líneas de `package-lock.json` y tocó ~30 archivos de aplicación.
- La auditoría del 10-11 ya advertía que sus simulaciones usan almacenamiento en memoria y "no validan latencia, realtime ni todos los triggers/RLS de producción". Las 1.890 pruebas pasaban el 10-25, el día de la falla.

**Lo que NO está probado (dicho con claridad)**

La causa raíz sigue sin demostrar. Mi primera hipótesis fue que Next deduplica fetch GET idénticos dentro de una petición (el mecanismo existe: `next/dist/server/lib/dedupe-fetch.js`, clave = método + cabeceras + URL). La busqué contra la documentación y **se debilita**: la memoización dura una pasada de render, y el cuerpo de una Server Action probablemente corre fuera de ella. Queda como candidata, no como conclusión. Candidatas ordenadas:

1. **Cambio de comportamiento de Next 16.3.x** (cacheo de fetch o de cliente). Coincide en fecha; falta reproducirlo.
2. **Lectura de réplica con retraso** en Supabase, si el proyecto tiene réplicas de lectura.
3. **Escrituras sin verificar filas.** Si el `UPDATE` afecta 0 filas por RLS no da error. El arreglo ya lo cubre en `moverJugadorEntreGrupos`, pero el patrón sigue en otras acciones.

Por qué la llave también falló: la llave se arma desde `calcularClasificadosDesdeBD` y los partidos de grupo. Con grupos mal armados (partidos fantasma, otros faltantes), los clasificados salen mal y la llave hereda el error. Es consecuencia, no un segundo bug independiente. No encontré en el historial un arreglo aparte de la llave posterior al 10-11.

**Cómo cerrar esto de verdad:** mover jugadores en un torneo de **Demostración TDM** con registro de las dos lecturas y de las filas afectadas, primero en Next 16.3.6 y luego en 16.2.7. Con eso se sabe si fue la actualización.

## 3. Hallazgos de riesgo en el código

| # | Hallazgo | Dónde |
|---|---|---|
| 1 | `obtenerLinkInvitacion` lee, inserta **sin revisar el error** y relee con la misma consulta. Rompe la regla de escrituras revisadas del CLAUDE.md | `src/app/actions/dashboard.ts:9-12` |
| 2 | `traspasarJugador` es un endpoint vivo (mueve jugadores entre clubes por RPC) y **nadie lo llama** | `src/app/actions/jugadores.ts:646` |
| 3 | `eliminarTorneo` es un alias de `archivarTorneo`; el nombre sugiere borrado y no borra | `torneos.ts:3426` |
| 4 | Cada `export` de un archivo `'use server'` es un endpoint público. Las acciones sin uso amplían la superficie de ataque sin dar nada | ver sección 5 |
| 5 | Dos migraciones llevan el número 303 (`torneos_integridad_financiera` y `votaciones_buin`). Si la de torneos no se pegó, los RPC de traspaso y premios siguen sin la protección | `supabase/migrations/` |
| 6 | Migraciones 283-286 figuraban como "pendientes de pegar" en el commit del 10-03. No se puede saber desde el repo si se pegaron | memoria + commit `8d48bf2` |
| 7 | Los commits `#86` y `#87` son el mismo cambio duplicado | historial |
| 8 | 603 `any` en TypeScript: los tipos de Supabase no están protegiendo las consultas | todo `src/` |

## 4. Latencia

Medido por conteo estático; no hay perfil de tiempos reales.

- **65 de 75 páginas son componentes cliente.** El navegador baja el HTML, luego el JS, luego verifica sesión, perfil y módulos, y recién entonces consulta datos. Es una cascada por diseño y es la causa principal de la espera.
- **Páginas con más consultas por carga:** `finanzas` 33, `jugadores/[id]` 23, `torneos/[id]` 20, `torneo-oficial/evento/[id]` 13, `calendario` 11, `dashboard` 10.
- **Archivos gigantes:** `torneos/[id]/page.tsx` 3.000 líneas, `torneos.ts` 3.604, `torneo-oficial.ts` 2.500, `jugadores/[id]/page.tsx` 1.940. Cualquier cambio ahí tiene un radio de daño enorme.
- **Bien resuelto:** `xlsx`, `jspdf` y `html2canvas` se cargan solo al usarse (importación dinámica). Los bundles grandes (862 KB `xlsx`, 432 KB Sentry) no están en la ruta inicial salvo Sentry.
- `select('*')`: 21 usos, 14 en el módulo de fútbol (se van con él).
- Consultas en bucle (posible N+1) a revisar en `ligaJornadas.ts`, `superadmin.ts`, `torneo-oficial.ts:81,1817` y `horario.ts`.

## 5. Código muerto y qué eliminar

| Qué | Tamaño | Nota |
|---|---|---|
| Módulo **Liga Fútbol** | ~5.700 líneas, 17 archivos + referencias en `dashboard`, `finanzas`, `calendario`, `proxy.ts`, `layout-app`, `superadmin`, `modulos.ts`, `database.ts`, `respaldo.ts` | Ningún otro módulo depende de él |
| Módulo **Liga** (tenis de mesa) | ~11.500 líneas, 31 archivos + referencias en calendario integrado, exportación de partidos, finanzas, `clubConfig`, `marcador` | **Lo usan Unión San Bernardo y Spinhouse** según `modulos.ts`. No es solo de Buin |
| Archivos sin ningún importador | `MarcadorPantalla.tsx` (101), `lib/auth/invite-url.ts` (6), `lib/marcador-oficial-persist.ts` (53) | Seguros de borrar |
| Solo usado por pruebas | `lib/domain/elo.ts` (191) | El plan Spinhouse lo marca "sin enganchar todavía": decidir |
| Server Actions sin llamador | `marcarSinClase`, `quitarSinClase`, `traspasarJugador`, `toggleVoucher`, `sincronizarSetsMarcadorOficial`, `hoyChileOficial`, cinco `*Action` de `redes-sociales.ts`, alias `eliminarTorneo` | Verificar por texto antes de borrar |

Si se borran fútbol y liga, el repositorio baja de ~98.700 a ~81.500 líneas (-17%). Las migraciones antiguas se **conservan**: las ya aplicadas son historia. Las tablas (`liga_futbol_*`, `liga_*`) solo se eliminan con una migración nueva con respaldo y los portazos, según `docs/migraciones-destructivas.md`.

## 6. Caché

`cachedFetch` tiene 12 llamadas y **6 no declaran sus tablas**, así que el caché no se invalida cuando la tabla cambia y puede mostrar datos de hasta 1 minuto atrás:

- `src/lib/torneo-oficial/carga-cliente.ts:31` (**Buin, torneo oficial**)
- `CalendarioIntegrado.tsx:50`, `calendario-publico/[clubId]/page.tsx:26`
- `PanelFichaParalimpica.tsx:47`, `PanelRetencion.tsx:50`, `spinhouse/PanelFinanzasSpinhouse.tsx:33`

El mecanismo en sí (`query-cache.ts`) está bien pensado: anota las tablas al lanzar, descarta peticiones en vuelo al invalidar y distingue `null` de "no está". El riesgo es solo ese 50% sin declarar. Pendiente verificar contra la base qué tablas están en `supabase_realtime` (consulta del CLAUDE.md).

## 7. Qué recomiendo, en orden

1. **Reproducir la falla de grupos** en Demostración con Next 16.3.6 vs 16.2.7 antes de volver a un torneo real.
2. Declarar las tablas en las 6 llamadas de `cachedFetch` (cambio chico, sin riesgo).
3. Borrar los 3 archivos huérfanos y las acciones sin llamador (en especial `traspasarJugador`).
4. Eliminar Liga Fútbol (con migración de baja).
5. Decidir sobre la Liga de tenis de mesa con los otros dos clubes en la mesa.
6. Separar `torneos.ts` y `torneos/[id]/page.tsx`; mover las páginas más pesadas a lectura en servidor.
7. Dejar de mezclar actualizaciones de dependencias con arreglos funcionales en el mismo commit.

## Anexo — Liga Fútbol eliminada (2026-10-26, sin subir)

Confirmado por el usuario: solo fútbol, para todos los clubes.

- **Código:** 18 archivos borrados (`liga-futbol` en páginas, componentes, acción, dominio, Excel y PDF, más su plan) y 11 editados (dashboard, finanzas, calendario, menú, superadmin, `proxy.ts`, `modulos.ts`, tipos de la base, dos pruebas y un comentario).
- **Migración nueva:** `305_eliminar_liga_futbol.sql`. Había 281 filas del club `Liga Fut` (liga "Apertura 2026"); el dueño confirmó que eran datos inventados y pidió **no guardar respaldo**. La migración cuenta las filas, quita la clave de `modulos_habilitados` y borra las nueve tablas sin `CASCADE`. **Aplicada el 2026-10-26** (tablas `lf_*` en 0, registrada). El club `Liga Fut` (1 cuenta admin, 0 jugadores, 1 movimiento) se borró aparte con los mismos pasos que el panel del superadmin.
- **Orden obligatorio:** primero subir la aplicación, después pegar la 305. El calendario de la versión anterior consulta `lf_fechas`; con la tabla borrada daría error de carga a todos los clubes.
- **Verificación:** `tsc` completo, 1.861 pruebas, ESLint sin errores (734 advertencias, bajaron 83) y `next build` aprobados.
- **Hallazgo aparte:** `tsc --noEmit` pasaba solo por el caché incremental (`tsconfig.tsbuildinfo`, ignorado por git). Con chequeo completo, `torneos-externos-simulacion.test.ts` tenía dos líneas que no compilaban desde el 11 de octubre; en una copia limpia, como CI, el paso de tipos habría fallado. Corregidas. Para chequear de verdad: `npx tsc --noEmit --incremental false`.

## Anexo 2 — Causa real de los torneos de Buin (2026-10-27)

**Descartado con pruebas (la explicación del commit del 25-oct era incorrecta):**

| Hipótesis | Prueba | Resultado |
|---|---|---|
| Next deduplica la lectura repetida | La misma Server Action (leer, mover, releer) en Next 16.2.7 y 16.3.6, contra un servidor que registra cada petición | La segunda lectura llega al servidor y ve el dato nuevo, en las dos versiones |
| La actualización de Next del 3-oct | Mismo experimento | Sin diferencia entre versiones |
| Lectura con retraso en Supabase | 60 escrituras seguidas, cada una con lectura inmediata, en la base real (fila temporal en Demostración, ya borrada) | 0 lecturas con dato viejo |

**Lo que sí está demostrado:**

- `eliminar_jugador_atomico` deja los partidos del jugador con el rival en `NULL` (la pantalla lo muestra como "vs —") y le saca la fila al grupo, **sin rearmar los partidos del grupo** ni mirar si el torneo sigue vivo. El botón de eliminar de Jugadores no revisaba torneos.
- El 2026-10-25 a las 02:07 UTC se eliminaron dos jugadoras (auditoría de la base), horas después de armar los grupos de TC A (22:53 UTC) y TC B (23:22 UTC) del día 24. El torneo TCB del 2026-09-06 conserva la huella del mismo patrón: un grupo con 2 jugadores y 3 partidos, 2 de ellos con rival vacío.
- La llave se arma desde los grupos: con grupos así, sus cruces salen mal y hubo que reordenarla a mano (4 reordenamientos el 25-oct a las 14:38 UTC).

**Arreglo (en esta entrega):** `eliminarJugador` se niega, con un mensaje claro, si el jugador está en un grupo de un torneo que no esté finalizado, archivado ni cancelado, y lo manda a sacarlo desde el torneo (`quitarJugadorDeGrupo`, que sí rearma los partidos). La MESA no cuenta. Si no puede revisar los torneos, no borra. Seis pruebas nuevas. El comentario engañoso de `moverJugadorEntreGrupos` quedó corregido.

**Lo que no pude reproducir:** no tengo el registro de lo que el administrador hizo clic a clic el 25-oct, y el estado actual de TC A y TC B ya está reparado. La causa del "vs —" encaja con los datos y con el código, pero es una inferencia, no una reproducción del día. Si vuelve a aparecer un grupo con partidos vacíos, hay que mirar primero la auditoría de la base (`audit_log`, acción `jugadores/eliminar`) para ver si alguien fue eliminado en esa ventana.

**Pendiente:** la migración 303 de torneos (protecciones financieras) sigue sin aplicarse en producción.
