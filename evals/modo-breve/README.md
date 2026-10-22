# Respuestas breves: cuánto bajan la salida, medido

El mismo guion, sin Toki, con y sin la instrucción de respuestas breves en el system prompt. De aquí sale el `SALIDA_BREVE = 0.88` de `hooks/ahorro.ts`: con la sección, cada pedido escribe un 12 % menos de salida, y Toki cuenta como ahorro la salida que Claude no escribió.

## Cómo se midió

- Claude Code `-p`, Opus 5.5, esfuerzo por defecto, herramientas `Read, Edit, Glob, Grep`. Octubre de 2026.
- Tres corridas por brazo y guion, en un proyecto chico (`src/turnos.ts`, `src/mat.ts` y una prueba que falla; los fixtures de `ruta-compleja` y `ruta-trivial`).
- Brazos:
  - **base**: Claude Code tal cual.
  - **estilo**: el cuerpo de `/output-style toki:conciso`, en español.
  - **breve**: la sección que manda Toki (`SECCION_BREVE`, de `hooks/breve.ts`), en inglés.
- Guiones:
  - **mixta** (7 mensajes): explicar una función, renombrar `sumar` a `add`, encontrar por qué falla una prueba, arreglarla, «no funcionó», planear un cambio a fondo y «gracias».
  - **abiertos** (6 mensajes): qué hay en el proyecto, cómo funciona `agendar`, agregar una validación, otros problemas, escribir una prueba y «¿algo más?».
- La prueba usa `--append-system-prompt`; Toki manda el mismo texto con `prompt.compose`, como sección `session` al final del system prompt.

## Resultados

Tokens de salida por corrida (respuestas, herramientas y razonamiento):

| Guion | base | estilo | breve |
|---|---|---|---|
| mixta | 3810, 3898, 4303 (media 4004) | 3518, 3689, 3332 (media 3513, **−12 %**) | 3158, 3626, 3767 (media 3517, **−12 %**) |
| abiertos | 7276, 7675, 7098 (media 7350) | 5190, 5077, 5959 (media 5409, **−26 %**) | 5672, 6697, 6352 (media 6240, **−15 %**) |

- Cada corrida de **breve** escribió menos que cada corrida de base.
- El texto visible bajó más: con **breve**, mixta pasó de 4254 a 3234 caracteres (−24 %) y abiertos de 10 580 a 8393 (−21 %).
- Toki usa la baja menor, 12 %: `SALIDA_BREVE = 0.88`.
- Toki manda **breve** y no **estilo** porque el texto tiene que ser siempre el mismo: si cambiara con tu idioma, el pedido siguiente reescribiría toda la conversación en el caché. Claude responde en tu idioma igual.
- La sección mide 201 tokens (el primer pedido pasó de 18 720 a 18 921 tokens de entrada). Toki descuenta 210 por pedido de lo que ahorra: leídos del caché, o escritos si el pedido reescribió la conversación.
- El costo en dólares no sirve para comparar los brazos: depende de qué había en el caché (la primera corrida de cada brazo lo escribe).

## Calidad

- En **mixta**, las nueve corridas (tres por brazo) dejan `src/turnos.test.ts` pasando y el renombre completo: `function add` y ningún `sumar`. Lo revisa `calidad.py`.
- Leídas a mano con `textos.py`: todas responden en español y mantienen lo importante (la causa del fallo, el cambio exacto, los casos borde del plan). Lo que se va son los saludos, los anuncios de lo que va a hacer y los resúmenes finales.

## Correrlo

Con Toki apagado (`claude plugin disable toki@toki`; después, `claude plugin enable toki@toki`). Cada corrida cuesta ~$0.25.

```sh
for n in 1 2 3; do
  for b in base estilo breve; do
    python3 evals/modo-breve/correr.py $b mixta $n
    python3 evals/modo-breve/correr.py $b abiertos $n
  done
done
python3 evals/modo-breve/analizar.py       # salida por brazo y la baja frente a base (-v: por mensaje)
python3 evals/modo-breve/calidad.py        # pruebas y renombre de cada corrida de mixta (necesita bun)
python3 evals/modo-breve/textos.py evals/results/modo-breve/mixta-breve-1.jsonl 3   # el texto del mensaje 3
```

Las corridas quedan en `evals/results/modo-breve/`, que git ignora.
