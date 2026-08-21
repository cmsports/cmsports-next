# Plan — Ley 21.719 de protección de datos personales

**Qué es:** la ley que reemplaza a la 19.628 y entra en vigencia el **1 de
diciembre de 2026**. Crea una Agencia de Protección de Datos con facultades
fiscalizadoras y sancionatorias reales, que la ley anterior no tenía.

**No soy abogado.** Todo lo que sigue es lectura de ingeniería: qué exige la ley
según fuentes públicas, y cómo se cruza con lo que el sistema hace hoy. Las
decisiones sobre **base legal** y la redacción de los consentimientos necesitan
revisión de alguien con título. Lo que sí es mío y es concreto: construir los
mecanismos.

Complementa a `docs/registro-actividades-tratamiento.md`, que es el inventario
(el RAT que la ley exige). Este documento es la lista de trabajo.

---

## 1. Por qué a Buin le pega fuerte

Los números salieron de la base el 2026-08-21, filtrando socios activos de
Asociación TDM Buin y Paine:

| | |
|---|---|
| Socios activos | **108** |
| Menores de 18 | **58** (54%) |
| **Menores de 14** | **30** |
| Con información médica real en la ficha | **54** |
| Sin fecha de nacimiento | 0 — el sistema sabe la edad de todos |

Eso ubica al club justo en las dos categorías que la ley trata con más rigor:

**Menores.** La ley establece un régimen por tramos. Bajo 14 años se exige
**consentimiento de los padres o tutores para todo tratamiento de datos
personales**; entre 14 y 15, para datos sensibles. Y toda decisión debe regirse
por el interés superior del menor. Son 30 niños en el primer tramo.

**Datos sensibles.** La salud es dato sensible por definición legal. `jugadores.
indicaciones_medicas` tiene información médica real en 54 fichas —hay al menos
una que consigna una condición del espectro autista—, y **más de la mitad de
esas fichas son de menores**. Es la combinación de mayor exigencia que contempla
la ley: dato sensible de un niño.

**La buena noticia:** el campo `fecha_nacimiento` está lleno en el 100% de las
fichas. El sistema puede calcular quién es menor y de qué tramo sin pedirle nada
a nadie. Eso hace viable automatizar casi todo lo que sigue.

---

## 2. Sanciones y plazos

- **Multas** de hasta 20.000 UTM, y hasta 4% de los ingresos en caso de
  reincidencia.
- **Notificación de brechas de seguridad a la Agencia dentro de 72 horas** de
  tomar conocimiento.
- **Período de gracia para PYMEs:** entre diciembre 2026 y diciembre 2027 las
  pequeñas empresas reciben solo amonestaciones, no multas. **Esto no exime de
  cumplir**, solo cambia la consecuencia del incumplimiento durante el primer
  año.

Ese año de gracia es el argumento para no entrar en pánico, y también para no
dejarlo para noviembre de 2026.

---

## 3. Los huecos, por gravedad

### 3.1 No existe ningún registro de consentimiento — **el hueco crítico**

Se buscó en todo el esquema y en todo el código: **no hay una sola tabla,
columna ni pantalla que registre un consentimiento**. Ni para la ficha, ni para
los datos médicos, ni para las fotos, ni para los videos.

Con 30 menores de 14 años y 54 fichas con datos de salud, esto es lo primero.
No es un tema de papeles: la ley pide consentimiento **verificable**, y hoy no
hay dónde guardarlo aunque el apoderado lo dé de viva voz.

### 3.2 No hay figura de apoderado como tal

El sistema tiene `contacto_emergencia_nombre` y `contacto_emergencia_telefono`,
y la pantalla lo rotula "Apoderado / contacto emergencia"
(`src/app/jugadores/page.tsx:760`). Pero es un teléfono para emergencias, no un
representante legal identificado: no tiene RUT, no tiene vínculo declarado con
el menor, y nada dice que esa persona sea quien puede autorizar.

Para un consentimiento verificable de un menor de 14, hace falta saber **quién**
lo dio y **con qué título**.

### 3.3 Contraseñas en texto plano

`credencial_visible` guarda la contraseña legible para que el admin pueda
entregarla. Es una decisión deliberada y documentada (migración 113), y con la
ley vieja era discutible. Con la 21.719, que exige medidas de seguridad técnicas
apropiadas al riesgo, **es lo más difícil de defender ante una fiscalización**,
sobre todo combinado con datos de salud de menores en el mismo sistema.

No propongo tocarlo todavía: cambiarlo afecta la operación diaria del club y
merece su propia conversación. Pero tiene que estar en la lista.

### 3.4 Nombres completos de menores en la vista pública de torneos

`torneo_publico(codigo)` y `oficial_campeonato_publico(codigo)` entregan, **sin
autenticación**, los nombres de los inscritos. Es el diseño buscado —que
cualquiera siga los resultados con el código— pero publica el nombre completo de
niños de 8 años en internet.

Vale revisar si para ese fin basta con nombre y primer apellido. Es un cambio
chico con impacto real.

### 3.5 Sin canal para ejercer derechos (ARCOP)

La ley da al titular derechos de **A**cceso, **R**ectificación, **C**ancelación,
**O**posición y **P**ortabilidad. Hoy no hay por dónde pedirlos ni plazo de
respuesta definido.

Parcialmente resuelto sin querer: `jugadorExport.ts` ya exporta la ficha (sirve
para acceso y portabilidad) y `eliminar_jugador_atomico` borra conservando la
contabilidad disociada (sirve para cancelación). **Los mecanismos existen, falta
la puerta.**

### 3.6 Sin política de retención en varias tablas

`asistencia`, `solicitudes_jugador` y el módulo técnico guardan
indefinidamente. La ley pide conservar solo mientras sea necesario para la
finalidad. La migración 207 ya puso 90 días a los respaldos: existe el
precedente y el patrón.

---

## 4. Lo que ya está bien

No todo está por hacerse, y conviene saberlo antes de dimensionar el trabajo:

- **Aislamiento por club:** 148 de 171 políticas RLS filtran por `club_id`. Un
  club no ve los datos de otro.
- **Disociación en contabilidad:** al borrar un jugador,
  `eliminar_jugador_atomico` conserva los movimientos con `jugador_id = NULL`.
  Eso **es** el mecanismo de disociación que la ley busca, y ya existe.
- **Respaldos cerrados y con retención:** migraciones 197 y 207.
- **Rate limiting en funciones públicas:** migración 205 limitó
  `consultar_credencial_por_rut` a una consulta exitosa.
- **El RAT ya está redactado** en borrador (`registro-actividades-tratamiento.md`).
- **Storage privado** desde la migración 072.

---

## 5. Plan de trabajo

### Fase 1 — Consentimiento (lo único verdaderamente urgente)

**1.1 · Tabla `consentimientos`**

```
consentimientos   id, club_id, jugador_id, tipo, otorgado_por_nombre,
                  otorgado_por_rut, otorgado_por_vinculo, otorgado_en,
                  revocado_en, texto_version, medio (presencial|app)
```

`tipo`: `ficha`, `salud`, `imagen`, `video`, `comunicaciones`. Uno por
finalidad — la ley no acepta un consentimiento genérico para todo.

`texto_version` guarda **qué texto exacto firmó**, porque si mañana cambia la
redacción hay que poder demostrar qué aceptó cada uno.

Revocación por `revocado_en`, nunca borrando la fila: hay que poder probar que
existió y cuándo se retiró.

**1.2 · Identificar al apoderado de verdad**
Agregar a `jugadores` (o tabla aparte si hay más de uno):
`apoderado_nombre`, `apoderado_rut`, `apoderado_vinculo`,
`apoderado_email`. Sin RUT no hay consentimiento verificable.

**1.3 · Pantalla de captura**
En la ficha del jugador: qué consentimientos tiene, cuáles faltan, botón para
registrar. Con la edad ya calculada desde `fecha_nacimiento`, el sistema puede
decir solo **cuáles son obligatorios** para ese jugador según su tramo.

**1.4 · Panel de cumplimiento**
Una pantalla que responda "¿a quién le falta qué?". Sin eso, 108 fichas se
revisan a mano y no se revisan nunca.

### Fase 2 — Derechos ARCOP

**2.1 · Puerta de entrada.** Formulario o correo publicado, con registro de cada
solicitud y su fecha (hay que poder probar que se respondió en plazo).

**2.2 · Exportación completa del titular.** Extender `jugadorExport.ts` para que
junte todo lo de una persona: ficha, asistencia, pagos, feedback, evaluaciones.
Hoy exporta la ficha, no la vida completa.

**2.3 · Flujo de eliminación con constancia.** `eliminar_jugador_atomico` ya
hace lo correcto; falta dejar registro de que se pidió y se ejecutó.

### Fase 3 — Minimización y retención

**3.1 · Vista pública de torneos:** evaluar mostrar nombre + primer apellido.

**3.2 · Política de retención** para `asistencia`, `solicitudes_jugador` y
módulo técnico, siguiendo el molde de la 207.

**3.3 · Limpiar `indicaciones_medicas`.** 46 de las 100 fichas con contenido
dicen "no", "ninguna", "nada". Vaciarlas reduce la superficie de dato sensible
sin perder nada. Es la medida más barata de todo este documento.

### Fase 4 — Gobernanza (no es código)

**4.1 · Encargado de datos.** El DPO es obligatorio para quienes tratan datos
sensibles a gran escala. Un club de 108 socios probablemente **no** califica,
pero igual conviene nombrar un responsable interno. **A confirmar con abogado.**

**4.2 · Procedimiento de brecha a 72 horas.** Quién detecta, quién decide, quién
notifica. Escrito antes de necesitarlo, porque el reloj corre desde que se sabe.

**4.3 · Política de privacidad publicada** y cláusulas con proveedores
(Supabase es un encargado de tratamiento y eso debe estar documentado).

---

## 6. Orden sugerido

```
Fase 1 (consentimiento) ─── lo único que no puede faltar en diciembre 2026
        │
        └──> Fase 2 (ARCOP) ──> Fase 3 (minimización)

Fase 3.3 (limpiar "ninguna") ─── independiente, se puede hacer hoy en 10 minutos

Fase 4 (gobernanza) ─── en paralelo, depende de abogado, no de código
```

**Primer entregable útil:** 3.3, que es una limpieza de datos trivial.
**El que importa:** Fase 1 completa. Todo lo demás es mejora; sin consentimiento
registrado no hay cumplimiento posible.

**Hay tiempo, pero no tanto:** faltan poco más de tres meses para el 1 de
diciembre de 2026, y la Fase 1 implica pedirle el consentimiento a 108 familias
—un trabajo humano que no depende de la velocidad del software—. Conviene tener
las pantallas listas bastante antes, para que la recolección se haga con calma
durante las clases.

---

## 7. Lo que necesita abogado, no programador

1. La **base legal** de cada tratamiento del RAT (hoy todas dicen "a confirmar").
2. El **texto** de cada consentimiento.
3. Si el club **necesita DPO** formal.
4. Si la **vista pública de torneos** se sostiene por interés legítimo.
5. Si el club tiene **personalidad jurídica** — porque define quién es el
   responsable del tratamiento ante la Agencia. Es la misma pregunta que aparece
   en `plan-khipu.md` §11.1 para poder cobrar por Khipu.

---

## Fuentes

Consultadas el 2026-08-21. Son guías profesionales, no el texto oficial de la
ley; para decisiones legales hay que ir a la ley y a un abogado.

- [Ley 21.719: guía 2026 (Prey)](https://preyproject.com/es/blog/ley-de-proteccion-de-datos-en-chile)
- [Ley 21.719 para PYMES (Prey)](https://preyproject.com/es/blog/ley-21719-pymes-proteccion-datos)
- [Guía 2026 (GRC360)](https://www.grc360.cl/blog/ley-21719-proteccion-datos-chile)
- [Datos sensibles bajo la Ley 21.719 (Alayia Trust)](https://alayiatrust.com/blog/datos-sensibles-ley-21719)
- [Chile Data Privacy Laws (Recording Law)](https://www.recordinglaw.com/es/world-laws/world-data-privacy-laws/chile-data-privacy-laws/)
- [Guía completa (XMS Latam)](https://xmslatam.com/ley-21719-proteccion-datos-chile/)
