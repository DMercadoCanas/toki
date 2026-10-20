# ahorro-tokens

**El acompañante de ahorro de tokens para Claude Code.** Lo instalas y listo: no tienes que aprender qué skill usar ni cuándo compactar. Toma las mejores ideas de las herramientas de ahorro más populares, las combina sin que se pisen entre sí, y nunca sacrifica calidad para ahorrar.

> Versión 0.3 (prototipo). Requiere Claude Code 2.1.287 o posterior.

## Qué hace

| Pieza | Qué hace | Inspirada en |
|---|---|---|
| **Compactador de salidas** | Cuando corres tests, builds, instalaciones, linters o logs, Claude recibe una versión compacta: agrupa líneas repetidas y parecidas, y conserva cada error, advertencia, el inicio y el final. El original completo queda guardado. | RTK, Token Optimizer |
| **Rescate de errores escondidos** | Claude Code recorta por la mitad las salidas largas de los comandos que fallan, y justo ahí suele estar el error. ahorro-tokens copia la salida completa mientras el comando corre y le entrega a Claude el error real, en menos espacio. | Idea propia |
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
- **Toki aprende:** si cambias de modelo a mitad de sesión con el caché caliente, te dice cuántos tokens se reprocesan y cuánto costaría, y lo guarda en "Lo que Toki notó esta sesión" dentro de `/ahorro`. Lo mismo con los comandos que fallan en bucle.
- Los porcentajes de ahorro son estimados (unos 4 caracteres por token).

## El panel `/ahorro`

Cifras grandes (esta sesión, hoy, 7 días, 30 días, histórico), una gráfica de barras del ahorro por día en las últimas dos semanas, qué ocupa tu contexto ahora, lo que Toki notó en la sesión y sugerencias concretas. El historial se guarda en tu máquina, por proyecto.

## Cómo se usa

No tienes que hacer nada. Además:

- **`/ahorro`**: abre un reporte con lo ahorrado, qué ocupa tu contexto y sugerencias concretas.
- **`/ahorro-mapa`**: crea o actualiza el mapa del proyecto (también se crea solo, una vez al día, en repositorios git).
- **`/output-style`** → `ahorro-tokens:conciso`: activa las respuestas cortas.

### Configuración

Con `/plugin configure ahorro-tokens@kit-ahorro` puedes apagar cualquiera de las piezas automáticas: compactador, mapa automático, acompañante y sonidos.

## Resultados en el proyecto de prueba

Medidos con Claude Code 2.1.303 sobre un proyecto con 420 tests y un build de 300 módulos:

| Comando | Sin ahorro-tokens | Con ahorro-tokens |
|---|---|---|
| `npm run build` (éxito) | 22.700 caracteres | 490 caracteres |
| `npm test` (1 test falla) | 10.000 caracteres, **sin el test que falló** (recortado) | 3.800 caracteres, **con el test que falló y su causa** |

En el segundo caso, sin el plugin Claude tuvo que hacer llamadas extra para encontrar el error. Con el plugin lo identificó a la primera.

Los ahorros en tokens que muestra el plugin son estimaciones (aprox. 4 caracteres por token).

## Límites conocidos de esta versión

- La captura completa de salidas funciona con bash y zsh (macOS, Linux, WSL). En otros shells, el plugin compacta lo que entrega Claude Code sin rescatar la parte recortada.
- Solo envuelve comandos que ya tienen permiso para ejecutarse sin preguntar. Nunca genera una solicitud de permiso nueva.
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
