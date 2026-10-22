# El texto que Claude escribió en el mensaje n (desde 1) de una corrida, para leerlo a mano.
#
# Uso: python3 evals/modo-breve/textos.py evals/results/modo-breve/mixta-breve-1.jsonl 3
import json
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit("Uso: textos.py <corrida.jsonl> <n>")
    f, n = sys.argv[1], int(sys.argv[2])
    i, partes = 1, []
    for l in open(f, encoding="utf-8"):
        try:
            e = json.loads(l)
        except ValueError:
            continue
        if e.get("type") == "assistant" and i == n:
            for c in e.get("message", {}).get("content", []):
                if c.get("type") == "text":
                    partes.append(c["text"])
        if e.get("type") == "result":
            i += 1
    print("\n---\n".join(partes))


if __name__ == "__main__":
    main()
