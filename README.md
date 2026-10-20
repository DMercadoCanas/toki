<p align="center">
  <img src="assets/toki-banner.svg" alt="Toki: tu acompañante de ahorro de tokens. Cada token cuenta." width="880">
</p>

# Toki: tu acompañante de ahorro de tokens

**Cada token cuenta.** Toki es un robot de limpieza que vive sobre tu prompt en Claude Code: aspira el ruido para que Claude lea solo lo que importa. Lo instalas una vez y se encarga solo: compacta las salidas ruidosas, rescata los errores que se esconden, recuerda lo importante cuando Claude Code compacta, mapea tu proyecto y te avisa justo cuando conviene actuar. Toma las mejores ideas de las herramientas de ahorro más populares, las combina sin que se pisen y nunca sacrifica calidad para ahorrar.

Habla español e inglés. No agrega ni un token fijo a tu contexto.

> Versión 0.6. Requiere Claude Code 2.1.287 o posterior. [English below](#english).

## Instalación

En una sesión de Claude Code:

```
/plugin install toki --marketplace DMercadoCanas/toki
```

Responde `y` para agregar el marketplace y elige el alcance (Enter para "usuario"). Queda activo de inmediato. Desde la terminal del sistema es lo mismo con `claude plugin install toki --marketplace DMercadoCanas/toki`. En la app de escritorio: botón **+** junto al cuadro de texto → **Plugins** → **Add marketplace** con `DMercadoCanas/toki` → **Add plugin**.

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
| **Estilo conciso** | Respuestas cortas sin relleno; el código, los errores y las rutas no se tocan. Se activa solo al 50% de contexto o con `/output-style`. | Caveman (nivel lite) |

### Reglas que nunca rompe

1. **Cero tokens fijos en el contexto.** No agrega skills ni texto que se cargue en cada mensaje.
2. **No rompe el caché.** Todo lo que agrega va al final; nunca modifica lo que ya se envió.
3. **Todo es reversible.** La salida original queda en `.claude/toki/salidas/` y Claude la puede leer cuando la necesite.
4. **Nunca provoca reintentos.** Si no está seguro, no toca nada. No compacta lecturas de archivos, diffs ni salidas que Claude ya filtró con `| grep`.
5. **Nunca pide un permiso nuevo.** Solo cambia cómo corre un comando si Claude Code toma la misma decisión de permisos que con el original.
6. **Si algo falla, no estorba.** Claude sigue trabajando normal.
7. **Nada sale de tu computador.** Sin telemetría, sin red.

## La barra de Toki

```
╭──────────────────────────────────────────────────────────────────────────────────────╮
│ [^‿^] ✓ Toki · Listo. En «npm test» te ahorré ~5.4k tokens.                    − × │
│ contexto ██████░░░░░░░░ 37% · caché ● 48 min · ahorrado ~5.4k · 🔥 4 días · 5 h 25%  ▸ más │
╰──────────────────────────────────────────────────────────────────────────────────────╯
```

- **Toki actúa lo que pasa:** su cara va en la pantalla del robot. `[•_•]···` pensando, `[⊙‿⊙]` leyendo, `[•‿•] ⠋` ejecutando, `✎` editando, `[>‿<] ≋` aspirando (compactando), `[•o•]?` esperando tu permiso, `[^‿^]✓` listo, `\[^‿^]/ ✦` celebrando un logro, `[−_−]zZ` caché frío, `[•△•]!` contexto alto. En la app de escritorio es un dibujo animado: flota, parpadea, gira las ruedas cuando trabaja, aspira con la manguera cuando compacta y lanza confeti con cada logro.
- **Una frase y, si hace falta, un botón:** al 70% de contexto (o si la conversación ya pesa más de 200k tokens) aparece **Compactar ahora** (atajo `c`).
- **Medidores:** contexto, reloj del caché (`●` lleno → `○` frío), tokens ahorrados en la sesión, tu racha y, en planes con suscripción, los límites de 5 horas y de la semana.
- **Cada ahorro y cada rescate te lo dice** con un aviso corto, y una campanita (solo macOS).
- **`▸ más`** muestra duración, llamadas, salidas compactadas, bucles, cuánto del último turno salió del caché e histórico. **`−`** la deja en una línea. **`×`** la oculta (vuelve con `/toki`).
- **Toki aprende** y lo anota en "Lo que Toki notó": cambios de modelo con el caché caliente, bucles, relecturas del mismo archivo, varias salidas enormes seguidas (mejor un subagente con Haiku), sesiones de más de 3 horas y compactaciones repetidas.

## El panel `/toki`

Cifras grandes (esta sesión, hoy, 7 días, 30 días, histórico), tu racha y tus logros, una gráfica del ahorro por día de las últimas dos semanas, qué ocupa tu contexto ahora, los últimos comandos y qué hizo Toki con cada uno, lo que notó en la sesión y sugerencias concretas.

### Logros

✓ Primer ahorro · 10k tokens · 100k tokens · 1M tokens · 3 días seguidos · 7 días seguidos · Memoria a prueba de compactación · Rescate de errores

## Comandos

- **`/toki`**: el panel con todo lo anterior.
- **`/toki-por-que`**: los últimos comandos y, para cada uno, si se compactó (y cuánto ahorró), si se rescató algo o por qué no se tocó. Si crees que Toki no está ahorrando, empieza por aquí.
- **`/toki-mapa`**: crea o actualiza el mapa del proyecto (también se crea solo, una vez al día, en repositorios git).
- **`/output-style`** → `toki:conciso`: respuestas cortas desde ya.

## Configuración

En `/plugin`, elige Toki y abre su configuración. Puedes apagar cualquier pieza (compactador, mapa automático, acompañante, sonidos, memoria, modo conciso), fijar el idioma y activar **Mantener el caché caliente**:

- Solo sirve si pagas por token en la API, donde el caché dura 5 minutos. Con una suscripción el caché normalmente dura una hora y Toki no hace nada.
- Mientras lees o piensas, Toki hace un "ping" que solo lee el caché cada ~4 minutos, como máximo 30 minutos después de tu último mensaje. Cada ping cuesta ~10% del precio normal de tu contexto; volver con el caché frío cuesta ~125%.
- Se detiene solo si el caché ya se enfrió, si cambias de modelo o si no hay nada que mantener. Viene apagado.

## Resultados medidos (con y sin Toki)

Misma pregunta, mismo modelo (Haiku), dos corridas por escenario, tokens de entrada totales que reporta Claude Code (incluye caché):

| Escenario | Sin Toki | Con Toki | Diferencia |
|---|---|---|---|
| "Corre npm test y dime qué test falla": Claude corta la salida con `\| tail` y el fallo queda en medio | 184.6k–192.6k tokens · 3 comandos | 93.1k tokens · 1 comando | **−50% y dos comandos menos** |
| "Corre npm run enorme y dime qué error aparece al final": 1,6 MB de salida con el error en la última línea | 134.2k–179.9k tokens · 3–4 turnos | 88.1k tokens · 2 turnos | **−34% a −51%** |
| PowerShell: "Corre npm test y dime qué test falla" (Claude Code recorta la salida del fallo por el medio) | 154.7k–208.0k tokens · 4 turnos | 97.1k–97.2k tokens · 2 turnos | **−37% a −53%** |
| PowerShell: `npm test \| Select-Object -Last 30` | ~96k tokens, y Claude **no pudo decir** qué test fallaba | ~96k tokens, respuesta correcta a la primera | misma cifra, la respuesta cambia |
| `npm test` con 1 fallo entre 421 tests (26 KB de salida, sin filtrar) | 94.5k tokens · 2 turnos | 89.8k–94.5k tokens · 2 turnos | hasta −5% |

Lo honesto: el ahorro grande aparece cuando Toki le evita a Claude volver a correr o volver a buscar. En una sesión real larga, cada llamada que se evita vale mucho más que aquí, porque reenvía toda la conversación.

Lo que la barra muestra como "ahorrado" es la diferencia entre lo que Claude habría leído sin Toki (como máximo 30 KB, o la vista previa de 2 KB cuando Claude Code guarda la salida en un archivo) y lo que leyó con él, a ~4 caracteres por token. Es una estimación conservadora y siempre lleva "~": los rescates y los turnos evitados no se suman.

En `evals/` hay una suite para `claude plugin eval`, que corre cada caso con y sin el plugin y califica el resultado (necesita el sandbox del sistema; en macOS viene incluido).

## Límites conocidos

- La copia completa y los rescates funcionan con bash y zsh (macOS, Linux, WSL, Git Bash) y con PowerShell. PowerShell está probado con la herramienta real de Claude Code y PowerShell 7; con Windows PowerShell 5.1 (que guarda la copia en UTF-16) solo con pruebas automáticas. Si ves algo raro, `/toki-por-que` lo explica y puedes apagar el compactador en la configuración.
- Toki solo envuelve un comando si Claude Code le da exactamente el mismo permiso que al original. Si tienes reglas finas (por ejemplo `Bash(npm test:*)`), el comando envuelto ya no calza con la regla, así que Toki compacta lo que entrega Claude Code sin copia completa, y lo dice en el encabezado si Claude Code ya había recortado algo.
- En cuentas de empresa (Team o Enterprise), Claude Code carga un guardia que no deja a los plugins intervenir en la compactación ni recibir el evento de cambio de modelo. Toki lo compensa: detecta ambas cosas por su cuenta.
- La franja se dibuja en la terminal y en la app de escritorio. En la extensión de VS Code y en `claude -p` el motor funciona igual, sin franja; `/toki` responde con el reporte en texto.
- El mapa es análisis de texto, no un árbol sintáctico completo: puede omitir símbolos en código poco convencional.

## English

**Toki: your token-saving companion. Every token counts.**

Toki is a little cleaning robot that lives above your Claude Code prompt and vacuums up the noise so Claude reads only what matters. Install it once and it takes care of the rest: it compacts noisy command output (tests, builds, installs, linters, logs) while keeping every error, rescues the errors Claude Code's truncation or a `| tail` would hide, reminds Claude of the task after a compaction, maps your project without using the model, and tells you when it is the right moment to compact or clear. It adds zero always-on tokens to your context and never touches file reads or diffs.

```
/plugin install toki --marketplace DMercadoCanas/toki
```

- Toki speaks the language you write to Claude in. You can pin it to `en` or `es` in its settings.
- `/toki` opens the panel: savings for this session, today, 7 and 30 days, your 🔥 streak, achievements, a 14-day chart, what fills your context, and suggestions.
- `/toki-por-que` explains, command by command, what Toki did and why.
- Measured with Haiku: when Claude cuts test output with `| tail` and the failure sits in the middle, the same task used **half the tokens** with Toki (93.1k vs 184.6k–192.6k) and needed one command instead of three. With a 1.6 MB output, 88.1k vs 134.2k–179.9k.
- Optional for API (pay-per-token) users: keep the 5-minute prompt cache warm while you read or think, at ~10% of the cost of reprocessing.

## Para desarrollar

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

La lógica pura vive en `hooks/` (`compresor.ts`, `cache.ts`, `bucles.ts`, `mapa.ts`, `mascota.ts`, `toki-svg.ts`, `historial.ts`, `memoria.ts`, `idioma.ts`); `hooks/register.tsx` la conecta con Claude Code. Las pruebas están en `tests/`. Los sonidos de `sonidos/` son sintéticos (generados con Python, sin derechos de terceros).

## Créditos

Toki se inspira en las ideas de otros, reimplementadas desde cero:

- [Caveman](https://github.com/JuliusBrussee/caveman), de Julius Brussee: respuestas concisas.
- [RTK](https://github.com/rtk-ai/rtk), de rtk-ai: filtros de salida por familia de comandos.
- [Graphify](https://github.com/safishamsi/graphify), de Safi Shamsi: el mapa del proyecto sin usar el modelo.
- [Token Optimizer](https://github.com/alexgreensh/token-optimizer), de Alex Greenshpun: archivar originales, detectar bucles y el acompañante en la interfaz.

## Licencia

MIT
