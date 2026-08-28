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

## Parte 2 — Asistencia de los profesores ⏳ pendiente

Los profes marcan que estuvieron en el bloque, para contabilizar horas
trabajadas. Puede haber dos profes en el mismo bloque y cada uno marca la suya.

Plan: tabla `asistencia_profesores` (`profesor_id`, `bloque_id`, `fecha`,
`hora`, `registrado_por`), única por los tres primeros. La marca la puede poner
el propio profe o el admin. Reporte de horas del mes reutilizando
`horasSemanales()` de `lib/domain/horario.ts`.

Módulo: `asistencia_profes`.

---

## Parte 3 — Feedback del alumno hacia el profesor ⏳ pendiente

Lo inverso de `feedback_jugadores`, que ya existe. El alumno escribe con su
nombre o anónimo.

Plan: tabla `feedback_profesores` con `jugador_id` **siempre guardado** (el
admin lo necesita si hay que moderar un abuso) y `anonimo boolean`. El profe lee
por una **vista** que devuelve el nombre en NULL cuando `anonimo` — la RLS no
puede esconder una columna, la vista sí.

Módulo: `feedback_profes`.
