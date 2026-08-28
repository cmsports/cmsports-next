# Spinhouse: cancelar, recuperar, asistencia de profes y feedback al profe

Lo que pidió Spinhouse, en tres partes. **Solo Spinhouse**
(`2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41`): cada parte se enciende con su propio
módulo, y las migraciones solo se lo activan a ese club. Buin no ve nada.

Rama: `feat/spinhouse-clases` · worktree `cmsports-spinhouse-clases`.

---

## Parte 1 — Cancelar el bloque y recuperarlo ✅ hecha (falta aplicar la migración)

**Módulo:** `recuperar_clases` · **Migración:** `226_cupos_por_dia_spinhouse.sql`

El alumno avisa que no va a una clase concreta. Si avisa con 24 horas o más,
conserva el derecho a recuperarla; con menos, la pierde. En los dos casos su
lugar queda libre ese día para otro.

- Tabla `bloque_cupos_dia`: un movimiento de cupo de UNA fecha, `tipo` =
  `libera` (avisó que no va) o `toma` (el profe lo puso a recuperar). No toca
  `bloque_jugadores`: cancelar un martes no es dejar el grupo.
- `con_derecho` lo calcula la base (`cancelar_bloque_dia`), nunca el navegador:
  es lo que decide si la clase se pierde.
- `cupos_libres_por_dia(desde, hasta)` devuelve **cuántos** lugares quedan, no
  quiénes faltan. La migración 101 le prohíbe al alumno leer inscripciones
  ajenas y eso no se reabre.
- El alumno **no se asigna solo**: ve qué hay libre, lo pide por WhatsApp, y el
  profe lo mete desde `/horario` → pestaña *Recuperaciones*.

Archivos: `src/lib/domain/cuposDia.ts` (+ test),
`src/components/PanelRecuperarClases.tsx` (alumno, dentro de `/mi-horario`),
`src/components/PanelRecuperaciones.tsx` (profe, dentro de `/horario`).

### Antes de probar
1. Pegar en el SQL Editor de Supabase:
   `C:\Users\Marcela Sandoval\Documents\CMSPORTS\cmsports-spinhouse-clases\supabase\migrations\226_cupos_por_dia_spinhouse.sql`
2. Cargarle el teléfono al club, si no el botón de WhatsApp no aparece:
   `UPDATE clubes SET telefono = '+569XXXXXXXX' WHERE id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';`

---

## Parte 2 — Asistencia de los profesores ✅ hecha (falta aplicar la migración)

**Módulo:** `asistencia_profes` · **Migración:** `227_asistencia_profesores_spinhouse.sql`

Los profes marcan que estuvieron, y el club cuenta horas trabajadas. Dos profes
en el mismo bloque marcan cada uno la suya: la clave es
`(profesor, bloque, fecha)`.

- Vive en `/asistencia` → pestaña **Profesores**, con dos vistas: *Marcar el
  día* y *Horas del mes*.
- El profesor marca solo la suya; el admin la de cualquiera. Lo impone la RLS,
  no la pantalla.
- Nadie puede marcar una fecha futura: va en el `WITH CHECK` de la política,
  porque `now()` no es inmutable y Postgres no la acepta en un `CHECK` de tabla.
- `get_my_profesor_id()` enlaza `perfiles` con `profesores` **por el correo**,
  que es la convención que ya usan `crearProfesor` y `crearAccesoProfesor`. Es
  el punto frágil: si los correos no coinciden, el profe ve la pestaña pero no
  puede marcar. La pantalla lo detecta y lo dice con un mensaje claro en vez del
  error crudo de Postgres.

**Esto NO reemplaza el reporte de Cupos/bloques → Reportes.** Ese suma las horas
que a cada profesor le *tocaba* dictar según el horario (el plan); este suma las
que *marcó* (el hecho). Cuando alguien falta o cubre a un compañero los dos
números se separan, y esa diferencia es lo que Spinhouse quería ver.

Archivos: `src/lib/domain/horasProfesor.ts` (+ test),
`src/components/PanelAsistenciaProfes.tsx`.

### Antes de probar
1. Pegar en el SQL Editor de Supabase:
   `C:\Users\Marcela Sandoval\Documents\CMSPORTS\cmsports-spinhouse-clases\supabase\migrations\227_asistencia_profesores_spinhouse.sql`
2. Correr la última consulta del archivo: dice **qué profesores van a poder
   marcarse**. Los que salgan con `puede_marcarse = false` tienen el correo
   distinto entre su ficha y su cuenta y hay que emparejarlos antes de avisarle
   al club.

---

## Parte 3 — Feedback del alumno hacia el profesor ⏳ pendiente

Lo inverso de `feedback_jugadores`, que ya existe. El alumno escribe con su
nombre o anónimo.

Plan: tabla `feedback_profesores` con `jugador_id` **siempre guardado** (el
admin lo necesita si hay que moderar un abuso) y `anonimo boolean`. El profe lee
por una **vista** que devuelve el nombre en NULL cuando `anonimo` — la RLS no
puede esconder una columna, la vista sí.

Módulo: `feedback_profes`.
