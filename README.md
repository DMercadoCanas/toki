# ahorro-tokens

**El acompañante de ahorro de tokens para Claude Code.** Lo instalas y listo: no tienes que aprender qué skill usar ni cuándo compactar. Toma las mejores ideas de las herramientas de ahorro más populares, las combina sin que se pisen entre sí, y nunca sacrifica calidad para ahorrar.

> Versión 0.5 (prototipo). Requiere Claude Code 2.1.287 o posterior.

## Qué hace

| Pieza | Qué hace | Inspirada en |
|---|---|---|
| **Compactador de salidas** | Cuando corres tests, builds, instalaciones, linters o logs, Claude recibe una versión compacta: agrupa líneas repetidas y parecidas, y conserva cada error, advertencia, el inicio y el final. El original completo queda guardado. | RTK, Token Optimizer |
| **Rescate de errores escondidos** | Claude Code recorta por la mitad las salidas largas de los comandos que fallan, y justo ahí suele estar el error. ahorro-tokens copia la salida completa mientras el comando corre y le entrega a Claude el error real, en menos espacio. | Idea propia |
| **Memoria que sobrevive la compactación** | Toki anota en silencio la tarea actual, las decisiones que Claude va tomando, los archivos editados, los últimos comandos y errores. Cuando Claude Code compacta el contexto, se lo recuerda en una nota corta para que siga donde quedó sin volver a explorar. | Token Optimizer |
| **Detector de bucles** | Si el mismo comando falla 3 veces seguidas, le avisa a Claude que cambie de enfoque antes de seguir reintentando. | Token Optimizer |
| **Mapa del proyecto** | Genera un mapa de archivos, símbolos y módulos más usados, sin gastar tokens del modelo. La primera vez que Claude busca algo en la sesión, le avisa que el mapa existe. | Graphify |
| **Toki, el acompañante** | Una barra viva sobre el prompt con una mascota que actúa lo que Claude hace (piensa, lee, ejecuta, edita, compacta, duerme), medidores de contexto, caché, ahorro y límites del plan, una frase que dice qué pasa y un botón cuando hay algo que hacer. | Token Optimizer |
| **Estilo conciso** | Respuestas cortas sin relleno. El código, los errores y las rutas no se tocan. Opcional. | Caveman (nivel lite) |

### Reglas que nunca rompe

1. **Cero instrucciones fijas en el contexto.** No agrega skills ni texto que se cargue en cada mensaje.
2. **No rompe el caché.** Todo lo que agrega va al final, nunca modifica lo que ya se envió.
3. **Todo es reversible.** La salida original queda en `.claude/ahorro-tokens/salidas/` y Claude la puede leer cuando la necesite.
4. **Nunca provoca reintentos.** Si no está seguro, no toca nada. No compacta lecturas de archivos, diffs ni salidas que ya filtraste con `| grep`, `| tail`, etc.
5. **Si algo falla, no estorba.** Claude sigue trabajando normal.
6. **Nada sale de tu computador.** Sin telemetría, sin red.

## Instalación

En una sesión de Claude Code en la terminal:

```
/plugin install ahorro-tokens --marketplace DMercadoCanas/ahorro-tokens
```

Responde `y` para agregar el marketplace y elige el alcance (Enter para "usuario"). Queda activo de inmediato.

Desde la terminal del sistema:

```
claude plugin install ahorro-tokens --marketplace DMercadoCanas/ahorro-tokens
```

En la app de escritorio: botón **+** junto al cuadro de texto → **Plugins** → **Add marketplace** con `DMercadoCanas/ahorro-tokens` → **Add plugin**.

## La barra de Toki

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ (•‿•) Toki · Todo en orden. Esta sesión te ahorré ~5.4k tokens.        − × │
│ contexto ██████░░░░░░░░ 37% · caché ● 48 min · ahorrado ~5.4k · 5 h 25% · semana 12%   ▸ más │
╰──────────────────────────────────────────────────────────────────────────────╯
```

- **La mascota actúa lo que pasa:** `(•_•)···` pensando, `(⊙‿⊙)` leyendo, `(•‿•) ⠋` ejecutando, `✎` editando, `(>‿<)` compactando, `(•o•)?` esperando tu permiso, `(^‿^)✓` listo, `(−_−)zZ` caché frío, `(•△•)!` contexto alto.
- **Una frase y, si hace falta, un botón:** al 70% de contexto aparece **Compactar ahora** (atajo `c`).
- **Medidores:** contexto (verde, amarillo, rojo), reloj del caché (`●` lleno → `○` frío), tokens ahorrados en la sesión y, en planes con suscripción, los límites de 5 horas y semana.
- **Cada vez que ahorra, te lo dice:** aparece un aviso corto ("Toki te ahorró ~5.4k tokens en «npm test»").
- **`▸ más`** muestra duración, llamadas, salidas compactadas, bucles e histórico. **`−`** la deja en una sola línea. **`×`** la oculta (vuelve con `/ahorro`).
- **En la app de escritorio, Toki es un dibujo vectorial animado** (respira, parpadea, y cambia de cara y accesorio según lo que Claude hace). En la terminal usa caras de texto.
- **Sonidos suaves** (solo macOS): una campanita al ahorrar, un acorde al terminar con ahorro y un tono bajo al avisar. Se apagan en la configuración del plugin.
- **Toki aprende:** te avisa (y lo guarda en "Lo que Toki notó esta sesión" dentro de `/ahorro`) cuando cambias de modelo con el caché caliente, cuando un comando falla en bucle, cuando Claude relee el mismo archivo completo una y otra vez, cuando hay varias salidas enormes seguidas (mejor un subagente con Haiku), cuando la sesión pasa de 3 horas y cuando van 3 compactaciones.
- **Modo conciso automático:** al pasar del 50% de contexto, le pide a Claude respuestas más cortas, sin recortar código ni errores. Se añade al final del contexto, así que no rompe el caché.
- Los porcentajes de ahorro son estimados (unos 4 caracteres por token).

## El panel `/ahorro`

Cifras grandes (esta sesión, hoy, 7 días, 30 días, histórico), una gráfica de barras del ahorro por día en las últimas dos semanas, qué ocupa tu contexto ahora, lo que Toki notó en la sesión y sugerencias concretas. El historial se guarda en tu máquina, por proyecto.

## Cómo se usa

No tienes que hacer nada. Además:

- **`/ahorro`**: abre un reporte con lo ahorrado, qué ocupa tu contexto y sugerencias concretas.
- **`/ahorro-mapa`**: crea o actualiza el mapa del proyecto (también se crea solo, una vez al día, en repositorios git).
- **`/ahorro-por-que`**: la lista de los últimos comandos y, para cada uno, si se compactó (y cuánto ahorró) o por qué no se tocó. Si crees que Toki no está ahorrando, empieza por aquí.
- **`/output-style`** → `ahorro-tokens:conciso`: activa las respuestas cortas.

### Configuración

Con `/plugin configure ahorro-tokens@kit-ahorro` puedes apagar cualquiera de las piezas automáticas: compactador, mapa automático, acompañante, sonidos, memoria y modo conciso.

### Si crees que no está ahorrando

1. Escribe `/ahorro-por-que`. Verás cada comando reciente con el motivo exacto.
2. Los motivos más comunes: Claude usó `| tail` o `| grep` (la salida ya venía filtrada), la salida era corta, o el comando no es de una familia ruidosa.
3. Después de actualizar el plugin, usa `/reload-plugins`. Si dice `register.tsx unchanged`, reinicia la sesión: Claude Code no recompiló el módulo.

## Resultados medidos (con y sin plugin)

Misma pregunta, mismo modelo (Haiku), dos corridas por escenario, tokens de entrada totales reportados por Claude Code (incluye caché):

| Escenario | Sin plugin | Con plugin | Diferencia |
|---|---|---|---|
| `npm test` con 1 fallo entre 421 tests (26 KB de salida) | 94.5k tokens · 2 turnos | 89.8k–94.5k tokens · 2 turnos | hasta −4.7k (−5%) |
| `npm run enorme`: 1,6 MB de salida con el error en la última línea | 134.2k tokens · 3 turnos | 88.0k tokens · 2 turnos | **−46k (−34%) y un turno menos** |

Lo honesto: el ahorro grande aparece con salidas enormes, donde Claude Code sin ayuda entrega solo una vista previa del inicio y Claude tiene que hacer una segunda llamada para buscar el error. En salidas medianas el ahorro es de unos miles de tokens por comando. Y en una sesión real larga, cada turno que se evita vale mucho más que aquí, porque reenvía toda la conversación.

Lo que muestra Toki como "tokens ahorrados" es la diferencia entre lo que Claude habría leído sin el plugin (como máximo 30 KB, o la vista previa de 2 KB cuando Claude Code guarda la salida en archivo) y lo que leyó con él, a ~4 caracteres por token. Es una estimación y siempre lleva "~".

### Evals formales

En `evals/` hay una suite para la herramienta oficial de Anthropic, que corre cada caso con y sin el plugin y califica el resultado. Necesita el sandbox del sistema (en macOS viene incluido):

```bash
claude plugin eval . --scaffold --allow-tools "Bash(npm *)" --runs 3
```

## Límites conocidos de esta versión

- La captura completa de salidas funciona con bash y zsh (macOS, Linux, WSL). En otros shells, el plugin compacta lo que entrega Claude Code sin rescatar la parte recortada.
- Solo envuelve comandos que ya tienen permiso para ejecutarse sin preguntar. Nunca genera una solicitud de permiso nueva.
- En cuentas de empresa (Team o Enterprise) Claude Code carga un guardia que no deja a los plugins de usuario intervenir en la compactación. Por eso la memoria usa un hook de comando (`SessionStart` con `compact`), que funciona siempre. En Windows ese hook necesita Git Bash.
- La franja se dibuja en la terminal y en la app de escritorio. En la extensión de VS Code y en `claude -p`, el motor funciona igual pero sin franja; `/ahorro` responde con el reporte en texto.
- El mapa es análisis de texto, no un árbol sintáctico completo: puede omitir símbolos en código poco convencional.

## Para desarrollar

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

Las pruebas viven en `tests/`. La lógica pura está en `hooks/compresor.ts`, `hooks/bucles.ts`, `hooks/mapa.ts`, `hooks/mascota.ts`, `hooks/toki-svg.ts` y `hooks/historial.ts`; `hooks/register.tsx` la conecta con Claude Code. Los sonidos de `sonidos/` son sintéticos (generados con Python, sin derechos de terceros).

## Créditos

Este proyecto se inspira en las ideas de otros, reimplementadas desde cero:

- [Caveman](https://github.com/JuliusBrussee/caveman), de Julius Brussee: respuestas concisas.
- [RTK](https://github.com/rtk-ai/rtk), de rtk-ai: filtros de salida por familia de comandos.
- [Graphify](https://github.com/safishamsi/graphify), de Safi Shamsi: el mapa del proyecto sin usar el modelo.
- [Token Optimizer](https://github.com/alexgreensh/token-optimizer), de Alex Greenshpun: archivar originales, detectar bucles y el acompañante en la interfaz.

## Licencia

MIT
