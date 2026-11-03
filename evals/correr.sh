#!/bin/bash
# La eval completa: los 11 casos, con y sin Toki, en Opus y en Sonnet, 5 corridas por
# brazo, una a la vez. Necesita el sandbox del sistema para los casos con Bash: viene en
# macOS; en Linux, instala bubblewrap y socat. Cada corrida es una llamada real a tu
# cuenta: lee evals/README.md antes, y los fixture.sh, que corren fuera del sandbox.
#
#   bash evals/correr.sh
#   MODELOS=claude-sonnet-5-5 CORRIDAS=3 TOPE_USD=5 bash evals/correr.sh
#
# Deja evals/results/<fecha>-<modelo>.json y la tabla en evals/results/<fecha>.md.
set -euo pipefail
cd "$(dirname "$0")/.."

fecha=$(date +%F)
modelos=${MODELOS:-"claude-opus-5-5 claude-sonnet-5-5"}
corridas=${CORRIDAS:-5}
tope=${TOPE_USD:-15}
archivos=()

for modelo in $modelos; do
  salida="evals/results/$fecha-$modelo.json"
  echo "== $modelo: $corridas corridas por caso y brazo, tope \$$tope" >&2
  # --threshold 0: una nota baja no corta la corrida, sale en la tabla.
  # --keep-temp: las trazas quedan para contar los tokens de salida; se borran abajo.
  claude plugin eval . --scaffold --trust-plugin --allow-tools Edit "Bash(npm *)" "Bash(grep *)" \
    --model "$modelo" --runs "$corridas" -j 1 --threshold 0 --max-cost-usd "$tope" \
    --keep-temp --no-publish --json "$salida" \
    || echo "aviso: $modelo terminó con código $? (tope de costo, límite de uso o error de API); la tabla lo marca" >&2
  if [ -f "$salida" ]; then
    python3 evals/benchmark.py --anotar "$salida"
    # Borra solo las carpetas que --keep-temp guardó para esta corrida, ya anotadas. Quedan
    # de solo lectura (con una subcarpeta sellada en 000): primero se les devuelve el permiso.
    python3 - "$salida" <<'PY'
import json, os, re, shutil, subprocess, sys
datos = json.load(open(sys.argv[1]))
for caso in datos.get("cases", []):
    for corridas in caso.get("arms", {}).values():
        for c in corridas:
            carpeta = os.path.dirname(os.path.dirname(c.get("tracePath") or ""))
            if re.fullmatch(r"(e|claude-eval)-[A-Za-z0-9]{6}", os.path.basename(carpeta)) and os.path.isdir(os.path.join(carpeta, "out")):
                subprocess.run(["chmod", "-R", "u+rwx", carpeta], stderr=subprocess.DEVNULL)
                shutil.rmtree(carpeta, ignore_errors=True)
PY
    archivos+=("$salida")
  fi
done

if [ ${#archivos[@]} -gt 0 ]; then
  python3 evals/benchmark.py "${archivos[@]}" > "evals/results/$fecha.md"
  echo "Tabla: evals/results/$fecha.md" >&2
fi
