# Plan de estética — embellecer la plataforma sin romperla

Objetivo: que la app se vea de una sola pieza y bien hecha, en los cuatro
perfiles (superadmin, admin, profesor, jugador), en claro y en oscuro, en
escritorio y en teléfono. Sin introducir bugs.

---

## 1. Por qué acá lo estético es peligroso

No es un proyecto donde cambiar un color sea cambiar un color.

- **5.102 bloques `style={{ }}`** repartidos en 128 de los 138 `.tsx`.
- **4.789 colores hex escritos a mano** en esos estilos.
- El **modo oscuro no usa variables**: traduce hex literales, uno por uno, con
  reglas como `html.dark [style*="background:#f8fafc"] { background: #0e1629 }`.
  Son ~450 líneas de `globals.css`.

Consecuencia directa: **cambiar un hex "para que se vea mejor" no rompe el modo
claro, hace desaparecer el elemento en modo oscuro.** Como `html.dark body *`
pinta todo el texto de blanco con `!important`, un fondo claro sin traducir
queda blanco sobre blanco. El elemento está, y no se lee. Ya pasó con los
bloques de Cupos (`#ecfdf5` y `#f0fdfa` sin regla) y por eso existe
`src/app/modo-oscuro-fondos.test.ts`.

Hay además tres selectores que **parecen** estilo y en realidad son API:

| Cadena literal | Qué engancha |
|---|---|
| `linear-gradient(135deg` | la sombra de color de todos los botones con degradado |
| `entraTarjeta` (nombre de animación) | el hover de todas las tarjetas |
| `position:fixed` + `inset:0` | la animación y el fondo oscuro de todos los modales |

Reescribir uno de esos strings apaga el efecto en decenas de pantallas de una,
sin error, sin test rojo.

Y una cuarta trampa, ya documentada en el propio CSS: **`transform` en un
contenedor rompe los modales de adentro** (un `position: fixed` hijo se
posiciona contra el contenedor, no contra la pantalla, y el overlay queda de
alto 0). Por eso las animaciones de entrada son solo opacidad.

---

## 2. Las reglas del plan

Todo lo que sigue respeta esto. Si una idea linda no cabe acá, no entra.

1. **Aditivo, no reescritura.** Se embellece desde `globals.css` enganchando lo
   que ya existe (etiquetas `table`, `input`, `button`, y los selectores por
   atributo). No se tocan los 5.102 inline en masa.
2. **Ningún hex cambia sin su traducción a oscuro en el mismo commit.**
3. **Los tres strings-API no se tocan.** Si un botón necesita otro degradado,
   se agrega el nuevo a `globals.css`, no se edita el existente.
4. **Cero `transform` en contenedores.** Solo opacidad, sombra, color.
5. **Nada de layout.** No se mueven columnas, no se reordenan secciones, no se
   cambian breakpoints. Solo color, espacio, tipografía, radio y sombra.
6. **Una fase = un commit = verificable en 4 perfiles × 2 temas.** Si algo se
   ve raro, se revierte una fase, no un mes de trabajo.

---

## 3. Dirección creativa — de qué tiene que verse la app

Hoy la paleta es la de fábrica de Tailwind: índigo `#4f46e5` y grises slate.
Está bien resuelta y no se parece a nada. Es la misma cara que tienen diez mil
dashboards. Lo que sigue es lo que le daría identidad propia **sin inventar
nada arbitrario**: sale del deporte.

### 3.1 La paleta: la mesa y la pelota, en voz baja

El tenis de mesa tiene dos colores que cualquiera reconoce sin que se los
expliquen: el **azul de la mesa** y el **naranjo de la pelota**. Esa es la
identidad disponible, y ya está medio insinuada en el CSS (hay un `--orange`
declarado que casi no se usa).

Pero esto es una herramienta de trabajo que el profesor abre todos los días,
no una landing. Así que va **como evolución, no como reemplazo**:

- **El índigo se queda como estructura**, corrido un paso hacia el azul de la
  mesa: más profundo, menos violeta. Es el mismo color, mejor elegido. Nadie
  va a abrir la app y decir "la cambiaron"; van a decir que se ve mejor.
- **Naranjo pelota, en dosis de gotero.** Tres o cuatro lugares en toda la
  plataforma: el punto de la campana con notificaciones, el dato que exige
  acción, el acento del logo. **Nunca como relleno de un botón grande ni de una
  tarjeta.** Un naranjo en todos lados no acentúa nada y cansa a la semana.
- Los semánticos (verde pagado, rojo deuda, ámbar pendiente) **no se tocan**:
  en un sistema con plata, el rojo tiene que seguir significando exactamente lo
  mismo que significa hoy.
- Los grises pasan de neutros puros a **grises con una gota de azul**. Es un
  cambio que nadie nota conscientemente y que hace que la app se vea de una
  sola pieza. De todo lo de esta sección, es lo que más rinde y lo que menos
  se nota.

**Criterio de sobriedad, para no discutirlo dos veces:** si al abrir una
pantalla lo primero que ves es un color y no el dato, el color está mal
puesto.

### 3.2 Un acento por perfil

Cada rol lleva su matiz **solo en el ítem activo de la navegación y en el
avatar del pie**. No cambia el fondo, no cambia el resto de la pantalla: es una
señal, no un tema por perfil.

| Perfil | Matiz | Por qué |
|---|---|---|
| Jugador | azul mesa | la cara "cliente" del sistema |
| Profesor | verde cancha | se distingue del admin de un vistazo |
| Admin | azul profundo | autoridad, es quien mueve la plata |
| Superadmin | violeta | ya es la señal de "estás fuera de tu club" |

No es decorativo: hoy, mirando una pantalla, no se sabe con qué cuenta estás
adentro. Con esto, sí. Se implementa como una variable en el contenedor raíz
según `perfil.rol` — un solo lugar, en `layout-app.tsx`.

### 3.3 Tipografía — el cambio más grande por menos esfuerzo

Hoy la app usa la fuente del sistema (`-apple-system`, `Segoe UI`). Funciona,
pero es lo que hace que se vea "hecha en casa".

- **Una fuente propia cargada con `next/font`** (Inter o Geist). Se empaqueta
  en el build, no pide nada a un servidor externo, no hay flash de texto sin
  estilo. Es, de todo este documento, lo que más sube el nivel percibido por
  línea de código.
- **Números tabulares** (`font-variant-numeric: tabular-nums`) en montos,
  tablas y marcadores. Es el detalle que separa una tabla financiera que se ve
  profesional de una que no: las cifras quedan alineadas en columna aunque
  cambien de valor. Va en una regla, alcanza a toda la app.
- Títulos con `letter-spacing` negativo y peso 800 — ya está hecho en `h1`, hay
  que extenderlo a `h2`/`h3`.

⚠️ Único punto de cuidado real de esta sección: cambiar la fuente cambia el
ancho del texto, así que puede correr algo unos píxeles en pantallas apretadas.
Es un cambio de una línea y se revisa mirando; no rompe nada en silencio.

### 3.4 Movimiento — animaciones que informan, no que adornan

La base ya está y es buena (una curva, tres velocidades, todo anulado si la
persona pidió menos movimiento). Falta el nivel de arriba, pero **el criterio
es que la animación explique algo, no que se luzca**. Una animación que notas
la segunda vez que la ves está de más. Todo lo que sigue respeta además la
prohibición de `transform` en contenedores.

**Entra:**

- **El check de asistencia.** Es la acción más repetida de toda la plataforma:
  el profesor la ejecuta cien veces por semana. La marca se dibuja en ~200 ms
  y confirma que el toque registró. Una sola animación, muy pulida, en el lugar
  más usado. Si hay que elegir una de toda esta lista, es esta.
- **Esqueletos por forma real.** Hoy el esqueleto es un rectángulo genérico.
  Que tenga la silueta de lo que viene (filas de tabla, tarjetas) elimina el
  salto visual al cargar. No es un efecto: es que la pantalla deje de saltar.
- **Estados vacíos con carácter.** "No hay movimientos este mes" con un ícono y
  una frase, en vez de un espacio gris. Hay muchas pantallas que arrancan
  vacías, y es la primera impresión de todo jugador nuevo.
- **Filo de acento en la fila con el mouse encima.** Hoy la fila se ilumina;
  un filo de 2px a la izquierda la hace seguible con la vista entre ciento tres
  jugadores. Sin movimiento, solo color.
- **Sombras con una gota de azul** en vez de gris puro. Estáticas. Es sutil y
  es lo que distingue una interfaz "diseñada" de una "armada".

**No entra, y por qué:**

- **Cifras que cuentan desde 0.** Se ve bien en una demo y estorba en el uso
  diario: el admin abre Finanzas para leer un número, no para verlo subir. Y
  con `useEnVivo` refrescando, el riesgo de que baile es real.
- **Podio del ranking con brillo.** Tentador, pero es justo el tipo de cosa que
  empuja la app hacia lo llamativo. Si más adelante lo quieren, se agrega solo,
  y se decide mirándolo.
- **Transiciones de página (View Transitions API).** Toca justo el mecanismo de
  los modales, que ya se rompió antes.
- **Parallax, partículas, degradados animados de fondo.** Se ven bien un día y
  molestan todos los demás.

---

## 4. Fases

### Fase 0 — La red de seguridad (antes de tocar un solo color)

Sin esto, todo lo demás es apostar.

- **Ampliar `modo-oscuro-fondos.test.ts`.** Hoy solo revisa `background:`. Le
  faltan los otros dos vectores del mismo bug:
  - `color: '#xxxxxx'` oscuro sin regla clara → invisible en oscuro.
  - `border: '1px solid #xxxxxx'` claro sin regla → borde fantasma.
- **Test de paleta cerrada.** Inventario de los hex en uso, con una lista
  permitida. Arranca como advertencia (imprime los fuera de paleta), y recién
  cuando la Fase 1 los reduzca, pasa a fallar.
- **Capturas base.** 4 perfiles × pantallas clave × claro/oscuro, guardadas
  antes de empezar. Es el "antes" con el que se compara cada fase.

Entregable: dos tests nuevos y una carpeta de capturas. Cero cambio visual.

### Fase 1 — Tokens (invisible, habilitante)

Definir en `:root` la escala que hoy no existe:

- **Radios:** 8 / 12 / 16 (hoy hay nueve valores distintos: 6, 7, 8, 9, 10, 12,
  14, 16, 20).
- **Sombras:** tres niveles — apoyada, elevada, flotante (hoy hay **52
  variantes** de la misma sombra gris).
- **Tipografía:** 11 / 12 / 13 / 15 / 18 / 22, con los pesos ya definidos.
- **Espaciado:** 4 / 8 / 12 / 16 / 24.

Se aplican **solo por `globals.css`** a etiquetas y clases. Los inline viejos
siguen funcionando igual; los nuevos usan los tokens. Cero riesgo, y es lo que
hace baratas las fases 2 a 5.

### Fase 2 — El chasis

`src/app/layout-app.tsx` — un solo archivo, y es lo único que los cuatro
perfiles ven en **todas** las pantallas. Máximo impacto, mínimo alcance:

- Sidebar: jerarquía real entre encabezado de sección, ítem y ítem activo. Hoy
  el activo es un bloque índigo sólido con borde izquierdo, bastante duro.
- Nav móvil: altura, área de toque y estado activo.
- Bloque de usuario del pie: avatar, nombre, rol.
- Botones del pie (montos, cerrar sesión, volver a superadmin): hoy son tres
  cajas grises iguales sin jerarquía.
- Banner de cuenta demo.

Riesgo bajo y contenido: si sale mal, se ve al primer vistazo y es un archivo.

### Fase 3 — Tarjetas y tablas, por CSS

Aprovechando los ganchos que **ya existen** (`[style*="entraTarjeta"]`,
`tbody tr`, `input`, `button`): borde más suave, sombra de la escala nueva,
cabecera de tabla con más aire, filas alternadas, estados de foco.

Llega a las treinta pantallas sin abrir treinta archivos. Es exactamente la
técnica que el CSS ya usa y documenta.

### Fase 4 — Pantalla por pantalla, por perfil

En este orden, por cuánta gente las mira:

1. **Jugador** — `/perfil`, `/estado-cuenta`, `/mi-horario`. Son las más vistas
   y casi siempre desde el teléfono.
2. **Profesor** — `/dashboard-profesor`, `/asistencia`.
3. **Admin** — `/dashboard`, `/jugadores`, `/finanzas`.
4. **Superadmin** — su panel.

Acá sí se tocan inline, pero de a una pantalla, con la regla 2 vigente y el
test de Fase 0 corriendo.

### Fase 5 — Modo oscuro de verdad (opcional, después)

Migrar los hex a `var(--token)` pantalla por pantalla, borrando su regla
`html.dark` correspondiente a medida que deja de hacer falta. Con la red de la
Fase 0 puesta, es seguro. Sin ella, no.

No es requisito para que la app se vea bien: es lo que hace que **la próxima**
mejora estética sea barata.

---

## 5. Cómo se verifica cada fase

Antes de dar una fase por cerrada:

- `npm test` en verde (incluidos los tests nuevos de Fase 0).
- Recorrido en `localhost:3000` con los **cuatro** perfiles.
- Cada pantalla tocada, en **claro y en oscuro**.
- Cada pantalla tocada, en **escritorio y en 375px**.
- Abrir **un modal** en cada pantalla tocada. Es el bug que más veces volvió y
  el que ningún test detecta.

---

## 6. Lo que este plan NO propone

Para que quede escrito y no se vuelva a discutir:

- **No** migrar a Tailwind ni a una librería de componentes. Reescribir 5.102
  estilos en línea es cambiar toda la app a la vez, que es justo lo que pediste
  evitar.
- **No** rediseñar la navegación ni mover módulos de lugar.
- **No** tocar la lógica de datos, RPC, consultas ni realtime. Este plan no
  abre un solo archivo de `src/lib/domain` ni de `supabase/`.
