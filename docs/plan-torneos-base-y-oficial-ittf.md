# Torneos: club vs. oficial ITTF

## Dos pistas separadas

| | Torneos club (interno/externo) | Torneo oficial |
|---|---|---|
| Ruta | `/torneos`, `/torneos-internos` | `/torneo-oficial` |
| Módulo | `torneos` | `torneo_oficial` |
| Resultado | Solo ganador | Sets obligatorios |
| Puntos grupo | 2/0 | ITTF 2/1/0 |
| Desempate | H2H o manual | Ratio juegos → ratio puntos |
| Llaves | Sí (club) | Sí (1° vs 2° otro grupo) |

## Torneo oficial — flujo

1. **Campeonato** → uno o más **eventos** (categoría/género)
2. **Inscripción** → cabezas opcionales → **formar grupos** (~3 jugadores)
3. Resultados con sets o **marcador en vivo**
4. **Llaves** se sincronizan solas al cerrar grupos (o manual)
5. **Programación** de mesas desde el campeonato
6. **PDF**: grupos, llaves, programa del día

## Migraciones Supabase (manual)

| # | Archivo |
|---|---------|
| 156 | `156_modulo_torneo_oficial.sql` — tablas |
| 157 | Demo club + técnico (requiere 154) |
| 158 | Índice llaves + config mesas |
| 159 | Solo activar módulo en Club Demostración |
| 160 | 3er lugar + RPC drag cupos oficial |
| 161 | RPC corregir playoff oficial (atómico) |

## Club Demostración TDM

`club_id = 0884dbef-798d-4ce3-9e7a-deace0b4aa95`

Si el sidebar no muestra «Torneo oficial», pegar migración **159** o activar `torneo_oficial` en superadmin.

## Estado actual (agosto 2026)

- ✅ Partido por 3.er lugar en torneo oficial:
  - Se crea al cerrar ambas semifinales.
  - Guarda ganador como `tercer_inscrito_id`.
  - Se muestra en UI como 🥉.
- ✅ Intercambio de cupos (drag) en llaves oficiales:
  - Solo ronda inicial.
  - Bloquea llaves ya jugadas.
  - RPC: `intercambiar_cupos_oficial_seguro`.
- ✅ Fallback en detalle de campeonato si falta migración 158:
  - El campeonato se muestra igual con defaults de programación.
  - Mensaje explícito cuando falte aplicar 158/160/161.
- ✅ Recarga silenciosa en pantallas oficiales (`cachedFetch` + sin spinner si ya hay datos).
- ✅ RPC atómico `corregir_resultado_playoff_oficial_seguro` (migración 161).

## Pendiente futuro

- Export Excel estilo Koidan
