# Evals de Toki

Comparan a Claude con y sin el plugin en escenarios reales, con la herramienta oficial `claude plugin eval`. Cada caso corre dos brazos (con Toki y sin Toki) y califica la respuesta. `benchmark.py` convierte el resultado en una tabla de nota y costo por brazo.

```bash
# La eval completa: 11 casos, con y sin Toki, en Opus 5.5 y Sonnet 5.5, 5 corridas por brazo
# (necesita el sandbox del sistema para Bash: viene en macOS; en Linux, bubblewrap y socat)
bash evals/correr.sh

# Un modelo, menos corridas o otro tope
MODELOS=claude-sonnet-5-5 CORRIDAS=3 TOPE_USD=5 bash evals/correr.sh

# Solo los casos sin Bash (corren en cualquier parte)
claude plugin eval . --scaffold --trust-plugin --tag generados --tag ruta-modelo --tag breve --allow-tools Edit \
  --model claude-opus-5-5 --runs 5 -j 1 --threshold 0 --keep-temp --no-publish --json evals/results/sin-bash.json
python3 evals/benchmark.py --anotar evals/results/sin-bash.json

# Juntar archivos en una tabla (por modelo; si un caso está en más de un archivo con el mismo modelo, vale el del último)
python3 evals/benchmark.py evals/results/sin-bash.json evals/results/bash.json
```

`correr.sh` corre los dos modelos uno tras otro, con un tope de $15 por modelo (`TOPE_USD`), y deja `evals/results/<fecha>-<modelo>.json` y la tabla en `evals/results/<fecha>.md`. `--scaffold` ejecuta cada `fixture.sh` fuera del sandbox para crear el proyecto de prueba: léelos antes de correrlo.

**Usa `-j 1`.** El comienzo del prompt (herramientas e instrucciones de Claude Code) es igual en los dos brazos y queda unos minutos en el caché. La corrida que lo escribe paga más y las siguientes lo leen barato, sean del brazo que sean. Con `-j 3`, varias corridas arrancan en frío a la vez y el brazo que va primero sale más caro: en una corrida así, `lockfile-version` con Toki costó el doble, y era solo el caché. Por eso `benchmark.py` usa la mediana por corrida, sin el costo del juez.

## Los casos

| Caso | Qué mide | Herramientas | Etiquetas |
|---|---|---|---|
| `test-con-fallo` | 421 tests, uno falla a la mitad de una salida larga. Claude suele cortarla con `\| tail` (o Claude Code la recorta) y el fallo queda fuera; con Toki llega el error. | Bash | smoke, compactador |
| `tail-esconde-error` | La misma suite con `npm test 2>&1 \| tail -n 40`: el fallo queda fuera del corte. Toki agrega el error que el `tail` escondió. | Bash | smoke, rescate |
| `salida-enorme` | 1,6 MB de salida con el error en la última línea. Sin Toki, Claude ve solo una vista previa y necesita otra llamada. | Bash | compactador, rescate |
| `busqueda-enorme` | `grep -rn` sobre 60 archivos (~250 KB). Toki entrega el conteo por archivo; la pregunta es cuál tiene más coincidencias. | Bash | busquedas, benchmark |
| `lockfile-version` | Una versión dentro de un `package-lock.json` de 200 KB. Si Claude intenta leerlo entero, Toki le sugiere Grep. | Read, Grep | generados, benchmark |
| `ruta-trivial` | "Renombra la función sumar a add" con Opus. Toki debería mandarlo en un modelo o esfuerzo más barato sin perder el resultado. | Read, Edit | ruta-modelo, benchmark |
| `ruta-compleja` | Por qué falla un test de citas que se tocan en el borde. Toki no debe bajar el modelo hasta perder la respuesta (calificado por un juez). | Read, Grep | ruta-modelo, benchmark |
| `breve-causa`, `breve-abierta` | Respuestas breves: un diagnóstico y una pregunta abierta sobre el mismo código, sin tope de largo en el pedido (calificados por un juez). | Read, Grep | breve |
| `breve-causa-conciso`, `breve-abierta-conciso` | Lo mismo con "Answer concisely." al final del system prompt. Su brazo sin Toki es el tercer brazo: lo que logra el usuario que ya pide respuestas cortas. | Read, Grep | breve |

## Qué reporta `benchmark.py`

- **Aprobadas y nota** por brazo. Una nota más baja con Toki es una regresión aunque cueste menos.
- **Costo** (mediana por corrida, sin el juez) y **costo por tarea exitosa**: todo lo que costó el brazo dividido por las corridas que aprobaron. Una corrida barata que falla no ahorra nada; esta cifra la cobra.
- **Diferencia con intervalo de 95 %** (bootstrap de la mediana, con semilla fija). Si el intervalo cruza el 0 %, con esas corridas no se distingue del azar: se publica igual.
- **Tres brazos de las respuestas breves**: sin instrucción, "Answer concisely." y Toki (más Toki con "Answer concisely."), con los tokens de salida de cada uno. Salen de las trazas: `correr.sh` usa `--keep-temp`, las anota con `--anotar` y luego borra esas carpetas temporales.
- **Corridas perdidas**: las que terminaron en error de API, en aborto o sin juez por el tope de costo, con el motivo. No entran en las cifras, y un archivo `partial` lo dice arriba de la tabla.

`modo-breve/` es otra cosa: no usa `claude plugin eval`. Mide, sin Toki y con `claude -p`, cuánto baja la salida con la sección de respuestas breves (−12 % en tareas de código, −15 % en preguntas abiertas, con los tests pasando igual). De ahí sale el 12 % con que Toki cuenta ese ahorro. Su `README.md` explica cómo correrlo.

## Última corrida (3 nov 2026: Toki 0.17.6, Claude Code 2.1.316, Opus 5.5 y Sonnet 5.5, 5 corridas por caso y brazo, `-j 1`)

`bash evals/correr.sh`: 220 corridas, ninguna perdida. Costó $15.33 ($9.95 en Opus y $5.38 en Sonnet); las corridas de diagnóstico de abajo, $1.13 más.

### claude-opus-5-5

| Caso | Con Toki: aprob. · nota | costo | por éxito | turnos | Sin Toki: aprob. · nota | costo | por éxito | turnos | Diferencia [IC 95 %] |
|---|---|---|---|---|---|---|---|---|---|
| breve-abierta | 5/5 · 1.00 | $0.1109 | $0.1102 | 2.0 | 5/5 · 1.00 | $0.1081 | $0.1088 | 2.0 | +3% [-3%, +6%] |
| breve-causa | 5/5 · 1.00 | $0.0933 | $0.0939 | 2.0 | 5/5 · 1.00 | $0.0920 | $0.0922 | 2.0 | +1% [0%, +5%] |
| busqueda-enorme | 5/5 · 1.00 | $0.0823 | $0.0828 | 2.0 | 5/5 · 1.00 | $0.0802 | $0.0803 | 2.0 | +3% [+2%, +6%] |
| lockfile-version | 5/5 · 1.00 | $0.0831 | $0.0832 | 2.0 | 5/5 · 1.00 | $0.0812 | $0.0819 | 2.0 | +2% [-2%, +3%] |
| ruta-compleja | 5/5 · 1.00 | $0.0897 | $0.0911 | 2.4 | 5/5 · 1.00 | $0.0895 | $0.0889 | 2.0 | 0% [-4%, +8%] |
| ruta-trivial | 5/5 · 1.00 | $0.0547 | $0.0531 | 5.6 | 5/5 · 1.00 | $0.0960 | $0.0991 | 4.6 | -43% [-51%, -42%] |
| salida-enorme | 0/5 · 0.40 | $0.0871 | — | 2.2 | 0/5 · 0.33 | $0.0849 | — | 2.0 | +3% [+1%, +14%] |
| tail-esconde-error | 5/5 · 1.00 | $0.0485 | $0.0486 | 2.0 | 0/5 · 0.75 | $0.1147 | — | 4.0 | -58% [-59%, +11%] |
| test-con-fallo | 2/5 · 0.88 | $0.1042 | $0.2573 | 2.8 | 0/5 · 0.80 | $0.1000 | — | 3.2 | +4% [-6%, +7%] |

**Total por corrida:** $0.7538 con Toki vs $0.8465 sin Toki (-11%).

**Respuestas breves, tres brazos.** Tokens de salida = mediana por corrida (— si la eval no se corrió con --keep-temp y --anotar).

| Caso | Brazo | aprob. · nota | costo | por éxito | tokens de salida |
|---|---|---|---|---|---|
| breve-abierta | sin instrucción | 5/5 · 1.00 | $0.1081 | $0.1088 | 1 547 |
|  | "Answer concisely." | 5/5 · 1.00 | $0.1022 | $0.1019 | 1 219 |
|  | Toki | 5/5 · 1.00 | $0.1109 | $0.1102 | 1 564 |
|  | Toki + "Answer concisely." | 5/5 · 1.00 | $0.1052 | $0.1044 | 1 277 |
| breve-causa | sin instrucción | 5/5 · 1.00 | $0.0920 | $0.0922 | 646 |
|  | "Answer concisely." | 5/5 · 1.00 | $0.0889 | $0.0885 | 482 |
|  | Toki | 5/5 · 1.00 | $0.0933 | $0.0939 | 666 |
|  | Toki + "Answer concisely." | 5/5 · 1.00 | $0.0901 | $0.0905 | 462 |

### claude-sonnet-5-5

| Caso | Con Toki: aprob. · nota | costo | por éxito | turnos | Sin Toki: aprob. · nota | costo | por éxito | turnos | Diferencia [IC 95 %] |
|---|---|---|---|---|---|---|---|---|---|
| breve-abierta | 5/5 · 1.00 | $0.0520 | $0.0526 | 2.2 | 5/5 · 1.00 | $0.0502 | $0.0500 | 2.0 | +4% [+1%, +12%] |
| breve-causa | 5/5 · 1.00 | $0.0468 | $0.0469 | 3.0 | 5/5 · 1.00 | $0.0463 | $0.0459 | 3.0 | +1% [-1%, +6%] |
| busqueda-enorme | 5/5 · 1.00 | $0.0406 | $0.0422 | 2.2 | 5/5 · 1.00 | $0.0396 | $0.0441 | 2.6 | +3% [-25%, +22%] |
| lockfile-version | 5/5 · 1.00 | $0.0416 | $0.0418 | 2.0 | 5/5 · 1.00 | $0.0409 | $0.0407 | 2.0 | +2% [+2%, +4%] |
| ruta-compleja | 5/5 · 1.00 | $0.0445 | $0.0446 | 3.0 | 5/5 · 1.00 | $0.0434 | $0.0435 | 3.0 | +2% [+1%, +4%] |
| ruta-trivial | 5/5 · 1.00 | $0.0536 | $0.0528 | 5.6 | 5/5 · 1.00 | $0.0530 | $0.0503 | 5.2 | +1% [-5%, +19%] |
| salida-enorme | 4/5 · 0.93 | $0.0664 | $0.0776 | 2.2 | 5/5 · 1.00 | $0.0645 | $0.0663 | 2.0 | +3% [-22%, +11%] |
| tail-esconde-error | 5/5 · 1.00 | $0.0482 | $0.0483 | 2.0 | 0/5 · 0.75 | $0.0498 | — | 3.0 | -3% [-4%, -1%] |
| test-con-fallo | 5/5 · 1.00 | $0.0478 | $0.0480 | 2.0 | 0/5 · 0.80 | $0.0488 | — | 3.0 | -2% [-5%, 0%] |

**Total por corrida:** $0.4414 con Toki vs $0.4365 sin Toki (+1%).

**Respuestas breves, tres brazos.** Tokens de salida = mediana por corrida (— si la eval no se corrió con --keep-temp y --anotar).

| Caso | Brazo | aprob. · nota | costo | por éxito | tokens de salida |
|---|---|---|---|---|---|
| breve-abierta | sin instrucción | 5/5 · 1.00 | $0.0502 | $0.0500 | 1 157 |
|  | "Answer concisely." | 4/5 · 0.80 | $0.0472 | $0.0594 | 836 |
|  | Toki | 5/5 · 1.00 | $0.0520 | $0.0526 | 1 212 |
|  | Toki + "Answer concisely." | 5/5 · 1.00 | $0.0485 | $0.0483 | 900 |
| breve-causa | sin instrucción | 5/5 · 1.00 | $0.0463 | $0.0459 | 645 |
|  | "Answer concisely." | 5/5 · 1.00 | $0.0441 | $0.0444 | 450 |
|  | Toki | 5/5 · 1.00 | $0.0468 | $0.0469 | 601 |
|  | Toki + "Answer concisely." | 5/5 · 1.00 | $0.0453 | $0.0455 | 467 |

### Corridas perdidas

Ninguna.

Costo = mediana por corrida, sin el juez. Por éxito = todo lo que costó el brazo dividido por las corridas que aprobaron. Diferencia = costo con Toki frente a sin Toki (negativa = Toki gastó menos), con su intervalo de 95 %: si cruza el 0%, con estas corridas no se distingue del azar. Una nota más baja con Toki es una regresión aunque cueste menos.

### Qué se ve en las trazas

Corridas de diagnóstico con `--keep-temp`, después de la eval:

- En `tail-esconde-error` y `test-con-fallo`, los dos modelos cortan con `npm test 2>&1 | tail -40` (o `-n 40`). Toki agranda el corte a `tail -n 10000`, con el mismo permiso, y agrega las 2 líneas del fallo. Sin Toki, Claude vuelve a correr los tests para encontrarlo.
- Opus a veces vuelve a correr aunque ya tenga el error: en una corrida, con `npm test 2>&1 | grep -n -A3 …`, para sacar números de línea.
- En `salida-enorme`, Opus arma comandos compuestos (`npm run enorme > "$TMPDIR/enorme.log" 2>&1; echo "exit=$?"; wc -l …`) que `Bash(npm *)` y `Bash(grep *)` no cubren. En modo `dontAsk`, Claude Code los niega y Opus se rinde, en los dos brazos: el caso no mide a Toki en Opus hasta que la eval le dé permisos más amplios o el pedido nombre un comando simple. Sonnet usa `tail -c 6000` (bytes), que Toki deja como está, o `tail -n 200`.
- Toki suma ~230 tokens al primer pedido (17 067 frente a 16 838). Al iniciar, lo único distinto entre los brazos son sus 9 comandos.
- `cc-plugin-sec-default`, el guardia de las cuentas de empresa, se salta el `prompt.compose` y el `session.compact` de Toki. Las respuestas breves van como nota desde el segundo mensaje, así que los casos `breve-*`, de un solo mensaje, miden lo que cuesta Toki y lo que logra "Answer concisely.", no la sección de Toki.

Los totales por modelo suman todos los casos, incluido `salida-enorme` en Opus, que falla en los dos brazos.
