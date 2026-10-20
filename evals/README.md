# Evals de ahorro-tokens

Comparan a Claude con y sin el plugin en escenarios reales. Se corren con la herramienta oficial:

```bash
claude plugin eval . --scaffold --allow-tools "Bash(npm *)" --runs 3
```

- `test-con-fallo`: 421 tests, uno falla en la mitad de una salida larga. Sin el plugin, Claude Code recorta la salida del comando fallido y el fallo suele quedar oculto; con el plugin llega completo.
- `salida-enorme`: 1,6 MB de salida con el error en la última línea. Sin el plugin, Claude solo ve una vista previa del inicio y necesita una segunda llamada; con el plugin lo ve en la primera.

Nota: `--scaffold` ejecuta `fixture.sh` fuera del sandbox para crear el proyecto de prueba. Léelo antes de correrlo.
