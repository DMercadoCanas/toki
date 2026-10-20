import { describe, expect, test } from 'claude-code/testing'

import {
  agrupar,
  bytesDeBase64,
  caracteresRecortados,
  compactar,
  decodificarUtf16,
  encabezado,
  envolver,
  envolverPs,
  envolverRescate,
  envolverRescatePs,
  esCompactable,
  esError,
  esRuidoso,
  limpiar,
  rescatarErrores,
  separarComando,
  separarComandoPs,
  separarSelectLast,
  separarTail,
} from '../hooks/compresor'

describe('captura', () => {
  test('conserva un cd inicial fuera del subshell', async () => {
    expect(separarComando('cd app && npm test')).toEqual({ prefijo: 'cd app && ', cuerpo: 'npm test' })
    expect(envolver('cd app && ', 'npm test', '/p/s.txt')).toBe("cd app && ( set -o pipefail; { npm test\n} 2>&1 | tee '/p/s.txt' ) # Toki: guarda una copia completa de la salida")
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

  test('ignora el echo final que Claude agrega', async () => {
    expect(esCompactable('npm run enorme; echo "EXIT_CODE=$?"')).toBe(true)
    expect(esCompactable('flutter test 2>&1; echo "---"; echo $?')).toBe(true)
    expect(esCompactable('npm test && cat resultado.json')).toBe(false)
    expect(esCompactable("(test -f x.js && cat -n x.js || (echo NO; find . -name 'x*'))")).toBe(false)
    expect(esCompactable('cat config.json && npm test')).toBe(false)
    expect(esCompactable('npm ci; echo "---"; npm test')).toBe(true)
    expect(esCompactable('npm run dev')).toBe(false)
    expect(esCompactable('npm run e2e:ci')).toBe(true)
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

  test('si hay cientos de errores, dice cuántos quedaron en la copia', async () => {
    const lineas = ['$ eslint .']
    for (let i = 0; i < 600; i++) lineas.push(`src/archivo${i}.ts:${i}:1  error  'x${i}' is defined but never used  no-unused-vars`)
    const c = compactar(lineas.join('\n'))
    if (c === null) throw new Error('debió compactar')
    expect(c.importantesOmitidas > 0).toBe(true)
    expect(encabezado(c, 'x.txt')).toContain('van las primeras y las últimas')
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
    const texto = encabezado(c, '.claude/toki/salidas/salida-00.txt')
    expect(texto).toContain('[Toki] Salida compactada')
    expect(texto).toContain('.claude/toki/salidas/salida-00.txt')
    expect(texto).toContain('Copia completa')
    expect(texto).toContain('Están todas las líneas con errores')
    expect(encabezado(c, 'x.txt', false)).toContain('Copia parcial')
    expect(encabezado(c, 'x.txt', true, 1600)).toContain('~1.6k tokens menos')
  })

  test('en inglés, el encabezado y las marcas también', async () => {
    const c = compactar(salidaDeTests(), 'en')
    if (c === null) throw new Error('debió compactar')
    expect(c.texto).toContain('similar lines')
    const texto = encabezado(c, 'x.txt', true, 1600, 'en')
    expect(texto).toContain('[Toki] Output compacted')
    expect(texto).toContain('~1.6k fewer tokens')
    expect(texto).toContain('Full copy, in case you need a specific line: x.txt')
    expect(encabezado(c, 'x.txt', false, undefined, 'en')).toContain('Partial copy')
  })
})

describe('rescate tras un | tail', () => {
  test('separa solo un tail final, sin tail -f', async () => {
    expect(separarTail('npm test 2>&1 | tail -n 80')).toEqual({ base: 'npm test 2>&1', filtro: 'tail -n 80' })
    expect(separarTail('flutter test | tail -50')).toEqual({ base: 'flutter test', filtro: 'tail -50' })
    expect(separarTail('cd app && npm test 2>&1 | tail')).toEqual({ base: 'cd app && npm test 2>&1', filtro: 'tail' })
    expect(separarTail('npm test | grep x | tail -5')).toBe(undefined)
    expect(separarTail('npm run dev | tail -f')).toBe(undefined)
    expect(separarTail('npm test | head -20')).toBe(undefined)
    expect(separarTail('npm test')).toBe(undefined)
  })

  test('el envoltorio no cambia lo que ve Claude ni el código de salida', async () => {
    expect(envolverRescate('', 'npm test 2>&1', 'tail -n 80', '/p/s.txt')).toBe("{ npm test 2>&1 | tee '/p/s.txt'; } | tail -n 80 # Toki: guarda una copia completa de la salida")
    expect(envolverRescate('cd app && ', 'npm test 2>&1', 'tail', '/p/s.txt')).toBe("cd app && { npm test 2>&1 | tee '/p/s.txt'; } | tail # Toki: guarda una copia completa de la salida")
    expect(esRuidoso('npm test 2>&1')).toBe(true)
    expect(esRuidoso('cat archivo.log')).toBe(false)
  })

  test('distingue errores de tests que pasan con "error" en el nombre', async () => {
    expect(esError(' ✕ src/pagos.test.ts > cobra con tarjeta vencida')).toBe(true)
    expect(esError('   AssertionError: expected 402 to be 200')).toBe(true)
    expect(esError(' ✓ src/api.test.ts > maneja el error de red')).toBe(false)
    expect(esError('npm WARN deprecated inflight@1.0.6')).toBe(false)
  })

  test('rescata solo los errores que el tail dejó fuera, con contexto', async () => {
    const completa = salidaDeTests()
    const entregado = completa.split('\n').slice(-80).join('\n')
    const r = rescatarErrores(completa, entregado)
    if (r === undefined) throw new Error('debió rescatar')
    expect(r.texto.join('\n')).toContain('✕ src/pagos.test.ts > cobra con tarjeta vencida')
    expect(r.texto.join('\n')).toContain('AssertionError: expected 402 to be 200')
    expect(r.texto.join('\n')).toContain('at src/pagos.test.ts:42:17')
    expect(r.texto.join('\n')).not.toContain('Tests  1 failed') // ya venía en el tail
    expect(r.texto.length <= 40).toBe(true)
    expect(rescatarErrores(completa, completa)).toBe(undefined)
  })
})

describe('lo que Claude Code ya recortó', () => {
  test('conserva la marca de recorte y lo dice en el encabezado', async () => {
    const lineas = salidaDeTests().split('\n')
    const recortada = [...lineas.slice(0, 90), '', '... [16582 characters truncated] ...', '', ...lineas.slice(-80)].join('\n')
    expect(caracteresRecortados(recortada)).toBe(16582)
    const c = compactar(recortada)
    if (c === null) throw new Error('debió compactar')
    expect(c.texto).toContain('[16582 characters truncated]')
    expect(c.recortadoAntes).toBe(16582)
    const texto = encabezado(c, 'x.txt', false)
    expect(texto).toContain('Claude Code ya había recortado')
    expect(texto).not.toContain('Están todas las líneas')
    // Con la copia completa no hay recorte del que avisar.
    expect(encabezado(compactar(salidaDeTests()) ?? c, 'x.txt', true)).toContain('Están todas las líneas')
  })
})

describe('PowerShell', () => {
  test('envuelve con Tee-Object sin cambiar el comando', async () => {
    expect(separarComandoPs('npm test')).toEqual({ prefijo: '', cuerpo: 'npm test' })
    expect(separarComandoPs('cd app; flutter test')).toEqual({ prefijo: 'cd app; ', cuerpo: 'flutter test' })
    expect(separarComandoPs("Set-Location 'C:\\mi app' && dotnet test")).toEqual({ prefijo: "Set-Location 'C:\\mi app' && ", cuerpo: 'dotnet test' })
    expect(separarComandoPs('npm ci; npm test')).toBe(undefined)
    expect(separarComandoPs('$r = npm test')).toBe(undefined)
    expect(separarComandoPs('npm test | Out-File x.txt')).toBe(undefined)
    expect(envolverPs('', 'npm test', "C:\\p\\it's.txt")).toBe("npm test 2>&1 | Tee-Object -FilePath 'C:\\p\\it''s.txt' # Toki: guarda una copia completa de la salida")
    expect(envolverPs('', 'npm test 2>&1', 'x.txt')).toBe("npm test 2>&1 | Tee-Object -FilePath 'x.txt' # Toki: guarda una copia completa de la salida")
  })

  test('el Select-Object -Last de PowerShell también se rescata', async () => {
    expect(separarSelectLast('npm test | Select-Object -Last 30')).toEqual({ base: 'npm test', filtro: 'Select-Object -Last 30' })
    expect(separarSelectLast('flutter test 2>&1 | select -last 50')).toEqual({ base: 'flutter test 2>&1', filtro: 'select -last 50' })
    expect(separarSelectLast('npm test | Select-Object -First 30')).toBe(undefined)
    expect(envolverRescatePs('', 'npm test', 'Select-Object -Last 30', 'x.txt')).toBe("npm test | Tee-Object -FilePath 'x.txt' | Select-Object -Last 30 # Toki: guarda una copia completa de la salida")
  })

  test('lee las copias en UTF-16 de Windows PowerShell 5.1', async () => {
    const texto = 'Error: falla ✕ ñ\n'
    const bytes = [0xff, 0xfe]
    for (const ch of texto) {
      const c = ch.charCodeAt(0)
      bytes.push(c & 255, c >> 8)
    }
    let binario = ''
    for (const b of bytes) binario += String.fromCharCode(b)
    const b64 = btoa(binario)
    expect([...bytesDeBase64(b64)]).toEqual(bytes)
    expect(decodificarUtf16(bytesDeBase64(b64))).toBe(texto)
  })

  test('respeta filtros y lecturas de PowerShell', async () => {
    expect(esCompactable('npm test | Select-String FAIL')).toBe(false)
    expect(esCompactable('dotnet test | Select-Object -Last 40')).toBe(false)
    expect(esCompactable('Get-Content package.json')).toBe(false)
    expect(esCompactable('flutter test; Write-Output "listo"')).toBe(true)
    expect(esCompactable('dotnet test')).toBe(true)
  })
})
