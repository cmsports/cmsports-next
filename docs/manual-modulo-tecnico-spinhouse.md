# Manual de uso — Módulo técnico (piloto Spinhouse)

Para el admin o profesor que se sienta a trabajar el perfil técnico de un jugador.
Club piloto: **Spinhouse**. Actualizado 2026-08-11.

---

## 0. Antes de empezar

| Dato | Valor |
|------|--------|
| Login admin demo | `spinhouse@cmsports.cl` / `spinhouse123` |
| Jugadores demo | Matías Rojas (Demo), Valentina Soto (Demo) |
| Menú | **Perfil técnico** (ícono de video) |
| Entrada alternativa | Ficha del jugador en **Jugadores** → botón **Perfil técnico** |

Roles:

- **Admin / Profesor:** ven todo, crean sesiones, marcan, evalúan, planes, IA.
- **Jugador:** solo ve sesiones y evaluaciones **publicadas** de su ficha.

Limitaciones actuales del piloto:

- **Subir video** funciona desde cualquier PC (producción o local).
- **Optimizar video** (FFmpeg) solo en un PC con el proyecto y FFmpeg; en Vercel el botón no procesa. Se puede analizar igual sobre el original.

---

## 1. El admin se sienta: panorama del club

1. Entra con el login de Spinhouse.
2. En el menú lateral abre **Perfil técnico** (`/tecnico`).

Ahí ve:

- KPIs: jugadores, sesiones, alertas de plan, videos por optimizar.
- Bloque **Necesitan atención** y lista compacta de jugadores (buscador + filtros).
- **Alertas de planes** (si un jugador lleva días sin avanzar ejercicios).
- **Actividad reciente** (últimas sesiones).

Botones de arriba a la derecha:

| Botón | Para qué |
|-------|----------|
| **Marcador en vivo** | Scoreboard tipo tablet (partidos) |
| **Cara a cara** | Comparar dos jugadores |
| **Objetivos** | Catálogo de objetivos técnicos |
| **Planes** | Planes de entrenamiento y ejercicios |
| **+ Nueva sesión** | Subir video / crear análisis |

### Marcador en vivo

1. Clic en **Marcador en vivo** → `/tecnico/marcador`.
2. Crea partido (jugadores o nombres libres, formato bo3/bo5/bo7).
3. Scoreboard a pantalla completa: +/− puntos, games, timer, tarjetas, challenge.
4. Requiere migración **154** en Supabase.

**Ruta típica del día:** mirar alertas → abrir historial de un jugador → o crear una sesión nueva.

---

## 2. Revisar estadísticas de un jugador

1. En `/tecnico`, clic en la tarjeta del jugador (ej. Matías) o en **Historial**.
2. Llega a `/tecnico/jugadores/[id]`.

En el historial encuentra:

- Resumen: sesiones, eventos, efectividad, % error, servicio, golpe principal, rating, zona principal.
- Comparación **mes actual vs mes anterior**.
- Gráfico de evolución (aprox. 6 meses).
- Distribución de golpes (SER, DER, REV, BLQ, ERR).
- Avance de objetivos en evaluaciones publicadas.
- Lista de sesiones y evaluaciones.
- **Asesor técnico IA** (más abajo).
- **Exportar PDF** del progreso.
- Atajo **Cara a cara** con ese jugador precargado.

Cómo leerlo en 2 minutos:

1. Efectividad y % error del mes vs el anterior.
2. Golpe principal y zona: ¿dónde concentra el trabajo?
3. Objetivos: cuántos “logrados” vs “en progreso”.
4. Si hay alerta de plan, abrir el plan y ver qué ejercicio falta.

---

## 3. Comparar dos jugadores (cara a cara)

1. Desde `/tecnico` → **Cara a cara**, o desde el historial → **Cara a cara**.
2. Elige jugador A y jugador B (ej. Matías vs Valentina).
3. Opcional: filtra por período y/o tipo de sesión (entrenamiento, partido, video libre).
4. Revisa:
   - Ratings (control, ataque, servicio, regularidad, eficacia).
   - Indicadores directos (efectividad, errores, eventos, etc.).
   - % de objetivos logrados en evaluaciones publicadas.

Úsalo para decidir quién necesita más foco en servicio, quién ya puede subir de nivel, o para mostrar avance a apoderados (con datos publicados).

---

## 4. Agregar u ordenar objetivos técnicos

Los objetivos son el “lenguaje” de las evaluaciones (ej. `SER-CONTROL`, `DER-CONS`).

1. `/tecnico` → **Objetivos** (`/tecnico/objetivos`).
2. **+ Agregar objetivo** (o el botón equivalente de alta).
3. Completa: código, nombre, dimensión (servicio, derecho, etc.), nivel, criterio.
4. Guarda. Quedan disponibles al evaluar una sesión.

Buenas prácticas:

- Código corto y estable (`DER-CONS`), no lo cambies después si ya hay historial.
- Criterio medible: “8 de 10 golpes válidos”, no “mejorar el derecho”.
- Si un objetivo deja de usarse, **desactívalo**; no lo borres a ciegas (el historial lo referencia).

En el piloto Spinhouse ya hay un catálogo sembrado (migración 146). Puedes sumar más según el club.

---

## 5. Planes de entrenamiento

1. `/tecnico` → **Planes**.
2. Abre **Base técnica inicial** (plan demo) o crea uno nuevo.
3. En el detalle del plan:
   - **Asignar jugadores** (estado: asignado / en curso / completado…).
   - Ver **cumplimiento** por ejercicio (qué sesiones ya tocaron cada ejercicio).
   - **+ Agregar ejercicio**, o **Editar** / **Borrar** los existentes.
4. Cada ejercicio puede ligarse a un objetivo del catálogo y llevar criterio de éxito.

Flujo recomendado:

1. Definir objetivos.
2. Armar plan con 3–6 ejercicios.
3. Asignar jugadores.
4. Al crear sesiones tipo **Entrenamiento**, elegir plan + ejercicio (así el cumplimiento se llena solo).

---

## 6. Grabar (o traer) un video y crear la sesión

En cancha: graba con el celular (horizontal si puedes). Luego:

1. `/tecnico` → **+ Nueva sesión** (`/tecnico/nueva`).
2. Elige **jugador**.
3. Elige **tipo**:
   - **Video libre** — análisis general.
   - **Entrenamiento** — pide plan y ejercicio (recomendado si hay plan asignado).
   - **Partido / competencia** — rival, competencia, marcador.
   - **Evaluación** — sesión más formal de chequeo.
4. Título y notas opcionales.
5. Selecciona el archivo de video (hasta ~2 GB).
6. Espera la barra de progreso y confirma. Te lleva a la sesión creada.

Sin video también se puede crear la sesión (según el flujo de la pantalla); con video es el caso normal del piloto.

---

## 7. Analizar: marcar golpes en el video

En `/tecnico/sesiones/[id]`:

1. Reproduce el video (usa la copia optimizada si existe; si no, el original).
2. Opcional: **Optimizar video** (solo útil en el PC con FFmpeg local).
3. Para marcar un evento:
   - Pausa en el instante.
   - Elige **golpe**: SER, DER, REV, BLQ, ERR.
   - Elige **zona de mesa** 1–9.
   - Elige **resultado**: punto ganado / perdido / en juego.
   - Guarda el evento (aparece en la línea de tiempo / lista).
4. Puedes **editar** o **borrar** un evento si te equivocaste.
5. Mira las stats en vivo de esa sesión (totales, efectividad, por golpe).
6. **Export CSV** de eventos o **Export PDF** del informe de sesión cuando quieras.

Consejo de ritmo: no marques cada pelota del peloteo; marca momentos útiles (errores, cambios de ritmo, servicios clave, 1–2 minutos representativos).

---

## 8. Evaluar la sesión (y publicar)

En la misma pantalla de sesión, bloque de evaluación:

1. Escribe un **resumen** corto (“Buen control de derecha; servicio corto aún inestable”).
2. Agrega ítems de objetivos: estado `pendiente` / `en_progreso` / `logrado` / `no_logrado` + comentario.
3. **Guardar borrador** si aún no quieres que lo vea el jugador.
4. **Publicar** cuando la evaluación esté lista: la sesión queda **publicada** y el jugador puede verla.

Sin publicar, el jugador no ve esa sesión/evaluación.

---

## 9. Preguntar al asesor IA

1. Abre el **historial** del jugador (`/tecnico/jugadores/[id]`).
2. Baja hasta **Asesor técnico IA**.
3. Usa una sugerencia rápida o escribe tu pregunta, por ejemplo:
   - “Prioriza 3 focos para las próximas 2 semanas.”
   - “Compara este mes con el anterior.”
4. Lee la respuesta como **sugerencia**, no como veredicto. Tú decides.

Requisitos:

- `OPENAI_API_KEY` configurada en el entorno.
- Cuota: 5 consultas / 5 min y 30 / día (por seguridad/costo).

---

## 10. Recorrido completo de ejemplo (simulación)

Escenario: el admin llega el lunes, revisa el piloto y deja trabajo para Matías.

| Paso | Acción | Pantalla |
|------|--------|----------|
| 1 | Login Spinhouse | `/login` |
| 2 | Abre **Perfil técnico** | `/tecnico` |
| 3 | Mira KPIs y alertas; ve actividad de Matías/Valentina (datos 152/153) | `/tecnico` |
| 3b | (Opcional) **Marcador en vivo**: crea Matías vs Valentina y suma puntos | `/tecnico/marcador` |
| 4 | Entra al historial de Matías: efectividad, mes vs mes, gráficos | `/tecnico/jugadores/...` |
| 5 | **Cara a cara** Matías vs Valentina, filtro último mes | `/tecnico/comparar` |
| 6 | Revisa **Objetivos**; si falta uno de táctica, lo agrega | `/tecnico/objetivos` |
| 7 | Abre plan **Base técnica inicial**, confirma asignación y ejercicios | `/tecnico/planes/...` |
| 8 | En cancha graba 8–10 min de peloteo a Matías | (celular) |
| 9 | **+ Nueva sesión** → Entrenamiento → plan + ejercicio → sube video | `/tecnico/nueva` |
| 10 | Marca ~20 eventos útiles (golpes, zonas, resultados) | `/tecnico/sesiones/...` |
| 11 | Evalúa objetivos, escribe resumen, **Publica** | misma sesión |
| 12 | Vuelve al historial y pregunta a la IA 1–2 focos de la semana | historial |
| 13 | Exporta PDF si quiere mandarlo al apoderado o archivar | historial / sesión |

Con los seeds 152/153 los pasos 3–7 ya se pueden hacer **sin subir video**. Los pasos 8–11 son el circuito real con cámara.

---

## 11. Checklist rápido del profe

- [ ] Entré a **Perfil técnico**
- [ ] Revisé alertas de plan
- [ ] Abrí historial del jugador (stats + mes vs mes)
- [ ] Comparé si hace falta (cara a cara)
- [ ] Objetivos del catálogo al día
- [ ] Plan asignado y ejercicios claros
- [ ] Sesión creada (con video si hay)
- [ ] Eventos marcados y corregidos
- [ ] Evaluación publicada
- [ ] (Opcional) Asesor IA + PDF

---

## 12. Problemas frecuentes

| Situación | Qué hacer |
|-----------|-----------|
| No aparece **Perfil técnico** en el menú | El club no tiene el módulo `tecnico` (solo Spinhouse en el piloto). |
| El jugador no ve la sesión | Hay que **publicar** la evaluación/sesión. |
| El video no se oye/ve fluido | Es el original pesado; optimizar solo en PC local por ahora. |
| Falló la optimización | Reintentar en el PC con FFmpeg + `npm run dev`, o seguir con el original. |
| La IA no responde | Revisar `OPENAI_API_KEY` y la cuota diaria. |
| No hay datos en gráficos | Aplicar migraciones 152 y 153, o crear sesiones reales. |

---

## Continuidad

- Plan técnico: `docs/plan-modulo-tecnico-video-estadisticas.md`
- Marcador: `docs/marcador-en-vivo-avance.md`
- Propuesta comercial: `docs/propuesta-comercial-spinhouse-avance.md`

Este manual es el de **uso operativo** para admin/profesor del piloto.
