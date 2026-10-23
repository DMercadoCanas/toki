# Evals de Toki

Comparan a Claude con y sin el plugin en escenarios reales, con la herramienta oficial `claude plugin eval`. Cada caso corre dos brazos (con Toki y sin Toki) y califica la respuesta. `benchmark.py` convierte el resultado en una tabla de nota y costo por brazo.

```bash
# Todo (necesita el sandbox del sistema para Bash: viene en macOS; en Linux, bubblewrap y socat)
claude plugin eval . --scaffold --trust-plugin --allow-tools Edit "Bash(npm *)" "Bash(grep *)" \
  --model claude-opus-5-5 --runs 3 -j 1 --json evals/results/r.json
python3 evals/benchmark.py evals/results/r.json > evals/results/benchmark.md

# Solo los casos sin Bash (corren en cualquier parte)
claude plugin eval . --scaffold --trust-plugin --tag generados --tag ruta-modelo --allow-tools Edit \
  --model claude-opus-5-5 --runs 3 -j 1 --json evals/results/sin-bash.json

# Solo los casos con Bash
claude plugin eval . --scaffold --trust-plugin --tag compactador --tag rescate --tag busquedas \
  --allow-tools "Bash(npm *)" "Bash(grep *)" --model claude-opus-5-5 --runs 3 -j 1 --json evals/results/bash.json

# Juntar corridas en una tabla (si un caso está en más de un archivo, vale el del último)
python3 evals/benchmark.py evals/results/sin-bash.json evals/results/bash.json
```

`--max-cost-usd 5` pone un tope a la corrida completa. `--scaffold` ejecuta cada `fixture.sh` fuera del sandbox para crear el proyecto de prueba: léelos antes de correrlo.

**Usa `-j 1`.** El comienzo del prompt (herramientas e instrucciones de Claude Code) es igual en los dos brazos y queda unos minutos en el caché. La corrida que lo escribe paga más y las siguientes lo leen barato, sean del brazo que sean. Con `-j 3`, varias corridas arrancan en frío a la vez y el brazo que va primero sale más caro: en una corrida así, `lockfile-version` con Toki costó el doble, y era solo el caché. Por eso `benchmark.py` usa la mediana por corrida, sin el costo del juez.

## Los casos

| Caso | Qué mide | Herramientas | Etiquetas |
|---|---|---|---|
| `test-con-fallo` | 421 tests, uno falla a la mitad de una salida larga. Sin Toki, Claude Code recorta la salida y el fallo suele quedar oculto; con Toki llega completo. | Bash | smoke, compactador |
| `tail-esconde-error` | La misma suite con `npm test 2>&1 \| tail -n 40`: el fallo queda fuera del corte. Toki agrega el error que el `tail` escondió. | Bash | smoke, rescate |
| `salida-enorme` | 1,6 MB de salida con el error en la última línea. Sin Toki, Claude ve solo una vista previa y necesita otra llamada. | Bash | compactador, rescate |
| `busqueda-enorme` | `grep -rn` sobre 60 archivos (~250 KB). Toki entrega el conteo por archivo; la pregunta es cuál tiene más coincidencias. | Bash | busquedas, benchmark |
| `lockfile-version` | Una versión dentro de un `package-lock.json` de 200 KB. Si Claude intenta leerlo entero, Toki le sugiere Grep. | Read, Grep | generados, benchmark |
| `ruta-trivial` | "Renombra la función sumar a add" con Opus. Toki debería mandarlo en un modelo o esfuerzo más barato sin perder el resultado. | Read, Edit | ruta-modelo, benchmark |
| `ruta-compleja` | Por qué falla un test de citas que se tocan en el borde. Toki no debe bajar el modelo hasta perder la respuesta (calificado por un juez). | Read, Grep | ruta-modelo, benchmark |

`modo-breve/` es otra cosa: no usa `claude plugin eval`. Mide, sin Toki y con `claude -p`, cuánto baja la salida con la sección de respuestas breves (−12 % en tareas de código, −15 % en preguntas abiertas, con los tests pasando igual). De ahí sale el 12 % con que Toki cuenta ese ahorro. Su `README.md` explica cómo correrlo.

## Última corrida (22 oct 2026: Toki 0.16, Claude Code 2.1.308, Opus 5.5, 3 corridas por brazo, `-j 1`)

| Caso | Con Toki: nota · costo | Sin Toki: nota · costo | Diferencia |
|---|---|---|---|
| `ruta-trivial` | 100 % · $0.038 | 100 % · $0.085 | −55 % |
| `ruta-compleja` | 100 % · $0.074 | 100 % · $0.073 | +1 % |
| `lockfile-version` | 100 % · $0.066 | 100 % · $0.066 | 0 % |

Costo = mediana por corrida, sin el juez. En total, $0.178 por corrida con Toki frente a $0.224 sin Toki.

- En `ruta-trivial`, Toki eligió Sonnet con esfuerzo bajo en las tres corridas: las tres costaron $0.038, contra $0.081–$0.085 de Opus sin Toki. `/toki-modelo` y `.claude/toki/diagnostico.txt` registran el cambio.
- En `ruta-compleja` lo dejó en Opus. En una corrida con trazas, el contexto que recibió Claude difirió en 8 tokens entre los dos brazos; el +1 % (menos de $0.001) es una respuesta unas decenas de tokens más larga. En `claude -p` no hay a quién preguntar, así que Toki nunca sube el costo por su cuenta: solo aplica cambios que ahorran.
- En `lockfile-version`, Opus fue directo a Grep, así que la guardia no tuvo que actuar. Con modelos que sí intentan leerlo entero (lo vimos en vivo), la guardia los lleva a leer por tramos.
- Con 0.16, Toki no agregaba tokens fijos: el primer pedido medía lo mismo con y sin él (~15k tokens). Desde 0.17 lleva además la sección de respuestas breves (~200 tokens, en el caché).

Los casos con Bash no se corrieron aquí: esta máquina no tiene el sandbox. Las cifras medidas a mano para esos escenarios están en el README principal.
