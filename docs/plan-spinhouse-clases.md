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

## Parte 3 — Feedback del alumno hacia el profesor ✅ hecha (falta aplicar la migración)

**Módulo:** `feedback_profes` · **Migración:** `228_feedback_a_profesores_spinhouse.sql`

Lo inverso de `feedback_jugadores`. El alumno escribe con su nombre o anónimo,
desde `/feedbacks` → pestaña *Escribirle al profe*. El profe lo lee en
*Lo que me escribieron*.

- Solo puede escribirle a los profes que **le hacen clases**: salen de sus
  bloques, no de la lista completa del club.
- Uno por profesor por día. No es una regla del club, es un freno al spam: si se
  arrepiente, borra el suyo y escribe otro.

### El anonimato, que es la parte delicada

La RLS de Postgres filtra **filas, no columnas**: no hay forma de darle la fila
al profesor con el `jugador_id` escondido. Por eso:

- La tabla tiene **una sola política**, la del alumno sobre lo suyo. El profesor
  y el admin **no leen la tabla**.
- La leen por `feedback_de_profesores()`, que devuelve el autor en NULL cuando
  es anónimo.
- **Tampoco el admin ve al autor.** En Buin los admin son entrenadores, así que
  un admin que puede ver quién escribió qué vacía la palabra "anónimo".
- Borrar va por `borrar_feedback_profesor()` y no por una política de DELETE:
  con la política, un `DELETE ... RETURNING jugador_id` desde la API devolvería
  justo el dato que el anonimato niega.
- El `jugador_id` **sí se guarda**: es lo que le permite al alumno releer y
  borrar lo suyo, y lo que permitiría investigar un abuso real — pero eso se
  hace con SQL, a mano y dejando rastro, no desde una pantalla.

Archivos: `src/components/PanelFeedbackAlProfe.tsx` (alumno),
`src/components/PanelFeedbackRecibido.tsx` (profe/admin).

### Antes de probar
Pegar en el SQL Editor de Supabase:
`C:\Users\Marcela Sandoval\Documents\CMSPORTS\cmsports-spinhouse-clases\supabase\migrations\228_feedback_a_profesores_spinhouse.sql`

La verificación que importa está al final del archivo: **tiene que haber una
sola política** sobre `feedback_profesores`. Si aparece alguna de SELECT para
staff, el anonimato está roto.
