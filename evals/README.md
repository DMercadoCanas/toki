# Evals de Toki

Comparan a Claude con y sin el plugin en escenarios reales, con la herramienta oficial `claude plugin eval`. Cada caso corre dos brazos (con Toki y sin Toki) y califica la respuesta. `benchmark.py` convierte el resultado en una tabla de nota y costo por brazo.

```bash
# Todo (necesita el sandbox del sistema para Bash: viene en macOS; en Linux, bubblewrap y socat)
claude plugin eval . --scaffold --trust-plugin --allow-tools Edit "Bash(npm *)" "Bash(grep *)" \
  --model claude-opus-5-5 --runs 3 --json evals/results/r.json
python3 evals/benchmark.py evals/results/r.json > evals/results/benchmark.md

# Solo los casos sin Bash (corren en cualquier parte)
claude plugin eval . --scaffold --trust-plugin --tag generados --tag ruta-modelo --allow-tools Edit \
  --model claude-opus-5-5 --runs 3 --json evals/results/r.json
```

`--max-cost-usd 5` pone un tope a la corrida completa. `--scaffold` ejecuta cada `fixture.sh` fuera del sandbox para crear el proyecto de prueba: léelos antes de correrlo.

## Los casos

| Caso | Qué mide | Herramientas |
|---|---|---|
| `test-con-fallo` | 421 tests, uno falla a la mitad de una salida larga. Sin Toki, Claude Code recorta la salida y el fallo suele quedar oculto; con Toki llega completo. | Bash |
| `tail-esconde-error` | La misma suite con `npm test 2>&1 \| tail -n 40`: el fallo queda fuera del corte. Toki agrega el error que el `tail` escondió. | Bash |
| `salida-enorme` | 1,6 MB de salida con el error en la última línea. Sin Toki, Claude ve solo una vista previa y necesita otra llamada. | Bash |
| `busqueda-enorme` | `grep -rn` sobre 60 archivos (~250 KB). Toki entrega el conteo por archivo; la pregunta es cuál tiene más coincidencias. | Bash |
| `lockfile-version` | Una versión dentro de un `package-lock.json` de 200 KB. Si Claude intenta leerlo entero, Toki le sugiere Grep. | Read, Grep |
| `ruta-trivial` | "Renombra la función sumar a add" con Opus. Toki debería mandarlo en un modelo o esfuerzo más barato sin perder el resultado. | Read, Edit |
| `ruta-compleja` | Por qué falla un test de citas que se tocan en el borde. Toki no debe bajar el modelo hasta perder la respuesta (calificado por un juez). | Read, Grep |

## Última corrida (21 oct 2026, Claude Code 2.1.306, Opus 5.5, 3 corridas por brazo)

| Caso | Con Toki: nota · costo | Sin Toki: nota · costo | Ahorro |
|---|---|---|---|
| `ruta-trivial` | 100 % · $0.039 | 100 % · $0.086 | −54 % |
| `ruta-compleja` | 100 % · $0.074 | 100 % · $0.074 | 0 % |
| `lockfile-version` | 100 % · $0.066 | 100 % · $0.066 | 0 % |

- En `ruta-trivial`, Toki eligió Sonnet con esfuerzo bajo en las tres corridas: `/toki-modelo` y `.claude/toki/diagnostico.txt` lo registran como `trivial (tarea-mecanica) … −58% [auto]`.
- En `ruta-compleja` lo dejó en Opus. En `claude -p` no hay a quién preguntar, así que Toki nunca sube el costo por su cuenta: solo aplica cambios que ahorran.
- En `lockfile-version`, Opus fue directo a Grep, así que la guardia no tuvo que actuar. Con modelos que sí intentan leerlo entero (lo vimos en vivo), la guardia los lleva a leer por tramos.

Los casos con Bash no se corrieron en esta máquina porque no tiene el sandbox. Las cifras medidas a mano para esos escenarios están en el README principal.
