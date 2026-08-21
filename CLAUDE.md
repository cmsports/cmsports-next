# cmsports-next

Sistema de gestión para clubes y asociaciones deportivas (tenis de mesa).
Next.js + Supabase. En producción desde el 1 de agosto de 2026.

## Migraciones — leer antes de escribir una

Las migraciones **se ejecutan a mano**, pegándolas en el SQL Editor de Supabase.
No hay `supabase db push` ni runner automático. Eso significa que nada impide
pegar dos veces el mismo archivo, y una migración destructiva repetida vuelve a
destruir.

**Toda migración nueva empieza con el portazo:**

```sql
BEGIN;
SELECT _migracion_nueva('125_nombre_del_archivo');
-- ... el resto ...
COMMIT;
```

Si ya se aplicó, esa línea lanza una excepción y aborta la transacción entera,
sin ejecutar nada de lo que viene abajo.

Antes de escribir cualquier migración con `DELETE`, `TRUNCATE` o `DROP`, leer
**`docs/migraciones-destructivas.md`**. Las reglas de ahí no son teóricas: el
2026-08-05 se descubrió que `089_arranque_limpio_buin.sql` se había ejecutado
dos veces y había destruido datos reales de producción —161 movimientos de
mensualidad, un ingreso de $3.191.300 y dos sueldos— porque su respaldo usaba
`CREATE TABLE IF NOT EXISTS` y la segunda pasada no respaldó nada mientras el
`DELETE` corría igual. Se recuperó solo porque `audit_log` guardaba el monto de
cada movimiento al crearlo.

Migraciones anuladas que **nunca** deben re-ejecutarse (tienen guarda, no
quitarla): `089_arranque_limpio_buin`, `060_limpiar_jugadores_externos`,
`081_baja_jugadores_retirados`.

## Reglas de datos

- **Fechas: siempre hora de Chile.** `current_date` y `toISOString()` dan UTC y
  descuadran el día. Usar `fechaChile()` en TS y
  `(now() AT TIME ZONE 'America/Santiago')::date` en SQL.
- **La plata de un mes cerrado no cambia.** Borrar un jugador no borra sus
  movimientos: `eliminar_jugador_atomico` los deja con `jugador_id = NULL`
  (migración 127). No revertir eso.
- **Toda operación financiera pasa por su RPC atómico** (`registrar_pago_*`,
  `registrar_movimiento_financiero_atomico`). Nunca insertar en `movimientos`
  desde el cliente: los RPC dejan el rastro en `audit_log` que ya salvó la
  recuperación de julio.
- **Asistencia:** la tabla guarda faltas, así que toda consulta nueva filtra
  `estado = 'presente'`.
- **Inscripciones a bloques: la tabla guarda las cerradas.** `bloque_jugadores`
  no borra la fila cuando alguien cambia de grupo, le pone `vigente_hasta`. Toda
  consulta que quiera "en qué grupos está hoy" lleva `.is('vigente_hasta',
  null)`. El olvido **no falla**: la consulta sin filtro es SQL válido, no da
  error y pinta una etiqueta plausible; solo lo detecta alguien que conozca al
  jugador. El 2026-08-20 el filtro por grupo del módulo de feedback salió sin
  ese filtro y 19 jugadores aparecían en grupos que ya habían dejado. Modelos
  correctos: `dashboard-profesor`, `PanelCupos`, `jugadores/[id]`, `mi-horario`.
  Solo el historial usa la tabla cruda a propósito (`PanelReportes`,
  `lib/supabase/historial.ts`, y `AsistenciaPanel` con su rango de fechas).
- **Bloques son la fuente de verdad** de días y sede; no tocar `entrena_*` ni
  `sede` a mano.

## Frontend

- Toda pantalla nueva usa `useEnVivo` para refrescarse sola, y `cachedFetch`
  declarando las tablas que consume. Sin eso, muestra datos viejos.
- **Y la tabla que escuche tiene que estar en `supabase_realtime`.** Suscribirse
  a una que no está no da error: se conecta, queda escuchando y no llega nada
  nunca. Mordió dos veces —la 121 y la 142— y la segunda dejó a `movimientos`,
  `perfiles` y `credencial_visible` mudas: se cobraba una clase extra y
  Finanzas no se enteraba, se creaba una cuenta y el informe de credenciales no
  la mostraba. Para ver qué está publicado hoy:

  ```sql
  SELECT tablename FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' ORDER BY tablename;
  ```
- Español en toda la interfaz.

## Alcance

Salvo que se indique lo contrario, los cambios son para **Asociación TDM Buin y
Paine** (`club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'`). Hay otros clubes
en la misma base —Demostración TDM, Unión San Bernardo, Paine— y toda consulta
o migración debe filtrar por club: varias consultas de diagnóstico sin ese
filtro ya causaron confusión sumando plata de clubes ajenos.

### Declarar el club antes de tocar nada

Se vienen clubes nuevos que **funcionan distinto** —otra forma de tomar
asistencia, Khipu, reglas propias—. Buin es el único con plata y gente real, así
que el riesgo ya no es que un club vea los datos de otro (el RLS eso lo cubre:
148 de 171 políticas filtran por club), sino que **el trabajo hecho para un club
rompa a otro**.

Antes de escribir una migración, tocar un RPC de plata o modificar código
compartido, **decir a qué club apunta y esperar confirmación**:

```
Este cambio afecta a: Asociación TDM Buin y Paine (club en producción)
Toca: supabase/migrations/208_x.sql, src/lib/domain/asistencia.ts
¿Confirmas que va a ese club?
```

No aplica a cambios cosméticos ni a lo que es obviamente de un solo club por
contexto. Si pregunta por todo, deja de servir.

**Las diferencias entre clubes son dato, no código.** Nunca un `if (club_id ===
'ec1ef...')` en código compartido: eso ata a los tres clubes al mismo archivo. Si
algo no se puede expresar como configuración, va como módulo aparte. El plan
completo —incluido el portazo `_migracion_para_club()` y la tabla `club_config`—
está en `docs/plan-aislamiento-clubes.md`, y **todavía no está implementado**.
