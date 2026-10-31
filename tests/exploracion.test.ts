import type { On } from 'claude-code'
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

  test('el umbral pide varias llamadas, más de una búsqueda y tamaño; editar reinicia la cuenta', async () => {
    const grande = UMBRAL_EXPLORACION.caracteres
    let e = EXPLORACION_VACIA
    // Muchas lecturas grandes de archivos conocidos, sin buscar: no es explorar.
    for (let i = 0; i < 6; i++) e = sumarPaso(e, 'lectura', grande)
    expect(tocaDelegar(e)).toBe(false)
    e = sumarPaso(e, 'busqueda', 100)
    e = sumarPaso(e, 'busqueda', 100)
    expect(tocaDelegar(e)).toBe(true)
    expect(sumarPaso(e, 'edicion', 0)).toEqual(EXPLORACION_VACIA)
    expect(sumarPaso(e, 'delegacion', 0)).toEqual(EXPLORACION_VACIA)
    // Correr tests no cuenta ni reinicia.
    expect(sumarPaso(e, undefined, 50_000)).toEqual(e)
    // Búsquedas chicas: aunque sean muchas, cuesta más delegar que seguir.
    let chica = EXPLORACION_VACIA
    for (let i = 0; i < 8; i++) chica = sumarPaso(chica, 'busqueda', 500)
    expect(tocaDelegar(chica)).toBe(false)
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

describe('exploración con el motor', () => {
  test('al pasar el umbral sugiere Explore una sola vez, y anota si Claude delegó', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    const archivos = disco(on)
    // La terminal responde con stdout y stderr; las demás herramientas, con su texto.
    on('tool.call', ($, e) => (e.tool === 'Bash' ? { result: { stdout: 'x'.repeat(5_000), stderr: '', interrupted: false } } : { result: 'x'.repeat(5_000) }) as never)
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
    // Una vez por conversación.
    await llamar({ tool: 'Grep', pattern: 'otro' })
    expect(notas.at(-1)?.join('\n') ?? '').not.toContain('Explore')

    await llamar({ tool: 'Agent', subagent_type: 'Explore', prompt: 'Busca dónde se calcula el total.' })
    const diagnostico = [...archivos.entries()].find(([ruta]) => ruta.endsWith('diagnostico.txt'))?.[1] ?? ''
    expect(diagnostico).toContain('exploración: aviso de delegar (5 llamadas')
    expect(diagnostico).toContain('exploración: Claude delegó tras el aviso (Explore)')
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
