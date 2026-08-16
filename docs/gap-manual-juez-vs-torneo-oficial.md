# Gap: Manual Juez General vs Torneo Oficial

**Estado:** zonal para Coydán (grupos + llaves + pre-llave + mural) en código (2026-08-16). Pegar migraciones antes de demo.  
**Avance operativo:** `docs/avance-manual-juez-oficial.md`

## Fuentes

| Fuente | Ruta |
|--------|------|
| Manual primario (Juez General / ITTF) | `C:\Users\Marcela Sandoval\Downloads\MANUAL TORNEOS\Manual J.General 2021.pdf` |
| Excel compañero (Koidan, 22 hojas) | `C:\Users\Marcela Sandoval\Downloads\MANUAL TORNEOS\DesarrolloTorneo 2da Fecha Individual Sub19 MET2 2026.xlsx` |
| Plan módulo oficial | `docs/plan-torneos-base-y-oficial-ittf.md` |
| Avance UX + marcador | `docs/avance-torneo-oficial-ux-marcador.md` |
| Avance este corte | `docs/avance-manual-juez-oficial.md` |

## Club vs oficial (no mezclar)

| | Torneos club | Torneo oficial |
|--|--------------|----------------|
| Manual | `MANUAL-TORNEOS-REGLAS-Y-USO.md` | PDF Juez General + Excel Koidan |
| Rutas | `/torneos`, `/torneos-internos` | `/torneo-oficial` |
| Resultado | Solo ganador | Sets y/o marcador en vivo |
| Puntos grupo | 2 / 0 | 2 / 1 / 0 (ITTF) |
| Desempate | H2H o manual | pts → ratio juegos → ratio puntos |
| Pagos / vivo público | Sí | Programa mural `/torneo-oficial/vivo/CODIGO` (sin pagos) |
| Migraciones | — | 156–161, 179, **180**, **181**, **194**, **195** |

## Qué ya cubre el módulo oficial

- Campeonato multi-evento; inscripción; siembra; puntos ITTF; sets; BYE; llaves; programa; PDF; bridge marcador (179)
- **Grupos §2.2:** `calcularNumGruposOficial` = `floor(N/3)` → tamaños 3–4 (evita grupos de 2; N=40 → 13 grupos)
- **Cierre Jugado / W.O. / Retiro** con sets parciales + sintéticos 11-0 (§2.3.6–2.3.7)
- **Motivo + alcance** (partido / evento / campeonato) en W.O./retiro
- **Editor de programa** mesa/hora + alerta conflictos
- **Export Excel** Prog + GRP + Sorteo
- **Orden de juego ITTF/Koidan** grupos 3 y 4
- **Bitácora sanciones** (manual + sync desde tarjetas del marcador al cerrar)
- **Sorteo 2ª fase** configurable: fijo / sorteo de 2.os / serpiente (§3.7)
- **Resumen de siembra** (tamaño llave, BYEs, fase inicial; previas = grupos)
- **Panel conflictos multi-evento** en campeonato (mismo `jugador_id` o mesa, §4.3)
- **Numeración ITTF** `numero_ittf` en programa / Excel / PDF (§4.5)
- **Árbitro** texto libre por partido (`arbitro_nombre`)

- **Programa por grupo** (ola ~70 min en una mesa) y **día por evento** (sáb/dom)
- **PDF mural** grilla hora × mesa (además de la lista)
- **Importar lista** CSV/xlsx en inscripción
- **Pre-llave (`avance`)** si 2×grupos no cabe en `tamano_cuadro`
- **Vivo público** `/torneo-oficial/vivo/[codigo]`

## Gaps priorizados

### Must-have

| # | Ítem | Estado |
|---|------|--------|
| 1 | Retiro / partido incompleto (sets parciales) | ✅ hecho |
| 2 | Sanciones a nivel torneo (bitácora) | ✅ hecho (sync al cerrar marcador; carga manual) |
| 3 | Flujo ausencia: motivo + alcance | ✅ hecho |
| 4 | Orden de juego ITTF grupos 3/4 | ✅ hecho |
| 5 | Editor fino programa + conflictos | ✅ hecho |
| 6 | Export Excel estilo Koidan | ✅ hecho (Prog/GRP/Sorteo; no clona las 22 hojas) |

### Nice-to-have

| Ítem | Estado |
|------|--------|
| Sorteo/siembra formal (posiciones, BYEs, resumen) | ✅ hecho (sobre motor de llaves existente) |
| Sorteo 2ª fase configurable | ✅ hecho (`modo_sorteo_llave`) |
| Panel conflictos multi-evento campeonato | ✅ hecho |
| Numeración ITTF | ✅ hecho |
| Árbitros básicos | ✅ hecho (texto; sin catálogo) |
| Lucky loser / clasificatorias aparte | ✅ cubierto como pre-llave `avance` cuando el cuadro es chico; cut lucky-loser sigue deferred |
| Botón «Retiro» en tablet técnico | ⏸ deferred (retiro desde UI oficial Sets) |

### Later

- Equipos; doble eliminación; PTM/para; raquetas/TV/delegados; calificación JG; catálogo de árbitros

## Migraciones a pegar (SQL Editor)

1. `supabase/migrations/179_oficial_marcador_tecnico_fk.sql` — si aún no está  
2. `supabase/migrations/180_oficial_cierre_sanciones_programa.sql` — tipo_cierre, motivo, alcance, `oficial_sanciones` + realtime  
3. **`supabase/migrations/181_oficial_sorteo_numero_arbitro.sql`** — `modo_sorteo_llave`, `numero_ittf`, `arbitro_nombre`
4. **`supabase/migrations/194_club_juez_met2.sql`** — club Juez MET2 Costa (no Buin)
5. **`supabase/migrations/195_oficial_zonal_programa_y_publico.sql`** — día, bloque grupo, especiales, código público, RPC mural

## Cómo continuar

```
Seguir desde docs/avance-manual-juez-oficial.md
Operacional: pegar 179 (si falta) + 180 + 181
Opcional: retiro desde tablet técnico
Deferred: lucky loser; catálogo árbitros; equipos/PTM/doble elim
```
