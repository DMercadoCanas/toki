# Respuestas breves: cuánto bajan la salida, medido

El mismo guion, sin Toki, con y sin una instrucción de respuestas breves. De aquí sale el `SALIDA_BREVE = 0.88` de `hooks/ahorro.ts`: con la sección, cada pedido escribe un 12 % menos de salida, y Toki cuenta como ahorro la salida que Claude no escribió. También decide qué usa Toki: su sección, el estilo Concise de Claude Code o una nota.

## Cómo se midió

- Claude Code 2.1.316 `-p`, Opus 5.5, esfuerzo por defecto, herramientas `Read, Edit, Glob, Grep`. Noviembre de 2026.
- Tres corridas por brazo y guion, en un proyecto chico (`src/turnos.ts`, `src/mat.ts` y una prueba que falla; los fixtures de `ruta-compleja` y `ruta-trivial`).
- Toki va apagado en cada corrida (`enabledPlugins` en `--settings`, sin tocar tu configuración): ningún brazo lleva nada suyo.
- Brazos:
  - **base**: Claude Code tal cual.
  - **breve**: la sección que manda Toki (`SECCION_BREVE`, de `hooks/breve.ts`), en inglés, con `--append-system-prompt`. Toki manda el mismo texto con `prompt.compose`, como sección al final del system prompt.
  - **nativo**: el estilo Concise de Claude Code (`outputStyle: "Concise"`, desde la 2.1.237).
  - **estilo**: el cuerpo de `/output-style toki:conciso`, en español.
  - **nota**: la nota que Toki manda cuando no puede agregar la sección (`notaConciso`, de `hooks/idioma.ts`), antes del primer mensaje.
- Guiones:
  - **mixta** (7 mensajes): explicar una función, renombrar `sumar` a `add`, encontrar por qué falla una prueba, arreglarla, «no funcionó», planear un cambio a fondo y «gracias».
  - **abiertos** (6 mensajes): qué hay en el proyecto, cómo funciona `agendar`, agregar una validación, otros problemas, escribir una prueba y «¿algo más?».

## Resultados

Frente a base, con mixta y abiertos sumados (media de tres corridas):

| Brazo | Pesa (tokens) | Salida | Texto visible | Costo |
|---|---|---|---|---|
| breve (la sección de Toki) | 205 | −16 % | −19 % | −12 % |
| nativo (Concise) | 488 | −17 % | −19 % | −7 % |
| estilo (`toki:conciso`) | 237 | −10 % | −16 % | −7 % |
| nota | ~85 | −2 % | −13 % | 0 % |

Tokens de salida por corrida (respuestas, herramientas y razonamiento), con la media:

| Guion | base | breve | nativo | estilo | nota |
|---|---|---|---|---|---|
| mixta | 6063, 7978, 6183 (6741) | 5691, 5522, 6616 (5943, **−12 %**) | 5391, 8085, 6990 (6822, +1 %) | 6489, 7307, 8128 (7308, +8 %) | 7248, 5710, 5542 (6167, −9 %) |
| abiertos | 12 286, 18 859, 14 063 (15 069) | 12 432, 12 644, 12 134 (12 403, **−18 %**) | 12 423, 10 940, 10 632 (11 332, −25 %) | 11 779, 11 321, 13 601 (12 234, −19 %) | 17 618, 14 855, 12 966 (15 146, +1 %) |

Caracteres de texto visible, en media:

| Guion | base | breve | nativo | estilo | nota |
|---|---|---|---|---|---|
| mixta | 4052 | 3305 (−18 %) | 3671 (−9 %) | 3843 (−5 %) | 4034 (0 %) |
| abiertos | 11 155 | 9044 (−19 %) | 8620 (−23 %) | 8884 (−20 %) | 9251 (−17 %) |

- **El nativo no le gana a la sección**: corta lo mismo y pesa más del doble. En mixta, la sección bajó el texto un 18 % y el nativo un 9 %: cada corrida de la sección escribió menos que cada una del nativo. En abiertos el nativo bajó algo más (−23 % contra −19 %), dentro del ruido. Toki se queda con su sección.
- **La nota es lo más flojo**: casi no baja la salida ni el costo, y en mixta deja el texto igual. Con el guardia de empresa, que no deja agregar la sección, Toki manda la nota y sugiere una vez `/output-style` → `Concise`. Entre los dos estilos no hay ganador claro (`toki:conciso` cortó un 10 % esta vez y, en octubre, un 12 % y un 26 %), y Concise es de Claude Code: no depende de Toki.
- La sección bajó la salida un 12 % en mixta, igual que en octubre, y un 18 % en abiertos (15 % en octubre). Toki usa la menor, 12 %: `SALIDA_BREVE = 0.88`.
- Toki manda **breve** y no **estilo** porque el texto tiene que ser siempre el mismo: si cambiara con tu idioma, el pedido siguiente reescribiría toda la conversación en el caché. Claude responde en tu idioma igual.
- Lo que pesa cada brazo es la entrada del primer pedido frente a base (mediana). Toki descuenta 210 tokens por pedido de lo que ahorra con la sección: leídos del caché, o escritos si el pedido reescribió la conversación.
- Desde octubre, la salida de base subió de 4004 a 6741 tokens en mixta y de 7350 a 15 069 en abiertos, con el mismo texto visible (4254 y 10 580 caracteres entonces): lo que creció es sobre todo el razonamiento. Por eso el texto visible es la medida más limpia.
- El costo es ruidoso: depende de cuántas herramientas usó Claude y de qué había en el caché.

## Calidad

- En **mixta**, las 15 corridas (tres por brazo) dejan `src/turnos.test.ts` pasando y el renombre completo: `function add` y ningún `sumar`. Lo revisa `calidad.py`.
- Las 30 corridas responden en español, también con el Concise nativo, que está en inglés.
- Leídas a mano con `textos.py`: el diagnóstico de la prueba (mensaje 3 de mixta) trae en los cinco brazos la causa, la línea y el cambio exacto, y el plan (mensaje 6) de la sección y del nativo conserva los mismos puntos. Lo que se va son los saludos, los anuncios de lo que va a hacer y los resúmenes finales.

## Correrlo

Cada corrida cuesta ~$0.40 en mixta y ~$0.65 en abiertos: las 30 costaron $15.52.

```sh
for n in 1 2 3; do
  for b in base breve nativo estilo nota; do
    python3 evals/modo-breve/correr.py $b mixta $n
    python3 evals/modo-breve/correr.py $b abiertos $n
  done
done
python3 evals/modo-breve/analizar.py       # salida, costo, texto y peso por brazo, y la baja frente a base (-v: por mensaje)
python3 evals/modo-breve/calidad.py        # pruebas y renombre de cada corrida de mixta (bun o node 23.6+)
python3 evals/modo-breve/textos.py evals/results/modo-breve/mixta-breve-1.jsonl 3   # el texto del mensaje 3
```

Lo que pasó en cada corrida queda en `evals/results/modo-breve/`, que git ignora. El proyecto que Claude edita queda en `$TMPDIR/toki-modo-breve/`, fuera del repo: adentro, `claude plugin test` correría su prueba.
