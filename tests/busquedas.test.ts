import { describe, expect, mock, test } from 'claude-code/testing'

import { resumirBusqueda, tipoBusqueda } from '../hooks/busquedas'

// Búsquedas enormes por la terminal: resumen por archivo o carpeta y la salida completa en una copia.

function grepGrande(): string {
  const lineas: string[] = []
  for (let f = 0; f < 60; f++) {
    const n = f === 0 ? 300 : f < 5 ? 40 : 6
    for (let i = 1; i <= n; i++) lineas.push(`src/modulo${f}/archivo${f}.ts:${i * 3}:  const paciente = await buscarPaciente(id, { incluirHistoria: true }) // ${i}`)
  }
  return lineas.join('\n')
}

describe('búsquedas enormes', () => {
  test('reconoce búsquedas sin filtrar', () => {
    expect(tipoBusqueda('grep -rn paciente src')).toBe('contenido')
    expect(tipoBusqueda('cd app && rg "TODO"')).toBe('contenido')
    expect(tipoBusqueda('git grep -n foo')).toBe('contenido')
    expect(tipoBusqueda('rg -l foo')).toBe('rutas')
    expect(tipoBusqueda('find . -name "*.ts"')).toBe('rutas')
    expect(tipoBusqueda('rg foo | head -20')).toBeUndefined()
    expect(tipoBusqueda('grep foo archivo.txt')).toBeUndefined()
    expect(tipoBusqueda('find . -name "*.tmp" -delete')).toBeUndefined()
    expect(tipoBusqueda('rg foo && npm test')).toBeUndefined()
  })

  test('puro: cuenta por archivo, con muestras y la ruta de la copia', () => {
    const salida = grepGrande()
    const r = resumirBusqueda(salida, 'contenido', '.claude/toki/salidas/salida-03.txt')
    expect(r).toBeDefined()
    expect(r?.texto).toContain('en 60 archivos')
    expect(r?.texto).toMatch(/ 300 {2}src\/modulo0\/archivo0\.ts/)
    expect(r?.texto).toContain('… y 20 archivos más')
    expect(r?.texto).toContain('.claude/toki/salidas/salida-03.txt')
    expect((r?.caracteresDespues ?? 1e9) < 12_000).toBe(true)
    expect(resumirBusqueda('src/a.ts:1:x', 'contenido', 'x')).toBeUndefined()
  })

  test('puro: rutas de find agrupadas por carpeta', () => {
    const rutas = Array.from({ length: 1500 }, (_, i) => `./node_modules/paquete${i % 30}/lib/archivo-con-nombre-largo-${i}.js`).join('\n')
    const r = resumirBusqueda(rutas, 'rutas', 'copia.txt', 'en')
    expect(r?.texto).toContain('in 30 folders')
    expect(r?.texto).toContain('    50  node_modules/paquete0/')
  })

  test('con el motor: rg sin filtrar de 50 KB llega resumido, con copia completa', async ($, on) => {
    mock.clock(on, { now: 5_000_000 })
    mock.store(on)
    mock.env(on, { SHELL: '/bin/zsh' })
    const archivos = new Map<string, string>()
    on('fs.exists', ($, e) => ({ value: archivos.has(e.path) }))
    on('fs.write', ($, e) => {
      archivos.set(e.path, e.text)
      return { value: undefined }
    })
    on('fs.read', ($, e) => {
      const t = archivos.get(e.path)
      return t === undefined ? { deny: 'no existe' } : { value: t }
    })
    on('ui.toast', () => ({ value: undefined }))
    on('ui.log', () => ({ value: undefined }))
    on('session.cwd', () => ({ value: '/proyecto' }))
    on('tool.check', () => ({ decision: 'allow' as const }))
    const salida = grepGrande()
    on('tool.call', ($, e) => {
      const ruta = String((e as { command?: unknown }).command).match(/tee '\/proyecto\/([^']+)'/)?.[1]
      const clave = [...archivos.keys()].find(k => ruta !== undefined && k.endsWith(ruta))
      if (clave !== undefined) archivos.set(clave, salida)
      return { result: { stdout: salida, stderr: '', interrupted: false } }
    })
    const r = await $.tool.call({ tool: 'Bash', command: 'rg -n buscarPaciente' })
    const texto = (r.result as { stdout: string }).stdout
    expect(texto).toContain('[Toki] La búsqueda devolvió')
    expect(texto.length < salida.length / 4).toBe(true)
    expect([...archivos.values()].some(v => v === salida)).toBe(true)
  })
})

