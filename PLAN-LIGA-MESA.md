# Liga Presencial por Divisiones — Plan de pasos

Módulo nuevo e independiente del módulo `torneos` actual (grupos+playoffs por ELO). Esta es una liga de temporada regular por divisiones, formato round robin, con motor de programación de mesas/horarios/árbitros para jornadas presenciales.

Cada paso es una sesión independiente. Al iniciar una sesión, indica:
**"Ejecuta el paso N del PLAN-LIGA-MESA.md"**

Reglas inquebrantables del motor (HC-01 a HC-08) y el resto de la especificación funcional completa quedaron en el mensaje original de la usuaria — resumidas aquí en cada paso relevante.

---

## Progreso actual

- [x] Paso 1 — Esquema de base de datos
- [x] Paso 2 — Generación de fixture (round robin) por división
- [x] Paso 3 — Motor de programación automática (mesas/horarios/árbitros)
- [x] Paso 4 — Drag & Drop de partidos con validación de conflictos
- [x] Paso 5 — Estados de fecha + registro de resultados Bo5
- [x] Paso 6 — Partidos no jugados (walkover / reprogramación a Fecha 5)
- [x] Paso 7 — Ranking por división
- [x] Paso 8 — Impresión/exportación (PDF)

---

## Paso 1 — Esquema de base de datos

Crear las tablas nuevas (prefijo `liga_` para no chocar con `torneos`):

- `ligas` — temporada de liga (club_id, nombre, estado)
- `liga_divisiones` — divisiones dentro de una liga (nombre, orden)
- `liga_division_jugadores` — jugadores asignados a cada división
- `liga_fechas` — 5 fechas por liga (numero 1-5, estado, es_ajuste)
- `liga_mesas` — mesas físicas disponibles durante la liga
- `liga_partidos` — partidos del fixture, con fecha/mesa/horario dinámicos (HC-05), árbitro, resultado Bo5, estado

Reglas a respetar (Anexo A):
- HC-03/HC-06: una mesa no puede tener dos partidos en el mismo bloque horario de la misma fecha → constraint único parcial.
- HC-08: resultados válidos Bo5 (3-0, 3-1, 3-2, 0-3, 1-3, 2-3) → check constraint.
- HC-07: estados válidos (`programado`, `en_juego`, `finalizado`, `no_jugado`, `walkover`, `pendiente`).
- HC-01 (jugador no puede estar en dos partidos simultáneos) se valida en capa de aplicación (paso 3/4), no es expresable como constraint simple de SQL.

Entregables:
- Migración SQL en `supabase/migrations/`
- RLS policies (select por club, escritura solo admin)
- Actualizar `src/types/database.ts` con las tablas nuevas
- Tipos de dominio en `src/types/index.ts` si corresponde

**Validación**: migración corre sin errores en Supabase, `npx tsc --noEmit` pasa.

---

## Paso 2 — Generación de fixture (round robin)

- Función pura en `src/lib/domain/liga.ts`: dado un listado de jugadores de una división, generar todos los enfrentamientos (n×(n-1)/2)
- Server Action para confirmar lista de jugadores de una división y disparar la generación
- Bloquear edición de jugadores sin regeneración controlada del fixture
- **Validación**: división de 10 jugadores genera exactamente 45 partidos, sin duplicados ni un jugador contra sí mismo.

---

## Paso 3 — Motor de programación automática

- Asignar fecha (1-4), mesa y bloque horario (09:00-17:00, bloques de 30 min) a cada partido del fixture
- Priorizar programación compacta por jugador (minimizar tiempo muerto, HC global: eficiencia > equilibrio)
- Asignación de árbitros: jugador de la misma división, cercano temporalmente a su propio partido, nunca arbitrando su propio encuentro (HC-04)
- Respetar HC-01 (jugador no en dos partidos simultáneos) y HC-03/HC-06 (mesa exclusiva por bloque)
- **Validación**: programación generada sin conflictos de jugador/mesa, partidos por jugador agrupados en bloques continuos siempre que sea posible.

---

## Paso 4 — Drag & Drop de partidos

- Interfaz visual para mover partidos entre mesa/horario/fecha
- Validación de conflicto en tiempo real al soltar (mesa libre, jugadores disponibles, árbitro sin conflicto)
- **Validación**: mover un partido a un slot ocupado es rechazado; a un slot libre se confirma y persiste.

---

## Paso 5 — Estados de fecha + registro de resultados

- Estado de fecha: `programada` → `en_juego` (botón "Iniciar Fecha")
- Acciones habilitadas solo en el estado correspondiente (editar horarios/mesas/árbitros solo en `programada`; registrar resultados solo en `en_juego`)
- Formulario de registro de resultado Bo5 con validación de marcador válido
- **Validación**: no se puede registrar resultado en fecha `programada`; no se puede editar horario en fecha `en_juego`.

---

## Paso 6 — Partidos no jugados

- Marcar partido como "No Jugado" abre ventana de resolución obligatoria: Walkover o Reprogramar a Fecha 5
- Walkover: asigna victoria/derrota y puntos automáticamente
- Reprogramar: mueve el partido a Fecha 5, estado `pendiente`, sin puntos ni sets
- **Validación**: ambos caminos disponibles y mutuamente excluyentes; ranking se actualiza solo en el caso walkover.

---

## Paso 7 — Ranking por división

- Tabla por división: PJ, PG, PP, PTS, SF, SC, DS
- Puntos: victoria 3, derrota 1, walkover ganado 3, walkover perdido 0
- Orden de clasificación: Puntos → PG → DS → SF → enfrentamiento directo
- Actualización automática al confirmar cualquier resultado
- **Validación**: ranking recalculado correctamente tras cada resultado, empates resueltos según la jerarquía.

---

## Paso 8 — Impresión/exportación (PDF)

- Programación por fecha
- Programación por mesa
- Ranking por división
- Hoja individual de partido (liga, fecha, división, mesa, jugadores, árbitro, espacios para 5 sets, resultado, observaciones)
- **Validación**: cada PDF se genera limpio y listo para imprimir sin ajustes manuales.

---

## Cómo usar este plan

1. Abre una sesión de Claude Code.
2. Di: **"Ejecuta el paso N del PLAN-LIGA-MESA.md"**.
3. Al terminar, marca el paso como `[x]` en "Progreso actual".
4. Un paso por sesión, salvo que Marcela pida lo contrario.
5. No se hace `git push` ni deploy salvo pedido explícito.
