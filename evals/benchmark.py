#!/usr/bin/env python3
"""Resume la salida --json de `claude plugin eval` en tablas: con Toki vs sin Toki.

Uso:
  bash evals/correr.sh                                   # la eval completa, en Opus y Sonnet
  python3 evals/benchmark.py evals/results/a.json [b.json ...] > evals/results/benchmark.md
  python3 evals/benchmark.py --anotar evals/results/a.json   # guarda los tokens de salida de cada corrida

Con varios archivos junta sus casos, separados por modelo (un archivo por modelo, o
los casos con Bash corridos en otra máquina). Si un caso está en más de un archivo con
el mismo modelo, vale el del último.

Por caso y brazo muestra cuántas corridas aprobaron, la nota media, la mediana del costo
por corrida (sin el juez), el costo por tarea exitosa (todo lo gastado en el brazo,
dividido por las corridas que aprobaron) y la diferencia de costo con su intervalo de 95 %
(bootstrap de la mediana, con semilla fija: la misma entrada da la misma tabla). Las
corridas perdidas (error, aborto o juez saltado por el tope) se listan aparte y no
entran en las cifras.

Los casos `<x>` y `<x>-conciso` (este último con "Answer concisely." en el system
prompt) forman la tabla de tres brazos de las respuestas breves: sin instrucción
(`<x>` sin Toki), "Answer concisely." (`<x>-conciso` sin Toki) y Toki (`<x>` con Toki).
Los tokens de salida salen de las trazas: corre la eval con --keep-temp y luego --anotar.

Por qué la mediana: el comienzo del prompt (herramientas e instrucciones de Claude Code)
es igual en los dos brazos y queda unos minutos en el caché. La corrida que lo escribe
paga más (en `lockfile-version`, el doble) y las siguientes lo leen barato, sea del brazo
que sea. Con -j 1 y la mediana, una corrida en frío no decide el resultado. Con -j mayor
que 1, varias corridas arrancan en frío a la vez y el brazo que va primero sale más caro.
"""

import json
import os
import random
import sys
from statistics import mean, median

CONCISO = "-conciso"
REMUESTRAS = 2000


def costo(corrida):
    # costUsd incluye al juez (llm); se descuenta para comparar solo el trabajo de Claude.
    return max((corrida.get("costUsd") or 0) - (corrida.get("judgeCostUsd") or 0), 0)


def perdida(corrida):
    """Por qué la corrida no cuenta, o None si cuenta."""
    if corrida.get("error"):
        return str(corrida["error"])
    if corrida.get("aborted"):
        return "abortada: " + str((corrida["aborted"] or {}).get("reason", ""))
    if corrida.get("skippedPaidGraders"):
        return "el tope de costo saltó al juez"
    return None


def tokens_traza(ruta):
    """Tokens de salida de una traza (una línea JSON por mensaje), o None si no está."""
    if not ruta or not os.path.exists(ruta):
        return None
    por_id, sueltos, final = {}, 0, None
    with open(ruta) as f:
        for linea in f:
            try:
                m = json.loads(linea)
            except ValueError:
                continue
            if not isinstance(m, dict):
                continue
            if m.get("type") == "result" and isinstance(m.get("usage"), dict):
                final = m["usage"].get("output_tokens")
            msj = m.get("message") if isinstance(m.get("message"), dict) else {}
            uso = msj.get("usage")
            if m.get("type") == "assistant" and isinstance(uso, dict):
                # Un mensaje en varios bloques repite el mismo id: vale el último.
                if msj.get("id"):
                    por_id[msj["id"]] = uso.get("output_tokens") or 0
                else:
                    sueltos += uso.get("output_tokens") or 0
    if final is not None:
        return final
    return sum(por_id.values()) + sueltos if por_id or sueltos else None


def anotar(rutas):
    for ruta in rutas:
        datos = json.load(open(ruta))
        anotadas = total = 0
        for caso in datos.get("cases", []):
            for corridas in caso.get("arms", {}).values():
                for c in corridas:
                    total += 1
                    t = tokens_traza(c.get("tracePath"))
                    if t is not None:
                        c["outputTokens"] = t
                        anotadas += 1
        with open(ruta, "w") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        print(f"{ruta}: tokens de salida en {anotadas} de {total} corridas", file=sys.stderr)


def resumen(corridas):
    if not corridas:
        return None
    buenas = [c for c in corridas if perdida(c) is None]
    r = {"total": len(corridas), "n": len(buenas), "perdidas": len(corridas) - len(buenas)}
    if not buenas:
        return r
    costos = [costo(c) for c in buenas]
    aprobadas = sum(1 for c in buenas if c.get("passed"))
    salida = [c["outputTokens"] for c in buenas if isinstance(c.get("outputTokens"), (int, float))]
    r.update(
        costos=costos,
        aprobadas=aprobadas,
        nota=mean(c.get("score") or 0 for c in buenas),
        costo=median(costos),
        # Costo por tarea exitosa: lo que costaron todas, repartido entre las que salieron bien.
        exito=sum(costos) / aprobadas if aprobadas else None,
        turnos=mean(c.get("turns") or 0 for c in buenas),
        salida=median(salida) if salida else None,
    )
    return r


def intervalo(con, sin, semilla):
    """Diferencia de la mediana del costo (con frente a sin) e intervalo bootstrap de 95 %."""
    if not con.get("costos") or not sin.get("costos") or median(sin["costos"]) == 0:
        return None
    azar = random.Random(semilla)
    difs = []
    for _ in range(REMUESTRAS):
        a = median(azar.choices(con["costos"], k=len(con["costos"])))
        b = median(azar.choices(sin["costos"], k=len(sin["costos"])))
        if b:
            difs.append(a / b - 1)
    difs.sort()
    bajo, alto = difs[int(0.025 * len(difs))], difs[int(0.975 * len(difs)) - 1]
    return con["costo"] / sin["costo"] - 1, bajo, alto


def pct(x):
    return "0%" if abs(x) < 0.005 else f"{x:+.0%}"


def dinero(x):
    return "—" if x is None else f"${x:.4f}"


def celda(r):
    if r is None or "costos" not in r:
        return "— | — | — | —"
    return f"{r['aprobadas']}/{r['n']} · {r['nota']:.2f} | {dinero(r['costo'])} | {dinero(r['exito'])} | {r['turnos']:.1f}"


def tokens(r):
    return "—" if r is None or r.get("salida") is None else f"{r['salida']:,.0f}".replace(",", " ")


def main(rutas):
    archivos = [json.load(open(ruta)) for ruta in rutas]
    modelos = {}  # modelo -> {caso: caso}
    for datos in archivos:
        modelo = (datos.get("suite") or {}).get("modelOverride") or "el modelo de cada caso"
        for caso in datos.get("cases", []):
            modelos.setdefault(modelo, {})[caso["name"]] = caso

    print("# Benchmark de Toki\n")
    for datos in archivos:
        modelo = (datos.get("suite") or {}).get("modelOverride") or "el modelo de cada caso"
        corridas = max((len(c.get("arms", {}).get("with", [])) for c in datos.get("cases", [])), default=0)
        parcial = f" · **parcial: {datos.get('partialReason') or 'sin terminar'}**" if datos.get("partial") else ""
        print(f"- Claude Code {datos.get('claudeVersion', '?')} · {datos.get('startedAt', '')[:10]} · {modelo} · {corridas} {'corrida' if corridas == 1 else 'corridas'} por caso y brazo · {len(datos.get('cases', []))} casos{parcial}")

    perdidas = []
    for modelo, casos in modelos.items():
        print(f"\n## {modelo}\n")
        print("| Caso | Con Toki: aprob. · nota | costo | por éxito | turnos | Sin Toki: aprob. · nota | costo | por éxito | turnos | Diferencia [IC 95 %] |")
        print("|---|---|---|---|---|---|---|---|---|---|")
        total = {"con": 0.0, "sin": 0.0, "exito_con": 0.0, "exito_sin": 0.0, "exito_ok": True}
        for i, caso in enumerate(casos.values()):
            if caso["name"].endswith(CONCISO):
                continue
            con = resumen(caso.get("arms", {}).get("with", []))
            sin = resumen(caso.get("arms", {}).get("without", []))
            dif = intervalo(con, sin, i) if con and sin else None
            if dif:
                total["con"] += con["costo"]
                total["sin"] += sin["costo"]
                if con["exito"] is not None and sin["exito"] is not None:
                    total["exito_con"] += con["exito"]
                    total["exito_sin"] += sin["exito"]
                else:
                    total["exito_ok"] = False
            diferencia = "—" if dif is None else f"{pct(dif[0])} [{pct(dif[1])}, {pct(dif[2])}]"
            print(f"| {caso['name']} | {celda(con)} | {celda(sin)} | {diferencia} |")
        if total["sin"]:
            print(f"\n**Total por corrida:** ${total['con']:.4f} con Toki vs ${total['sin']:.4f} sin Toki ({pct(total['con'] / total['sin'] - 1)}).", end="")
            if total["exito_ok"] and total["exito_sin"]:
                print(f" **Por tarea exitosa:** ${total['exito_con']:.4f} vs ${total['exito_sin']:.4f} ({pct(total['exito_con'] / total['exito_sin'] - 1)}).", end="")
            print()

        pares = [n for n in casos if n.endswith(CONCISO) and n[: -len(CONCISO)] in casos]
        if pares:
            print("\n**Respuestas breves, tres brazos.** Tokens de salida = mediana por corrida (— si la eval no se corrió con --keep-temp y --anotar).\n")
            print("| Caso | Brazo | aprob. · nota | costo | por éxito | tokens de salida |")
            print("|---|---|---|---|---|---|")
            for n in pares:
                base, conciso = casos[n[: -len(CONCISO)]], casos[n]
                brazos = [
                    ("sin instrucción", resumen(base.get("arms", {}).get("without", []))),
                    ('"Answer concisely."', resumen(conciso.get("arms", {}).get("without", []))),
                    ("Toki", resumen(base.get("arms", {}).get("with", []))),
                    ('Toki + "Answer concisely."', resumen(conciso.get("arms", {}).get("with", []))),
                ]
                for j, (nombre, r) in enumerate(brazos):
                    if r is None:
                        continue
                    partes = celda(r).split(" | ")[:3]
                    print(f"| {base['name'] if j == 0 else ''} | {nombre} | {' | '.join(partes)} | {tokens(r)} |")

        for caso in casos.values():
            for brazo, corridas in caso.get("arms", {}).items():
                for k, c in enumerate(corridas):
                    motivo = perdida(c)
                    if motivo:
                        perdidas.append(f"- {modelo} · {caso['name']} · {'con' if brazo == 'with' else 'sin'} Toki · corrida {k + 1}: {motivo[:160]}")

    print("\n## Corridas perdidas\n")
    print("\n".join(perdidas) if perdidas else "Ninguna.")
    print("\nCosto = mediana por corrida, sin el juez. Por éxito = todo lo que costó el brazo dividido por las corridas que aprobaron. Diferencia = costo con Toki frente a sin Toki (negativa = Toki gastó menos), con su intervalo de 95 %: si cruza el 0%, con estas corridas no se distingue del azar. Una nota más baja con Toki es una regresión aunque cueste menos.")


if __name__ == "__main__":
    argumentos = sys.argv[1:]
    if not argumentos or argumentos == ["--anotar"]:
        sys.exit(__doc__)
    if argumentos[0] == "--anotar":
        anotar(argumentos[1:])
    else:
        main(argumentos)
