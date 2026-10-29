<p align="center">
  <img src="assets/toki-banner.svg" alt="Toki: tu acompañante de ahorro de tokens. Cada token cuenta." width="880">
</p>

# Toki: tu acompañante de ahorro de tokens

**Cada token cuenta.** Toki es un robot de limpieza que vive sobre tu prompt en Claude Code: aspira el ruido para que Claude lea solo lo que importa. Lo instalas una vez y se encarga solo: compacta las salidas ruidosas, rescata los errores que se esconden, recuerda lo importante cuando Claude Code compacta, mapea tu proyecto y te avisa justo cuando conviene actuar. Toma las mejores ideas de las herramientas de ahorro más populares, las combina sin que se pisen y nunca sacrifica calidad para ahorrar.

Habla español e inglés. Lo único fijo que agrega a tu contexto son ~200 tokens (en el caché) para pedir respuestas breves, y lo que cuestan se resta de lo que ahorran.

> Versión 0.17.4. Requiere Claude Code 2.1.287 o posterior. [English below](#english).

## Instalación

En una sesión de Claude Code:

```
/plugin install toki --marketplace DMercadoCanas/toki
```

Responde `y` para agregar el marketplace y elige el alcance (Enter para "usuario"). Queda activo de inmediato. Desde la terminal del sistema es lo mismo con `claude plugin install toki --marketplace DMercadoCanas/toki`. En la app de escritorio: botón **+** junto al cuadro de texto → **Plugins** → **Add marketplace** con `DMercadoCanas/toki` → **Add plugin**.

## Lo nuevo en 0.17

- **El ahorro, medido y en dólares.** Antes la barra tenía tres cifras, y la primera, «ahorrado», solo contaba las salidas recortadas: en una sesión sin tests ni builds se quedaba en ~0 aunque Toki ahorrara por otro lado. Ahora hay una sola cifra, lo ahorrado en la sesión a precio de API, con cuánto menos costó que sin Toki («ahorrado $0.42 −18 %»). Suma todo lo que ahorra:
  - **Modelo y esfuerzo:** cada pedido se compara con el mismo pedido sin Toki (tu modelo, tu esfuerzo y el caché que tu modelo habría tenido), con lo que devolvió la API. Lo que costó de más (reescribir el caché al cambiar de modelo, más esfuerzo, la consulta a Haiku) se resta. Si en neto costó de más, la barra lo dice.
  - **Relecturas evitadas y salidas recortadas**, ahora también en dólares.
  - **Empezar en limpio:** si Toki lo propone y dices que sí, la conversación de antes deja de releerse en cada pedido. Cuenta hasta que esa conversación habría llegado al 80 % de la ventana, hasta que compactes o hasta que termine la sesión.
  - **Respuestas breves** (abajo).
  - `/toki` desglosa de dónde sale cada dólar y dice «esta sesión costó X; sin Toki habría costado Y». La tarjeta semanal y el aviso del lunes traen la cifra neta y la comparación con la semana anterior. Con suscripción no lo pagas aparte: es uso de tus límites que te queda libre.
  - Lo ahorrado antes de 0.17 (solo tokens) se pasa a dólares una sola vez, a precio de Sonnet, y el panel dice cuánto fue estimado.
- **Respuestas breves desde el primer mensaje.** Una sección fija al final del system prompt (~200 tokens, en el caché) le pide a Claude respuestas sin relleno; el código, los comandos, los errores y las rutas no se tocan. Medido sin Toki en Opus 5.5: ~12 % menos salida en tareas de código y ~15 % en preguntas abiertas, con los tests pasando igual ([evals/modo-breve](evals/modo-breve)). El ahorro se cuenta con el 12 %, en tu modelo y con tu esfuerzo, menos lo que cuesta mandar la sección. Si eliges tu propio `/output-style`, se respeta; se apaga en `/plugin` → Toki → Respuestas breves.
- **La entrevista se cumple.** En un pedido grande con entrevista, hasta que Claude te pregunte, Toki frena (y le dice por qué) las herramientas que cambian algo y los subagentes; leer para preparar las preguntas sí pasa. A lo sumo 3 veces por mensaje: nunca un bucle. «Con» o «sin entrevista» se cuenta al terminar, según Claude haya preguntado de verdad; si lo interrumpes antes de que pregunte, no cuenta. Las preguntas de Toki no cuentan como las de Claude.
- **Investigar no se entrevista.** «¿Por qué falla…?» va directo: Claude investiga primero. Y «esto hay que solucionarlo…» retoma lo anterior, así que Toki no ofrece empezar en limpio aunque parezca otro tema.
- El chip del modelo lleva ✓ cuando la API confirma qué modelo respondió.
- **0.17.1: el esfuerzo de verdad.** Toki suponía esfuerzo «medio» al abrir la sesión y no se enteraba de `/effort`: si ibas en «muy alto», planeaba como si fueras en medio y no bajaba nada. Ahora, antes de cada mensaje, lo lee como Claude Code: `CLAUDE_CODE_EFFORT_LEVEL`, lo que `/effort` guardó en tu configuración o en la del proyecto, y el por defecto de cada modelo. `/effort` (también `max`) cuenta desde el mensaje siguiente. Si aun así el primer pedido trae otro, Toki decide de nuevo antes de que salga y sin preguntar: aplica lo que ahorra, no sube lo que cuesta más y respeta lo que elegiste en la pregunta. Si tu cuenta trae otro por defecto que el de fábrica, lo recuerda para la próxima sesión. El diagnóstico lo anota como `ruta corregida`. Y si otro hook frena tu mensaje, lo que Toki planeó para él ya no pasa al siguiente.
- **0.17.2: Toki pasa la aspiradora.** El Toki en píxeles dejó la escoba: ahora trabaja con una aspiradora de manguera anillada que chupa los tokens del suelo, y tiene manos de garra de dos pinzas.
- **0.17.3: la barra muestra a cuánto compacta.** Al cambiar de modelo, la barra podía saltar a «de 1.0M» aunque Claude Code siguiera compactando a los 300k. Ahora muestra siempre la ventana a la que de verdad se compacta.
- **0.17.4: bajar el esfuerzo con cuidado, y un ahorro más honesto.** Una orden corta que cambia código («agrega el campo cups») ya no va en esfuerzo bajo. Si un mensaje que Toki bajó pasa de 8 pedidos o entra en bucle, vuelve a tu esfuerzo a mitad del turno, y una corrección («no, eso no») nunca cuenta como simple. Lo que ahorra bajar el esfuerzo se cuenta a la mitad de la tabla hasta tener datos: 1 de cada 10 mensajes que Toki bajaría va con tu esfuerzo, de testigo, y `/toki-modelo` muestra lo medido. Si las respuestas breves no pueden ir en el system prompt, Toki se lo pide a Claude con una nota y te sugiere una vez `/output-style` → `toki:conciso`. En la app de escritorio, el robot y el texto de la barra van lado a lado.

## Lo nuevo en 0.16

- **Nota de la semana.** La tarjeta de `/toki-semana` trae ahora una nota de A a F con tres partes, cada una con su porqué. El consejo del final apunta a la parte más floja.
  - **Contexto** (la mitad de la nota): cuántos pedidos pasaron de 150k de contexto.
  - **Claridad**: cuántos de tus mensajes corregían lo anterior («no, eso no…»). Cuenta desde 10 mensajes.
  - **Caché**: cuántas veces volviste con el caché vencido y mucho contexto.
  - La nota aparece desde 20 pedidos y 5 mensajes tuyos en la semana.
- **Más cifras en la tarjeta:**
  - cuánto ahorró elegir modelo y esfuerzo por mensaje (a precio de API; con suscripción es límite que no gastas);
  - cuántos de tus mensajes respondió cada modelo;
  - las correcciones por pedido con y sin preguntas antes;
  - cuántos consejos para pedir mejor te dio Toki.
  - Si casi todo fue a Opus, el consejo sugiere `/toki-sonnet sí`.
- **`/toki-semana md`** guarda la tarjeta en Markdown en `.claude/toki/semana-AAAA-MM-DD.md`, lista para pegar en un documento o mandar al equipo. La carpeta se ignora sola en git. Con la semana anterior: `/toki-semana pasada md`.
- **El aviso del lunes** lleva la nota y dice cómo ver la tarjeta: `/toki-semana pasada`.
- **0.16.1: palabras con tilde y ñ.** Toki leía mal algunas: «no funcionó» no contaba como que seguías atascado (y el mensaje podía ir a un modelo más barato justo ahí), «área» contaba como pedir que pensara a fondo y «un pequeño sistema» no contaba como proyecto nuevo. Ahora reconoce cualquier letra. Y `/toki-sonnet actívalo` o `apágalo`, como dice su ayuda, ya funcionan.
- **0.16.2: un registro para afinar a Toki.** `.claude/toki/diagnostico.txt` ahora sigue entre sesiones (las últimas 1000 líneas, varios días de uso). Anota cada decisión de modelo y esfuerzo, lo que deshiciste, qué mensajes corregían el anterior y, de cada mensaje, lo que gastó de verdad junto a lo que Toki estimó. Nunca guarda el texto de tus mensajes: solo el tipo de mensaje, el porqué, el cambio y las cifras. Sirve para ajustar los umbrales con uso real. Queda en la carpeta del proyecto, que git ignora sola.
- **0.16.2: lo que se midió en una sesión real.** En un mensaje simple, bajar el esfuerzo de medio a bajo no ahorra: la respuesta sale del mismo tamaño. Toki ya no lo cambia ni lo cuenta como ahorro; `/toki-modelo` dice «sin cambio (casi no cambia el costo)». Lo que más pesa es cuántas veces se relee el contexto: cada vez que Claude usa una herramienta. Además, un «gracias» después de pensar a fondo ya no hereda lo profundo ni cambia de modelo. Y cuando Toki no puede preguntar (`claude -p`, o porque lo callaste) y lo recomendado reescribiría el caché, al menos baja el esfuerzo en tu modelo, si eso ahorra.

## Lo nuevo en 0.15

- **Solo Sonnet hasta que haga falta.** Actívalo con `/toki-sonnet sí` o en la configuración. Toki trabaja en Sonnet, que cuesta la mitad que Opus, y sube a Opus solo cuando hace falta: cuando pides pensarlo a fondo («ultrathink», «analiza a fondo…») o cuando algo sigue fallando. Cuando vuelves a algo normal, vuelve a Sonnet.
  - Cambia de modelo cuando sale gratis (al empezar, o con el caché vencido) o cuando el cambio se paga en los próximos mensajes; con un caché grande y caliente, espera.
  - Subir a Opus cuesta más: en modo `preguntar`, Toki te pregunta antes. Volver a Sonnet ahorra, así que lo hace solo y lo avisa.
  - Los subagentes generales también van en Sonnet, salvo los que piden pensar a fondo o retoman algo que falló. Con Fable u otro modelo, Toki solo ajusta el esfuerzo.
  - `/toki-sonnet` muestra si está activo y cuántos mensajes fueron en cada modelo en la sesión.
- **Si eliges modelo con `/model`, manda tu elección.** Si eliges Opus, Sonnet primero queda en pausa por la sesión; `/toki-sonnet sí` lo reanuda.
- **`/toki-modelo deshacer`** vuelve atrás el último cambio de modelo o esfuerzo, igual que el botón Deshacer, y Toki no lo repite solo en la sesión para mensajes del mismo tipo.
- **El ahorro por modelo cuenta cada mensaje.** Antes contaba solo el mensaje en que Toki cambiaba de modelo. Ahora cuenta también los que siguen en el modelo más barato, contra lo que costaría cada uno sin Toki (tu modelo, con tu esfuerzo).

## Lo nuevo en 0.14

- **Preguntas antes de un pedido grande.** Si empiezas algo nuevo y amplio («quiero una app para…», «diseña la arquitectura de…») sin decir archivos ni cuándo está listo, Toki le pide a Claude que te haga 2-4 preguntas de opción múltiple (la recomendada primero) y deje el resumen en `.claude/toki/spec.md`. Cuesta ~1-2k tokens y evita correcciones. No pregunta en seguimientos, pedidos ya detallados, comandos ni con `claude -p`. Escribe «sin preguntas» para saltarla; tras 3 saltos Toki se calla. `/toki-entrevista auto|preguntar|no`; sin argumento muestra cuántas correcciones hubo con y sin entrevista.
- **Consejos para pedir mejor.** Un aviso corto (una vez por tipo, máximo 2 veces): comprobar el resultado, nombrar el archivo, separar tareas mezcladas, acotar un «todo».
- **Empezar en limpio.** Tras dos correcciones sobre lo mismo, o un cambio de tema con mucho contexto, Toki ofrece limpiar y te devuelve el mensaje (con lo que ya probaste, si fue una corrección).

## Lo nuevo en 0.13

**Tarjeta semanal.** El primer lunes que abres Claude Code, Toki te avisa que la semana anterior ya está lista. Con `/toki-semana` ves la semana en curso; con `/toki-semana pasada`, la anterior. La tarjeta muestra cuánto ahorró por tipo (salidas compactadas, salidas repetidas, búsquedas, textos pegados), cómo te fue contra la semana previa, relecturas evitadas, lecturas frenadas, tokens leídos, pedidos y sesiones, tu mejor día y tu racha. El costo solo aparece si pagas por token. Cierra con un consejo según tu semana: por ejemplo, si muchos pedidos fueron con contexto largo, usa `/clear` o `/compact` entre tareas.

**Presupuesto por tarea.** `/toki-presupuesto $2` o `/toki-presupuesto 500k` pone un tope a lo que estás haciendo. Toki avisa al 50 % y al 80 % (y la barra muestra `tope 80%`). Si pasas el tope, antes de tu próximo mensaje te pregunta qué hacer:

- seguir en modo ahorro (modelo y esfuerzo más baratos hasta que termine la tarea);
- subir el tope un 50 %;
- parar, con tu mensaje de vuelta en el cuadro;
- quitar el tope.

El tope se borra con `/clear` o con `/toki-presupuesto quitar`. Con suscripción, en tokens es más fiel que en dólares.

**Benchmark con la herramienta oficial.** `evals/` tiene ahora siete casos para `claude plugin eval`, y `evals/benchmark.py` convierte el resultado en una tabla de nota y costo con y sin Toki (ver [Resultados medidos](#resultados-medidos-con-y-sin-toki)).

## Lo nuevo en 0.12

**0.12.1: archivos generados, por tramos.** En una prueba en vivo, cuando Toki frenaba la lectura de un `package-lock.json`, Claude la repetía enseguida y se llevaba el archivo entero. Ahora la segunda lectura trae solo las primeras 300 líneas y la tercera, el archivo completo. Con el cambio, Claude pasó a leer por tramos: 2–16 KB en vez de 35 KB.

**Búsquedas enormes.** Si Claude corre por la terminal un `grep -r`, `rg`, `git grep`, `find` o `fd` sin filtrar y la salida pasa de 30 KB, Claude Code la corta a ciegas. Toki entrega en su lugar un resumen: coincidencias por archivo (o rutas por carpeta), las primeras coincidencias de los archivos con más, y la ruta de la salida completa para que Claude busque ahí. Probado con `claude -p`: un `grep -rn` de 254 KB (1.800 líneas en 60 archivos) llegó como un resumen de ~3k tokens y Claude respondió bien. Se apaga con la opción "Resumir búsquedas enormes".

## Lo nuevo en 0.11

**Textos pegados enormes.** Todo lo que pegas en el chat (un log, un JSON, un archivo entero) se queda en la conversación y Claude lo relee en cada mensaje que sigue: un log de ~15k tokens en una conversación de 30 mensajes son ~450k tokens releídos. Si pegas más de ~10k tokens, Toki pregunta antes de enviar:

- **Guardar en archivo y enviar lo esencial ★**: guarda el texto completo en `.claude/toki/pegados/` y a Claude le llega el principio (donde suele ir tu pregunta), el final (donde suele estar el error), las líneas con error del medio y la ruta de la copia. Claude lee el resto con Grep o por tramos si lo necesita.
- **Enviar completo**: tal cual. Si lo eliges dos veces, Toki no vuelve a preguntar en la sesión.

Se apaga con la opción "Textos pegados enormes". En `claude -p` no pregunta ni toca nada.

## Lo nuevo en 0.10

**Frena la lectura de archivos generados.** Si Claude intenta leer entero un lockfile (`package-lock.json`, `yarn.lock`, `Cargo.lock`…), código minificado, un `.map`, código generado (`.g.dart`, `.pb.go`…) o algo dentro de `node_modules`/`dist`, Toki lo detiene la primera vez y le sugiere buscar con Grep o leer un tramo con `offset` y `limit`. Si Claude insiste con la misma lectura, se la entrega: nunca te quedas sin el archivo. Se apaga con la opción "Frenar lecturas de archivos generados".

## Lo nuevo en 0.9

- **Aviso de caché vencido antes de enviar.** El caché dura 1 hora con una suscripción y 5 minutos en la API. Si vuelves después y la conversación pesa más de 60k tokens, tu próximo mensaje reescribe todo el contexto a precio de escritura, entre 25 y 40 veces lo que cuesta releerlo. Por eso Toki te pregunta antes de enviar y te muestra el costo: con 220k en Opus y una suscripción, «cuenta como ~5 mensajes normales de tu límite»; en la API, «≈$1.06 más que con el caché vivo». Las opciones:
  - **Compactar y enviar:** Toki compacta con su memoria de la tarea y reenvía tu mensaje solo. Después, cada mensaje sale ~30-50% más barato. Desde 120k tokens es la recomendada (★).
  - **Enviar así:** con menos de 120k es la recomendada. Si la eliges dos veces, Toki no vuelve a preguntar en esa sesión.
  - **Empezar en limpio:** Toki hace `/clear` y te devuelve el mensaje al cuadro, con una nota de la tarea, las decisiones y los archivos de antes. Lo revisas y lo envías.
- **Guardia de límites (planes con suscripción).** Toki calcula a tu ritmo de gasto cuándo se acaba la ventana de 5 horas y la semanal. En la de 5 horas usa tu ritmo de los últimos 45 minutos, si lo hay.
  - Si se acaba antes de renovarse, avisa una sola vez por ventana: desde el 50% en la de 5 horas y desde el 30% en la semanal. La barra lo muestra: `5 h 72% se acaba ~3:40 p. m.`.
  - Al 90%, antes de enviar, pregunta una vez: **Modo ahorro hasta que se renueve**, **Seguir igual** o **Esperar**, que deja tu mensaje en el cuadro.
  - En modo ahorro, cada mensaje va con la opción Ahorro sin preguntar: Sonnet si el contexto es chico y menos esfuerzo. `/toki-modelo preguntar` lo quita.
- **Se pueden apagar:** **Avisar si el caché venció** y **Vigilar tus límites**, en la configuración. En `claude -p` y en el SDK nunca preguntan.

## Lo nuevo en 0.8

- **Modelo y esfuerzo para cada mensaje.** Antes de enviar tu mensaje, Toki lo lee y lo clasifica: trivial, normal, complejo o profundo. Usa reglas rápidas y, si duda, una consulta corta a Haiku que dura como máximo 2 segundos. Luego elige el modelo y el esfuerzo de ese mensaje:
  - Un "renombra foo a bar" va con Sonnet y esfuerzo bajo.
  - Un "ultrathink: analiza a fondo…" va con Opus y esfuerzo máximo.
  - Si te trabas ("sigue fallando", "no funciona"), sube un nivel.
- **Te muestra las opciones con sus consecuencias.** Hasta tres opciones, Calidad, Equilibrio y Ahorro, más **Dejar como está**. Cada una muestra su modelo y esfuerzo, cuánto cuesta frente a lo que tienes (`+40%`, `−65%`) y, si cambia el modelo, cuánto caché se reescribe. La recomendada lleva ★.
- **Cuándo pregunta y cuándo cambia solo.** Por defecto pregunta solo si la opción cuesta más o si cambiar el modelo reescribiría más de 30k tokens de caché. Si la opción ahorra, la aplica sola.
- **Te avisa cuando cambia algo.** Si Toki cambia algo, la barra parpadea, suena una campanita y aparece "⚡ Este mensaje va con Sonnet · esfuerzo bajo". El botón **Deshacer** vuelve a lo de antes.
- **Respeta tus decisiones.** Si eliges "Dejar como está", Toki recuerda tu elección para ese tipo de mensaje. Si la eliges 3 veces, deja de preguntar en esa sesión.
- **Cambia entre Opus y Sonnet solo cuando conviene.** Cambiar de modelo obliga a reescribir el caché una vez. Toki solo cambia cuando la conversación es chica o el caché ya está frío (sesión nueva, después de `/clear` o de compactar, o caché vencido). Cambiar el esfuerzo no toca el caché, así que eso lo ajusta siempre que cambie el costo.
- **Subagentes con Sonnet.** Si trabajas con Opus, los subagentes de propósito general con encargos sencillos van con Sonnet. Los que tienen su propio modelo (Explore suele usar Haiku) no se tocan.
- **Para comprobar que funciona:** después de cualquier mensaje, `/toki-modelo` muestra la línea «Último mensaje: complejo (…) · Opus · máximo → Opus · alto (−40%) · aplicado», aunque no haya cambiado nada. Mientras un mensaje va con otro modelo o esfuerzo, la barra lo dice: «Opus · alto · por Toki». Y `.claude/toki/diagnostico.txt` guarda por mensaje una línea `ruta:` (lo que decidió) y otra `uso:` (lo que gastó).
- **`/toki-modelo`** muestra lo que decidió en la sesión y cambia el modo:
  - `preguntar`: el de siempre.
  - `siempre`: pregunta cada vez.
  - `automatico`: nunca pregunta.
  - `no`: apagado.

  También se cambia en la configuración, en **Modelo y esfuerzo por mensaje**.
- **Seguro si algo no calza.** Si tu cuenta no tiene acceso al modelo que Toki eligió y la API responde con otro, Toki lo nota, deja de cambiar el modelo y te avisa. En `claude -p` no puede preguntar: solo aplica lo que no cuesta más ni reescribe el caché. Si lo recomendado lo reescribiría, al menos baja el esfuerzo en tu modelo, si eso ahorra.

Medido con `claude -p` y Opus 5.5 de modelo:

| Mensaje | Qué decidió Toki | Resultado |
|---|---|---|
| "renombra la constante foo a bar en utils.js" | trivial → Sonnet, esfuerzo bajo | respondió Sonnet, $0.20 el mensaje |
| "ultrathink: analiza a fondo todos los escenarios…" | profundo → Opus, esfuerzo máximo | respondió Opus con ~16k tokens de razonamiento |

## Lo nuevo en 0.7

- **Compacta antes en modelos de 1M.** Con Opus o Sonnet de 1M, Claude Code espera hasta ~500k (o ~967k, según la cuenta) para compactar, y cada mensaje relee la conversación entera. En una sesión de 128 llamadas que crece hasta ~346k, eso son unos 25M tokens leídos del caché. Toki baja ese umbral a **300k** (puedes elegir 200k, 400k, 500k o dejar el de Claude Code), y su memoria le recuerda la tarea a Claude después de compactar. Si ya elegiste un umbral (`/autocompact` o `CLAUDE_CODE_AUTO_COMPACT_WINDOW`), no lo toca. Probado con sesiones reales: Claude Code lo respeta porque Toki lo pone al arrancar la sesión.
- **Te muestra a dónde se va cada token.** Con las cifras que la API reporta pedido por pedido: cuánto fue releer la conversación, escribir al caché, entrada nueva, respuestas y razonamiento, y subagentes. Si el ahorro va en 0, `/toki-por-que` te dice por qué.
- **Relecturas evitadas.** Lo que Toki saca del contexto (o lo que compacta antes) Claude ya no lo relee en cada pedido siguiente. Toki lo cuenta aparte, pedido por pedido, y descuenta lo que cuesta la compactación misma.
- **Salidas repetidas en una línea.** Si un comando devuelve exactamente lo mismo que hace un rato (`git status`, un build sin cambios), Claude recibe una línea con la ruta de la copia.
- **Modo conciso por tamaño.** Se activa cuando la conversación pasa de ~150k tokens (o la mitad de la ventana de compactación). Antes era al 50% de la ventana, y con 1M de ventana llegaba tarde o nunca.
- **Lo que no hace, a propósito:** Claude Code ya evita releer un archivo que no cambió, así que Toki no lo duplica. Tampoco recorta lo que Claude pidió exacto (`cat`, `sed -n`, `git diff`), para no perder información.

## Lo nuevo en 0.6

- **Se llama Toki** y tiene logo, eslogan y voz propia.
- **Rescate del `| tail`.** Claude suele cortar la salida de los tests con `| tail -n 80`, y el fallo queda en medio, fuera del corte. Toki guarda la salida completa en el camino y le agrega a Claude solo los errores que el corte escondió. En la prueba medida, **la misma tarea gastó la mitad de tokens** y Claude encontró el fallo a la primera.
- **Inglés.** Toki habla el idioma en que le escribes a Claude (o el que elijas).
- **Memoria a prueba de todo.** Si el hook de compactación no puede correr (Windows sin Git Bash) o el guardia de tu empresa lo bloquea, Toki detecta la compactación por su cuenta y le deja la nota a Claude igual.
- **Aviso de cambio de modelo en cuentas de empresa,** donde antes no llegaba el evento.
- **Mantener el caché caliente** (opcional, solo si pagas por token en la API).
- **Rachas y logros:** 🔥 días seguidos ahorrando, medallas, confeti y una fanfarria corta cuando desbloqueas una.
- **PowerShell:** en Windows sin Git Bash, Toki compacta, guarda la copia completa (con `Tee-Object`) y rescata lo que esconde un `| Select-Object -Last`. Probado con la herramienta PowerShell real de Claude Code.
- **Si venías de ahorro-tokens,** la primera vez que arranca Toki trae tu total, tu historial y tu racha.

## Qué hace

| Pieza | Qué hace | Inspirada en |
|---|---|---|
| **Compactador de salidas** | Tests, builds, instalaciones, linters y logs llegan a Claude compactados: agrupa líneas repetidas y parecidas, y conserva cada error, advertencia, el inicio y el final. El original completo queda guardado. | RTK, Token Optimizer |
| **Rescate de errores escondidos** | Claude Code recorta las salidas largas de los comandos que fallan, y justo ahí suele estar el error. Toki copia la salida completa mientras el comando corre y le entrega a Claude el error real, en menos espacio. | Idea propia |
| **Rescate del `\| tail`** | Si Claude corta un test o un build con `\| tail`, Toki le agrega los errores que quedaron fuera del corte, con su contexto. Lo que Claude pidió llega intacto. | Idea propia |
| **Memoria que sobrevive la compactación** | Toki anota la tarea, las decisiones, los archivos editados, los últimos comandos y errores. Cuando Claude Code compacta, se lo recuerda a Claude en una nota corta para que siga donde quedó. | Token Optimizer |
| **Detector de bucles** | Si el mismo comando falla 3 veces seguidas, le pide a Claude cambiar de enfoque antes de seguir reintentando. | Token Optimizer |
| **Mapa del proyecto** | Archivos, símbolos y módulos más usados, sin gastar tokens del modelo. La primera vez que Claude busca algo, le avisa que el mapa existe. | Graphify |
| **Toki, el acompañante** | Un robot de limpieza vivo sobre el prompt que actúa lo que Claude hace, con medidores de contexto, caché, ahorro, racha y límites del plan, y un botón cuando hay algo que hacer. | Token Optimizer |
| **Compactación temprana** | En modelos de 1M, compacta a los 300k en vez de esperar a ~500k-967k: cada mensaje relee menos. La memoria de Toki guarda la tarea. | Idea propia |
| **Cuenta real del gasto** | Lo que costó cada pedido según la API (relectura, caché, entrada, salida, subagentes) y las relecturas que Toki evitó. | Token Optimizer |
| **Salidas repetidas** | La misma salida otra vez llega como una línea con la ruta de la copia. | Token Optimizer |
| **Modelo y esfuerzo por mensaje** | Lee tu mensaje antes de enviarlo y elige el modelo y el esfuerzo que pide la tarea. Si cuesta más, te muestra opciones con su costo; si ahorra, lo aplica y te avisa, con un botón Deshacer. | Model Matchmaker, claude-model-advisor, claude-router |
| **Aviso de caché vencido** | Si el caché venció y la conversación es grande, Toki pregunta antes de enviar, con el costo de cada opción: compactar y enviar, enviar así o empezar en limpio. | Idea propia |
| **Guardia de límites** | Calcula a tu ritmo cuándo se acaban tus límites de 5 h y semanal, y avisa si se acaban antes de renovarse. Al 90 % ofrece el modo ahorro. | Claude-Code-Usage-Monitor, ccusage |
| **Respuestas breves** | Desde el primer mensaje, una sección fija al final del system prompt le pide a Claude respuestas sin relleno; el código, los comandos, los errores y las rutas no se tocan. Medido sin Toki en Opus 5.5: ~12 % menos salida con tareas de código y ~15 % con preguntas abiertas, con los tests pasando igual ([evals/modo-breve](evals/modo-breve)). Si eliges tu propio `/output-style`, se respeta. | Caveman (nivel lite) |

### Reglas que nunca rompe

1. **Casi cero tokens fijos.** No agrega skills. Lo único fijo es la sección de respuestas breves (~200 tokens, en el caché): lo que cuesta mandarla se resta de lo que ahorra, y puedes apagarla en `/plugin`.
2. **No rompe el caché.** Todo lo que agrega va al final; nunca modifica lo que ya se envió. Cambiar de modelo sí lo reescribe. Toki lo hace sin preguntar solo si el caché está frío o la conversación es chica; si no, te muestra cuánto cuesta y decides tú.
3. **Todo es reversible.** La salida original queda en `.claude/toki/salidas/` y Claude la puede leer cuando la necesite.
4. **Nunca provoca reintentos.** Si no está seguro, no toca nada. No compacta lecturas de archivos, diffs ni salidas que Claude ya filtró con `| grep`.
5. **Nunca pide un permiso nuevo.** Solo cambia cómo corre un comando si Claude Code toma la misma decisión de permisos que con el original.
6. **Si algo falla, no estorba.** Claude sigue trabajando normal.
7. **Nada sale de tu computador.** Sin telemetría, sin red.

## La barra de Toki

```
╭──────────────────────────────────────────────────────────────────────────────────────╮
│ [^‿^] ✓ Toki · Listo. En «npm test» te ahorré ~5.4k tokens.                    − × │
│ contexto █████░░░░░░░ 37% de 300k · caché ● 48 min · ahorrado $0.42 −18 % · 🔥 4 días │
╰──────────────────────────────────────────────────────────────────────────────────────╯
```

- **Toki actúa lo que pasa:** su cara va en la pantalla del robot. `[•_•]···` pensando, `[⊙‿⊙]` leyendo, `[•‿•] ⠋` ejecutando, `✎` editando, `[>‿<] ≋` aspirando (compactando), `[•o•]?` esperando tu permiso, `[^‿^]✓` listo, `\[^‿^]/ ✦` celebrando un logro, `[−_−]zZ` caché frío, `[•△•]!` contexto alto. En la app de escritorio es un dibujo animado en píxeles: parpadea, se toca la barbilla cuando piensa, pasa la aspiradora cuando trabaja, aprieta una caja cuando compacta, duerme cuando el caché se enfría y lanza confeti con cada logro.
- **Una frase y, si hace falta, un botón:** al 70% de contexto (o si la conversación ya pesa más de 200k tokens) aparece **Compactar ahora** (atajo `c`).
- **Medidores:** contexto (contra el tamaño al que se compacta, no contra el millón del modelo), reloj del caché (`●` lleno → `○` frío), lo ahorrado en la sesión en dólares a precio de API con el % frente a lo que habría costado sin Toki (mientras no llega a un centavo, en tokens; el desglose está en `/toki`), tu racha y, en planes con suscripción, los límites de 5 horas y de la semana.
- **Cada ahorro y cada rescate te lo dice** con un aviso corto, y una campanita (solo macOS).
- **`▸ más`** muestra duración, llamadas, salidas compactadas, bucles, cuánto del último turno salió del caché e histórico. **`−`** la deja en una línea. **`×`** la oculta (vuelve con `/toki`).
- **Toki aprende** y lo anota en "Lo que Toki notó": cambios de modelo con el caché caliente, bucles, relecturas del mismo archivo, varias salidas enormes seguidas (mejor un subagente con Haiku), sesiones de más de 3 horas y compactaciones repetidas.

## El panel `/toki`

Cifras grandes en dólares (esta sesión, hoy, 7 días, 30 días, histórico), de dónde sale el ahorro de la sesión (relecturas, recortes, empezar en limpio, respuestas breves, modelo y esfuerzo), lo que costó según la API y lo que habría costado sin Toki, a cuánto compacta, tu racha y tus logros, una gráfica del ahorro por día de las últimas dos semanas, qué ocupa tu contexto ahora, los últimos comandos y qué hizo Toki con cada uno, lo que notó en la sesión y sugerencias concretas.

### Logros

✓ Primer ahorro · 10k tokens · 100k tokens · 1M tokens · 3 días seguidos · 7 días seguidos · Memoria a prueba de compactación · Rescate de errores

## Comandos

- **`/toki`**: el panel con todo lo anterior.
- **`/toki-por-que`**: los últimos comandos y, para cada uno, si se compactó (y cuánto ahorró), si se rescató algo o por qué no se tocó. Si crees que Toki no está ahorrando, empieza por aquí.
- **`/toki-entrevista`**: preguntas antes de pedidos grandes (`auto`, `preguntar`, `no`).
- **`/toki-modelo`**: qué modelo y esfuerzo eligió para cada mensaje, y el modo (`preguntar`, `siempre`, `automatico`, `no`). `/toki-modelo deshacer` vuelve atrás el último cambio.
- **`/toki-sonnet`** `sí` · `no`: Solo Sonnet hasta que haga falta; sin argumento, cómo va.
- **`/toki-semana`** (o `/toki-semana pasada`): la tarjeta de la semana, con su nota de A a F. Agrega `md` para guardarla en Markdown.
- **`/toki-presupuesto`** `$2` · `500k` · `quitar`: un tope para la tarea actual; sin argumentos, cómo va.
- **`/toki-mapa`**: crea o actualiza el mapa del proyecto (también se crea solo, una vez al día, en repositorios git).
- **`/output-style`** → `toki:conciso`: lo mismo que **Respuestas breves**, como estilo (por si apagaste la opción).

## Configuración

En `/plugin`, elige Toki y abre su configuración. Puedes apagar cualquier pieza (compactador, salidas repetidas, mapa automático, acompañante, sonidos, memoria, respuestas breves), fijar el idioma, elegir **Compactar a los…** (200k, 300k, 400k, 500k o "no" para dejar el de Claude Code; el cambio vale desde la próxima sesión) y activar **Mantener el caché caliente**:

- Solo sirve si pagas por token en la API, donde el caché dura 5 minutos. Con una suscripción el caché normalmente dura una hora y Toki no hace nada.
- Mientras lees o piensas, Toki hace un "ping" que solo lee el caché cada ~4 minutos, como máximo 30 minutos después de tu último mensaje. Cada ping cuesta ~10% del precio normal de tu contexto; volver con el caché frío cuesta ~125%.
- Se detiene solo si el caché ya se enfrió, si cambias de modelo o si no hay nada que mantener. Viene apagado.

## Resultados medidos (con y sin Toki)

**Con `claude plugin eval` (0.16, Claude Code 2.1.308, Opus 5.5, 3 corridas por brazo; costo = mediana por corrida según Claude Code, sin el juez):**

| Caso | Con Toki | Sin Toki | Diferencia | Nota (con / sin) |
|---|---|---|---|---|
| `ruta-trivial`: "Renombra la función sumar a add" | $0.038 | $0.085 | **−55 %** | 100 % / 100 % |
| `ruta-compleja`: por qué falla un test de citas que se pisan | $0.074 | $0.073 | +1 % | 100 % / 100 % |
| `lockfile-version`: qué versión hay en un `package-lock.json` de 200 KB | $0.066 | $0.066 | 0 % | 100 % / 100 % |

En la tarea mecánica, Toki la mandó en Sonnet con esfuerzo bajo en las tres corridas, sin perder la respuesta. En la que pide razonar, no tocó el modelo: en las trazas, el contexto que recibió Claude difirió en 8 tokens entre los dos brazos, y el +1 % (menos de $0.001) es una respuesta unas decenas de tokens más larga. En el lockfile, Opus fue directo a Grep, así que Toki no tuvo que frenar nada. Con 0.16, el primer pedido medía lo mismo con y sin Toki (~15k tokens); desde 0.17 lleva además la sección de respuestas breves (~200 tokens).

Los casos con Bash (`test-con-fallo`, `tail-esconde-error`, `salida-enorme`, `busqueda-enorme`) necesitan el sandbox del sistema: se corren en macOS, o en Linux con bubblewrap y socat. Usa `-j 1`: el comienzo del prompt es igual en los dos brazos y queda en el caché, así que si varias corridas arrancan a la vez, el brazo que va primero paga la escritura del caché y sale más caro sin que Toki tenga que ver.

```bash
claude plugin eval . --scaffold --trust-plugin --allow-tools Edit "Bash(npm *)" "Bash(grep *)" --model claude-opus-5-5 --runs 3 -j 1 --json evals/results/r.json
python3 evals/benchmark.py evals/results/r.json
```

**Antes, a mano con `claude -p`:** misma pregunta, mismo modelo (Haiku), dos corridas por escenario, tokens de entrada totales que reporta Claude Code (incluye caché):

| Escenario | Sin Toki | Con Toki | Diferencia |
|---|---|---|---|
| "Corre npm test y dime qué test falla": Claude corta la salida con `\| tail` y el fallo queda en medio | 184.6k–192.6k tokens · 3 comandos | 93.1k tokens · 1 comando | **−50% y dos comandos menos** |
| "Corre npm run enorme y dime qué error aparece al final": 1,6 MB de salida con el error en la última línea | 134.2k–179.9k tokens · 3–4 turnos | 88.1k tokens · 2 turnos | **−34% a −51%** |
| PowerShell: "Corre npm test y dime qué test falla" (Claude Code recorta la salida del fallo por el medio) | 154.7k–208.0k tokens · 4 turnos | 97.1k–97.2k tokens · 2 turnos | **−37% a −53%** |
| PowerShell: `npm test \| Select-Object -Last 30` | ~96k tokens, y Claude **no pudo decir** qué test fallaba | ~96k tokens, respuesta correcta a la primera | misma cifra, la respuesta cambia |
| `npm test` con 1 fallo entre 421 tests (26 KB de salida, sin filtrar) | 94.5k tokens · 2 turnos | 89.8k–94.5k tokens · 2 turnos | hasta −5% |

Lo honesto: el ahorro grande aparece cuando Toki le evita a Claude volver a correr o volver a buscar. En una sesión real larga, cada llamada que se evita vale mucho más que aquí, porque reenvía toda la conversación.

Las **relecturas evitadas** son otra cuenta, aparte: lo que Toki sacó del contexto, multiplicado por cada pedido siguiente que ya no lo releyó, hasta la próxima compactación. Si Toki compactó antes que Claude Code, cuenta la diferencia de tamaño en cada pedido mientras la conversación "sin Toki" no hubiera llegado al umbral de Claude Code, y descuenta una lectura completa por la compactación. Son lecturas de caché: la parte más barata de cada pedido, pero la más grande.

Lo que la barra muestra como "ahorrado" suma, en dólares a precio de API: las relecturas evitadas; las salidas recortadas (lo que Claude habría leído sin Toki, como máximo 30 KB o la vista previa de 2 KB cuando Claude Code guarda la salida en un archivo, menos lo que leyó con él, a ~4 caracteres por token); empezar en limpio; las respuestas breves (con lo medido); y modelo y esfuerzo (con lo que devolvió cada pedido). Resta lo que costó de más. Los rescates y los turnos evitados no se suman, así que en sesiones con tests y builds la cifra se queda corta.

En `evals/` está la suite para `claude plugin eval`: corre cada caso con y sin el plugin y califica el resultado. `evals/README.md` explica cada caso.

## Límites conocidos

- La copia completa y los rescates funcionan con bash y zsh (macOS, Linux, WSL, Git Bash) y con PowerShell. PowerShell está probado con la herramienta real de Claude Code y PowerShell 7; con Windows PowerShell 5.1 (que guarda la copia en UTF-16) solo con pruebas automáticas. Si ves algo raro, `/toki-por-que` lo explica y puedes apagar el compactador en la configuración.
- Toki solo envuelve un comando si Claude Code le da exactamente el mismo permiso que al original. Si tienes reglas finas (por ejemplo `Bash(npm test:*)`), el comando envuelto ya no calza con la regla, así que Toki compacta lo que entrega Claude Code sin copia completa, y lo dice en el encabezado si Claude Code ya había recortado algo.
- En cuentas de empresa (Team o Enterprise), Claude Code carga un guardia que no deja a los plugins intervenir en la compactación, recibir el evento de cambio de modelo ni agregar secciones al system prompt. Las dos primeras, Toki las detecta por su cuenta. Las respuestas breves no se aplican ahí, y por eso tampoco se cuentan: `/output-style` → `toki:conciso` hace lo mismo.
- La franja se dibuja en la terminal y en la app de escritorio. En la extensión de VS Code y en `claude -p` el motor funciona igual, sin franja; `/toki` responde con el reporte en texto.
- El mapa es análisis de texto, no un árbol sintáctico completo: puede omitir símbolos en código poco convencional.

## English

**Toki: your token-saving companion. Every token counts.**

Toki is a little cleaning robot that lives above your Claude Code prompt and vacuums up the noise so Claude reads only what matters. Install it once and it takes care of the rest: on 1M-context models it compacts at 300k instead of waiting until ~500k–967k (every message re-reads the whole conversation), it shows what each request really cost according to the API, it collapses identical repeated outputs into one line, it compacts noisy command output (tests, builds, installs, linters, logs) while keeping every error, rescues the errors Claude Code's truncation or a `| tail` would hide, reminds Claude of the task after a compaction, maps your project without using the model, and tells you when it is the right moment to compact or clear. The only always-on tokens it adds are ~200 (cached) asking for brief replies, and their cost is subtracted from what they save. It never touches file reads or diffs.

```
/plugin install toki --marketplace DMercadoCanas/toki
```

- Toki speaks the language you write to Claude in. You can pin it to `en` or `es` in its settings.
- `/toki` opens the panel: savings for this session, today, 7 and 30 days, your 🔥 streak, achievements, a 14-day chart, what fills your context, and suggestions.
- `/toki-por-que` explains, command by command, what Toki did and why, and where the session's tokens went when savings are ~0.
- **Model and effort per message (0.8).** Before each message is sent, Toki reads it and picks a model and effort: Sonnet on low effort for a rename, Opus on max for "ultrathink". When the pick saves, Toki applies it and shows a notice with **Undo**. When it costs more, or switching models would rewrite more than 30k tokens of cache, Toki asks first and shows each option's cost (`+40%`, `−65%`). Toki only switches between Opus and Sonnet while the context is small or the cache is already cold; effort changes keep the cache. Simple general-purpose subagents run on Sonnet. `/toki-modelo preguntar|siempre|automatico|no` sets how it behaves.
- **Before you send (0.9).** If the cache expired (1 h on a subscription, 5 min on the API) and the conversation is over 60k tokens, Toki asks first and shows the cost, in normal messages or in dollars. You can compact and send (Toki resends your message), send as is, or start fresh: `/clear`, with your message put back in the box with a note of the task. On a subscription, Toki projects when your 5-hour and weekly limits run out at your current pace. It warns once if a limit runs out before it resets. At 90% it offers a saving mode until the reset.
- Settings: **Compact at…** (200k, 300k, 400k, 500k, or "no" to keep Claude Code's); if you already chose a window, Toki leaves it alone.
- Measured with Haiku: when Claude cuts test output with `| tail` and the failure sits in the middle, the same task used **half the tokens** with Toki (93.1k vs 184.6k–192.6k) and needed one command instead of three. With a 1.6 MB output, 88.1k vs 134.2k–179.9k.
- **Weekly card and per-task budget (0.13).** On the first Monday of the week Toki tells you last week's card is ready: `/toki-semana` shows the current week and `/toki-semana last` the previous one. The card shows savings by type, the change against the week before, and one tip. `/toki-presupuesto $2` or `/toki-presupuesto 500k` caps the task at hand. Toki warns at 50% and 80%. Past the cap, it asks before your next message: go on in saving mode, raise the cap 50%, stop, or remove it.
- **Questions before a big request (0.14).** When you start something new and broad ("build me an app that…") without naming files or what done looks like, Toki asks Claude to put 2–4 multiple-choice questions to you first (recommended answer first) and saves the summary to `.claude/toki/spec.md`. It costs ~1–2k tokens and saves rework. Type "no questions" to skip it. `/toki-entrevista auto|preguntar|no`. Toki also shows short tips for asking better, and after two corrections on the same thing it offers to start fresh.
- **Sonnet first, Opus when needed (0.15).** Turn it on with `/toki-sonnet on` or in the settings. Toki works on Sonnet (half the price of Opus) and moves up to Opus only when you ask for deep thinking or something keeps failing, then comes back. It switches when the switch is free (at the start, or with a cold cache) or pays for itself; moving up asks first in `preguntar` mode. Picking a model with `/model` pauses it for the session. `/toki-modelo undo` reverts the last model or effort change, and Toki won't repeat it for that kind of message. Model savings now count every message that stays on the cheaper model, against what it would cost without Toki.
- **Weekly grade and Markdown export (0.16).** The weekly card now has an A–F grade made of three parts, each with its reason: context (half the grade: requests past 150k), clarity (messages that correct the one before) and cache (coming back to an expired cache with a big context). The closing tip targets the weakest part. The card also shows what per-message model and effort choices saved, how many of your messages each model answered, corrections with and without questions first, and the tips Toki gave. `/toki-semana md` saves the card as Markdown under `.claude/toki/` (`/toki-semana last md` for last week). The Monday notice carries the grade and points to `/toki-semana last`.
- **Accented words (0.16.1).** Toki misread some Spanish words with accents or ñ: «no funcionó» (it didn't work) didn't count as being stuck, so the message could go to a cheaper model right then; «área» counted as asking to think hard; and «un pequeño sistema» didn't count as a new project. It now handles any letter. `/toki-sonnet actívalo` and `apágalo`, as its help says, now work too.
- **Decision log (0.16.2).** `.claude/toki/diagnostico.txt` now carries over between sessions (the last 1,000 lines, a few days of use). It records each model and effort decision, what you undid, which messages corrected the one before, and what each message really used next to what Toki estimated. It never stores what you wrote: only the kind of message, the reason, the change and the numbers. It's there to tune Toki's thresholds with real use. It stays in the project folder, which git ignores on its own.
- **Measured in a real session (0.16.2).** On a simple message, going from medium to low effort saves nothing: the answer comes out the same size. Toki no longer changes it or counts it as savings; `/toki-modelo` says "no change (it barely changes the cost)". What weighs most is how often the context is reread: every time Claude uses a tool. A "thanks" after deep thinking no longer inherits the deep level or switches models. And when Toki can't ask (`claude -p`, or you silenced it) and the pick would rewrite the cache, it at least lowers the effort on your model, if that saves.
- **Savings, measured and in dollars (0.17).** The bar used to show three numbers, and the first one, "saved", only counted trimmed output: in a session without tests or builds it stayed at ~0 even when Toki was saving elsewhere. Now there is one number, what the session saved at API prices and how much less it cost than without Toki ("saved $0.42 −18%"). It adds up everything Toki saves: model and effort (each request against the same request without Toki: your model, your effort and the cache your model would have had, from what the API returned, minus what cost extra, such as rewriting the cache when switching models); re-reads avoided and trimmed output; starting clean when Toki suggested it; and brief replies. If Toki cost extra overall, the bar says so. `/toki` breaks it down and shows what the session would have cost without Toki; the weekly card and the Monday notice carry the net figure. Savings from before 0.17 (tokens only) are converted once, at Sonnet prices.
- **Brief replies from the first message (0.17).** A fixed section at the end of the system prompt (~200 tokens, cached) asks Claude for replies without filler; code, commands, errors and paths are left alone. Measured without Toki on Opus 5.5: ~12% less output on coding tasks and ~15% on open questions, with tests passing the same ([evals/modo-breve](evals/modo-breve)). Savings are counted at 12%, on your model and effort, minus the cost of sending the section. Your own `/output-style` is respected; turn it off in `/plugin` → Toki → Brief replies.
- **The interview is enforced (0.17).** On a big request with an interview, until Claude asks you, Toki blocks (and says why) tools that change things and subagents; reading to prepare the questions is allowed. At most 3 times per message, never a loop. "With" or "without interview" is counted at the end, by whether Claude really asked; if you interrupt before it asks, it doesn't count. Asking why something fails is never interviewed: Claude investigates first.
- **The real effort (0.17.1).** Toki assumed medium effort when a session opened and didn't notice `/effort`: on extra-high it planned as if you were on medium and lowered nothing. Before each message it now reads the effort the way Claude Code does: `CLAUDE_CODE_EFFORT_LEVEL`, what `/effort` saved in your settings or the project's, and each model's default. `/effort` (`max` too) counts from the next message. If the first request still carries a different effort, Toki decides again before it goes out, without asking: it applies what saves, doesn't raise what costs more, and keeps what you picked in the question. If your account's default differs from the factory one, Toki remembers it for the next session. The log records it as `ruta corregida`. And if another hook drops your message, what Toki planned for it no longer carries over to the next one.
- **Toki vacuums (0.17.2).** The pixel Toki put the broom away: it now works with a vacuum with a ribbed hose that sucks the tokens off the floor, and has two-pincer claw hands.
- **The bar shows where it compacts (0.17.3).** After a model switch, the bar could jump to "of 1.0M" while Claude Code kept compacting at 300k. It now always shows the window it really compacts at.
- **Lowering effort carefully, and more honest savings (0.17.4).** A short order that changes code ("add the cups field") no longer goes on low effort. If a message Toki lowered passes 8 requests or loops, it goes back to your effort mid-turn, and a correction ("no, not that") never counts as simple. The saving from lowering effort counts at half the table until there is data: 1 in 10 messages Toki would lower goes at your effort as a control, and `/toki-modelo` shows what was measured. If brief replies can't go in the system prompt, Toki asks Claude with a note and suggests `/output-style` → `toki:conciso` once. In the desktop app, the robot and the bar's text sit side by side.
- Measured with `claude plugin eval` on Opus: a mechanical rename cost **55% less** with Toki (it routed to Sonnet on low effort) with the same result. A task that needs reasoning was left untouched.
- Optional for API (pay-per-token) users: keep the 5-minute prompt cache warm while you read or think, at ~10% of the cost of reprocessing.
- On Team and Enterprise accounts, a Claude Code guard stops plugins from adding to the system prompt, so brief replies don't apply there and aren't counted: `/output-style` → `toki:conciso` does the same.

## Para desarrollar

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

La lógica pura vive en `hooks/` (`compresor.ts`, `gasto.ts`, `cache.ts`, `bucles.ts`, `mapa.ts`, `mascota.ts`, `toki-svg.ts`, `toki-pixel.ts`, `historial.ts`, `memoria.ts`, `idioma.ts`); `hooks/register.tsx` la conecta con Claude Code. Las pruebas están en `tests/`. Los sonidos de `sonidos/` son sintéticos (generados con Python, sin derechos de terceros).

## Créditos

Toki se inspira en las ideas de otros, reimplementadas desde cero:

- [Caveman](https://github.com/JuliusBrussee/caveman), de Julius Brussee: respuestas concisas.
- [RTK](https://github.com/rtk-ai/rtk), de rtk-ai: filtros de salida por familia de comandos.
- [Graphify](https://github.com/safishamsi/graphify), de Safi Shamsi: el mapa del proyecto sin usar el modelo.
- [Token Optimizer](https://github.com/alexgreensh/token-optimizer), de Alex Greenshpun: archivar originales, detectar bucles y el acompañante en la interfaz.
- [Model Matchmaker](https://github.com/jacobcxdev/model-matchmaker), de jacobcxdev, [claude-model-advisor](https://github.com/mmediavilla/claude-model-advisor), de mmediavilla, [claude-router](https://github.com/alexei-led/claude-router), de alexei-led, y [claude-model-router](https://github.com/TFoxik/claude-model-router), de TFoxik: clasificar el mensaje sin gastar tokens, mostrar cuánto cuesta reescribir el caché y cambiar de modelo solo cuando compensa.
- [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor), de Maciek-roboblog, y [ccusage](https://github.com/ryoppippi/ccusage), de ryoppippi: proyectar a tu ritmo cuándo se acaba el límite.

## Licencia

MIT
