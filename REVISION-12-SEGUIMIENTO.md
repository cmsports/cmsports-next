# Revisión 12 — Seguimiento de implementación

> Documento vivo. Se edita al cierre de cada sesión.
> Origen: `Revision_12_Sistema_Club_Corregido (1).docx`
> Última actualización: **2026-06-15**

---

## Resumen

La Revisión 12 pide cambios en 6 módulos + ajustes generales de diseño. Cada módulo tiene su propio bloque de estado.

---

## 1. Módulo Jugador

**Lo que pide la Rev 12:**
- Eliminar concepto "ELO" → usar "Ranking"
- Curva de avance: eje Y = posición en torneos (fase de grupos → 128avos → ... → final), no puntaje numérico
- Sesiones → plan personalizado: mensual / semanal / libre acceso. Admin fija mensualidad + entrenamientos/semana al aceptar solicitud. Editable después.
- Ficha del jugador con precio mensual, entrenamientos semanales, contacto (email, teléfono), categoría (principiante/intermedio/avanzado), todo editable por admin/entrenador.

**Estado:**

| Sub-paso | Descripción | Estado |
|---|---|---|
| J1 | Migración SQL: campos `mensualidad`, `tipo_plan`, `entrenamientos_por_semana` | ✅ Hecho |
| J2 | Renombrar "ELO" → "Ranking" en toda la UI | ✅ Hecho |
| J3 | Form crear/editar jugador con plan (presets + personalizado) | ✅ Hecho |
| J4 | Validación registro (RUT/teléfono) + modal aprobación con plan | ✅ Hecho |
| J5 | Edición inline de contacto, plan y categoría en ficha del jugador | ✅ Hecho |
| J6 | Gráfico de evolución por posición en torneos (eje ordinal) | ⬜ Pendiente |

> Detalle completo en `MODULO-JUGADOR.md`.

---

## 2. Módulo Torneo

**Lo que pide la Rev 12:**
- **Corrección de errores**: poder cambiar resultados a mano en fase de grupos; volver de llaves a grupos para corregir y regenerar la llave; corregir ganador de un partido de llaves incluso después de haber avanzado.
- **Visual de llaves**: conexiones visuales claras entre llaves, mejorar la presentación.
- **Preparar para 128avos de final**: el torneo debe poder partir desde 128avos.
- **Fixture editable**: ofrecer llave inicial y permitir al admin cambiar posiciones/lugares por error en posición espejo.
- **Lógica de Bye y Llaves de Avance**:
  - Determinar potencia de 2 superior al número de clasificados (50→64, 100→128, 180→256).
  - Bye = tamaño cuadro − clasificados. Se asignan a los mejores sembrados.
  - Llave de Avance: los restantes juegan ronda preliminar para completar el cuadro.
  - Prueba final: 50 grupos, 100 clasificados → cuadro de 128 → 28 Bye + 72 en llave de avance → 64 al cuadro.

**Estado:** ⬜ No iniciado

---

## 3. Eje de Asistencia

**Lo que pide la Rev 12:**
- Visual actual se mantiene (sin cambios estéticos).
- Botón para marcar asistencia visible para admin, entrenador y jugador, condicionado a "solo HOY".
- Solo admin puede desmarcar asistencia.
- Asistencias mostradas de forma semanal (no acumulado total), renovación semanal.
- Evitar gráficos de barras (toscos y feos).
- Énfasis en mostrar inasistencia: botón dentro del signo de alerta que despliegue nombres y acumulado de inasistencias.

**Estado:** ⬜ No iniciado

---

## 4. Módulo Calendario

**Lo que pide la Rev 12:**
- Distinto para cada rol:
  - **Jugador**: ve clases programadas (con nota explicativa al hacer clic), próximos torneos, compromisos del club. Solo visualiza, no altera.
  - **Admin/Entrenador**: puede crear eventos. Analizar fusionar profesor en admin (entrenadores muchas veces son admin).
- Se alimenta del módulo Clases: botón "Crear clase" disponible en vista admin/entrenador.

**Estado:** ⬜ No iniciado

---

## 5. Módulo Clases

**Lo que pide la Rev 12:**
- Clases con más contenido. Ejemplo realista: clase de 11:00 a 13:00 con programación cada 20 minutos (calentamiento, peloteo, técnica, servicio, multibolas, partidos dirigidos, etc.).
- Evitar que el entrenador ponga solo "Clase 1" sin detalle.
- Alerta permanente en panel del admin: **"Existen clases sin programar para esta semana"** si hay días sin actividad programada. Con que haya algo programado para el día, basta.

**Estado:** ⬜ No iniciado

---

## 6. Módulo Finanzas

**Lo que pide la Rev 12:**
- Revisión visual ("está horrible, hay que revisar qué pasa").
- Ícono de cobro por WhatsApp: hacerlo más grande, con botón que diga "Cobrar".

**Estado:** ⬜ No iniciado

---

## 7. Ajustes generales de diseño

**Lo que pide la Rev 12:**
- Orden lógico de presentación (cada detalle explicado, nada sin explicar).
- 3 colores principales para la página, diferenciados por tipo de gráfico.
- No usar gráficos de barras (buscar algo menos genérico).
- Revisar tipografía general.
- Manual de uso (lo hace Marcela, no el desarrollador).

**Estado:** ⬜ No iniciado (pendiente decisión de colores)

---

## Historial de sesiones

### Sesión 2026-06-15
- **Módulo Jugador**: completados J1 a J5. Pendiente J6 (gráfico de evolución).
- **Fix transversal**: migración de 23 archivos a cliente SSR (`@/lib/supabase/client`) para resolver bug de login.
- **Otros módulos**: no iniciados.
- **Próximo paso sugerido**: J6 (gráfico) o iniciar Módulo Torneo.
