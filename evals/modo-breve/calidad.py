# Que responder breve no rompa nada: en cada corrida de `mixta`, la prueba de src/turnos.test.ts pasa
# (Claude la arregló) y el renombre de sumar a add está completo. Necesita bun.
#
# Uso: python3 evals/modo-breve/calidad.py [carpeta]   (por defecto evals/results/modo-breve)
import glob
import os
import re
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))


def main():
    carpeta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "evals", "results", "modo-breve")
    if shutil.which("bun") is None:
        sys.exit("Falta bun (https://bun.sh) para correr src/turnos.test.ts")
    fallos = 0
    for d in sorted(glob.glob(os.path.join(carpeta, "mixta-*-*"))):
        if not os.path.isdir(d):
            continue
        prueba = subprocess.run(["bun", "src/turnos.test.ts"], cwd=d, capture_output=True, text=True, timeout=60)
        fuentes = "".join(open(f, encoding="utf-8").read() for f in glob.glob(os.path.join(d, "src", "*.ts")))
        add = re.search(r"\bfunction add\b", open(os.path.join(d, "src", "mat.ts"), encoding="utf-8").read()) is not None
        sumar = len(re.findall(r"\bsumar\b", fuentes))
        ok = prueba.returncode == 0 and add and sumar == 0
        fallos += 0 if ok else 1
        print(f"{os.path.basename(d):18} prueba={'pasa' if prueba.returncode == 0 else 'falla'}  function add={'sí' if add else 'no'}  sumar restantes={sumar}  {'OK' if ok else 'REVISAR'}")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
