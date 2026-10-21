#!/bin/bash
# Un package-lock.json de ~200 KB (800 dependencias). La respuesta está en la línea ~4000.
python3 - <<'PY'
import json
paquetes = {"": {"name": "demo", "version": "1.0.0"}}
for i in range(800):
    paquetes[f"node_modules/paquete-{i}"] = {"version": f"1.{i}.0", "resolved": f"https://registry.npmjs.org/paquete-{i}/-/paquete-{i}-1.{i}.0.tgz", "integrity": "sha512-" + "a" * 64, "dev": i % 3 == 0}
json.dump({"name": "demo", "version": "1.0.0", "lockfileVersion": 3, "requires": True, "packages": paquetes}, open("package-lock.json", "w"), indent=2)
PY
echo '{ "name": "demo", "version": "1.0.0" }' > package.json
