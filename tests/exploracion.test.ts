import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { describe, expect, mock, test } from 'claude-code/testing'

import { EXPLORACION_VACIA, pasoExploracion, sumarPaso, tocaDelegar, UMBRAL_EXPLORACION } from '../hooks/exploracion'

// Explorar a mano en la conversación principal: pasado el umbral, Toki sugiere un subagente Explore.

describe('exploración', () => {
  test('reconoce búsquedas, lecturas, ediciones y delegaciones', async () => {
    expect(pasoExploracion('Grep')).toBe('busqueda')
    expect(pasoExploracion('Glob')).toBe('busqueda')
    expect(pasoExploracion('Bash', 'rg "calcular_total" src')).toBe('busqueda')
    expect(pasoExploracion('Bash', 'sed -n 1,80p hooks/register.tsx')).toBe('lectura')
    expect(pasoExploracion('Bash', 'sed -i "s/a/b/" x.ts')).toBe(undefined)
    expect(pasoExploracion('Bash', 'npm test')).toBe(undefined)
    expect(pasoExploracion('PowerShell', 'Select-String -Path *.cs -Pattern Total')).toBe('busqueda')
    expect(pasoExploracion('PowerShell', 'Get-Content app.cs')).toBe('lectura')
    expect(pasoExploracion('Read')).toBe('lectura')
    expect(pasoExploracion('Edit')).toBe('edicion')
    expect(pasoExploracion('Agent')).toBe('delegacion')
  })

  test('el umbral pide varias llamadas, más de una búsqueda, tamaño y una conversación grande; editar reinicia la cuenta', async () => {
    const grande = UMBRAL_EXPLORACION.caracteres
    const ctx = UMBRAL_EXPLORACION.contexto
    let e = EXPLORACION_VACIA
    // Muchas lecturas grandes de archivos conocidos, sin buscar: no es explorar.
    for (let i = 0; i < 6; i++) e = sumarPaso(e, 'lectura', grande)
    expect(tocaDelegar(e, ctx)).toBe(false)
    e = sumarPaso(e, 'busqueda', 100)
    e = sumarPaso(e, 'busqueda', 100)
    expect(tocaDelegar(e, ctx)).toBe(true)
    // En una conversación chica, el subagente cuesta más de lo que ahorra.
    expect(tocaDelegar(e, ctx - 1)).toBe(false)
    expect(sumarPaso(e, 'edicion', 0)).toEqual(EXPLORACION_VACIA)
    expect(sumarPaso(e, 'delegacion', 0)).toEqual(EXPLORACION_VACIA)
    // Correr tests no cuenta ni reinicia.
    expect(sumarPaso(e, undefined, 50_000)).toEqual(e)
    // Búsquedas chicas: aunque sean muchas, cuesta más delegar que seguir.
    let chica = EXPLORACION_VACIA
    for (let i = 0; i < 8; i++) chica = sumarPaso(chica, 'busqueda', 500)
    expect(tocaDelegar(chica, ctx)).toBe(false)
  })
})

function disco(on: On): Map<string, string> {
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
  on('ui.log', () => ({ value: undefined }))
  return archivos
}

/** Cada pedido de la conversación principal contesta con `contexto` tokens: Toki lo usa como tamaño de la conversación. */
function pedidos(on: On, contexto: number, modelo = 'claude-opus-5-5'): void {
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use' as const, usage: { input_tokens: 2, output_tokens: 200, model: modelo, cache_read_input_tokens: contexto - 2, cache_creation_input_tokens: 0 } }
  })
}

async function pedido($: Parameters<TestBody>[0]): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 10 })
  for await (const _ of stream) {
    // Sin trozos: solo importa el uso.
  }
  await stream.result
}

describe('exploración con el motor', () => {
  test('al pasar el umbral sugiere Explore una sola vez, y anota si Claude delegó', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    const archivos = disco(on)
    pedidos(on, 120_000)
    // La terminal responde con stdout y stderr; las demás herramientas, con su texto.
    on('tool.call', ($, e) => (e.tool === 'Bash' ? { result: { stdout: 'x'.repeat(5_000), stderr: '', interrupted: false } } : { result: 'x'.repeat(5_000) }) as never)
    await pedido($)
    const notas: (readonly string[] | undefined)[] = []
    const llamar = async (entrada: object): Promise<void> => {
      notas.push((await $.tool.call(entrada as never)).context)
    }
    await llamar({ tool: 'Grep', pattern: 'total' })
    await llamar({ tool: 'Read', file_path: 'a.py' })
    await llamar({ tool: 'Bash', command: 'rg total src' })
    await llamar({ tool: 'Read', file_path: 'b.py' })
    expect(notas.every(n => n === undefined || !n.join('\n').includes('Explore'))).toBe(true)
    await llamar({ tool: 'Read', file_path: 'c.py' })
    expect(notas.at(-1)?.join('\n')).toContain('subagente Explore')
    expect(notas.at(-1)?.join('\n')).toContain('Llevas 5 búsquedas y lecturas')
    // Con Opus, Toki corre Explore en Sonnet y lo dice; nunca promete «un modelo más barato» sin saberlo.
    expect(notas.at(-1)?.join('\n')).toContain('corre en Sonnet')
    // Una vez por conversación.
    await llamar({ tool: 'Grep', pattern: 'otro' })
    expect(notas.at(-1)?.join('\n') ?? '').not.toContain('Explore')

    await llamar({ tool: 'Agent', subagent_type: 'Explore', prompt: 'Busca dónde se calcula el total.' })
    const diagnostico = [...archivos.entries()].find(([ruta]) => ruta.endsWith('diagnostico.txt'))?.[1] ?? ''
    expect(diagnostico).toContain('exploración: aviso de delegar (5 llamadas')
    expect(diagnostico).toContain('contexto ~120.0k, Explore irá en Sonnet')
    expect(diagnostico).toContain('exploración: Claude delegó tras el aviso (Explore)')
  })

  test('si el hilo principal va en Sonnet, sugiere Explore sin prometer un modelo más barato', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    disco(on)
    pedidos(on, 120_000, 'claude-sonnet-5-5')
    on('tool.call', () => ({ result: 'x'.repeat(5_000) }) as never)
    await pedido($)
    const notas: string[] = []
    for (const entrada of [
      { tool: 'Grep', pattern: 'a' },
      { tool: 'Read', file_path: 'a.py' },
      { tool: 'Grep', pattern: 'b' },
      { tool: 'Read', file_path: 'b.py' },
      { tool: 'Read', file_path: 'c.py' },
    ]) {
      notas.push(((await $.tool.call(entrada as never)).context ?? []).join('\n'))
    }
    expect(notas.at(-1)).toContain('subagente Explore: te devuelve solo lo que encontró')
    expect(notas.join('\n')).not.toMatch(/Sonnet|más barato/)
  })

  test('en una conversación chica no sugiere nada', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    disco(on)
    pedidos(on, 30_000)
    on('tool.call', () => ({ result: 'x'.repeat(5_000) }) as never)
    await pedido($)
    const notas: string[] = []
    for (const entrada of [
      { tool: 'Grep', pattern: 'a' },
      { tool: 'Read', file_path: 'a.py' },
      { tool: 'Grep', pattern: 'b' },
      { tool: 'Read', file_path: 'b.py' },
      { tool: 'Read', file_path: 'c.py' },
      { tool: 'Read', file_path: 'd.py' },
    ]) {
      notas.push(((await $.tool.call(entrada as never)).context ?? []).join('\n'))
    }
    expect(notas.some(n => n.includes('Explore'))).toBe(false)
  })

  test('editar a mitad de camino reinicia la cuenta: no hay aviso', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    disco(on)
    on('tool.call', () => ({ result: 'x'.repeat(5_000) }) as never)
    const notas: string[] = []
    for (const entrada of [
      { tool: 'Grep', pattern: 'a' },
      { tool: 'Read', file_path: 'a.py' },
      { tool: 'Grep', pattern: 'b' },
      { tool: 'Edit', file_path: 'a.py', old_string: 'x', new_string: 'y' },
      { tool: 'Read', file_path: 'b.py' },
      { tool: 'Grep', pattern: 'c' },
    ]) {
      notas.push(((await $.tool.call(entrada as never)).context ?? []).join('\n'))
    }
    expect(notas.some(n => n.includes('Explore'))).toBe(false)
  })
})
