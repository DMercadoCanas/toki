# Publicar Toki en el directorio

Lista para el día que decidas enviarlo. Nada de esto se ha enviado.

## Qué ruta

- **Tu marketplace (ya funciona).** `/plugin install toki --marketplace DMercadoCanas/toki`. Cada push con `version` nueva llega a quien corra `claude plugin update`.
- **Marketplace de la comunidad (`claude-community`).** Es el que lista lo que se envía por el formulario del directorio. Hay dos formularios:
  - [claude.ai/admin-settings/directory/submissions/plugins/new](https://claude.ai/admin-settings/directory/submissions/plugins/new): necesita una organización Team o Enterprise y el permiso Directory (los Owners lo tienen).
  - [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit): para autores individuales.

  Una vez aprobado, queda fijado a un commit en [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json). Puede tardar en aparecer.
- El marketplace oficial (`claude-plugins-official`) no acepta envíos por formulario.

## Antes de enviar

- [x] **Mascota decidida.** `.claude-plugin/icon.png` (1024×1024) y el banner del README (`assets/toki-banner.svg`) usan el Toki en píxeles de `hooks/toki-pixel.ts`, barriendo con la escoba. Ojo: el ícono del directorio se toma **una sola vez**, la primera vez que guardas o envías el plugin en el portal; cambiarlo después no cambia el del listado. Si la mascota cambia antes de enviar, regenera los dos.
- [ ] Nombre permanente: `toki`. No se cambia nunca; para otra etiqueta se usa `displayName`.
- [ ] `version` subida en `plugin.json` (ahora 0.17.0) y el mismo número en `VERSION` de `hooks/register.tsx`.
- [ ] `claude plugin validate --strict .` → `Validation passed` sin advertencias (hoy pasa).
- [ ] `claude plugin test .` → todo verde (hoy 273/273).
- [ ] Instalar desde el marketplace en una carpeta limpia y abrir una sesión: `claude plugin marketplace add DMercadoCanas/toki`, luego `claude plugin install toki@toki`.
- [ ] Correr en el Mac los casos con Bash (necesitan el sandbox; el comando, con `-j 1`, está en `evals/README.md`), juntarlos con los demás (`python3 evals/benchmark.py evals/results/2026-10-22-sin-bash.json evals/results/bash.json`) y pegar la tabla en el README. Los casos sin Bash ya están medidos con 0.16.
- [x] `homepage` y `repository` en `plugin.json` apuntan a `https://github.com/DMercadoCanas/toki`, igual que tu `origin` local.
- [ ] Licencia MIT en `LICENSE`. Los sonidos son sintéticos, sin derechos de terceros.

## Lo que la revisión puede preguntar (y la respuesta)

El directorio corre un escaneo de seguridad y una revisión de políticas que `validate` no hace. Además, tiene reglas propias para los plugins con módulo de hooks, como Toki. Conviene que el README deje claro esto:

| Qué hace Toki | Por qué y cómo se controla |
|---|---|
| Cambia modelo y esfuerzo antes de enviar | Solo aplica solo lo que ahorra, siempre con aviso y **Deshacer**. Pregunta si cuesta más o si reescribe el caché. `/toki-modelo no` lo apaga. |
| Agrega una sección fija al system prompt (respuestas breves) | ~200 tokens al final, en el caché; no toca código, comandos ni errores. Lo que cuesta se resta del ahorro. Respeta el `/output-style` que elijas y se apaga en `/plugin` → Toki → Respuestas breves. |
| Rechaza herramientas que cambian algo mientras falta la entrevista | Solo en pedidos grandes con entrevista, hasta que Claude pregunte, con el motivo y a lo sumo 3 veces por mensaje. Leer siempre pasa, y nunca frena lo que hace un subagente que ya corre ni lo que hace otro plugin. `/toki-entrevista no` lo apaga, y «sin preguntas» lo salta. |
| Hace una pregunta corta a Haiku para clasificar mensajes dudosos | Unos cientos de tokens, con tiempo límite. Si tarda, usa la heurística local. |
| Envuelve comandos de Bash/PowerShell para guardar la salida completa | Solo si Claude Code le da exactamente el mismo permiso que al original. La copia queda en `.claude/toki/` del proyecto. |
| Baja el umbral de autocompactación en modelos de 1M | Opción "Compactar a los…". No toca un valor que tú ya fijaste. |
| Ping de caché cada ~4 min | Solo API, **apagado por defecto**. Máximo 30 min. |
| Guarda historial y logros | En el store local de Claude Code y en `.claude/toki/`. Nada sale de tu máquina. |

## Texto para el listado

**Corto (es):** Tu acompañante de ahorro de tokens: elige modelo y esfuerzo por mensaje, recorta salidas ruidosas, rescata errores escondidos, pone presupuesto por tarea y te muestra a dónde se va cada token.

**Short (en):** Your token-saving companion: picks model and effort per message, trims noisy output, rescues hidden errors, caps a task's budget, and shows where every token goes.

**Categoría sugerida:** productividad / costos.

**Capturas útiles:** la barra sobre el prompt, el panel `/toki`, la tarjeta `/toki-semana` y la pregunta del presupuesto.
