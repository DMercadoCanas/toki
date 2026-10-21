#!/usr/bin/env python3
"""Resume la salida --json de `claude plugin eval` en una tabla: con Toki vs sin Toki.

Uso:
  claude plugin eval . --scaffold --trust-plugin --runs 3 --no-publish --json evals/results/r.json
  python3 evals/benchmark.py evals/results/r.json > evals/results/benchmark.md

Por caso muestra la nota media, el % de corridas aprobadas, el costo medio por corrida
(sin contar al juez), los turnos medios y la diferencia de costo. El costo es el que
informa Claude Code para cada corrida (tokens leídos y escritos a precio de API).
"""

import json
import sys
from statistics import mean


def resumen(corridas):
    buenas = [c for c in corridas if not c.get("error")]
    if not buenas:
        return None
    return {
        "n": len(buenas),
        "nota": mean(c.get("score") or 0 for c in buenas),
        "aprobadas": sum(1 for c in buenas if c.get("passed")) / len(buenas),
        "costo": mean(c.get("costUsd") or 0 for c in buenas),
        "turnos": mean(c.get("turns") or 0 for c in buenas),
        "errores": len(corridas) - len(buenas),
    }


def celda(r):
    if r is None:
        return "— | — | — | —"
    return f"{r['nota']:.2f} | {r['aprobadas']:.0%} | ${r['costo']:.4f} | {r['turnos']:.1f}"


def main(ruta):
    datos = json.load(open(ruta))
    filas = []
    total = {"con": 0.0, "sin": 0.0}
    for caso in datos.get("cases", []):
        con = resumen(caso.get("arms", {}).get("with", []))
        sin = resumen(caso.get("arms", {}).get("without", []))
        if con and sin:
            total["con"] += con["costo"]
            total["sin"] += sin["costo"]
            dif = (con["costo"] - sin["costo"]) / sin["costo"] if sin["costo"] else 0
            ahorro = f"{-dif:+.0%}"
        else:
            ahorro = "—"
        errores = sum(r["errores"] for r in (con, sin) if r)
        filas.append(f"| {caso['name']} | {celda(con)} | {celda(sin)} | {ahorro} |" + (f" {errores} con error" if errores else ""))

    print(f"# Benchmark de Toki\n")
    print(f"Claude Code {datos.get('claudeVersion', '?')} · {datos.get('startedAt', '')[:10]} · {max((len(c['arms'].get('with', [])) for c in datos.get('cases', [])), default=0)} corridas por caso y brazo\n")
    print("| Caso | Con Toki: nota | aprob. | costo | turnos | Sin Toki: nota | aprob. | costo | turnos | Ahorro |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    print("\n".join(filas))
    if total["sin"]:
        print(f"\n**Total por corrida:** ${total['con']:.4f} con Toki vs ${total['sin']:.4f} sin Toki ({(total['sin'] - total['con']) / total['sin']:+.0%} de ahorro).")
    print("\nAhorro positivo = Toki gastó menos. Una nota más baja con Toki es una regresión aunque cueste menos.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
