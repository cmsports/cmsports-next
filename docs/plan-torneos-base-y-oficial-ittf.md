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

## Club Demostración TDM

`club_id = 0884dbef-798d-4ce3-9e7a-deace0b4aa95`

Si el sidebar no muestra «Torneo oficial», pegar migración **159** o activar `torneo_oficial` en superadmin.

## Pendiente futuro

- Partido por 3.er lugar
- Export Excel estilo Koidan
- Intercambio de cupos en llaves (drag)
- RPC atómico para corregir playoff (como club `corregir_resultado_playoff_seguro`)
