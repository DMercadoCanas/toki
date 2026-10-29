import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { anotarUsoMcp, armarDieta, DIAS_SIN_USO, leerUsoMcp, textoDieta } from '../hooks/dieta'
import type { OpcionesDieta, UsoMcp } from '../hooks/dieta'

// /toki-dieta: lo que va en cada pedido antes de tu conversación y qué recortar.

const DIA = 86_400_000
const AHORA = 100 * DIA

/** /context con la conversación, el espacio libre y herramientas bajo demanda, que no son fijos. */
const DESGLOSE = {
  categories: [
    { name: 'System prompt', tokens: 3_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 12_000, color: 'inactive', isDeferred: false, kind: 'used' },
    { name: 'MCP tools', tokens: 9_000, color: 'cyan', isDeferred: false, kind: 'used' },
    { name: 'MCP tools (deferred)', tokens: 20_000, color: 'cyan', isDeferred: true, kind: 'deferred' },
    { name: 'Memory files', tokens: 6_000, color: 'claude', isDeferred: false, kind: 'used' },
    { name: 'Skills', tokens: 1_500, color: 'warning', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 40_000, color: 'purple', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 100_000, color: 'promptBorder', isDeferred: false, kind: 'free' },
  ],
  totalTokens: 71_500,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'model',
  percentage: 36,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [
    { path: '/Users/yo/.claude/CLAUDE.md', type: 'User', tokens: 2_000 },
    { path: '/p/CLAUDE.md', type: 'Project', tokens: 4_000 },
  ],
  mcpTools: [
    { name: 'mcp__linear__create_issue', serverName: 'linear', tokens: 3_000, isLoaded: true },
    { name: 'mcp__linear__list_issues', serverName: 'linear', tokens: 3_000, isLoaded: true },
    { name: 'mcp__slack__send', serverName: 'slack', tokens: 3_000, isLoaded: true },
    { name: 'mcp__github__create_pr', serverName: 'github', tokens: 0, isLoaded: false },
    { name: 'mcp__github__list_prs', serverName: 'github', tokens: 0, isLoaded: false },
  ],
  agents: [],
  skills: { totalSkills: 30, includedSkills: 24, tokens: 1_500, skillFrontmatter: [] },
  isAutoCompactEnabled: true,
  apiUsage: null,
} as const

const desglose = DESGLOSE as never

/** Opus: $0.50 el millón leído del caché, $10 escrito por una hora. */
function opciones(o: Partial<OpcionesDieta> = {}): OpcionesDieta {
  return { ahora: AHORA, modelo: 'Opus', desde: AHORA - 30 * DIA, pedidosSemana: 100, lectura: t => (t * 0.5) / 1e6, escritura: t => (t * 10) / 1e6, ...o }
}

describe('dieta del contexto fijo (puro)', () => {
  test('lo fijo deja fuera la conversación, el espacio libre y lo que se carga bajo demanda', () => {
    const uso: UsoMcp = { desde: AHORA - 30 * DIA, ultimo: { mcp__linear__list_issues: AHORA - 2 * DIA, mcp__github__create_pr: AHORA - DIA / 2 } }
    const d = armarDieta(desglose, uso)
    expect(d.fijo).toBe(31_500)
    expect(d.partes.map(p => p.nombre)).toEqual(['System tools', 'MCP tools', 'Memory files', 'System prompt', 'Skills'])
    expect(d.servidores).toEqual([
      { nombre: 'linear', tokens: 6_000, cargadas: 2, diferidas: 0, ultimoUso: AHORA - 2 * DIA },
      { nombre: 'slack', tokens: 3_000, cargadas: 1, diferidas: 0 },
      { nombre: 'github', tokens: 0, cargadas: 0, diferidas: 2, ultimoUso: AHORA - DIA / 2 },
    ])
  })

  test('el costo por pedido y de la semana, y qué recortar: el MCP sin usar y la memoria que pesa', () => {
    const uso: UsoMcp = { desde: AHORA - 30 * DIA, ultimo: { mcp__linear__list_issues: AHORA - 2 * DIA } }
    const texto = textoDieta(armarDieta(desglose, uso), opciones())
    expect(texto).toContain('Lo que va en cada pedido antes de tu conversación: ~31.5k tokens.')
    // 31.5k leídos del caché a $0.50 el millón; escritos a $10.
    expect(texto).toContain('En Opus: ~$0.016 por pedido con el caché vivo; ~$0.32 si el caché venció.')
    expect(texto).toContain('Esta semana: 100 pedidos × ~31.5k ≈ 3.1M tokens leídos, ~$1.57 a precio de API (con el tamaño de hoy).')
    expect(texto).toContain('Herramientas de Claude Code')
    expect(texto).not.toContain('Messages')
    expect(texto).toMatch(/linear {2}~6\.0k · 2 herramientas · usado hace 2 días/)
    expect(texto).toMatch(/slack {3}~3\.0k · 1 herramienta · sin usar en 7 días/)
    expect(texto).toContain('github  ~0 · 0 herramientas (+2 bajo demanda) · sin usar en 7 días')
    expect(texto).toContain(`Apaga slack en /mcp si no lo vas a usar: no lo usaste en ${DIAS_SIN_USO} días y pesa ~3.0k en cada pedido (~$0.15 esta semana).`)
    // github no pesa nada mientras no se cargue; linear se usó.
    expect(texto).not.toContain('Apaga github')
    expect(texto).not.toContain('Apaga linear')
    expect(texto).toContain('Tu memoria (CLAUDE.md y similares) pesa ~6.0k')
    expect(texto).toContain('Skills: ~1.5k para listar 24 de 30')
  })

  test('si Toki empezó a contar hace poco, no da por abandonado un servidor', () => {
    const texto = textoDieta(armarDieta(desglose, { desde: AHORA - 2 * DIA, ultimo: {} }), opciones({ desde: AHORA - 2 * DIA }))
    expect(texto).toContain('sin usar desde que Toki cuenta (2 días)')
    expect(texto).not.toContain('Apaga')
  })

  test('sin desglose lo dice; liviano, nada que recortar; en inglés', () => {
    expect(textoDieta(undefined, opciones())).toContain('Todavía no hay desglose del contexto')
    const liviano = { ...DESGLOSE, memoryFiles: [], mcpTools: [] } as never
    expect(textoDieta(armarDieta(liviano, { desde: 0, ultimo: {} }), opciones())).toContain('Nada que recortar: el contexto fijo está liviano.')
    const en = textoDieta(armarDieta(desglose, { desde: 0, ultimo: {} }), opciones({ idioma: 'en' }))
    expect(en).toContain('What goes with every request before your conversation: ~31.5k tokens.')
    expect(en).toContain('Turn slack off in /mcp')
  })

  test('el uso guardado se sanea y recuerda solo las 300 herramientas más recientes', () => {
    expect(leerUsoMcp(null, 5)).toEqual({ desde: 5, ultimo: {} })
    expect(leerUsoMcp({ desde: 1, ultimo: { mcp__a__b: 3, Read: 4, mcp__c__d: 'x' } }, 5)).toEqual({ desde: 1, ultimo: { mcp__a__b: 3 } })
    let u: UsoMcp = { desde: 0, ultimo: {} }
    for (let i = 0; i < 305; i++) u = anotarUsoMcp(u, `mcp__s__t${i}`, i)
    expect(Object.keys(u.ultimo).length).toBe(300)
    expect(u.ultimo['mcp__s__t0']).toBeUndefined()
    expect(u.ultimo['mcp__s__t304']).toBe(304)
  })
})

/** Lo que hay debajo de los plugins: el desglose de /context y las herramientas MCP respondiendo. */
function mundo(on: On, guardado: Map<string, unknown>): void {
  on('store.get', ($, e) => ({ value: guardado.get(e.key) }))
  on('store.set', ($, e) => {
    guardado.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 71_500, window: 200_000, percent: 36, breakdown: DESGLOSE }, rateLimits: [] } }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
}

describe('/toki-dieta con el motor', () => {
  test('una llamada a MCP queda anotada, y /toki-dieta la usa para el último uso', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const guardado = new Map<string, unknown>()
    mundo(on, guardado)
    await $.tool.call({ tool: 'mcp__linear__list_issues' } as never)
    expect((guardado.get('usoMcp') as UsoMcp).ultimo['mcp__linear__list_issues']).toBe(AHORA)
    await reloj.advance(3 * DIA)
    const texto = ((await $.command.run({ command: 'toki-dieta', args: '' } as never)) as { text: string }).text
    expect(texto).toContain('~31.5k tokens')
    expect(texto).toMatch(/linear {2}~6\.0k · 2 herramientas · usado hace 3 días/)
    // Toki empezó a contar con esa llamada: slack aún no cuenta como abandonado.
    expect(texto).toContain('sin usar desde que Toki cuenta (3 días)')
  })
})
