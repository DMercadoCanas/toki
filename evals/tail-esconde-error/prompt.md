---
max_turns: 8
allowed_tools: [Read, Glob, Grep]
tags: [smoke, rescate]
---

Corre los tests con `npm test 2>&1 | tail -n 40` y dime, en una sola línea, qué test falló y por qué.
