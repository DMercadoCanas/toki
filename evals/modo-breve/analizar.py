# Por brazo: tokens de salida, costo, caracteres de texto visible y herramientas, por corrida y en media,
# cuánto bajó la salida frente a base y cuánto pesa la instrucción (la entrada del primer pedido, frente
# a base). Con -v, la salida y el texto de cada mensaje.
#
# Uso: python3 evals/modo-breve/analizar.py [-v] [carpeta]   (por defecto evals/results/modo-breve)
import glob
import json
import os
import statistics as st
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))


def leer(f):
    """Una fila por mensaje: lo que sumó cada `result` (los acumulados de modelUsage, restados)."""
    filas, prev, texto, herr = [], {}, 0, 0
    for l in open(f, encoding="utf-8"):
        try:
            e = json.loads(l)
        except ValueError:
            continue
        if e.get("type") == "assistant":
            for c in e.get("message", {}).get("content", []):
                if c.get("type") == "text":
                    texto += len(c.get("text", ""))
                if c.get("type") == "tool_use":
                    herr += 1
        if e.get("type") != "result":
            continue
        mu = e.get("modelUsage") or {}
        o = usd = 0
        for k, v in mu.items():
            p = prev.get(k, {})
            o += v.get("outputTokens", 0) - p.get("outputTokens", 0)
            usd += v.get("costUSD", 0) - p.get("costUSD", 0)
        prev = {k: dict(v) for k, v in mu.items()}
        filas.append({"salida": o, "usd": usd, "texto": texto, "herr": herr})
        texto = herr = 0
    return filas


def primer_pedido(f):
    """Tokens de entrada del primer pedido: el system prompt, las herramientas y el primer mensaje."""
    for l in open(f, encoding="utf-8"):
        try:
            e = json.loads(l)
        except ValueError:
            continue
        u = e.get("message", {}).get("usage") if e.get("type") == "assistant" else None
        if u:
            return u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)
    return None


def main():
    args = [a for a in sys.argv[1:] if a != "-v"]
    carpeta = args[0] if args else os.path.join(RAIZ, "evals", "results", "modo-breve")
    res, primeros = {}, {}
    for f in sorted(glob.glob(os.path.join(carpeta, "*.jsonl"))):
        guion, brazo, etiqueta = os.path.basename(f)[:-6].split("-")
        res.setdefault((guion, brazo), []).append((etiqueta, leer(f)))
        p = primer_pedido(f)
        if p is not None:
            primeros.setdefault((guion, brazo), []).append(p)
    medias = {}
    for (guion, brazo), corridas in sorted(res.items()):
        tot = [(sum(x["salida"] for x in r), sum(x["usd"] for x in r), sum(x["texto"] for x in r), sum(x["herr"] for x in r), len(r)) for _, r in corridas]
        medias[(guion, brazo)] = st.mean(t[0] for t in tot)
        print(f"{guion:9} {brazo:6} n={len(tot)} salida={[t[0] for t in tot]} media={medias[(guion, brazo)]:.0f}"
              f"  usd={[round(t[1], 3) for t in tot]} media={st.mean(t[1] for t in tot):.3f}"
              f"  texto={[t[2] for t in tot]} media={st.mean(t[2] for t in tot):.0f}  herramientas={[t[3] for t in tot]} mensajes={[t[4] for t in tot]}")
    for (guion, brazo), media in sorted(medias.items()):
        base = medias.get((guion, "base"))
        if brazo != "base" and base:
            print(f"{guion} {brazo}: {round((media / base - 1) * 100)} % de salida frente a base")
    for (guion, brazo), ps in sorted(primeros.items()):
        base = primeros.get((guion, "base"))
        if brazo != "base" and base:
            print(f"{guion} {brazo}: la instrucción pesa {round(st.median(ps) - st.median(base))} tokens (primer pedido, mediana)")
    if "-v" in sys.argv:
        for (guion, brazo), corridas in sorted(res.items()):
            for etiqueta, r in corridas:
                print(guion, brazo, etiqueta, " ".join(f"{x['salida']}/{x['texto']}" for x in r))


if __name__ == "__main__":
    main()
