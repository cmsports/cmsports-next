# Auditoría de lo entregado a Spinhouse

Revisión de las migraciones 226–230 y sus pantallas, hecha después de que las
tres partes estuvieran aplicadas y funcionando. Busca fallas, no confirmaciones.

Todo lo que sigue está verificado leyendo el código, no de memoria. Lo que no
pude comprobar está marcado como tal.

---

## Resumen

| # | Hallazgo | Severidad |
|---|---|---|
| 1 | Créditos de recuperación ilimitados cancelando fechas lejanas | **Alta** — ✅ migración 231 |
| 2 | Cancelar un día suspendido regala un crédito | **Alta** — ✅ migración 231 |
| 3 | El alumno y el profe ven saldos distintos | Media — ✅ migración 231 |
| 4 | `asignar_recuperacion_dia` no mira el saldo | Media — pendiente |
| 5 | La política admin de asistencia de profes no acota al club | Baja — pendiente |
| 6 | Un alumno puede opinar de un profe que no es suyo | Baja — pendiente |
| 7 | `PanelRecuperaciones` lee toda la historia sin cota | Baja — ✅ migración 231 |
| 8 | Las horas del mes se recalculan con el horario de hoy | Baja — pendiente |
| 9 | Los bloques de Spinhouse dicen "Buin" | Cosmética — pendiente |

**Resueltos** en `231_recuperaciones_caducan_y_feriados.sql`: los créditos ahora
caducan a los **30 días** de la fecha de la clase perdida, la app se lo dice al
alumno, el feriado ya no da crédito, solo se puede avisar por las próximas dos
semanas, y el saldo se calcula en un único lugar (`saldos_recuperacion()`) que
las dos pantallas consultan.

Ninguna compromete el anonimato del feedback, que era el riesgo grave. Ese
quedó bien y verificado en pantalla.

---

## 1. Créditos ilimitados cancelando fechas lejanas — **Alta**

`cancelar_bloque_dia` (migración 226) valida que la fecha caiga en el día de la
semana del bloque, pero **no valida que esté dentro de un horizonte razonable**
ni que el bloque siga vigente en esa fecha.

Cancelar el martes 2 de marzo de **2027** pasa todos los guardias y sale con
`con_derecho = true`, porque faltan más de 24 horas. La restricción única es
`(bloque, jugador, fecha)`, así que cada fecha futura distinta suma un crédito
más. No hay techo.

Se hace llamando la RPC directo; la pantalla solo ofrece dos semanas.

**Mitigante:** `asignar_recuperacion_dia` no consulta el saldo (ver hallazgo 4),
así que un saldo inflado **engaña al profe pero no otorga clases solo**. El daño
es que el profe vea "12 por recuperar" y lo crea.

**Arreglo:** acotar `p_fecha` en la función.

```sql
IF p_fecha < (now() AT TIME ZONE 'America/Santiago')::date
   OR p_fecha > (now() AT TIME ZONE 'America/Santiago')::date + 14 THEN
  RAISE EXCEPTION 'Solo se puede avisar por las clases de las próximas dos semanas';
END IF;
```

---

## 2. Cancelar un día suspendido regala un crédito — **Alta**

La misma función **no consulta `bloque_excepciones`**. Si el 18 de septiembre
está marcado sin clases y el alumno cancela ese día con más de 24 horas, se
lleva el derecho a recuperar una clase que nunca iba a existir.

La pantalla del alumno sí excluye las fechas suspendidas (`ocurrencias()` recibe
`excluir`), así que no se llega por la interfaz. Pero la regla del propio repo es
que **la pantalla no es el guardia** — está escrita así en `actions/asistencia.ts`
a propósito de este mismo tipo de agujero.

**Arreglo:**

```sql
IF EXISTS (SELECT 1 FROM bloque_excepciones e
           WHERE e.bloque_id = p_bloque_id AND e.fecha = p_fecha) THEN
  RAISE EXCEPTION 'Ese día no hay clases, no hay nada que avisar';
END IF;
```

---

## 3. El alumno y el profe ven saldos distintos — **Media**

`PanelRecuperarClases.tsx:87` pide los movimientos con
`.gte('fecha', sumarDias(hoy, -DIAS_VENTANA))` — solo los últimos 14 días.
`PanelRecuperaciones.tsx:76` los pide **todos**, sin filtro de fecha.

Consecuencia: un crédito ganado hace 20 días **existe para el profe y desapareció
para el alumno**. Y como la sección "Dónde podés recuperar" solo se muestra con
`saldo > 0`, el alumno pierde el acceso a su propio derecho sin que nada se lo
diga.

Es el peor de los tres primeros en términos de confianza: le sacamos en silencio
algo que le prometimos.

**Arreglo:** decidir primero la regla de negocio — ¿los créditos caducan? Si no
caducan, sacar el filtro del panel del alumno. Si caducan a los 30 días, que
caduquen **en la base** y que las dos pantallas lean lo mismo. Hoy la caducidad
es un accidente de una consulta, no una decisión.

---

## 4. `asignar_recuperacion_dia` no mira el saldo — **Media**

La función valida cupo, club, día y que el alumno no esté ya inscrito, pero **no
comprueba que tenga derecho a recuperar**. El profe puede asignar una
recuperación a alguien que nunca canceló nada.

Puede ser deliberado —el profe manda— pero **no está escrito en ninguna parte**,
y el panel muestra el saldo como si fuera vinculante ("sin saldo" en gris). Un
lector futuro no puede saber si falta un guardia o si es a propósito.

**Arreglo:** o se agrega el guardia, o se agrega el comentario que diga que el
profe puede pasar por encima. Cualquiera de las dos, pero que quede dicho.

---

## 5. La política admin de asistencia de profes no acota al club — **Baja**

En la migración 227, `asis_profes_propia` (la del profesor) comprueba que el
bloque sea de su club. `asis_profes_admin` **no comprueba ni el bloque ni el
profesor**: solo que `club_id` sea el suyo.

Un admin podría insertar, vía API, una fila con `profesor_id` de otro club
etiquetada con el propio. No expone datos ajenos —el club_id manda en las
lecturas— pero ensucia el reporte de horas con un id que no resuelve a ningún
nombre.

**Arreglo:** copiar el `EXISTS` de la política del profesor a la del admin, y
agregar el equivalente para `profesor_id`.

---

## 6. Un alumno puede opinar de un profe que no es suyo — **Baja**

La RLS de `feedback_profesores` (migración 228) valida que el profesor sea del
club, pero no que le haga clases al alumno. `PanelFeedbackAlProfe` sí filtra por
los bloques del alumno, así que por pantalla no se llega.

Mismo patrón que el hallazgo 2: la pantalla filtra, la base no. Menor porque el
daño es un comentario mal dirigido, no un derecho ganado.

---

## 7. `PanelRecuperaciones` lee toda la historia sin cota — **Baja**

`PanelRecuperaciones.tsx:74-76` trae **todos** los `bloque_cupos_dia` del club,
de toda la historia, en cada carga de pantalla. Hoy son 20 filas. En un año de
uso con 50 alumnos son varios miles, y se descargan enteras para mostrar un día.

El comentario del código explica por qué no se filtra por fecha (el saldo se
cuenta sobre toda la historia), y es una razón válida — pero entonces el saldo
debería calcularlo la base y devolver un número, como ya hace
`cupos_libres_por_dia`.

---

## 8. Las horas del mes se recalculan con el horario de hoy — **Baja**

`PanelAsistenciaProfes` calcula las horas de agosto uniendo cada marca con el
`hora_inicio`/`hora_fin` **actual** del bloque. Si en octubre se cambia el
horario de un bloque, agosto cambia retroactivamente.

`reportesMes.ts` tiene el mismo comportamiento, así que es consistente con lo que
ya había. Pero si esas horas se usan para pagar sueldos, un mes cerrado no
debería moverse — es la misma regla que el CLAUDE.md fija para la plata.

**Arreglo si importa:** guardar los minutos en la fila de
`asistencia_profesores` al marcar.

---

## 9. Los bloques de Spinhouse dicen "Buin" — **Cosmética**

`bloques_horario.sede` tiene un CHECK que solo acepta `'buin'` y `'paine'`
(migración 073). Los bloques de Spinhouse quedaron con `'buin'` y la pantalla los
rotula "Buin (Aníbal Pinto 158)".

Ya está documentado en la cabecera de la migración 229. El arreglo de fondo es
`club_config` (`docs/plan-aislamiento-clubes.md`), que no está implementado.

---

## Lo que sí quedó bien

No todo es hallazgo. Vale registrar lo que aguantó la revisión:

- **El anonimato.** La decisión de no darle la tabla al staff y servir por
  función es correcta, y es lo único que hacía imposible el filtrado de nombres.
  Verificado en pantalla: 10 anónimos, ninguno con autor.
- **`con_derecho` calculado en la base.** Si viniera del cliente, el alumno se
  lo pondría solo. Es el guardia bien puesto.
- **`cupos_libres_por_dia` devuelve un número, no una lista.** Preserva lo que
  cerró la migración 101.
- **Borrar feedback por función y no por política.** El `DELETE ... RETURNING`
  habría sido una fuga silenciosa.
- **Las tres tablas publicadas en realtime**, verificado por consulta.
- **Aislamiento por módulo**, verificado: los tres módulos solo en Spinhouse.

## Qué no está probado

- **Nada del lado del jugador** se ejercitó en la app: cancelar, deshacer, ver
  la grilla de recuperación. Es la mitad de la parte 1.
- **Ninguna de las funciones SQL tiene prueba automatizada.** Lo que está
  cubierto por tests es la aritmética en TypeScript (`cuposDia`,
  `horasProfesor`), no las RPC, que es donde están los hallazgos 1, 2, 4 y 5.
- **Los tres bugs que llegaron a producción** (`tipo_plan`, `date + bigint`,
  `id` ambiguo) los habría atajado correr el SQL una vez antes de entregarlo.
  Ninguno se veía leyendo.
