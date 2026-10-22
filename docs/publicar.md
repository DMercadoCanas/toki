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

- [ ] **Decidir la mascota.** El ícono del directorio se toma **una sola vez**, la primera vez que guardas o envías el plugin en el portal; cambiarlo después no cambia el del listado. `.claude-plugin/icon.png` es el Toki actual (1024×1024). Si eliges otra mascota del lienzo, reemplaza ese archivo antes de enviar.
- [ ] Nombre permanente: `toki`. No se cambia nunca; para otra etiqueta se usa `displayName`.
- [ ] `version` subida en `plugin.json` (ahora 0.14.0) y el mismo número en `VERSION` de `hooks/register.tsx`.
- [ ] `claude plugin validate --strict .` → `Validation passed` sin advertencias (hoy pasa).
- [ ] `claude plugin test .` → todo verde (hoy 152/152).
- [ ] Instalar desde el marketplace en una carpeta limpia y abrir una sesión: `claude plugin marketplace add DMercadoCanas/toki`, luego `claude plugin install toki@toki`.
- [ ] Correr la suite completa en el Mac (los casos con Bash necesitan el sandbox; ver `evals/README.md`) y pegar la tabla de `evals/benchmark.py` en el README.
- [ ] `homepage` y `repository` en `plugin.json` apuntan a `https://github.com/DMercadoCanas/toki`. Tu `origin` local todavía dice `ahorro-tokens`; GitHub redirige, pero puedes actualizarlo con `git remote set-url origin https://github.com/DMercadoCanas/toki.git`.
- [ ] Licencia MIT en `LICENSE`. Los sonidos son sintéticos, sin derechos de terceros.

## Lo que la revisión puede preguntar (y la respuesta)

El directorio corre un escaneo de seguridad y una revisión de políticas que `validate` no hace. Además, tiene reglas propias para los plugins con módulo de hooks, como Toki. Conviene que el README deje claro esto:

| Qué hace Toki | Por qué y cómo se controla |
|---|---|
| Cambia modelo y esfuerzo antes de enviar | Solo aplica solo lo que ahorra, siempre con aviso y **Deshacer**. Pregunta si cuesta más o si reescribe el caché. `/toki-modelo no` lo apaga. |
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
