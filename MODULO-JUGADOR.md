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

### J3 — Form crear/editar jugador con plan  ⬜ Pendiente
- En `jugadores/page.tsx`, modal:
  - Agregar `mensualidad` (input numérico CLP).
  - Agregar `tipo_plan` (select: mensual / semanal / libre).
  - Reemplazar `sesiones_limite` por `entrenamientos_por_semana` (interpretado según tipo de plan).
- Default al crear: mensual / 3 ent. semana / mensualidad sugerida (configurable global).
- **Validación**: crear y editar jugador escribe los nuevos campos.

### J4 — Modal de aprobación de solicitud  ⬜ Pendiente
- En `dashboard/solicitudes/page.tsx` y `solicitudes/page.tsx`, el botón "Aprobar" abre un modal:
  - Categoría (principiante / intermedio / avanzado)
  - Tipo de plan
  - Entrenamientos por semana
  - Mensualidad
- Al confirmar crea el jugador con esos valores.
- **Validación**: aprobar una solicitud nueva crea el jugador con plan personalizado, no con los valores hardcodeados.

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

### Sesión 2026-06-15 — Alcance inicial + J1 + J2
- **Qué hice**:
  - Leí la Revisión 12, comparé contra `Plan de mejora.md`, diseñé este documento con 6 sub-pasos.
  - **J1**: creé y apliqué `supabase/migrations/004_plan_jugador.sql` (3 columnas nuevas + backfill + refactor de `generar_mensualidades`); tipos TS sincronizados; backfill verificado con SELECT.
  - **J2**: renombré "ELO" → "Ranking" en 7 archivos de UI (jugadores, ranking, perfil, nav, torneos-externos); BD y módulo Torneo intactos. `tsc` ✅.
- **Qué mejoré**:
  - `jugadores` tiene plan personalizado por persona, sin romper el sistema viejo.
  - Toda la UI orientada al jugador habla de "Ranking", no de "ELO".
- **Dónde quedé**: J1 y J2 cerrados. Listo para arrancar J3 en la próxima sesión.
- **Qué sigue**: **J3** — form crear/editar jugador con campos de plan (mensualidad con presets + manual, tipo_plan, entrenamientos_por_semana). Es el primer sub-paso donde se usan los campos nuevos de BD.
