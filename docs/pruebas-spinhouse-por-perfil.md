# Pruebas de Spinhouse, punto por punto del formulario

Cada prueba sale de una frase del formulario de Spinhouse (Cristhian Carrasco,
septiembre 2026) y dice **con qué perfil** se hace, **qué hacer** y **qué tiene
que pasar**. Marca cada casilla cuando la pruebes.

Se prueba lo que **hoy está en producción**: el trabajo de Luis (migraciones
293 a 298) más lo que ya existía de antes. Lo que todavía no está construido va
al final (sección 13), para que no lo busques.

**Perfiles:** 🛠️ Admin · 🏓 Profe · 🙋 Jugador · 🌐 Sin cuenta (vista pública)

---

## 0. Antes de empezar

### 0.1 Tres cuidados, porque Spinhouse es un club real

- [ ] **Todo lo de prueba lleva "PRUEBA" en el nombre** (jugadores, grupos,
  actividades, torneos). Así se encuentra fácil para borrarlo al final (sección 14).
- [ ] **No cierres una liquidación de entrenador** (sección 7.4, último paso).
  Al cerrarla queda un gasto en Finanzas que **la base no deja editar ni borrar
  nunca más**. Prueba todo hasta antes de ese botón.
- [ ] **No actives el bloqueo automático por deuda.** El reloj de 30 días se
  reinicia cuando se cargue el padrón real (acordado con Luis).

### 0.2 Mirar qué tiene encendido Spinhouse (solo lee, no cambia nada)

Desactiva la traducción del navegador en supabase.com y corre:

```sql
SELECT modulos_habilitados FROM clubes
WHERE id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41';
```

```sql
SELECT clave, valor FROM club_config
WHERE club_id = '2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41'
ORDER BY clave;
```

### 0.3 Módulos que tienen que estar encendidos

Se encienden desde el panel de superadmin → Spinhouse → módulos. Para estas
pruebas hacen falta:

| Módulo (como sale en pantalla) | Para qué sección |
|---|---|
| Cupos/bloques · Asistencia · Mensualidades · Finanzas · Calendario · Torneos | Todas |
| Mesas de la sede · Tipos de clase y entrenador auxiliar · Perfil técnico | 2 y 5 |
| Configuración avanzada del club | 2 |
| Planes de mensualidad | 2 |
| Perfil deportivo del jugador · Consentimientos y accesibilidad | 4 |
| Ficha paralímpica privada | 4.4 |
| Retención y morosidad · Avisos y automatización de retención | 6 |
| Altas, bajas y reingresos del club | 3.2 |
| Asistencia de profesores | 7 |
| Categorías de finanzas propias del club · Márgenes, liquidaciones y proyección de caja | 3.3 y 7 |
| Modalidades de torneo · Torneos por equipos | 8 |
| Exportación de partidos CSV y JSON | 10 |
| Agenda integrada y calendario público | 9 |

> Las migraciones de Luis ya encendieron los seis suyos (márgenes, retención
> automática, agenda integrada, ficha paralímpica, exportación, altas y bajas).
> Revisa los demás con la consulta de 0.2.

---

## 1. Crear los tres perfiles

**1.1 🛠️ Admin de prueba**
1. Entra con el admin actual de Spinhouse.
2. Menú → **Configuración** → sección **Administradores**.
3. Nombre: `Admin PRUEBA` · Correo: `prueba.admin.spinhouse@cmsports.cl` ·
   Contraseña inicial: la que quieras (mínimo 6).
4. **Crear administrador**.
- [x] Sales y entras con ese correo: llegas al **Dashboard** de Spinhouse.
  ✅ 2026-10-04 · quedó como `benjamin@spinhouse.cl`.

**1.2 🏓 Profe de prueba**
1. Con el Admin PRUEBA: **Configuración** → sección **Profesores**.
2. Nombre: `Profe PRUEBA` · Correo: `prueba.profe.spinhouse@cmsports.cl` ·
   Especialidad: vacía · Contraseña inicial: la que quieras.
3. **Crear profesor**.
- [x] Entras con ese correo y llegas al **Dashboard del profesor**.
  ✅ 2026-10-04 · quedó como `prueba.profe.spinhouse@cmports.cl` (sin la "s"
  de cmsports: así se escribió al crearlo, y así hay que entrar).
  Ojo: un correo que ya tiene cuenta no sirve. `bcardenasc@fen.uchile.cl` era
  una cuenta de jugador de julio, y el profe no se creó.

**1.3 🙋 Jugador de prueba**
1. Con el Admin PRUEBA: **Jugadores** → **Nuevo jugador**.
2. Nombre: `Jugador PRUEBA`. Ponle **fecha de nacimiento de un menor**, por
   ejemplo 2014-05-10, así sirve para probar lo del apoderado y la categoría
   por edad. Agrega un celular de 9 dígitos y el contacto de emergencia.
3. Guarda, abre su ficha y aprieta **Crear acceso**.
- [ ] La pantalla te muestra el **usuario y la contraseña** generados. Anótalos;
  también quedan en **Credenciales oficiales del club**.
- [ ] Entras con ese usuario y llegas a **Mi perfil**.

> Te conviene crear un **segundo jugador** (`Jugador PRUEBA 2`, adulto, sin
> acceso) para torneos y cupos: con uno solo no se arma ningún partido.

---

## 2. Dejar el club armado (🛠️ Admin)

**2.1 Configuración avanzada** — **Configuración** → **Configuración avanzada del club**.

| Grupo | Opción (como sale en pantalla) | Valor para probar |
|---|---|---|
| Cupos | Cómo se calcula el cupo de un bloque | Las mesas × jugadores por mesa |
| Cupos | Jugadores por mesa en clase grupal | 4 |
| Cupos | Jugadores por mesa en clase particular | 2 |
| Morosidad | Días de deuda antes de avisar | 15 (lo dejó la migración de Luis) |
| Morosidad | Días de deuda antes de bloquear la cuenta | 31 (lo dejó la migración de Luis) |
| Retención | Inasistencias seguidas antes de alertar | 3 |
| Retención | Días sin asistir ni pagar antes de marcar inactivo | 60 |

"Día del mes en que vence la cuota" y "Cómo se determina la cuota" se dejan
para cuando el club mande sus planes.

- [ ] Cada cambio se guarda y al recargar la página sigue ahí.
- [ ] La opción "Automatización de retención" **no aparece** en este panel; se
  maneja solo desde Finanzas → Retención.

**2.2 Mesas de la sede** — **Cupos/bloques** → pestaña **Mesas**.
1. En "Mesas de tu sede" pon `6`.
- [ ] Se guarda y el panel muestra, por bloque, cuántos entran con las mesas
  libres a esa hora.

**2.3 Dos grupos** — **Cupos/bloques** → **Grilla semanal** → **Nuevo grupo**.
- Grupo A: `PRUEBA Grupal martes` · Martes 18:00–19:30 · Tipo de clase: **Grupal
  por nivel** · Entrenador principal: Profe PRUEBA · Plantilla de la sesión: la
  que haya.
- Grupo B: `PRUEBA Particular martes` · Martes 18:00–19:00 · Tipo de clase:
  **Particular (1 o 2)** · marca **Se cobra aparte** ("No se descuenta de la
  mensualidad") · Entrenador principal: Profe PRUEBA.
- [ ] En la grilla, cada bloque muestra su tipo ("Grupal por nivel",
  "Particular (1 o 2) · se cobra aparte") y el profe.

**2.4 Un plan** — **Finanzas** → pestaña **Planes** → **Crear plan**.
`PRUEBA 2 veces grupal`, tipo Grupal, 2 veces por semana, monto 30000.
- [ ] Aparece en "Planes de mensualidad" con "Nadie lo tiene todavía".

**2.5 Inscribir al jugador** — **Cupos/bloques** → **Cupos** → abre `PRUEBA
Grupal martes` → agrega a Jugador PRUEBA y a Jugador PRUEBA 2.
- [ ] Quedan en el grupo y el contador sube a "2 de N".

---

## 3. Panel de administración

> "Ocupación por bloque horario · Altas y bajas del mes · Ingresos por línea de negocio"

**3.1 Ocupación por bloque** 🛠️
1. **Dashboard** → al final, la tarjeta de ocupación.
- [ ] Sale `PRUEBA Grupal martes` con inscritos contra cupo y el porcentaje.
- [ ] El cupo que muestra es el de las mesas (6 mesas × 4 = 24, menos las
  mesas que use el particular a esa hora), no un número escrito a mano.
- [ ] 🏓 y 🙋 no ven el Dashboard de admin (el profe va al suyo, el jugador a Mi perfil).

**3.2 Altas, bajas y reingresos** 🛠️
1. **Dashboard** → tarjeta de altas y bajas.
- [ ] Jugador PRUEBA y PRUEBA 2 cuentan como **altas** este mes.
2. En la tarjeta → **Historial y retiro/reingreso** → **Registrar movimiento** →
   Jugador PRUEBA 2 · Movimiento: **Retiro declarado** · fecha de hoy · motivo "prueba".
- [ ] Suma 1 en **bajas** y el neto baja.
- [ ] En **Jugadores**, con el filtro de estado "Inactivo / retirado", aparece PRUEBA 2.
3. Registra ahora **Reingreso** para el mismo jugador.
- [ ] Suma 1 en **reingresos** y PRUEBA 2 vuelve a salir como activo.
- [ ] Cambiar a alguien de grupo **no** cuenta como baja.

**3.3 Ingresos por línea de negocio** 🛠️
1. **Finanzas** → **Movimientos** → registra tres ingresos de prueba:
   Mensualidad $1.000, **Clase particular** $2.000, **Arriendo de mesa** $3.000.
   Usa "PRUEBA" en la descripción.
- [ ] En el **Dashboard**, la tarjeta de ingresos del mes los muestra separados
  por línea.
- [ ] La lista de categorías de ingreso trae las de Spinhouse: clase particular,
  arriendo de mesa, venta de artículos y auspicio.
- [ ] La de gastos trae premio de liga y marketing y redes.

---

## 4. Ficha del jugador

> "Fecha de nacimiento y categoría por edad · federado y licencia FECHITEME ·
> mano hábil, estilo y material · nivel y grupo · observaciones solo para el
> staff · paralímpico · uso de imagen"

**4.1 Perfil deportivo** 🛠️
1. **Jugadores** → Jugador PRUEBA → tarjeta **Perfil deportivo** → lápiz.
2. Llena: mano hábil, estilo, madera, gomas y nivel (iniciación, intermedio o
   competitivo). En **¿Tiene licencia FECHITEME?** aprieta **Sí** y pon un número.
- [ ] Se guarda y se ve en la tarjeta.
- [ ] La tarjeta dice "Licencia FECHITEME: Sí · N.º …". Con **No**, el campo del
  número desaparece y la tarjeta dice "No".
- [ ] En **Jugadores**, el filtro de federados lo encuentra cuando dijo Sí.
- [ ] En el formulario de inscripción (link del club) aparece el mismo Sí/No.
  Una solicitud que dice Sí, al aprobarla, deja al jugador como federado.
- [ ] La **categoría por edad sale sola** de la fecha de nacimiento (con
  2014-05-10, una sub de menores). Cambia la fecha a una de adulto y la categoría cambia.
- [ ] El **grupo** que aparece es `PRUEBA Grupal martes`, el de su inscripción.

**4.2 Observaciones y objetivos solo para el staff**
1. 🛠️ En la ficha de Jugador PRUEBA, en el perfil técnico, escribe observaciones
   y objetivos.
- [ ] 🏓 El Profe PRUEBA, en la misma ficha, **los ve** y puede editarlos.
- [ ] 🙋 Jugador PRUEBA en **Mi perfil** **no los ve** por ningún lado.

**4.3 Uso de imagen** 🛠️
1. Ficha → **Uso de imagen** → registra **Autoriza**, quien firma: **El apoderado**.
- [ ] Queda en el historial con fecha y quién firmó.
2. Registra después **Retira la autorización**.
- [ ] El historial muestra las dos; la anterior no se borra.

**4.4 Paralímpico: clase deportiva y accesibilidad**
1. 🛠️ Ficha de Jugador PRUEBA → **Ficha paralímpica** → primero **Registrar
   firma** (autoriza el tratamiento de datos de salud). Como es menor, firma
   **Apoderado**, con nombre, fecha y dónde se guarda el respaldo.
- [ ] Antes de la firma no deja guardar la clase deportiva.
2. **Editar ficha** → Clase deportiva (1 a 11, o "Pendiente de clasificación") y
   necesidades de accesibilidad → **Guardar ficha**.
- [ ] Se guarda y aparece en el **Historial de consentimientos**.
- [ ] 🏓 El profe la ve.
- [ ] 🙋 El jugador la ve en **Mi perfil**, pero **no puede editarla**.
- [ ] 🙋 Con otro jugador no se ve la ficha paralímpica de Jugador PRUEBA.
3. Registra **Retira la autorización**.
- [ ] El profe deja de ver la clase deportiva.

---

## 5. Horarios y clases

> "Grupal, competitivo, particular (1 o 2), adultos, paralímpico, arriendo libre
> · mesas, entrenador principal y auxiliar, plantilla de la sesión, si se cobra aparte"

**5.1 Los seis tipos** 🛠️
1. **Nuevo grupo** → despliega **Tipo de clase**.
- [ ] Salen: Grupal por nivel, Grupo competitivo, Particular (1 o 2), Escuela de
  adultos, Paralímpico y Arriendo libre de mesas.

**5.2 Información de la clase** 🛠️
1. Edita `PRUEBA Grupal martes`: agrega un **Entrenador auxiliar** y una
   **Plantilla de la sesión**.
- [ ] En la grilla aparece "+ Nombre (aux.)".
- [ ] 🏓 El profe ve el grupo en su horario.

**5.3 Cupo por mesas** 🛠️
- [ ] En **Mesas**, el cupo de un bloque grupal es mesas libres × 4, y el de uno
  particular, mesas libres × 2.
- [ ] Con dos bloques a la misma hora, el segundo tiene menos mesas libres.
- [ ] Baja las mesas de la sede a 1: el cupo del grupal baja a 4 menos lo que
  use el particular, y la tarjeta de ocupación del Dashboard cambia igual.

**5.4 Sobrecupo** 🛠️ ⚠️ *Ver sección 13*
1. Con las mesas en 1, inscribe gente hasta pasar el cupo.
- [ ] Hoy el sistema **avisa** que el grupo quedó sobre su cupo, **pero deja
  inscribir**. El formulario pide **impedirlo**: es lo que me toca construir (299).

---

## 6. Reglas de asistencia y morosidad

> "Alerta con 3 inasistencias seguidas, con mensaje al apoderado · aviso de
> deuda a los 15 días y bloqueo a los 30 · inactivo con 60 días sin asistir ni pagar"

**6.1 Retención en modo revisión** 🛠️
1. **Finanzas** → pestaña **👁️ Retención**.
- [ ] Sale "Retención y morosidad" con la marca **Modo revisión**.
- [ ] Muestra las reglas: aviso a 15 días, bloqueo desde 31 días, 3 faltas
  seguidas y 60 días sin asistir ni pagar.
- [ ] Muestra "Revisión antes de activar", con la cuenta de días de 30 mínimos.
- [ ] El botón **Activar bloqueos e inactivación** está desactivado. ⚠️ No lo actives.
- [ ] **Actualizar avisos** corre sin error y dice cuántos cambios hubo.

**6.2 Tres faltas seguidas** 🏓 → 🛠️ (toma tres días de clase)
1. 🏓 Tres martes seguidos, en **Asistencia**, pasa lista a `PRUEBA Grupal
   martes` y marca **ausente** a Jugador PRUEBA.
- [ ] 🏓 Al tercero, el **Dashboard del profesor** muestra la alerta de
  inasistencias con un botón de WhatsApp para escribir.
- [ ] 🛠️ En **Retención**, después de **Actualizar avisos**, aparece en
  "Jugadores por revisar" con la marca **Inasistencias** y **Contactar por faltas**.
- [ ] Si una de las tres clases la marcas **presente**, la racha se corta.
- [ ] Las faltas **no bloquean** la cuenta.

**6.3 Aviso de deuda** 🙋 (necesita una cuota con más de 15 días de atraso)
- [ ] Con una cuota impaga de un mes anterior: 🛠️ **Actualizar avisos** → el
  jugador aparece con **Aviso de deuda**, y 🙋 al entrar ve el aviso arriba de
  todas sus pantallas.
- [ ] Al registrar el pago y actualizar avisos, el aviso desaparece.

> Si no logras crear una cuota de un mes pasado, esta prueba queda para cuando
> haya cuotas reales con atraso.

**6.4 Inactivo por 60 días** — no se puede forzar con datos nuevos: el jugador
recién creado cuenta como activo desde su alta. Se ve cuando haya padrón real.
- [ ] Lo que sí se prueba: el retiro declarado de la sección 3.2 lo saca del
  padrón activo, de las cuotas nuevas y de los indicadores.

**6.5 Bloqueo automático** — ⚠️ No se prueba: exige 30 días de revisión.

---

## 7. Finanzas: márgenes, liquidación y proyección

> "Margen por línea y por bloque · liquidación mensual por entrenador: horas por
> tipo de clase × tarifa · proyección de caja del mes siguiente"

Todo esto está en **Finanzas** → pestaña **💰 Márgenes y liquidaciones** (🛠️).

**7.1 Tarifas**
1. **Tarifas de entrenadores**: Profe PRUEBA · Grupal · Principal · desde el 1
   de este mes · `15000` → **Guardar tarifa**.
2. Otra para Particular · Principal · `20000`.
- [ ] Aparecen en "Tarifas registradas".
- [ ] 🏓 El profe **no** ve la pestaña ni puede entrar a Finanzas.

**7.2 Horas dictadas** 🏓 → 🛠️
1. 🏓 (o 🛠️) En **Asistencia** → asistencia de profesores → elige el día de hoy
   y **Marcar el día** para el bloque `PRUEBA Grupal martes`. Tiene que ser un
   día en que ese grupo tenga clase.
- [ ] 🛠️ En **Confirmar o corregir horas dictadas** aparece la clase con su
  duración (90 min), tipo Grupal y rol Principal.
- [ ] Una marca de un día pasado aparece **por confirmar**: hay que poner
  duración, tipo, rol y si se cobra aparte → **Confirmar horas**.

**7.3 Margen del mes**
1. **Asignar ingresos a bloques**: el ingreso de prueba de $2.000 (clase
   particular) asígnalo a `PRUEBA Particular martes`.
- [ ] En **Márgenes del mes** salen los ingresos por línea, el costo de
  entrenadores (horas × tarifa) y el margen, por línea y por bloque.

**7.4 Liquidación**
- [ ] **Liquidación mensual por entrenador** muestra al Profe PRUEBA con sus
  horas, minutos y el importe estimado.
- [ ] ⚠️ **No aprietes "Liquidar y registrar gasto".** Además, solo deja
  liquidar meses ya terminados.

**7.5 Proyección**
- [ ] **Proyección de cobros del mes siguiente** dice "Sin historial suficiente"
  o da una estimación con las cuotas emitidas y la morosidad de los últimos 6
  meses. Sin datos, lo correcto es que no invente un número.

---

## 8. Torneos

> "Eliminación directa con consolación · liguilla de una y dos ruedas · sistema
> suizo · por equipos (Swaythling)"

Todos se crean en **Torneos** → **Nuevo torneo** → **Modalidad** (🛠️ o 🏓).
Usa "PRUEBA" en el nombre y por lo menos 4 inscritos (crea más jugadores PRUEBA
si hace falta).

- [ ] **8.1 Elim. + consolación:** el que pierde su primer partido pasa al
  cuadro de consuelo; nadie juega uno solo.
- [ ] **8.2 Liguilla de 1 rueda:** todos contra todos una vez, sin llave.
- [ ] **8.3 Liguilla de 2 ruedas:** cada par se enfrenta dos veces.
- [ ] **8.4 Por equipos:** en **Swaythling · 5 individuales** (3 jugadores por
  equipo, así que necesitas 6 jugadores PRUEBA para 2 equipos) y en **Corbillon ·
  4 individuales y un dobles** (2 a 4 por equipo), el encuentro se gana al mejor de 5.
- [ ] 8.5 **Sistema suizo**: ⚠️ todavía no existe (sección 13).
- [ ] Al cargar un resultado con sus sets, la tabla y la llave avanzan solas.

---

## 9. Calendario

> "Jornadas de liga · torneos externos con nómina · campamentos, clínicas,
> reuniones, días sin actividad y feriados · cada uno ve lo suyo · vista pública"

**9.1 Crear actividades** 🛠️ (o 🏓)
1. **Calendario** → **+ Agregar actividad** → tipo **Torneo externo**, título
   `PRUEBA Nacional`, fecha, lugar, y en **Nómina de jugadores** marca a Jugador PRUEBA.
2. Crea también una de cada uno: **Clínica**, **Campamento**, **Reunión**,
   **Suspensión** (día sin actividad) y **Feriado**.
- [ ] Cada una aparece en su día con su color o etiqueta.
- [ ] Solo el torneo externo deja agregar nómina.
- [ ] **Editar** y **Eliminar** funcionan, con confirmación.

**9.2 Qué ve cada uno**
- [ ] 🛠️/🏓 Ven todo, con **Detalles internos** y la nómina completa.
- [ ] 🙋 Ve **Mi clase** los martes, las actividades del club y, en `PRUEBA
  Nacional`, el cartel **"Estás en la nómina de este torneo."**
- [ ] 🙋 **No** ve la nómina completa (solo su propio "Estás en la nómina").
- [ ] 🙋 ⚠️ **Hallazgo para Luis:** el campo **Detalles internos** el jugador
  **sí lo ve**. Se llama "internos", pero la pantalla se lo muestra a todos.
  Escribe algo en ese campo y confírmalo con el jugador.
- [ ] Si hay una liga con fechas, aparecen sus jornadas con el horario.

**9.3 Vista pública** 🌐
1. 🛠️ En una actividad marca **Publicar título, fecha, horas y lugar en la
   vista pública** y guarda.
2. Toca **Vista pública ↗** y copia el link. Ábrelo en una ventana de incógnito,
   sin sesión.
- [ ] Sale la actividad publicada con título, fecha, hora y lugar.
- [ ] **No** sale la nómina, ni descripciones, ni nombres de jugadores.
- [ ] Las actividades **no** marcadas para publicar no aparecen.

---

## 10. Exportar partidos

> "Descarga de los partidos de torneos y liga en CSV o JSON (jugadores, rondas, sets)"

1. 🛠️ o 🏓 Abre un torneo PRUEBA con resultados cargados.
- [ ] Arriba aparecen **Partidos CSV** y **Partidos JSON**.
- [ ] El CSV abre bien en Excel, con jugadores, ronda, resultado y los sets uno por uno.
- [ ] El JSON trae lo mismo.
- [ ] Lo mismo en una liga (**Liga** → la liga → botones de exportar).
- [ ] 🙋 El jugador **no** ve los botones.
- [ ] Si corriges un resultado, el detalle de sets se actualiza (o se vacía si
  no se volvió a cargar). Nunca quedan los sets viejos con el ganador nuevo.

---

## 11. Lo que cada perfil NO debe poder hacer

| Prueba | 🏓 Profe | 🙋 Jugador |
|---|---|---|
| Entrar a `/finanzas` escribiendo la dirección | Lo devuelve | Lo devuelve |
| Entrar a `/dashboard` (el del admin) | Lo devuelve | Lo devuelve |
| Entrar a `/configuracion` y crear profes o admins | No tiene las secciones de admin | No |
| Ver la ficha de otro jugador | Sí (es staff) | No |
| Ver observaciones técnicas | Sí | No |
| Ver tarifas o liquidaciones | No | No |

- [ ] Todas las filas se comportan así.

---

## 12. Para el apoderado y el jugador (🙋)

- [ ] **Mi perfil** muestra sus datos, su ficha paralímpica (solo lectura) y su asistencia.
- [ ] **Mi horario** muestra `PRUEBA Grupal martes`.
- [ ] **Estado de cuenta** muestra sus cuotas.
- [ ] **Calendario** muestra lo de la sección 9.2.

---

## 13. Lo que todavía NO está construido (no lo busques)

| Lo que pide el formulario | Estado |
|---|---|
| **Impedir** sobrepasar el cupo al inscribir | Hoy solo avisa. Lo construyo yo (migración 299) |
| Que las mesas de **arriendo** no se puedan usar para clases a la misma hora | Lo construyo yo, junto con el cupo |
| **Índice de fuerza** partido a partido, y el **historial competitivo** en la ficha | Lo construyo yo |
| **Sistema suizo** | Lo construyo yo (migración 300) |
| **Plantilla de entrenamiento** por alumno | Lo construyo yo (migración 301) |
| **Liga** como la pide el formulario (5 divisiones, puntaje 2/1/0, zonas de ascenso y descenso) | En espera de hablar con el club. Hoy usa la liga de CM Sports |
| **Avisos automáticos por WhatsApp** | Fuera por ahora. Hoy son botones que abren el mensaje |
| **Club de origen** editable en la ficha | Falta: la columna existe pero no hay campo |
| **Premios de torneos** como categoría de gasto | Falta en la lista (sí está "Premio de liga") |
| El mensaje de las 3 faltas va al **teléfono de la ficha**, no al del apoderado | Falta usar el contacto de emergencia |
| Clases **sábado o domingo** | Los grupos van de lunes a viernes. Hay que preguntarle al club |
| **Bloqueo automático** real por deuda | Construido, pero se activa 30 días después de cargar el padrón |

---

## 14. Limpieza al terminar (🛠️)

- [ ] Borrar las actividades PRUEBA del calendario.
- [ ] Borrar los torneos PRUEBA.
- [ ] Borrar los movimientos PRUEBA de Finanzas (los ingresos de la sección 3.3).
- [ ] Sacar a los jugadores PRUEBA de los grupos y borrar los grupos PRUEBA.
- [ ] Borrar los jugadores PRUEBA: su plata queda en Finanzas sin nombre, así
  que borra antes sus movimientos.
- [ ] Desactivar al Profe PRUEBA. El Admin PRUEBA se puede dejar o desactivar.
- [ ] El plan `PRUEBA 2 veces grupal`: desactivarlo.
- [ ] Tarifas de prueba: quedan como historial. Si molestan, avísame y vemos cómo sacarlas.
- [ ] Volver las **Mesas de la sede** al número real cuando el club lo mande.

> Lo que no se puede borrar desde la app (consentimientos, historial de
> permanencia y tarifas) se limpia con una consulta. Avísame antes de cargar el
> padrón real y la preparo.
