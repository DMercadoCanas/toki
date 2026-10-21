import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Compactar antes en modelos de 1M, contar lo que de verdad costó cada pedido,
// y no repetir salidas idénticas. Con lo que hay debajo de los plugins simulado.

/** Variables de entorno que se pueden leer y cambiar, como en el proceso real. */
function entorno(on: On, inicial: Record<string, string> = {}): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = { ...inicial }
  on('env.get', ($, e) => ({ value: vars[e.name] }))
  on('env.set', ($, e) => {
    vars[e.name] = e.value
    return { value: {} }
  })
  return vars
}

/** /context de Claude Code: la ventana de compactación sale de la variable si está puesta. */
function contexto(on: On, vars: Record<string, string | undefined>, estado: { tokens?: number; nativa: number; fuente: string }): void {
  on('session.usage', () => {
    const env = vars['CLAUDE_CODE_AUTO_COMPACT_WINDOW']
    const raw = env !== undefined ? Math.min(Number(env), 1_000_000) : estado.nativa
    const breakdown = {
      categories: [],
      totalTokens: estado.tokens ?? 0,
      maxTokens: raw,
      rawMaxTokens: raw,
      autocompactSource: env !== undefined ? 'env' : estado.fuente,
      percentage: 0,
      memoryFiles: [],
      mcpTools: [],
    }
    return {
      value: {
        startedAt: 0,
        context: { tokens: estado.tokens, window: 1_000_000, percent: estado.tokens === undefined ? undefined : Math.round(estado.tokens / 10_000), breakdown },
        rateLimits: [{ kind: 'five_hour', percentUsed: 40 }],
      },
    } as never
  })
}

function disco(on: On, toasts: string[]): Map<string, string> {
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
  on('fs.stat', () => ({ deny: 'no existe' }))
  on('fs.list', () => ({ value: [] }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  return archivos
}

/** Lo que hay debajo de los plugins: el turno empieza, cada pedido contesta con su uso, el turno termina. */
function motor(on: On, usoDelPedido: () => { cache_read_input_tokens: number; cache_creation_input_tokens: number }): void {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    const u = usoDelPedido()
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { input_tokens: 2, output_tokens: 200, model: 'claude-opus-5-5', ...u } }
  })
}

async function pedido($: Parameters<TestBody>[0], turnId: string, index: number): Promise<void> {
  const stream = $.turn.step({ turnId, index, model: 'claude-opus-5-5', messageCount: 10 + index })
  for await (const _ of stream) {
    // Sin trozos: solo importa el resultado.
  }
  await stream.result
}

describe('ventana y gasto', () => {
  test('con un modelo de 1M compacta a los 300k, y al compactar antes cuenta las relecturas evitadas (descontando la compactación)', async ($, on) => {
    const reloj = mock.clock(on, { now: 5_000_000 })
    mock.store(on)
    const toasts: string[] = []
    disco(on, toasts)
    const vars = entorno(on, { LANG: 'es_CO.UTF-8' })
    const estado = { tokens: 40_000 as number | undefined, nativa: 500_000, fuente: 'clientdata' }
    contexto(on, vars, estado)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.surfaces', () => ({ value: [] }))
    let tam = 250_000
    motor(on, () => ({ cache_read_input_tokens: tam - 1_000, cache_creation_input_tokens: 998 }))

    await $.session.start({ cwd: '/proyecto', surface: null, isInteractive: true })
    await reloj.advance(2_000)
    expect(vars['CLAUDE_CODE_AUTO_COMPACT_WINDOW']).toBe('300000')
    expect(toasts.some(t => t.includes('compactaré a los 300.0k') && t.includes('500.0k'))).toBe(true)

    await $.turn.start({ text: 'refactoriza el módulo de radiología y sus vistas', turnId: 't1' })
    await pedido($, 't1', 0)
    tam = 290_000
    await pedido($, 't1', 1)
    // Claude Code compactó a los ~290k (por la ventana de Toki): el pedido siguiente es chico.
    tam = 50_000
    await pedido($, 't1', 2)
    tam = 60_000
    await pedido($, 't1', 3)
    tam = 70_000
    await pedido($, 't1', 4)
    estado.tokens = 70_000
    await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' as const })

    const texto = (await $.command.run({ command: 'toki-por-que', args: '' } as never)) as { text: string }
    // −290k (la compactación misma) + 3 × 240k (cada pedido siguiente) = 430k.
    expect(texto.text).toContain('Relecturas evitadas: ~430.0k')
    expect(texto.text).toContain('Compactación: a los 300.0k (Claude Code lo haría a los 500.0k)')
    expect(texto.text).toContain('5 pedidos al modelo')
  })

  test('si ya elegiste una ventana, Toki no la toca', async ($, on) => {
    const reloj = mock.clock(on, { now: 6_000_000 })
    mock.store(on)
    disco(on, [])
    const vars = entorno(on, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '600000' })
    contexto(on, vars, { tokens: 30_000, nativa: 967_000, fuente: 'model-default' })
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.surfaces', () => ({ value: [] }))
    motor(on, () => ({ cache_read_input_tokens: 30_000, cache_creation_input_tokens: 100 }))

    await $.session.start({ cwd: '/proyecto', surface: null, isInteractive: true })
    await reloj.advance(2_000)
    expect(vars['CLAUDE_CODE_AUTO_COMPACT_WINDOW']).toBe('600000')
    const texto = (await $.command.run({ command: 'toki-por-que', args: '' } as never)) as { text: string }
    expect(texto.text).toContain('la elegiste tú')
  })

  test('una salida idéntica a la de hace un rato llega como una línea con la ruta de la copia', async ($, on) => {
    mock.clock(on, { now: 7_000_000 })
    mock.store(on)
    const archivos = disco(on, [])
    const salida = Array.from({ length: 60 }, (_, i) => ` M hms_clinical_history/views/vista_${i}.xml`).join('\n')
    on('tool.call', () => ({ result: { stdout: salida, stderr: '', interrupted: false } }))

    const primera = await $.tool.call({ tool: 'Bash', command: 'git status' } as never)
    expect((primera.result as { stdout: string }).stdout).toBe(salida)
    const segunda = await $.tool.call({ tool: 'Bash', command: 'git status' } as never)
    const texto = (segunda.result as { stdout: string }).stdout
    expect(texto).toContain('[Toki] Salida idéntica a la de este mismo comando')
    expect(texto).toContain('.claude/toki/salidas/')
    expect(texto.length < salida.length / 5).toBe(true)
    const copia = [...archivos.entries()].find(([ruta]) => ruta.includes('.claude/toki/salidas/'))
    expect(copia?.[1]).toContain('vista_59.xml')
    // Otra salida del mismo comando (cambió algo): se entrega completa.
    const tercera = await $.tool.call({ tool: 'Bash', command: 'git status --short' } as never)
    expect((tercera.result as { stdout: string }).stdout).toBe(salida)
  })
})
