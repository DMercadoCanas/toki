#!/usr/bin/env python3
"""Resume la salida --json de `claude plugin eval` en una tabla: con Toki vs sin Toki.

Uso:
  claude plugin eval . --scaffold --trust-plugin --runs 3 -j 1 --no-publish --json evals/results/r.json
  python3 evals/benchmark.py evals/results/r.json [otro.json ...] > evals/results/benchmark.md

Con varios archivos junta sus casos (por ejemplo, los casos con Bash corridos en otra
máquina). Si un caso está en más de un archivo, vale el del último.

Por caso muestra la nota media, el % de corridas aprobadas, la mediana del costo por
corrida (sin contar al juez), los turnos medios y la diferencia de costo. El costo es el
que informa Claude Code para cada corrida (tokens leídos y escritos a precio de API).

Por qué la mediana: el comienzo del prompt (herramientas e instrucciones de Claude Code)
es igual en los dos brazos y queda unos minutos en el caché. La corrida que lo escribe
paga más (en `lockfile-version`, el doble) y las siguientes lo leen barato, sea del brazo
que sea. Con -j 1 y la mediana, una corrida en frío no decide el resultado. Con -j mayor
que 1, varias corridas arrancan en frío a la vez y el brazo que va primero sale más caro.
"""

import json
import sys
from statistics import mean, median


def costo(corrida):
    # costUsd incluye al juez (llm); se descuenta para comparar solo el trabajo de Claude.
    return max((corrida.get("costUsd") or 0) - (corrida.get("judgeCostUsd") or 0), 0)


def resumen(corridas):
    buenas = [c for c in corridas if not c.get("error")]
    if not buenas:
        return None
    return {
        "n": len(buenas),
        "nota": mean(c.get("score") or 0 for c in buenas),
        "aprobadas": sum(1 for c in buenas if c.get("passed")) / len(buenas),
        "costo": median(costo(c) for c in buenas),
        "turnos": mean(c.get("turns") or 0 for c in buenas),
        "errores": len(corridas) - len(buenas),
    }


def celda(r):
    if r is None:
        return "— | — | — | —"
    return f"{r['nota']:.2f} | {r['aprobadas']:.0%} | ${r['costo']:.4f} | {r['turnos']:.1f}"


def main(rutas):
    archivos = [json.load(open(ruta)) for ruta in rutas]
    casos = {}
    for datos in archivos:
        for caso in datos.get("cases", []):
            casos[caso["name"]] = caso

    filas = []
    total = {"con": 0.0, "sin": 0.0}
    for caso in casos.values():
        con = resumen(caso.get("arms", {}).get("with", []))
        sin = resumen(caso.get("arms", {}).get("without", []))
        if con and sin:
            total["con"] += con["costo"]
            total["sin"] += sin["costo"]
            dif = (con["costo"] - sin["costo"]) / sin["costo"] if sin["costo"] else 0
            diferencia = "0%" if abs(dif) < 0.005 else f"{dif:+.0%}"
        else:
            diferencia = "—"
        errores = sum(r["errores"] for r in (con, sin) if r)
        filas.append(f"| {caso['name']} | {celda(con)} | {celda(sin)} | {diferencia} |" + (f" {errores} con error" if errores else ""))

    print("# Benchmark de Toki\n")
    for datos in archivos:
        modelo = (datos.get("suite") or {}).get("modelOverride") or "el modelo de cada caso"
        corridas = max((len(c.get("arms", {}).get("with", [])) for c in datos.get("cases", [])), default=0)
        nombres = ", ".join(c["name"] for c in datos.get("cases", []))
        print(f"- Claude Code {datos.get('claudeVersion', '?')} · {datos.get('startedAt', '')[:10]} · {modelo} · {corridas} {'corrida' if corridas == 1 else 'corridas'} por caso y brazo: {nombres}")
    print()
    print("| Caso | Con Toki: nota | aprob. | costo | turnos | Sin Toki: nota | aprob. | costo | turnos | Diferencia |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    print("\n".join(filas))
    if total["sin"]:
        print(f"\n**Total por corrida:** ${total['con']:.4f} con Toki vs ${total['sin']:.4f} sin Toki ({(total['con'] - total['sin']) / total['sin']:+.0%}).")
    print("\nCosto = mediana por corrida, sin el juez. Diferencia = costo con Toki frente a sin Toki: negativa = Toki gastó menos. Una nota más baja con Toki es una regresión aunque cueste menos.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
