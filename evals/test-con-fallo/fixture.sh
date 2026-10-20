#!/bin/bash
# Proyecto de prueba: 421 tests, uno falla en la mitad de una salida larga.
cat > package.json <<'JSON'
{ "name": "demo", "version": "1.0.0", "scripts": { "test": "node fake-test.js", "enorme": "node big.js" } }
JSON
cat > fake-test.js <<'JS'
const areas = ['login','pagos','carrito','perfil','busqueda','envios','facturas','reportes']
console.log('\n> vitest run\n')
for (let i = 0; i < 420; i++) {
  if (i === 233) {
    console.log(' ✕ src/pagos.test.ts > cobra con tarjeta vencida 12ms')
    console.log('   AssertionError: expected 402 to be 200')
    console.log('     at src/pagos.test.ts:42:17')
  }
  console.log(` ✓ src/${areas[i%8]}.test.ts > ${areas[(i*3)%8]} maneja ${areas[(i*5)%8]} en caso ${i} ${i%9}ms`)
}
console.log('\n Test Files  1 failed | 7 passed (8)\n      Tests  1 failed | 420 passed (421)\n   Duration  4.20s')
process.exit(1)
JS
cat > big.js <<'JS'
for (let i = 0; i < 20000; i++) console.log(`linea ${i} de salida bastante larga para probar el limite de treinta mil caracteres`)
console.log('ERROR: el ultimo modulo fallo con codigo X42'); console.log('resumen final: 19999 ok, 1 error')
JS
