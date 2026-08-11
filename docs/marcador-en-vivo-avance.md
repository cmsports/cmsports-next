# Avance — Marcador en vivo (perfil técnico)

**Última actualización:** 2026-08-11

## Hecho

- Migración `154_tecnico_marcador_partidos.sql` — aplicada.
- Migración **`158_marcador_sets_tiempo.sql`**: `historial_sets`, `timer_modo`, `timer_limite_segundos` (pegar en SQL Editor si falta; idempotente con 157).
- Migración **`159_marcador_sorteo_lados.sql`**: sorteo, saque inicial, posición física y cambios de lado.
- Lógica: `src/lib/tecnico/marcador.ts` (+ tests).
- UI tablet `/tecnico/marcador/[id]`:
  - Mesa 3D proporcionada, arena oscura y botones ± notorios.
  - Paneles oscuros legibles en cualquier tema.
  - Sorteo destacado antes de la mesa; no permite comenzar sin registrarlo.
  - Servicio visible y alternado cada 2 puntos (cada punto desde 10-10); alterna el primer servidor por set.
  - Cambio automático de lado al terminar cada set y a los 5 puntos del set decisivo.
  - Config de tiempo (cronómetro / cuenta atrás) en preparación.
  - Tabla **Sets jugados** (`historial_sets`).
  - **Registro del partido** (`tecnico_partido_eventos`: puntos, tarjetas, challenges, pausas).
- Lista/crear: `/tecnico/marcador` con opción de tiempo y borrado confirmado de partidos recientes.

## Pendiente del usuario

1. Ejecutar migraciones **158** y **159** en Supabase SQL Editor.
2. Probar partido completo: puntos → cierre de set → tarjetas → registro abajo.

## Backlog opcional

- Nav lateral dedicado, dobles, vincular a sesión técnica, export PDF.

## Cómo continuar en otro chat

> Seguir marcador desde `docs/marcador-en-vivo-avance.md`. Rutas `/tecnico/marcador*`, migraciones 158 y 159.
