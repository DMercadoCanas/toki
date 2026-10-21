#!/bin/bash
# 60 archivos que llaman a buscarPaciente (~250 KB de coincidencias). historial.ts es el que más tiene.
mkdir -p src
for i in $(seq 1 60); do
  n=25; [ "$i" = 37 ] && n=140
  {
    for j in $(seq 1 $n); do echo "export const consulta$j = await buscarPaciente({ id: $j, incluirHistorial: true, sede: 'norte', orden: 'fecha-desc' }) // modulo $i caso $j"; done
  } > "src/modulo$i.ts"
done
mv src/modulo37.ts src/historial.ts
