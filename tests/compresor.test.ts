import { describe, expect, test } from 'claude-code/testing'

import { agrupar, compactar, encabezado, envolver, esCompactable, limpiar, separarComando } from '../hooks/compresor'

describe('captura', () => {
  test('conserva un cd inicial fuera del subshell', async () => {
    expect(separarComando('cd app && npm test')).toEqual({ prefijo: 'cd app && ', cuerpo: 'npm test' })
    expect(envolver('cd app && ', 'npm test', '/p/s.txt')).toBe("cd app && ( set -o pipefail; { npm test\n} 2>&1 | tee '/p/s.txt' )")
  })

  test('no envuelve comandos que cambian el estado del shell o van en segundo plano', async () => {
    expect(separarComando('npm test && cd dist')).toBe(undefined)
    expect(separarComando('export CI=1 && npm test')).toBe(undefined)
    expect(separarComando('source .env; pytest')).toBe(undefined)
    expect(separarComando('npm run dev &')).toBe(undefined)
  })

  test('acepta && entre comandos normales', async () => {
    expect(separarComando('npm ci && npm test')).toEqual({ prefijo: '', cuerpo: 'npm ci && npm test' })
  })
})

function salidaDeTests(): string {
  const lineas: string[] = ['> proyecto@1.0.0 test', '> vitest run', '']
  for (let i = 1; i <= 300; i++) lineas.push(` ✓ src/modulo${i}.test.ts > hace la cosa ${i} (${i % 7}ms)`)
  lineas.push(' ✕ src/pagos.test.ts > cobra con tarjeta vencida')
  lineas.push('   AssertionError: expected 402 to be 200')
  lineas.push('     at src/pagos.test.ts:42:17')
  for (let i = 1; i <= 200; i++) lineas.push(` ✓ src/otro${i}.test.ts > caso ${i} (${i % 5}ms)`)
  lineas.push('', ' Test Files  1 failed | 500 passed (501)', '      Tests  1 failed | 500 passed (501)', '   Duration  12.31s')
  return lineas.join('\n')
}

describe('esCompactable', () => {
  test('acepta familias ruidosas', async () => {
    for (const comando of ['npm test', 'pnpm run build', 'npx vitest run', 'pytest -q', 'cargo build --release', 'go test ./...', 'docker compose up --build', 'cd app && yarn install', 'git log --oneline', 'flutter test', 'flutter pub get', 'dart analyze', 'cd ios && pod install', 'xcodebuild -scheme Runner build', 'cd android && ./gradlew assembleDebug']) {
      expect(esCompactable(comando)).toBe(true)
    }
  })

  test('nunca toca lecturas de contenido exacto ni salidas ya filtradas', async () => {
    for (const comando of ['cat package.json', 'git diff', 'git show HEAD', 'npm test | tail -50', 'pytest | grep FAIL', 'sed -n 1,80p src/app.ts', 'echo hola', 'git log -p']) {
      expect(esCompactable(comando)).toBe(false)
    }
  })

  test('no compacta comandos desconocidos', async () => {
    expect(esCompactable('./mi-script.sh')).toBe(false)
    expect(esCompactable('node index.js')).toBe(false)
  })
})

describe('compactar', () => {
  test('deja intactas las salidas cortas', async () => {
    expect(compactar('ok\nlisto\n')).toBe(null)
  })

  test('conserva el error, su contexto, el inicio y el resumen final', async () => {
    const original = salidaDeTests()
    const c = compactar(original)
    expect(c).not.toBe(null)
    if (c === null) return
    expect(c.texto).toContain('✕ src/pagos.test.ts > cobra con tarjeta vencida')
    expect(c.texto).toContain('AssertionError: expected 402 to be 200')
    expect(c.texto).toContain('at src/pagos.test.ts:42:17')
    expect(c.texto).toContain('> vitest run')
    expect(c.texto).toContain('Tests  1 failed | 500 passed (501)')
    expect(c.texto).toContain('líneas parecidas')
    expect(c.caracteresDespues < c.caracteresAntes * 0.4).toBe(true)
  })

  test('omite el ruido variado pero nunca un error en medio', async () => {
    const palabras = ['login', 'pagos', 'carrito', 'perfil', 'busqueda', 'envios', 'facturas', 'reportes']
    const lineas: string[] = ['$ pytest -q']
    for (let i = 0; i < 400; i++) lineas.push(`tests/test_${palabras[i % 8]}.py::test_${palabras[(i * 3) % 8]}_${palabras[(i * 5) % 8]} PASSED`)
    lineas.splice(210, 0, 'tests/test_pagos.py::test_reembolso FAILED', 'E   KeyError: monto')
    lineas.push('=== 1 failed, 400 passed in 9.12s ===')
    const c = compactar(lineas.join('\n'))
    if (c === null) throw new Error('debió compactar')
    expect(c.texto).toContain('test_reembolso FAILED')
    expect(c.texto).toContain('E   KeyError: monto')
    expect(c.texto).toContain('1 failed, 400 passed')
    expect(c.texto).toContain('líneas omitidas')
  })

  test('agrupa repetidas y barras de progreso', async () => {
    const progreso = Array.from({ length: 80 }, (_, i) => `Descargando paquete ${i}%`).join('\r') + '\n'
    const repetidas = Array.from({ length: 100 }, () => 'npm WARN deprecated inflight@1.0.6').join('\n')
    expect(limpiar(progreso)[0]).toBe('Descargando paquete 79%')
    const items = agrupar(limpiar(repetidas))
    expect(items.length).toBe(1)
    expect(items[0]?.repeticiones).toBe(100)
  })

  test('quita colores ANSI', async () => {
    expect(limpiar('\u001b[31mFAIL\u001b[0m prueba')[0]).toBe('FAIL prueba')
  })

  test('el encabezado dice qué se hizo y dónde está el original', async () => {
    const c = compactar(salidaDeTests())
    if (c === null) throw new Error('debió compactar')
    const texto = encabezado(c, '.claude/ahorro-tokens/salidas/salida-00.txt')
    expect(texto).toContain('[ahorro-tokens] Salida compactada')
    expect(texto).toContain('.claude/ahorro-tokens/salidas/salida-00.txt')
  })
})
