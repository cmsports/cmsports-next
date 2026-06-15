# Módulo Jugador — Seguimiento

> Documento vivo. Se edita al cierre de cada sesión.
> Origen: `Revision_12_Sistema_Club_Corregido.docx` (sección "Módulo Jugador").
> Última actualización: **2026-06-15** (sesión inicial, alcance pactado).

---

## Objetivo del módulo

Pasar de un módulo de jugadores con ELO numérico y un único plan hardcodeado a:
- Vocabulario "Ranking" (no "ELO") en toda la UI.
- **Plan personalizado por jugador**: mensualidad, tipo de plan (mensual / semanal / libre acceso) y entrenamientos/semana fijados al aprobar la solicitud, editables después.
- Ficha del jugador con todos los datos editables (contacto + categoría + plan).
- Gráfico de evolución por **posición en torneos** (128avos → final) en vez de ELO numérico.

---

## Estado de los archivos relevantes

| Archivo | Rol | Estado |
|---|---|---|
| `src/app/jugadores/page.tsx` | Listado + ranking + modal crear/editar | Sin cambios de Rev 12 |
| `src/app/jugadores/[id]/page.tsx` | Vista detalle + gráfico ELO + feedback | Sin cambios de Rev 12 |
| `src/app/dashboard/solicitudes/page.tsx` | Aprobación de solicitudes (admin desde dashboard) | Sin cambios de Rev 12 |
| `src/app/solicitudes/page.tsx` | Vista alternativa de solicitudes | Sin cambios de Rev 12 |
| `src/types/database.ts` | Tipos generados | `jugadores` aún no tiene los campos de plan |
| `supabase/migrations/` | Migraciones SQL | Sin migración de plan personalizado |

---

## Plan de sub-pasos

Cada sub-paso es una sesión. Al iniciar una sesión decir: **"Ejecuta el sub-paso JN del MODULO-JUGADOR.md"**.

### J1 — Migración SQL: plan personalizado por jugador  ✅ Hecho (2026-06-15)
- Archivo: [supabase/migrations/004_plan_jugador.sql](supabase/migrations/004_plan_jugador.sql)
- Aplicada en Supabase remoto (proyecto Cmsports). Tipos TS sincronizados a mano en `src/types/database.ts`. `tsc` ✅.
- Verificado con `select` de muestra: jugadores existentes quedaron con `mensualidad` correcta (8 ses→$25k, 12→$30k), `tipo_plan='mensual'`, `entrenamientos_por_semana` derivado (sesiones_limite/4).

### J2 — Rename "ELO" → "Ranking" en la UI  ✅ Hecho (2026-06-15)
- Archivos tocados (solo strings visibles, BD intacta):
  - `src/app/jugadores/page.tsx` — header tabla, tab, export Excel.
  - `src/app/jugadores/[id]/page.tsx` — stat "Ranking", "Curva de ranking", label de chart, tooltips.
  - `src/app/ranking/page.tsx` — h1 y label de cifra.
  - `src/app/perfil/page.tsx` — label "Ranking".
  - `src/app/layout-app.tsx` y `src/components/layout/Sidebar.tsx` — nav "Ranking" (profesor y jugador).
  - `src/app/torneos-externos/page.tsx` — vista del jugador, 3 strings.
- Lo que NO se tocó (queda para módulo Torneo): `torneos/[id]/page.tsx`, `reportes/page.tsx`, `lib/domain/elo.ts`, columnas/tablas BD (`elo`, `historial_elo`, `puntos_elo`).
- `npx tsc --noEmit` ✅.

### J3 — Form crear/editar jugador con plan  ✅ Hecho (2026-06-15)
- `src/app/jugadores/page.tsx` — modal con sección "Plan del jugador":
  - **Tipo de plan**: segmented control (Mensual / Semanal / Libre acceso).
  - **Entrenamientos por semana**: input numérico (oculto cuando tipo = libre).
  - **Mensualidad**: 4 chips preset ($15k / $25k / $30k / $40k, cada uno setea también ent./sem) + input "Monto personalizado".
- `guardar()` escribe `tipo_plan`, `entrenamientos_por_semana`, `mensualidad` y mantiene `sesiones_limite` derivado (ent×4, o 99 si libre) para no romper vistas legacy.
- Default al crear: mensual, 3 ent./sem, $30.000.
- `npx tsc --noEmit` ✅.

### J4 — Modal de aprobación + validación registro  ✅ Hecho (2026-06-15)
- **Registro** (`registro/page.tsx`): validación de RUT (formato `12345678-9`, sin puntos, con guión) y teléfono (`+56975235780`). Hints visuales + borde rojo en tiempo real.
- **Aprobación** (`dashboard/solicitudes/page.tsx` y `solicitudes/page.tsx`): botón "Aprobar" abre modal con categoría, tipo de plan (mensual/semanal/libre), entrenamientos/semana, mensualidad (4 presets + monto personalizado). Crea jugador con plan real, no hardcodeado.
- **Fix adicional**: migración de 23 archivos de `@supabase/supabase-js` a `@/lib/supabase/client` (cliente SSR) para resolver bug de login (sesión en cookies vs localStorage).

### J5 — Edición inline del perfil (admin / entrenador)  ⬜ Pendiente
- En `jugadores/[id]/page.tsx`:
  - Tarjeta de Contacto editable (email, teléfono).
  - Tarjeta de Plan editable (mensualidad, tipo, entrenamientos/sem).
  - Categoría editable.
- Cambios vía Server Action (no insert directo desde cliente — alinea con feedback de seguridad).
- **Validación**: admin y entrenador pueden cambiar email/teléfono/categoría/plan desde el detalle.

### J6 — Gráfico de evolución por posición en torneos  ⬜ Pendiente
- Reemplazar `Curva de ELO` por `Curva de avance`.
- Eje Y discreto, escala ordinal: `fase_grupos < 128avos < 64avos < 32avos < 16avos < octavos < cuartos < semifinal < final (subcampeón/campeón)`.
- Fuente de datos: `torneo_partidos.fase` por torneo + `torneos_externos.posicion`.
- Tooltip: nombre del torneo + fase alcanzada.
- **Validación**: para un jugador con torneos, la curva sube/baja según posición; no aparecen números ELO.

---

## Decisiones tomadas

- **2026-06-15**: Mantener la columna BD `jugadores.elo` aunque la UI ya no la muestre; el cálculo interno y el matching siguen usándola hasta el sub-paso de Torneos (fuera de este módulo). Esto evita migración de datos y rompe menos.
- **2026-06-15**: No fusionar el rol Profesor en Admin todavía (esa decisión viene del módulo Calendario de la Rev 12 y se discute fuera de este doc).
- **2026-06-15**: El campo `sesiones_limite` se reinterpreta como `entrenamientos_por_semana`; `sesiones_usadas` se conserva como contador del período pero se mostrará "X de N esta semana" en vez de "X de N en el mes".

---

## Decisiones pendientes / preguntas abiertas

Resueltas el **2026-06-15**:
- Mensualidad: **planes precargados + opción "personalizado"** en el mismo selector (UI sugiere 4/8/12/16 sesiones con sus precios; admin puede escribir monto libre).
- `entrenamientos_por_semana` se oculta cuando `tipo_plan = 'libre'` (queda en null o sin sentido).
- Gráfico J6: **se oculta por completo** si el jugador no tiene torneos (en vez de mensaje vacío).

---

## Historial de sesiones

### Sesión 2026-06-15 — Alcance inicial + J1 + J2 + J3
- **Qué hice**:
  - Leí la Revisión 12, comparé contra `Plan de mejora.md`, diseñé este documento con 6 sub-pasos.
  - **J1**: creé y apliqué `supabase/migrations/004_plan_jugador.sql` (3 columnas nuevas + backfill + refactor de `generar_mensualidades`); tipos TS sincronizados; backfill verificado con SELECT.
  - **J2**: renombré "ELO" → "Ranking" en 7 archivos de UI; BD y módulo Torneo intactos.
  - **J3**: agregué sección "Plan del jugador" al modal crear/editar (tipo, entrenamientos/sem, mensualidad con presets + manual). `guardar()` escribe los 3 campos nuevos y mantiene `sesiones_limite` derivado para no romper vistas legacy.
- **Qué mejoré**:
  - `jugadores` tiene plan personalizado por persona, editable desde el form.
  - UI habla de "Ranking" en todo el módulo.
  - Admin ya puede crear un jugador eligiendo plan preset o monto custom.
- **Dónde quedé**: J1, J2 y J3 cerrados. `tsc` limpio.
- **Qué sigue**: **J4** — modal de aprobación de solicitud que pida plan + categoría al aceptar.

### Sesión 2026-06-15 (cont.) — Fix login + J4
- **Qué hice**:
  - **Fix login crítico**: todas las páginas usaban `createClient` de `@supabase/supabase-js` (localStorage) en vez del cliente SSR (cookies). Migré 23 archivos a `@/lib/supabase/client`. Probado en localhost.
  - **J4**: validación en registro (RUT con guión, teléfono con +56) + modal de aprobación con plan personalizado (categoría, tipo plan, entrenamientos/sem, mensualidad presets + custom).
- **Qué mejoré**:
  - Login funciona correctamente (sesión compartida entre login y todas las páginas).
  - Datos de registro vienen limpios (RUT y teléfono con formato correcto).
  - Admin asigna plan real al aprobar solicitud, no valores hardcodeados.
- **Dónde quedé**: J1-J4 cerrados. `tsc` limpio.
- **Qué sigue**: **J5** — edición inline del perfil del jugador (contacto, plan, categoría) desde `jugadores/[id]/page.tsx`.
