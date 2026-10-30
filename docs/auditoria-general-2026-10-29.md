# Auditoría general — 29 de octubre de 2026

Alcance: repositorio completo (524 archivos TypeScript, 113.410 líneas, 67 páginas, 11 rutas de API, 246 acciones de servidor, 294 migraciones). **No se modificó ningún archivo de código ni se tocó la base.** Parte de la auditoría del 26-10 (`auditoria-salud-2026-10-26.md`): no la repite, comprueba qué de ella sigue abierto y agrega lo que le faltaba.

Cada hallazgo dice si fue **verificado** (leí el código o lo ejecuté) o es **inferencia**. Varios candidatos que mis búsquedas automáticas marcaron resultaron falsas alarmas al leer el código; van en la sección 5 para que nadie los vuelva a perseguir.

## 1. Veredicto

El código está sano en lo mecánico y bien defendido en lo que más duele (plata, acceso, ids, fechas). Lo que sigue abierto es poco y concreto: **dependencias con avisos de seguridad** (uno de ellos, un DoS de Server Actions en `next`, sí nos afecta), **código muerto confirmado que nadie borró desde el 26-10**, **migraciones cuyo estado en la base no se puede saber desde el repo**, y una **regla de escrituras revisadas que acumula 93 excepciones**.

| Chequeo | Resultado |
|---|---|
| `tsc --noEmit --incremental false` | 0 errores |
| `vitest run` | 146 archivos, **1.880 pruebas, todas aprobadas** |
| `eslint` | 0 errores, **735 advertencias** (817 el 26-10) |
| `next build` (variables ficticias, como CI) | Aprobado |
| `npm audit --omit=dev` | **7 avisos** (3 críticos, 3 altos, 1 moderado). Ver 2.1 |
| Base real: RLS, triggers, realtime, migraciones aplicadas | **No verificado** (sin acceso desde aquí) |
| Recorrido de botones con sesión | **No ejecutado** (requiere cuenta). Lo de botones es lectura de código |

## 2. Hallazgos, por prioridad

### 2.1 Dependencias con avisos — uno de ellos sí nos afecta (verificado)

> **Corrección (mismo día):** la primera versión de este informe decía que el riesgo de `next` era bajo. Estaba mal: al listar sus avisos mostré solo los primeros cuatro y `next` tenía **siete**. Los tres que faltaban son los graves y se detallan abajo.

| Paquete | Instalada | Aviso | ¿Lo usamos? |
|---|---|---|---|
| `next` | 16.3.6 | Cuatro avisos corregidos en 16.3.8: fuga de Draft Mode con `use cache`, envenenamiento de caché en SSG/ISR *self-hosted*, endpoint MCP del servidor de desarrollo, rutas de imagen de metadatos | No: sin `use cache`, sin Draft Mode, sin imágenes dinámicas de metadatos |
| `next` | 16.3.6 | **DoS con Server Actions** (GHSA-p3m5-59mp-jv5r, alto): peticiones sin sesión que dejan el proceso al 100 % de CPU. Sin otro arreglo que `next` ≥ 16.4.1; **no hay parche en la línea 16.3** | **Sí**: toda la app escribe por Server Actions |
| `next` | 16.3.6 | **RCE en el optimizador de imágenes con SVG** (GHSA-2464-fhr4-w9xw, crítico) | Puede: `next/image` acepta nuestro Storage. Se mitiga con `sharp` ≥ 0.35.5, según el propio aviso |
| `next` | 16.3.6 | **RCE en funciones `use cache`** que devuelven *typed arrays* (GHSA-673q-mjm6-r5xr, crítico) | No: no hay `use cache` ni `cacheComponents` |
| `zod` | 4.4.3 | Consumo de memoria con colecciones enormes (`<4.6.6`) | **Sí, es directa** y valida entradas de acciones de servidor. Es el único con superficie real; actualizar es un cambio menor |
| `@sentry/nextjs` | 10.63.0 | Salto de middleware con *tunnel route* | No: no hay `tunnelRoute` en la configuración |
| `dompurify` | 3.4.16 | Tres avisos de saneamiento | No: viene de `jspdf` y no se usa `.html()` |
| `sharp`, `source-map-js`, `fast-uri` | — | Avisos transitivos | Indirectos (imágenes de Next, compilación) |

Recomendación: un commit **solo de dependencias**, con build y pruebas, separado de cualquier arreglo funcional. El 26-10 ya se advirtió que mezclar la subida de Next del 3-oct con 30 archivos de aplicación dejó una causa imposible de aislar.

### 2.2 Migraciones: lo que el repo no puede decir (verificado en archivos; estado en la base: no verificado)

- **Dos migraciones llevan el 303**: `303_torneos_integridad_financiera` y `303_votaciones_buin`. Los nombres registrados son distintos, así que no se pisan al pegarlas. Las tablas de votaciones **sí existen en la base** (las cuatro con las columnas exactas de la 303). La de torneos sigue sin confirmarse: el 27-10 figuraba como **no aplicada**, y esa protege los RPC de traspaso y premios.
- **Hay 12 pares de archivos con el mismo número** (047, 054, 100, 105, 126, 127, 128, 129, 180, 254, 256, 303). No rompe nada porque se pegan a mano, pero el número ya no identifica a una migración. La siguiente libre es la **306**.
- **Dos registran un nombre distinto al de su archivo**: `131_superadmin_ve_jugadores` registra `130_…` y `274_rls_rendimiento_get_my` registra `213_rls_rendimiento_get_my`. En `_migraciones_aplicadas` aparecen con el número equivocado. (La 246 también trae `247_nombre_del_archivo`, pero es un ejemplo dentro de un comentario.)
- **La 274 no declara club ni "para todos"** y es posterior a la 247. Cambia políticas de todos los clubes, así que debió llevar `_migracion_para_todos_los_clubes(...)`.
- Huecos de numeración: 29-30, 144-154, 217-220, 253, 288-292. Los 288-292 coinciden con el choque del formulario de Spinhouse ya conocido.
- Todas las posteriores a la 128 tienen `_migracion_nueva`, `BEGIN` y `COMMIT`. Las destructivas que mi búsqueda marcó "sin respaldo" son funciones que contienen un `DELETE` (no migraciones que borren filas) y la 190, que tiene guarda de vacío.

**Cómo cerrarlo:** `docs/pegar-auditoria-migraciones.sql` ya existe, es de solo lectura y consulta el estado final de la base (migraciones registradas, funciones vivas con fecha UTC, lecturas de asistencia sin `estado`, etc.). Pegarla y comparar el resultado contra la lista de archivos es la única forma de saber qué falta.

### 2.3 Escrituras revisadas: la regla acumula excepciones (verificado)

`src/lib/escrituras-revisadas.test.ts` declara **93 escrituras que ignoran su error a propósito** (27 en `torneos.ts`, 23 en `torneo-oficial.ts`, 8 en `jugadores.ts`, 6 en `liga.ts`…). Cada una tiene su motivo escrito y la prueba pasa, pero el propio archivo dice que si la lista crece "la regla dejó de servir". Es el origen de los casos de grupos de torneos.

Sigue abierto un hallazgo del 26-10: **`obtenerLinkInvitacion`** (`src/app/actions/dashboard.ts:9-12`) inserta en `invitaciones` sin mirar el error y relee. Si el insert falla, devuelve un enlace con `codigo: ''` como si hubiera funcionado.

### 2.4 Código muerto confirmado (verificado con dos búsquedas independientes)

Nada de esto se borró desde el 26-10, salvo la Liga Fútbol.

**Archivos sin ningún importador** (263 líneas): `components/marcador/MarcadorPantalla.tsx` (101), `lib/marcador-oficial-persist.ts` (53), `lib/marcador-oficial.ts` (103, solo lo importan los dos anteriores), `lib/auth/invite-url.ts` (6).

**Acciones de servidor sin llamador** (cada `export` de un archivo `'use server'` es un endpoint público): `marcarSinClase`, `quitarSinClase`, `traspasarJugador` (mueve jugadores entre clubes), `toggleVoucher`, `eliminarTorneo` (alias de archivar, nombre engañoso), `hoyChileOficial`, `sincronizarSetsMarcadorOficial` y las cinco `*Action` de `redes-sociales.ts`. Total: 12.

**Lógica que solo usan las pruebas** (existe, está probada, pero ninguna pantalla la invoca):
- `anularUltimoAbono` (`liga-pagos.ts`): una acción de plata sin botón que la llame.
- `lib/domain/planes.ts`: `montoDelJugador`, `alcanzaLaFrecuencia`, `origenDelMonto`. La app calcula el monto con `montoEsperado` de `mensualidades.ts`; o planes está a medio enganchar o es una segunda lógica de precios sin usar. **Inferencia**: hay que preguntar a Luis cuál es.
- `lib/domain/elo.ts` (191 líneas), `vigencia.ts` (`diasVigentes`, `vigentesEn`), `torneos.ts` (`generarSiguienteFase`, `construirLlavesLayout`), `uuid.ts` (`uuidOrFail`).

**Candidatos sin segunda verificación**: diez helpers exportados de `lib/pdf/estilo.ts` (`barrasCategoria`, `panelDatos`, `piePagina`…) y `marcadorResumen`/`tarjetasDefault` de `lib/tecnico/marcador.ts` no tienen uso fuera de su archivo según el script. Antes de borrar, confirmar a mano.

**No es código muerto**: `/clases`, `/mensualidades` y `/redes-sociales` son páginas de 7 a 14 líneas que redirigen, dejadas a propósito para enlaces viejos. `/cuenta-bloqueada` y `/sin-club` las alcanza el proxy.

Hay además unos 150 `export` de tipos y constantes que solo se usan dentro de su archivo. Es ruido, no merece un cambio.

### 2.5 Calidad y mantenimiento (verificado)

- **Archivos gigantes**: `actions/torneos.ts` 3.609 líneas, `torneos/[id]/page.tsx` 3.053, `actions/torneo-oficial.ts` 2.500, `jugadores/[id]/page.tsx` 1.940. `torneos/[id]/page.tsx` concentra 156 de las 735 advertencias; `finanzas/page.tsx`, 66.
- **735 advertencias**: 532 `any`, 85 `set-state-in-effect`, 55 variables sin usar, 15 `exhaustive-deps`.
- **Tipos generados viejos**: `types/database.ts` no conoce votaciones, técnico ni torneo oficial; de ahí los `as any`.
- **CI** (`.github/workflows/ci.yml`): usa `npm install` y no `npm ci` (no respeta el lock al pie de la letra), `tsc --noEmit` con caché incremental (el 26-10 se vio que oculta errores de compilación), Node 20 mientras se desarrolla en 24, y no revisa avisos de dependencias. (La numeración de migraciones sí la vigila: `src/lib/migraciones-numeracion.test.ts` corre con las pruebas y falla ante un número repetido nuevo. La primera versión de este informe decía lo contrario.)
- **Binarios pesados versionados**: `public/videos/demo-cmsports-2.mp4` 13,6 MB y `-1.mp4` 4,2 MB, dos PNG de sponsors de 3,3 y 1,8 MB. Y `benja toro.mp4`/`benja trago.mp4` están en la raíz sin seguimiento: un `git add .` descuidado los sube.
- 148 `alert()`/`confirm()` nativos en pantallas; 8 `select('*')`; 0 `console.log`; 0 comentarios `TODO/FIXME`.

### 2.6 Menores (verificado)

- `esquemaCategorias.ts:79` asocia `CLUB_ID_BUIN` a su esquema en código. Es la excepción al principio "las diferencias entre clubes son dato"; ya existe `POR_NOMBRE` elegible por configuración, así que el mapa por id es un resto.
- `horario.ts` (`estadoDiaSinClase` y similares) interpola `params.fecha` en un `.or()` validándola solo indirectamente (`diaDesdeFecha` devuelve null si no es fecha). Solo la llama el staff y además filtra por `club_id`, así que el daño posible es mínimo; conviene validarla con la misma expresión regular que usan otras acciones.

## 3. Lo que sí está bien (verificado)

- **Acceso.** De 246 acciones de servidor, 6 no mostraban guarda en su cuerpo: 5 de Spinhouse pasan por un ayudante común que llama `requireAdminClub`, y `registrarSolicitud` es pública por diseño (alta). Las 11 rutas de API validan sesión y, donde escriben, rol y carpeta del club. Sin secretos en archivos versionados; `.env*` ignorado, solo `.env.local.example` se sube.
- **Plata.** Ninguna escritura directa a `movimientos` ni a `mensualidades` desde acciones o pantallas: todo pasa por RPC.
- **Ids en `.or()`.** Los seis sitios de acciones de servidor validan con `esUuid` antes de interpolar.
- **Filtros que no fallan.** 0 lecturas de `bloque_jugadores` sin vigencia. Las 3 lecturas de `asistencia` sin `estado` son intencionales (mover un registro de día y marcar "días con lista pasada").
- **Fechas.** Los `toISOString().slice(0,10)` que parecían el bug de UTC están anclados a mediodía o a `fechaChile()`. En SQL, `current_date` aparece solo en comentarios de arreglos o ya corregido por la 202.
- **Tiempo real.** Las 44 tablas que escuchan las pantallas tienen una migración que las publica (196, 249/251, 294…).
- **Caché.** 19 llamadas a `cachedFetch`, **todas declaran tablas**: las 6 que faltaban el 26-10 quedaron arregladas.
- **Botones.** 774 `<button>`: 2 sin `onClick`, que son el envío de un formulario; 0 `onClick` vacíos y 0 `href="#"`.
- **Cerrado desde el 26-10**: Liga Fútbol eliminada (migración 305 aplicada; no queda ninguna tabla `lf_*`), guarda contra borrar jugadores en torneos vivos, sincronía de grupos en pantalla.

## 4. Qué no pude comprobar

- **El estado real de la base**: RLS vigente, triggers, qué migraciones se pegaron. Se resuelve con `docs/pegar-auditoria-migraciones.sql`.
- **El funcionamiento de punta a punta con una cuenta**: no hice un recorrido botón por botón. Lo de botones es lectura de código.
- **Rendimiento real**: la latencia por cascada de pantallas cliente (65 de 75 son componentes cliente) es del 26-10 y es conteo estático.
- **Políticas de Storage**: se leyeron las rutas de API, no la configuración de los buckets.

## 5. Falsas alarmas que no hay que volver a perseguir

| Lo que parecía | Qué era |
|---|---|
| 5 rutas de API sin guarda | Usan `sesionApi()`/`esAdminApi()` (mi patrón buscaba otros nombres) |
| 5 acciones de Spinhouse sin guarda | Pasan por `llamar()` → `requireAdminClub()` |
| 8 tablas en vivo sin publicación | Las publican bucles `FOREACH … format(%I)` que no se ven con una búsqueda de texto simple |
| Fechas UTC en dashboard, inactivos, respaldoAviso | Ancladas a `T12:00` o a `fechaChile()` |
| `current_date` en la 134, 137, 202… | Comentarios, o ya parchado por la 202 |
| `SUPABASE_SERVICE_ROLE_KEY` en `proxy.ts` | Uso en servidor para leer `jugadores.estado` (bloqueo por morosidad); no llega al navegador |
| Migración 190 "destructiva sin respaldo" | Tiene guarda de vacío; ya se aplicó |
| Botones sin `onClick` en `PanelFinanzasSpinhouse` | Son el submit de su `<form onSubmit>` |

## 6. Qué recomiendo, en orden

1. **Pegar `docs/pegar-auditoria-migraciones.sql` y mandar el resultado**: es lo único que cierra la duda de la 303 de torneos y de las migraciones registradas.
2. **Actualizar dependencias** en un commit propio: `zod` (directa y con superficie real), `next` ≥ 16.3.8, `sharp` ≥ 0.35.5, `@sentry/nextjs` y `dompurify`. Para cerrar el DoS de Server Actions hace falta además `next` 16.4.x, un salto de versión menor que se evalúa y prueba aparte.
3. **Borrar el código muerto confirmado** (4 archivos y las 12 acciones). Es un cambio mecánico, sin riesgo, que además reduce la superficie pública de las acciones. `traspasarJugador` primero.
4. **Decidir `planes.ts` y `anularUltimoAbono`** con Luis: ¿se enganchan o se retiran?
5. **Arreglar `obtenerLinkInvitacion`** (revisar el error del insert).
6. **Endurecer el CI**: `npm ci`, `tsc --incremental false` y `npm audit`.
7. **Regenerar `types/database.ts`** y mover los videos pesados fuera del repo.
