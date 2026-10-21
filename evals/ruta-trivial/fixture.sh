#!/bin/bash
mkdir -p src
cat > src/mat.ts <<'TS'
export function sumar(a: number, b: number): number {
  return a + b
}

export function promedio(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce(sumar, 0) / xs.length
}
TS
