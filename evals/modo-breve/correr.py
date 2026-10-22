# A/B de respuestas breves, sin Toki: el mismo guion con y sin la instrucción en el system prompt.
#
# Uso: python3 evals/modo-breve/correr.py base|estilo|breve mixta|abiertos etiqueta
#   base:   Claude Code tal cual.
#   estilo: el cuerpo de /output-style toki:conciso (output-styles/conciso.md).
#   breve:  la sección que manda Toki (SECCION_BREVE, de hooks/breve.ts).
#
# Corre con Toki apagado (claude plugin disable toki@toki): si no, el brazo base también la lleva.
# Cada corrida cuesta ~$0.25 en Opus 5.5 y queda en evals/results/modo-breve/ (git la ignora).
import ast
import json
import os
import re
import shutil
import subprocess
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
SALIDA = os.path.join(RAIZ, "evals", "results", "modo-breve")


def seccion_breve():
    """SECCION_BREVE tal como la manda Toki, leída de hooks/breve.ts."""
    fuente = open(os.path.join(RAIZ, "hooks", "breve.ts"), encoding="utf-8").read()
    m = re.search(r"export const SECCION_BREVE = \[(.*?)\]\.join\('\\n'\)", fuente, re.S)
    if m is None:
        sys.exit("No encontré SECCION_BREVE en hooks/breve.ts")
    lineas = [ast.literal_eval(l.strip().rstrip(",")) for l in m.group(1).splitlines() if l.strip()]
    return "\n".join(lineas)


def estilo_conciso():
    """El cuerpo de /output-style toki:conciso, sin el encabezado."""
    texto = open(os.path.join(RAIZ, "output-styles", "conciso.md"), encoding="utf-8").read()
    return texto.split("---", 2)[2].strip()


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in ("base", "estilo", "breve") or sys.argv[2] not in ("mixta", "abiertos"):
        sys.exit("Uso: correr.py base|estilo|breve mixta|abiertos etiqueta")
    brazo, guion, etiqueta = sys.argv[1:]
    nombre = f"{guion}-{brazo}-{etiqueta}"
    carpeta = os.path.join(SALIDA, nombre)
    shutil.rmtree(carpeta, ignore_errors=True)
    os.makedirs(carpeta)
    # El mismo proyecto chico de los casos de ruteo: src/turnos.ts, src/mat.ts y una prueba que falla.
    for f in ("ruta-compleja", "ruta-trivial"):
        subprocess.run(["bash", os.path.join(RAIZ, "evals", f, "fixture.sh")], cwd=carpeta, check=True, stdout=subprocess.DEVNULL)
    cmd = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
           "--model", "claude-opus-5-5", "--tools", "Read,Edit,Glob,Grep", "--allowedTools", "Read,Edit,Glob,Grep",
           "--max-budget-usd", "2"]
    if brazo == "breve":
        cmd += ["--append-system-prompt", seccion_breve()]
    elif brazo == "estilo":
        cmd += ["--append-system-prompt", estilo_conciso()]
    mensajes = [json.loads(l) for l in open(os.path.join(AQUI, f"{guion}.jsonl"), encoding="utf-8") if l.strip()]
    salida = open(os.path.join(SALIDA, f"{nombre}.jsonl"), "w", encoding="utf-8")
    err = open(os.path.join(SALIDA, f"{nombre}.err"), "w", encoding="utf-8")
    p = subprocess.Popen(cmd, cwd=carpeta, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=err, text=True)
    t0 = time.time()
    # Un mensaje a la vez: el siguiente sale cuando Claude terminó el anterior.
    for m in mensajes:
        p.stdin.write(json.dumps(m, ensure_ascii=False) + "\n")
        p.stdin.flush()
        for linea in p.stdout:
            salida.write(linea)
            salida.flush()
            try:
                e = json.loads(linea)
            except ValueError:
                continue
            if e.get("type") == "result":
                break
    p.stdin.close()
    for linea in p.stdout:
        salida.write(linea)
    p.wait(timeout=120)
    print(nombre, "terminó con", p.returncode, f"en {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
