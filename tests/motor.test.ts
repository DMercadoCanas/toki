import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

// El motor de compactación de punta a punta, con lo que hay debajo de los plugins simulado.

function salidaRuidosa(fallo: boolean): string {
  const lineas: string[] = ['Determining projects to restore...', '  Restored /src/App.Tests/App.Tests.csproj']
  for (let i = 1; i <= 400; i++) lineas.push(`  Passed App.Tests.Caso${i} [${i % 9} ms]`)
  if (fallo) lineas.push('  Failed App.Tests.Pagos.CobraConTarjetaVencida [12 ms]', '  Error Message:', '   Assert.Equal() Failure: Expected 200, Actual 402')
  lineas.push(fallo ? 'Failed!  - Failed: 1, Passed: 400, Skipped: 0, Total: 401' : 'Passed!  - Failed: 0, Passed: 400, Skipped: 0, Total: 400')
  return lineas.join('\n')
}

function disco(on: On, toasts: string[] = []): Map<string, string> {
  const archivos = new Map<string, string>()
  on('fs.exists', ($, e) => ({ value: archivos.has(e.path) }))
  on('fs.write', ($, e) => {
    archivos.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const texto = archivos.get(e.path)
    return texto === undefined ? { deny: 'no existe' } : { value: texto }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  return archivos
}

/** La herramienta PowerShell existe en Windows; los tipos de esta versión no la nombran. */
function powershell(command: string): never {
  return { tool: 'PowerShell', command } as never
}

describe('motor', () => {
  test('PowerShell: compacta un dotnet test largo y guarda el original', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    const archivos = disco(on)
    const original = salidaRuidosa(false)
    on('tool.call', () => ({ result: { stdout: original, stderr: '', interrupted: false } }))

    const r = await $.tool.call(powershell('dotnet test'))
    const salida = (r.result as { stdout: string }).stdout
    expect(salida).toContain('[Toki] Salida compactada')
    expect(salida).toContain('Passed!  - Failed: 0, Passed: 400')
    expect(salida.length < original.length / 2).toBe(true)
    const guardado = [...archivos.entries()].find(([ruta]) => ruta.includes('.claude/toki/salidas/'))
    if (guardado === undefined) throw new Error(`no se guardó el original: ${[...archivos.keys()].join(', ')}`)
    expect(guardado?.[1]).toContain('Passed App.Tests.Caso200')
  })

  test('PowerShell: en un fallo conserva el error y deja una copia', async ($, on) => {
    mock.clock(on, { now: 2_000_000 })
    mock.store(on)
    disco(on)
    on('tool.call', () => ({ isError: true as const, result: undefined, text: `Exit code 1\n${salidaRuidosa(true)}` }))

    const r = await $.tool.call(powershell('dotnet test'))
    expect(r.deny).toContain('[Toki] Salida compactada')
    expect(r.deny).toContain('Expected 200, Actual 402')
    expect(r.deny).toContain('Exit code 1')
  })

  test('PowerShell: una salida ya filtrada no se toca', async ($, on) => {
    mock.clock(on, { now: 3_000_000 })
    mock.store(on)
    disco(on)
    const original = salidaRuidosa(false)
    on('tool.call', () => ({ result: { stdout: original, stderr: '', interrupted: false } }))
    const r = await $.tool.call(powershell('dotnet test | Select-String Failed'))
    expect((r.result as { stdout: string }).stdout).toBe(original)
  })

  test('Bash: si Claude corta con | tail, Toki agrega el error que quedó fuera', async ($, on) => {
    mock.clock(on, { now: 5_000_000 })
    mock.store(on)
    mock.env(on, { SHELL: '/bin/zsh' })
    const archivos = disco(on)
    on('session.cwd', () => ({ value: '/proyecto' }))
    on('tool.check', () => ({ decision: 'allow' as const }))
    // El fallo queda en medio: el tail solo ve los últimos tests y el resumen.
    const lineas = salidaRuidosa(false).split('\n')
    lineas.splice(150, 0, '  Failed App.Tests.Pagos.CobraConTarjetaVencida [12 ms]', '  Error Message:', '   Assert.Equal() Failure: Expected 200, Actual 402')
    const completa = lineas.join('\n')
    const cola = lineas.slice(-20).join('\n')
    let ejecutado = ''
    on('tool.call', ($, e) => {
      ejecutado = String((e as { command?: unknown }).command)
      const ruta = ejecutado.match(/tee '\/proyecto\/([^']+)'/)?.[1]
      const clave = [...archivos.keys()].find(k => ruta !== undefined && k.endsWith(ruta))
      if (clave !== undefined) archivos.set(clave, completa)
      return { result: { stdout: cola, stderr: '', interrupted: false } }
    })

    const r = await $.tool.call({ tool: 'Bash', command: 'dotnet test 2>&1 | tail -n 20' })
    expect(ejecutado).toContain("{ dotnet test 2>&1 | tee '/proyecto/.claude/toki/salidas/")
    expect(ejecutado).toContain('; } | tail -n 20')
    const salida = (r.result as { stdout: string }).stdout
    expect(salida.startsWith(cola)).toBe(true) // lo que pidió Claude, intacto
    expect(salida).toContain('dejó fuera')
    expect(salida).toContain('Expected 200, Actual 402')
  })

  test('PowerShell: con permiso igual, guarda la copia completa con Tee-Object y rescata el fallo del medio', async ($, on) => {
    mock.clock(on, { now: 6_000_000 })
    mock.store(on)
    const archivos = disco(on)
    on('session.cwd', () => ({ value: 'C:\\proyecto' }))
    on('tool.check', () => ({ decision: 'allow' as const }))
    const lineas = salidaRuidosa(false).split('\n')
    lineas.splice(150, 0, '  Failed App.Tests.Pagos.CobraConTarjetaVencida [12 ms]', '   Assert.Equal() Failure: Expected 200, Actual 402')
    const completa = lineas.join('\n')
    let ejecutado = ''
    on('tool.call', ($, e) => {
      ejecutado = String((e as { command?: unknown }).command)
      const ruta = ejecutado.match(/Tee-Object -FilePath 'C:\\proyecto\/([^']+)'/)?.[1]
      const clave = [...archivos.keys()].find(k => ruta !== undefined && k.endsWith(ruta))
      if (clave !== undefined) archivos.set(clave, completa)
      // Claude Code entrega la salida de un fallo recortada por el medio, con su marca.
      return { isError: true as const, result: undefined, text: `Exit code 1\n${lineas.slice(0, 60).join('\n')}\n\n... [9000 characters truncated] ...\n\n${lineas.slice(-40).join('\n')}` }
    })

    const r = await $.tool.call(powershell('dotnet test'))
    expect(ejecutado).toContain("dotnet test 2>&1 | Tee-Object -FilePath 'C:\\proyecto/.claude/toki/salidas/")
    expect(r.deny).toContain('Expected 200, Actual 402')
    expect(r.deny).toContain('Copia completa, por si necesitas')
  })

  test('PowerShell: si Claude corta con Select-Object -Last, Toki agrega el error que quedó fuera', async ($, on) => {
    mock.clock(on, { now: 7_000_000 })
    mock.store(on)
    const archivos = disco(on)
    on('session.cwd', () => ({ value: 'C:\\proyecto' }))
    on('tool.check', () => ({ decision: 'allow' as const }))
    const lineas = salidaRuidosa(false).split('\n')
    lineas.splice(150, 0, '  Failed App.Tests.Pagos.CobraConTarjetaVencida [12 ms]', '   Assert.Equal() Failure: Expected 200, Actual 402')
    const cola = lineas.slice(-20).join('\n')
    let ejecutado = ''
    on('tool.call', ($, e) => {
      ejecutado = String((e as { command?: unknown }).command)
      const ruta = ejecutado.match(/Tee-Object -FilePath 'C:\\proyecto\/([^']+)'/)?.[1]
      const clave = [...archivos.keys()].find(k => ruta !== undefined && k.endsWith(ruta))
      if (clave !== undefined) archivos.set(clave, lineas.join('\n'))
      return { result: { stdout: cola, stderr: '', interrupted: false } }
    })
    const r = await $.tool.call(powershell('dotnet test | Select-Object -Last 20'))
    expect(ejecutado).toContain("| Tee-Object -FilePath 'C:\\proyecto/.claude/toki/salidas/")
    expect(ejecutado).toContain('| Select-Object -Last 20')
    const salida = (r.result as { stdout: string }).stdout
    expect(salida.startsWith(cola)).toBe(true)
    expect(salida).toContain('Expected 200, Actual 402')
  })

  test('PowerShell: si el permiso del comando envuelto cambia, no lo toca y lo dice con honestidad', async ($, on) => {
    mock.clock(on, { now: 8_000_000 })
    mock.store(on)
    disco(on)
    on('session.cwd', () => ({ value: 'C:\\proyecto' }))
    on('tool.check', ($, e) => ({ decision: String((e as { input?: { command?: string } }).input?.command).includes('Tee-Object') ? ('ask' as const) : ('allow' as const) }))
    let ejecutado = ''
    const lineas = salidaRuidosa(true).split('\n')
    on('tool.call', ($, e) => {
      ejecutado = String((e as { command?: unknown }).command)
      return { isError: true as const, result: undefined, text: `Exit code 1\n${lineas.slice(0, 60).join('\n')}\n\n... [9000 characters truncated] ...\n\n${lineas.slice(-5).join('\n')}` }
    })
    const r = await $.tool.call(powershell('dotnet test'))
    expect(ejecutado).toBe('dotnet test')
    expect(r.deny).toContain('Claude Code ya había recortado')
    expect(r.deny).toContain('[9000 characters truncated]')
  })

  test('Bash: lee la copia completa capturada y cuenta el ahorro con honestidad', async ($, on) => {
    mock.clock(on, { now: 4_000_000 })
    mock.store(on)
    mock.env(on, { SHELL: '/bin/bash' })
    const archivos = disco(on)
    on('session.cwd', () => ({ value: '/proyecto' }))
    on('tool.check', () => ({ decision: 'allow' as const }))
    const completa = salidaRuidosa(true)
    let ejecutado = ''
    on('tool.call', ($, e) => {
      ejecutado = String((e as { command?: unknown }).command)
      // El comando envuelto escribe la copia completa con tee; Claude Code entrega solo el principio.
      const ruta = ejecutado.match(/tee '\/proyecto\/([^']+)'/)?.[1]
      // Toki dejó el archivo vacío antes de correr el comando; tee lo llena.
      const clave = [...archivos.keys()].find(k => ruta !== undefined && k.endsWith(ruta))
      if (clave !== undefined) archivos.set(clave, completa)
      return { isError: true as const, result: undefined, text: `Exit code 1\n${completa.slice(0, 9_000)}` }
    })

    const r = await $.tool.call({ tool: 'Bash', command: 'npm test' })
    expect(ejecutado).toContain("2>&1 | tee '/proyecto/.claude/toki/salidas/")
    expect(r.deny).toContain('Expected 200, Actual 402') // el error del final, que Claude Code había cortado
    expect(r.deny).toContain('Copia completa, por si necesitas')
  })

  test('trae una sola vez el total y el historial de ahorro-tokens', async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 20, 17) })
    mock.store(on)
    mock.env(on, { HOME: '/Users/ana' })
    const toasts: string[] = []
    const archivos = disco(on, toasts)
    archivos.set('/Users/ana/.claude/plugins/store/ahorro-tokens_kit-ahorro-abc.json', JSON.stringify({ tokensAhorradosTotal: 15900, historialDiario: { '2026-10-19': 9000, '2026-10-20': 6900 } }))
    archivos.set('/Users/ana/.claude/plugins/store/otro_plugin-1.json', JSON.stringify({ tokensAhorradosTotal: 999 }))
    on('fs.list', ($, e) => {
      const carpeta = String(e.path ?? '')
      return { value: [...archivos.keys()].filter(k => k.startsWith(`${carpeta}/`)).map(k => ({ name: k.slice(carpeta.length + 1), kind: 'file' as const, size: 10, mtimeMs: 0, isLink: false })) }
    })
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/proyecto', surface: null, isInteractive: false })
    expect(toasts.some(t => t.includes('Traje tu historial de ahorro-tokens: ~15.9k tokens'))).toBe(true)
    expect(toasts.some(t => t.includes('Logro desbloqueado') && t.includes('10k tokens'))).toBe(true)

    const ui = await $.ui.mount({
      plugin: 'toki',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'toki-panel',
      props: { title: 'Toki', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: /~15\.9k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Racha: 2 días seguidos/ })).toBeDefined()
    await ui.unmount()

    toasts.length = 0
    await $.session.start({ cwd: '/proyecto', surface: null, isInteractive: false })
    expect(toasts.some(t => t.includes('Traje tu historial'))).toBe(false)
  })
})
