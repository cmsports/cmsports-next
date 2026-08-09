# Migraciones que borran datos

Reglas obligatorias para cualquier migración con `DELETE`, `TRUNCATE` o `DROP`
sobre datos de un club en producción.

El origen de este documento es concreto: la migración
`089_arranque_limpio_buin.sql` borró plata real de Asociación Buin y Paine
—entre ella un ingreso de $3.191.300— creyendo que borraba datos de prueba. Se
recuperó de milagro, porque `audit_log` guardaba el monto de cada movimiento
creado a mano. Las reglas de abajo son las cosas que fallaron ahí.

## 0. Toda migración se registra al empezar

Las migraciones de este proyecto se ejecutan a mano en el SQL Editor de
Supabase, así que nada impide pegar dos veces el mismo archivo. Eso es
exactamente lo que pasó con la 089. La migración `128_registro_de_migraciones`
agrega el portazo que faltaba.

Toda migración nueva empieza así:

```sql
BEGIN;
SELECT _migracion_nueva('125_nombre_del_archivo');
-- ... el resto ...
COMMIT;
```

Si ya se aplicó, esa línea lanza una excepción, la transacción se aborta entera
y no corre nada de lo que viene abajo. Sin esa línea, la migración no tiene
ninguna protección contra repetirse.

Para saber qué se aplicó y cuándo:

```sql
SELECT * FROM _migraciones_aplicadas ORDER BY aplicada_en DESC;
```

## 0.b Nada de tablas temporales

`CREATE TEMP TABLE` no sirve en el SQL Editor de Supabase. La tabla se suelta
en el `COMMIT` (o antes, si el pooler manda alguna sentencia por otra
conexión), así que cualquier consulta que la use después falla con:

```
ERROR: 42P01: la relación "_loquesea" no existe
```

Pasó con la `141_borrar_cuentas_fantasma_buin`: el borrado se aplicó completo
y bien, pero las consultas de verificación del final reventaron y por un rato
pareció que la migración había fallado. Peor caso posible en una migración
destructiva: no saber si borró o no.

Cuando haga falta juntar filas una vez y usarlas en varios pasos, esa lista es
el respaldo. Se crea como tabla normal —con nombre único, ver el punto 1— y
todo lo demás sale de ahí:

```sql
CREATE TABLE _respaldo_x_20260809 AS
SELECT ... WHERE <la condición, escrita UNA vez>;

DELETE FROM tabla WHERE id IN (SELECT id FROM _respaldo_x_20260809);
```

Así el respaldo y el borrado no pueden desalinearse, y las verificaciones del
final siguen teniendo de dónde leer.

## 1. El respaldo lleva nombre único por corrida

**Nunca** `CREATE TABLE IF NOT EXISTS _respaldo_x`.

Si la migración se corre una segunda vez, la tabla ya existe, `IF NOT EXISTS`
no hace nada, y el `DELETE` de más abajo se ejecuta igual: la segunda pasada
borra sin ninguna copia. Eso fue exactamente lo que pasó con Buin, y es la
razón por la que no hubo respaldo de lo del 28 y 29 de julio.

```sql
-- MAL: la segunda corrida no respalda, pero borra igual.
CREATE TABLE IF NOT EXISTS _respaldo_movimientos_089 AS
SELECT * FROM movimientos WHERE club_id = '...';

-- BIEN: si ya existe, la migración se cae antes de borrar nada.
CREATE TABLE _respaldo_movimientos_089_20260728 AS
SELECT * FROM movimientos WHERE club_id = '...';
```

Sin `IF NOT EXISTS`, el segundo intento falla con "relation already exists" y
aborta la transacción completa. El error es la protección.

## 2. La condición de borrado se prueba antes con un SELECT

Todo `DELETE` va precedido del mismo `WHERE` como `SELECT count(*)`, y ese
número se compara contra lo que la migración dice que va a borrar.

La 089 prometía en su comentario que "los movimientos que NO vienen de una
mensualidad no se borran", pero incluía `mes_correspondiente IS NOT NULL` en el
`WHERE` — que barre con sueldos e ingresos manuales. Un `count(*)` previo
habría mostrado 50 filas donde el comentario esperaba 45.

Si el número no calza con lo esperado, la condición está mal escrita: se
corrige la condición, no el comentario.

## 3. Se confirma que los datos son de prueba, no se asume

La 089 arrancaba con "lo que había era de las pruebas previas al lanzamiento".
Era falso: al club se le había entregado la plataforma el 27 de julio de 2026 y
llevaba dos días cargando datos reales.

Antes de escribir un reseteo hay que mirar las fechas de lo que se va a borrar
y preguntarle al club si esa data es suya. Una migración de limpieza que se
escribe el mismo día que el club está trabajando en la plataforma es una
migración que va a borrar producción.

## Antes de correrla, la lista corta

- [ ] Empieza con `SELECT _migracion_nueva('NNN_nombre');` después del `BEGIN`.
- [ ] El respaldo tiene nombre único y sin `IF NOT EXISTS`.
- [ ] Corrí el `SELECT count(*)` con el mismo `WHERE` y el número calza.
- [ ] Confirmé con el club que esos datos son descartables.
- [ ] Está en una sola transacción (`BEGIN` / `COMMIT`).
- [ ] Al final hay una consulta de verificación.
- [ ] Anoté en el encabezado la fecha en que se corrió.

## Después de correrla

Agrega al encabezado del archivo una guarda que impida repetirla, como la de
`089_arranque_limpio_buin.sql`:

```sql
DO $$
BEGIN
  RAISE EXCEPTION 'Migración NNN anulada: ya se ejecutó. No repetir.';
END $$;
```

Una migración destructiva que ya cumplió su función es una bomba esperando a
que alguien la re-ejecute buscando "dejar la base como estaba".
