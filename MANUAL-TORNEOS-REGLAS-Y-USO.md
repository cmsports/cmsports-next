# Manual de torneos: reglas internas y uso

Versión vigente: 17 de julio de 2026
Alcance: torneos internos de CMSPORTS con fase de grupos y eliminación directa.

## 1. Objetivo del módulo

El módulo permite crear un torneo, inscribir jugadores, formar grupos, registrar resultados, determinar dos clasificados por grupo, construir un bracket fijo, disputar los playoffs, registrar el podio y administrar los pagos.

La regla deportiva principal es:

> En el primer cruce real del bracket siempre juega el 1.º de un grupo contra el 2.º de otro grupo.

El sistema no vuelve a sembrar jugadores después de iniciar el cuadro. Todos los ganadores siguen el camino dibujado hasta la final.

## 2. Permisos

- Solo un usuario con rol **administrador** puede crear y gestionar torneos.
- El administrador debe pertenecer al mismo club que el torneo.
- Los controles se aplican tanto en la interfaz como en el servidor y la base de datos.
- Profesores u otros roles no pueden crear torneos ni modificar resultados mediante llamadas directas.

## 3. Estados y fases

Un torneo recorre este flujo:

1. **Inscripción:** recibe jugadores y define su cuota.
2. **Grupos:** se disputan los partidos todos contra todos.
3. **Playoffs:** 32avos, 16avos, octavos, cuartos, semifinal y final, según el tamaño requerido.
4. **Finalizado:** quedan guardados campeón, subcampeón, fecha de término y pagos.
5. **Archivado:** conserva el historial y no elimina información financiera.

El bracket puede aparecer mientras la fase general todavía indica “Grupos”. Esto es intencional: las ramas completas pueden jugarse anticipadamente mientras terminan otros grupos.

## 4. Creación del torneo

### Datos obligatorios

- **Nombre:** no puede quedar vacío; se eliminan espacios sobrantes.
- **Fecha:** debe ser una fecha real con formato válido.
- **Cuota de inscripción:** número entero igual o mayor que $0.

Al crear el torneo, el sistema fija automáticamente:

- formato de grupos;
- estado “En curso”;
- fase “Inscripción”;
- inscripción abierta;
- cuota y precio de entrada con el mismo valor inicial;
- club del administrador creador.
- código público único, formado por un prefijo del club de hasta seis caracteres y un correlativo, por ejemplo `PAINE-01`.

No se permiten cuotas ni precios negativos.

## 5. Inscripción de jugadores

- Se requieren al menos **4 jugadores** para cerrar la inscripción.
- Antes de cerrar, el administrador puede inscribir, quitar y ordenar jugadores.
- Antes de formar los grupos, los inscritos permanecen en el grupo temporal **MESA**.
- El sistema busca primero jugadores existentes del club por nombre.
- Si la persona no existe, puede crear una ficha externa con RUT opcional, categoría inicial y sin sesiones contratadas.
- Un jugador no puede inscribirse dos veces en el mismo torneo.
- Quitar a alguien del torneo no elimina su ficha general de jugador.
- Puede definir una lista numerada de cabezas: #1, #2, #3, #4 y así sucesivamente.
- El mismo jugador no puede ocupar dos números y la numeración queda continua.
- Puede existir como máximo una cabeza por grupo estimado o ya creado.
- Los cabezas se distribuyen primero, respetando su número, y luego se reparte el resto.
- Una vez creado el bracket, los cabezas de serie ya no pueden modificarse.

### Pago al inscribir

- Si la cuota es $0, no se crea un registro de pago.
- Si la cuota es mayor que $0, se debe escoger efectivo, transferencia o pendiente.
- Efectivo y transferencia quedan pagados con la fecha del día.
- Pendiente queda sin método ni fecha hasta su confirmación posterior.
- Si falla el registro del pago, la inscripción en MESA se revierte para no dejar datos incompletos.

### Vista pública y solicitudes

- La dirección `/vivo/CODIGO` es pública y no exige una cuenta.
- Si una persona no aparece, puede enviar nombre y correo como solicitud.
- La solicitud no inscribe automáticamente; el club debe revisarla e incorporarla desde MESA.
- El mismo correo no crea dos solicitudes pendientes para el mismo torneo.
- Se aplican límites automáticos contra envíos abusivos por minuto, código, identidad y club.
- Limitación actual: la solicitud valida el código del torneo, pero todavía no verifica si la inscripción continúa abierta. El administrador debe rechazar solicitudes fuera de plazo.

## 6. Formación de grupos

### Cantidad de grupos

La cantidad se calcula así:

`máximo entre 2 y el entero más cercano a jugadores ÷ 3`

El objetivo normal es formar grupos cercanos a tres jugadores, manteniendo un mínimo de dos grupos.

### Distribución

- Los cabezas tienen prioridad según su número y nunca quedan dos en el mismo grupo.
- Los demás jugadores conservan el orden recibido.
- La distribución usa un recorrido serpenteante: A → B → C y luego C → B → A.
- Los grupos se nombran A, B, C… Z, AA, AB, etc.
- Cada grupo tiene un orden persistente para que el bracket no cambie por diferencias alfabéticas.
- El máximo soportado es **32 grupos** y **64 clasificados**.

### Partidos de grupo

- Se genera un formato **todos contra todos** dentro de cada grupo.
- Cada pareja se enfrenta una vez.
- No se puede mover o reordenar un jugador de un grupo cuya competencia ya comenzó.

## 7. Clasificación de grupos

Clasifican exactamente:

- el **1.º del grupo**;
- el **2.º del grupo**.

### Puntaje

- Victoria: **2 puntos**.
- Derrota: **0 puntos**.
- También se muestran partidos ganados y perdidos.

### Desempates

1. Se ordena por puntos, de mayor a menor.
2. Si solo dos jugadores están empatados, decide el resultado del enfrentamiento directo entre ambos.
3. Si tres o más jugadores quedan empatados en el corte que define los dos cupos, el administrador resuelve manualmente el orden revisando las papeletas.
4. Si existe un líder único y tres o más empatados por el segundo cupo, el líder queda fijo como 1.º y solo se elige el 2.º entre los empatados.
5. La resolución manual se guarda en la base de datos.

No se usan como desempate:

- sets ganados o perdidos;
- diferencia de sets;
- puntos de cada set;
- diferencia de puntos.

El desempate manual solo puede guardarse cuando todos los partidos del grupo terminaron y los elegidos corresponden realmente al empate detectado. Para cambiarlo después de crear el bracket, primero se debe usar **Volver a grupos**.

## 8. Momento de creación del bracket

El sistema intenta sincronizar el cuadro automáticamente.

El bracket se crea cuando:

- terminó al menos la mitad de los grupos, redondeada hacia arriba; y
- los grupos que contienen a todos los cabezas ya terminaron, para conocer su posición real; y
- no existe ningún grupo manual marcado “En preparación”.

Ejemplo: con 5 grupos, el cuadro puede fijarse cuando terminan 3, siempre que también hayan terminado los grupos de los cabezas.

Los grupos restantes completan después los cupos que ya quedaron reservados. El árbol no se reconstruye ni cambia de forma.

## 9. Reglas internas del bracket

### Cruces iniciales

- Todo partido real de la primera ronda enfrenta **1.º contra 2.º**.
- Los rivales deben provenir de grupos distintos.
- El 1.º y el 2.º del mismo grupo se ubican en mitades opuestas del cuadro.
- El sembrado usa una regla espejo estándar para todas las posiciones numeradas.
- #1 y #2 se intentan ubicar en mitades opuestas; #3 y #4 en cuartos diferentes; #5 a #8 en sectores menores diferentes, y así sucesivamente.
- Si el espejo exacto contradice la regla 1.º contra 2.º, se desplaza primero la cabeza de número más alto y prevalece la regla deportiva.
- Una cabeza eliminada en grupos no ocupa el bracket y las demás conservan su número.

### Tamaño y fase inicial

El cuadro usa la siguiente potencia de dos que pueda contener a todos los clasificados:

- 4 clasificados: semifinales;
- 5 a 8: cuartos;
- 9 a 16: octavos;
- 17 a 32: 16avos;
- 33 a 64: 32avos.

La implementación actual no genera una “llave de avance” separada para los cabezas. Los espacios faltantes se resuelven mediante BYE dentro de la primera ronda correspondiente.

### BYE

- Un BYE significa que el jugador avanza automáticamente sin disputar un partido preliminar.
- Los BYE se asignan por número: primero #1, luego #2, #3, #4, etc., siempre que la estructura 1.º contra 2.º lo permita.
- Si no existen suficientes BYE compatibles, se respeta primero la validez deportiva del cuadro.
- La ubicación de todos los cabezas queda protegida y no puede alterarse mediante arrastre.
- Los BYE no se marcan manualmente como partidos ganados: el sistema los propaga automáticamente.

### Árbol fijo

- El ganador de las llaves 1 y 2 forma la siguiente llave 1.
- El ganador de las llaves 3 y 4 forma la siguiente llave 2, y así sucesivamente.
- No existe reordenamiento por ranking después de cada ronda.
- Las rondas se crean o completan de forma segura evitando duplicados.
- La fase general avanza solo cuando la ronda correspondiente está completa y la siguiente tiene todos sus jugadores requeridos.

### Ramas anticipadas

- Una rama puede jugarse si ambos jugadores ya están definidos.
- No necesita esperar a que terminen grupos pertenecientes a otras ramas.
- Jugar anticipadamente no cambia por sí solo la fase general mientras aún existan grupos pendientes.

## 10. Edición manual del primer cuadro

En computador, el administrador puede arrastrar cupos de la primera ronda.

Solo se permiten intercambios que cumplan simultáneamente:

- pertenecen a la misma ronda inicial;
- permanecen dentro de la misma mitad del cuadro;
- son 1.º por 1.º o 2.º por 2.º;
- cada partido resultante mantiene 1.º contra 2.º;
- no enfrenta jugadores del mismo grupo;
- ninguna llave involucrada comenzó;
- no mueve ningún cabeza de serie;
- no altera rondas posteriores.

El intercambio se ejecuta en una sola transacción. Si una parte falla, no se aplica ninguna. Los cambios de posición quedan registrados en la auditoría con el antes, el después y el usuario responsable.

## 11. Registro y corrección de resultados

### Registro normal

- El ganador debe ser uno de los dos participantes del partido.
- Un partido ya resuelto no puede marcarse nuevamente.
- Un partido incompleto o un BYE no puede marcarse manualmente.
- En playoffs, la marcación y la propagación a la siguiente ronda son atómicas.

### Corrección en grupos

- El nuevo ganador debe pertenecer al partido.
- Se revierten y recalculan los partidos jugados y ganados.
- Se borra cualquier desempate manual que haya quedado obsoleto.
- Si la rama del grupo ya fue jugada en playoffs, primero deben corregirse los resultados posteriores.
- Después de la corrección, el sistema vuelve a sincronizar los cupos del grupo con el árbol fijo.

### Corrección en playoffs

- El nuevo ganador debe haber participado en la llave.
- Si la siguiente llave ya fue jugada, primero se corrige esa ronda posterior.
- La llave siguiente debe contener al ganador anterior antes de reemplazarlo.
- La corrección se realiza en una única transacción para no dejar el árbol a medias.
- Un torneo finalizado no admite esta corrección sin volver previamente a un estado administrable.

### Volver a grupos

Esta acción:

- elimina todos los partidos de playoffs;
- conserva jugadores, grupos y resultados de grupos;
- limpia las marcas de clasificados;
- devuelve la fase general a “Grupos”.

Luego el bracket puede reconstruirse desde los resultados vigentes.

## 12. Inscripciones tardías

Los jugadores tardíos quedan temporalmente en “MESA”. Solo pueden integrarse **antes de que exista el bracket**.

- Si llega un jugador, se agrega al grupo existente con menos integrantes que todavía tenga menos de 4 y no provoque dos cabezas en un grupo.
- Se crean sus partidos contra todos los integrantes actuales de ese grupo.
- Si no existe un destino válido, permanece en MESA hasta que haya suficientes tardíos para formar otro grupo.
- Si llegan dos juntos, se crea un grupo nuevo **En preparación**, sin partidos ni acceso al bracket.
- Cuando llega el tercero, se incorpora prioritariamente a ese grupo; el administrador debe finalizarlo para crear sus partidos.
- Si llegan tres o más, se crean grupos nuevos independientes de hasta 4 jugadores. Cualquier grupo que quede con solo dos permanece en preparación.
- Tres tardíos permanecen juntos; no se dividen en grupos de 2 y 1.
- También pueden añadirse a la lista numerada de cabezas antes de crear el bracket.
- Nunca se puede superar el límite general de 32 grupos.
- Después de crear el bracket, el sistema bloquea nuevas inscripciones y la incorporación de tardíos.

### Llegadas tardías inscritas una por una

Si los tardíos se procesan individualmente, pueden completar distintos grupos hasta cuatro jugadores. Para reagrupar, por ejemplo, a tres tardíos que terminaron repartidos en tres grupos:

1. Presionar **Crear grupo vacío**.
2. El nuevo grupo aparecerá marcado **En preparación**.
3. Arrastrar hacia él los tres jugadores que se desean reagrupar.
4. Ninguno de los grupos involucrados puede tener resultados registrados.
5. Ningún grupo puede superar cuatro jugadores ni recibir dos cabezas.
6. Presionar **Finalizar** cuando el nuevo grupo tenga tres o cuatro jugadores.

El grupo en preparación no genera ni permite resultados. Sus partidos todos contra todos se crean al finalizarlo. Los grupos normales de origen deben conservar al menos tres jugadores. Mientras exista un grupo en preparación, el bracket queda bloqueado. Si continúa vacío puede cancelarse. En computador se usa arrastre y en móvil aparece el botón **Mover → grupo**.

## 13. Pagos y Finanzas

- La cuota puede ser $0.
- Cada jugador puede quedar como pagado o pendiente.
- Un pago registrado incluye método: efectivo o transferencia.
- Se evitan registros duplicados de pago para el mismo jugador y torneo.
- El sistema calcula recaudación total, efectivo, transferencias, meta esperada y saldo pendiente.
- La recaudación general puede enviarse a Finanzas separada por efectivo y transferencia.
- Si ya existe un ingreso general de inscripción asociado al torneo, no se permite enviarlo nuevamente.
- Al finalizar un torneo con cuota, los pendientes pueden seleccionarse y subirse en conjunto a Finanzas.
- Solo se cargan jugadores que todavía no estaban pagados.
- El movimiento financiero corresponde a `cantidad de jugadores × cuota`.
- Si los pagos se actualizaron pero falla el movimiento financiero, el sistema informa expresamente esa situación.

### Premios y gastos

- Se pueden definir premios opcionales para 1.º, 2.º y 3.º lugar.
- Cada premio puede registrarse como efectivo o transferencia.
- También pueden agregarse gastos de gestión del torneo.
- Guardar el cierre financiero puede registrar la recaudación pendiente de envío, los premios como gastos y los gastos adicionales.
- Finalizar el torneo no obliga a que todos estén pagados ni a definir premios.

## 14. Finalización y archivo

El torneo solo puede finalizar cuando la final tiene:

- ambos participantes;
- un ganador válido.

Al finalizar se guardan automáticamente:

- campeón;
- subcampeón;
- fecha de término;
- estado y fase “Finalizado”.

Archivar conserva el torneo para consulta histórica. No borra ni descuenta movimientos de Finanzas.

La eliminación definitiva solo está disponible después de archivar. Esa eliminación sí borra los grupos, partidos, pagos y movimientos financieros asociados, por lo que debe usarse únicamente cuando se quiera eliminar todo el historial del torneo.

## 15. Garantías de integridad

La base de datos protege las siguientes reglas:

- ganador perteneciente al partido;
- jugadores distintos dentro de una llave;
- orden único de cada ronda de playoff;
- cuota y precio no negativos;
- metadata coherente de grupo y posición;
- numeración de cabezas entre 1 y 32, sin duplicados;
- máximo un grupo manual en preparación por torneo;
- cuando existen ambos cupos iniciales: grupos diferentes y posiciones opuestas;
- solo administradores del club pueden ejecutar operaciones críticas;
- marcación, corrección e intercambio protegidos por transacciones y bloqueos;
- cambios manuales del bracket registrados en auditoría.

## 16. Manual de uso paso a paso

### A. Crear y preparar

1. Entrar a **Torneos**.
2. Presionar **Nuevo torneo**.
3. Indicar nombre, fecha y cuota.
4. Abrir el torneo recién creado.
5. Compartir el código público si se utilizará la vista en vivo.
6. Inscribir al menos cuatro jugadores y registrar su forma de pago.
7. Revisar solicitudes públicas e incorporar manualmente las aceptadas.
8. Agregar todas las cabezas necesarias y ordenarlas como #1, #2, #3…
9. Resolver cualquier jugador tardío que continúe en MESA.
10. Revisar inscritos y presionar la opción para cerrar inscripción y generar grupos.

### B. Jugar grupos

1. Registrar el ganador de cada partido.
2. Revisar que la tabla se actualice inmediatamente.
3. Completar todos los partidos de cada grupo.
4. Si aparece empate múltiple, elegir el orden solicitado y guardarlo.
5. No usar cálculos externos de sets o puntos: no forman parte de la clasificación.
6. Si los tardíos quedaron repartidos, crear un grupo vacío, moverlos y finalizarlo antes del bracket.

### C. Iniciar playoffs

1. El cuadro aparecerá automáticamente cuando se cumplan las condiciones mínimas.
2. Revisar los cupos todavía indicados como “Por definir”.
3. Confirmar que cada cruce real sea 1.º contra 2.º de otro grupo.
4. En computador, arrastrar únicamente si se requiere un cambio válido en la ronda inicial.
5. Las ramas completas pueden comenzar aunque otros grupos sigan pendientes.

### D. Jugar el bracket

1. Marcar el ganador de cada llave.
2. Verificar su aparición automática en la ronda siguiente.
3. Continuar respetando el árbol, sin resembrar.
4. Si se cometió un error, corregir primero la ronda más avanzada y luego retroceder.
5. Completar la final y presionar **Finalizar torneo**.

### E. Cerrar pagos

1. Revisar pagados y pendientes.
2. Marcar método de pago cuando corresponda.
3. Con el torneo finalizado, seleccionar pendientes confirmados.
4. Subirlos a Finanzas.
5. Confirmar que aparezca el movimiento por el total esperado.
6. Registrar premios y gastos de gestión si corresponden.

## 17. Lista rápida de control

Antes de grupos:

- [ ] Nombre, fecha y cuota correctos.
- [ ] Mínimo 4 inscritos.
- [ ] Lista de cabezas sin duplicados y en el orden correcto.
- [ ] Máximo una cabeza por grupo.
- [ ] Pagos iniciales o pendientes correctamente marcados.
- [ ] MESA sin solicitudes o tardíos por resolver.

Antes del bracket:

- [ ] Partidos de los grupos cerrados completos.
- [ ] Empates múltiples resueltos.
- [ ] Grupos de los cabezas cerrados.
- [ ] Sin jugadores tardíos pendientes.
- [ ] Ningún grupo manual en preparación.

Durante playoffs:

- [ ] Cruces iniciales 1.º contra 2.º de otro grupo.
- [ ] BYE de cabezas respetados cuando corresponda.
- [ ] Árbol fijo, sin resembrar.
- [ ] Correcciones hechas desde la ronda más avanzada hacia atrás.

Al finalizar:

- [ ] Final completa.
- [ ] Campeón y subcampeón correctos.
- [ ] Pagos revisados.
- [ ] Movimiento de Finanzas confirmado.
- [ ] Premios y gastos registrados, si corresponden.

## 18. Límites conocidos

- Mínimo: 4 jugadores.
- Máximo del cuadro: 32 grupos y 64 clasificados.
- Clasifican dos jugadores por grupo.
- Puede haber tantas cabezas numeradas como grupos, con máximo una por grupo.
- El arrastre del bracket está disponible en computador, solo para jugadores no sembrados de la ronda inicial no jugada y dentro de la misma mitad.
- La prioridad de los cabezas nunca puede romper la regla 1.º contra 2.º de otro grupo.
