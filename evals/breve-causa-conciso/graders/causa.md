---
type: llm
---
La respuesta identifica que seCruzan usa comparaciones inclusivas (<=) y por eso dos citas que solo se tocan en el borde (una termina a las 9:30 y la otra empieza a las 9:30) cuentan como cruzadas, y propone cambiar a comparaciones estrictas (<), por ejemplo `a.inicio < b.fin && b.inicio < a.fin`.
