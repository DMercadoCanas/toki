import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import {
  anotarUso,
  armarDieta,
  arreglos,
  DIAS_SIN_USO,
  esDiferido,
  leerDiferidos,
  leerUsoMcp,
  medirTexto,
  nombreSkill,
  pedidoMemoria,
  prefijoMcp,
  skillsSinUso,
  textoDieta,
} from '../hooks/dieta'
import type { ArchivoMemoria, OpcionesDieta, Uso, UsoMcp } from '../hooks/dieta'

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
    // Claude Code ya deja herramientas tras ToolSearch: Toki puede dejar slack bajo demanda.
    expect(texto).toContain(
      `slack: sin usar en ${DIAS_SIN_USO} días y ~3.0k en cada pedido (~$0.15 esta semana). /toki-dieta mcp lo deja bajo demanda (Claude lo carga si lo busca); si ya no lo usas, apágalo en /mcp.`,
    )
    // github no pesa nada mientras no se cargue; linear se usó.
    expect(texto).not.toContain('github: sin usar')
    expect(texto).not.toContain('linear: sin usar')
    expect(texto).toContain('Tu memoria (CLAUDE.md y similares) pesa ~6.0k')
    expect(texto).toContain('Skills: ~1.5k para listar 24 de 30')
  })

  test('si Toki empezó a contar hace poco, no da por abandonado un servidor', () => {
    const texto = textoDieta(armarDieta(desglose, { desde: AHORA - 2 * DIA, ultimo: {} }), opciones({ desde: AHORA - 2 * DIA }))
    expect(texto).toContain('sin usar desde que Toki cuenta (2 días)')
    expect(texto).not.toContain('Apaga')
    expect(texto).not.toContain('/toki-dieta mcp')
  })

  test('sin desglose lo dice; liviano, nada que recortar; en inglés', () => {
    expect(textoDieta(undefined, opciones())).toContain('Todavía no hay desglose del contexto')
    const liviano = { ...DESGLOSE, memoryFiles: [], mcpTools: [] } as never
    expect(textoDieta(armarDieta(liviano, { desde: 0, ultimo: {} }), opciones())).toContain('Nada que recortar: el contexto fijo está liviano.')
    const en = textoDieta(armarDieta(desglose, { desde: 0, ultimo: {} }), opciones({ idioma: 'en' }))
    expect(en).toContain('What goes with every request before your conversation: ~31.5k tokens.')
    expect(en).toContain('slack: unused for 7 days and ~3.0k on every request (~$0.15 this week). /toki-dieta mcp loads it on demand')
  })

  test('el uso guardado se sanea y recuerda solo las 300 herramientas más recientes', () => {
    expect(leerUsoMcp(null, 5)).toEqual({ desde: 5, ultimo: {} })
    expect(leerUsoMcp({ desde: 1, ultimo: { mcp__a__b: 3, Read: 4, mcp__c__d: 'x' } }, 5)).toEqual({ desde: 1, ultimo: { mcp__a__b: 3 } })
    let u: UsoMcp = { desde: 0, ultimo: {} }
    for (let i = 0; i < 305; i++) u = anotarUso(u, `mcp__s__t${i}`, i)
    expect(Object.keys(u.ultimo).length).toBe(300)
    expect(u.ultimo['mcp__s__t0']).toBeUndefined()
    expect(u.ultimo['mcp__s__t304']).toBe(304)
  })
})

/** CLAUDE.md del proyecto con 312 líneas, el tuyo corto, un MEMORY.md que pasa los 25 KB y uno de la organización. */
const MEDIDOS: ArchivoMemoria[] = [
  { ruta: '/p/CLAUDE.md', tipo: 'Project', tokens: 4_000, lineas: 312, bytes: 15_000 },
  { ruta: '/Users/yo/.claude/CLAUDE.md', tipo: 'User', tokens: 2_000, lineas: 120, bytes: 6_000 },
  { ruta: '/Users/yo/.claude/projects/p/memory/MEMORY.md', tipo: 'AutoMem', tokens: 1_000, lineas: 90, bytes: 25_400 },
  { ruta: '/etc/claude-code/CLAUDE.md', tipo: 'Managed', tokens: 3_000, lineas: 500, bytes: 20_000 },
]

describe('dieta que arregla (puro)', () => {
  test('la opción de MCP bajo demanda se lee sin repetir; casa por quién provee la herramienta o por su nombre', () => {
    expect(leerDiferidos(' linear, slack ,linear,, ')).toEqual(['linear', 'slack'])
    expect(leerDiferidos(undefined)).toEqual([])
    expect(prefijoMcp('claude.ai Gmail')).toBe('mcp__claude_ai_Gmail__')
    expect(esDiferido('mcp__slack__send', 'mcp:slack', ['slack'])).toBe(true)
    expect(esDiferido('mcp__claude_ai_Gmail__search', undefined, ['claude.ai Gmail'])).toBe(true)
    // `git` no es `github`.
    expect(esDiferido('mcp__github__list_prs', 'mcp:github', ['git'])).toBe(false)
  })

  test('MCP bajo demanda solo si Claude Code usa ToolSearch y sin guardia; memoria larga sí, la de la organización no', () => {
    const uso: UsoMcp = { desde: AHORA - 30 * DIA, ultimo: { mcp__linear__list_issues: AHORA - 2 * DIA } }
    const d = armarDieta(desglose, uso)
    expect(d.bajoDemanda).toBe(true)
    expect(d.total).toBe(71_500)
    expect(arreglos(d, opciones()).mcp.map(s => s.nombre)).toEqual(['slack'])
    expect(arreglos(d, opciones({ guardia: true })).mcp).toEqual([])
    // Sin nada tras ToolSearch, bajo demanda Claude no lo encontraría.
    const sinBusqueda = armarDieta({ ...DESGLOSE, categories: DESGLOSE.categories.filter(c => c.kind !== 'deferred'), mcpTools: DESGLOSE.mcpTools.filter(h => h.isLoaded) } as never, uso)
    expect(sinBusqueda.bajoDemanda).toBe(false)
    expect(arreglos(sinBusqueda, opciones()).mcp).toEqual([])
    expect(textoDieta(sinBusqueda, opciones())).toContain('Apaga slack en /mcp si no lo vas a usar')
    expect(arreglos(d, opciones({ medidos: MEDIDOS })).memoria.map(a => a.ruta)).toEqual(['/p/CLAUDE.md', '/Users/yo/.claude/projects/p/memory/MEMORY.md'])
    expect(medirTexto('a\nb\n')).toEqual({ lineas: 2, bytes: 4 })
    expect(medirTexto('ñ\nb')).toEqual({ lineas: 2, bytes: 4 })
    expect(medirTexto('')).toEqual({ lineas: 0, bytes: 0 })
  })

  test('el informe propone /toki-dieta mcp y memoria; con plan enlaza /usage; con guardia vuelve a /mcp', () => {
    const d = armarDieta(desglose, { desde: AHORA - 30 * DIA, ultimo: { mcp__linear__list_issues: AHORA - 2 * DIA } })
    const texto = textoDieta(d, opciones({ medidos: MEDIDOS, suscripcion: true, diferidos: ['notion'] }))
    expect(texto).toContain('Bajo demanda por Toki: notion. Lo deshace /toki-dieta restaurar.')
    expect(texto).toContain('  /p/CLAUDE.md  ~4.0k · 312 líneas')
    expect(texto).toContain('/p/CLAUDE.md tiene 312 líneas (la meta de Claude Code es menos de 200) y pesa ~4.0k en cada pedido.')
    expect(texto).toContain('/Users/yo/.claude/projects/p/memory/MEMORY.md tiene 90 líneas (26 KB): Claude Code solo carga las primeras 200 líneas o 25 KB, lo demás no llega.')
    expect(texto).toContain('/toki-dieta memoria guarda un respaldo y le pide a Claude que lo adelgace, mostrándote cada cambio.')
    expect(texto).toContain('Con tu plan, /usage también marca lo que más pesa y la tecla f lo arregla.')
    expect(texto).not.toContain('Tu memoria (CLAUDE.md y similares)')
    expect(texto).not.toContain('/etc/claude-code/CLAUDE.md tiene')
    const guardia = textoDieta(d, opciones({ guardia: true, diferidos: ['notion'] }))
    expect(guardia).toContain('Apaga slack en /mcp si no lo vas a usar')
    expect(guardia).not.toContain('Bajo demanda por Toki')
  })

  test('el pedido para Claude se adapta a cada archivo, sin nada de un proyecto en particular', () => {
    const pedido = pedidoMemoria(memoriaLargaDe(MEDIDOS))
    expect(pedido).toBe(
      [
        'Adelgaza estos archivos de memoria de Claude Code sin perder lo importante. Muéstrame cada cambio antes de hacerlo.',
        '- /p/CLAUDE.md (312 líneas): deja lo esencial en menos de 200 líneas. Lo que solo aplica a ciertas carpetas o tareas, muévelo a `.claude/rules/` con `paths:` o a una skill; quita lo repetido y lo que ya se deduce del código.',
        '- /Users/yo/.claude/projects/p/memory/MEMORY.md (90 líneas, 26 KB): Claude Code solo carga las primeras 200 líneas o 25 KB. Déjalo como índice, una línea por recuerdo, y pasa el detalle a sus archivos de tema.',
      ].join('\n'),
    )
    const tuyo = pedidoMemoria([{ ruta: '/Users/yo/.claude/CLAUDE.md', tipo: 'User', tokens: 2_000, lineas: 250, bytes: 9_000 }], 'en')
    expect(tuyo).toContain('- /Users/yo/.claude/CLAUDE.md (250 lines): keep the essentials under 200 lines. Move what only applies to one project into that project, and long workflows into skills.')
  })

  test('skills sin uso: las tuyas y los plugins con todas sin usar; ni las de Claude Code, ni de un MCP, ni las de Toki', () => {
    const lista = [
      { name: 'informe', source: 'userSettings', tokens: 300 },
      { name: 'deploy', source: 'projectSettings', tokens: 250 },
      { name: 'pdf', source: 'plugin', pluginName: 'anthropic-skills', tokens: 200 },
      { name: 'xlsx', source: 'plugin', pluginName: 'anthropic-skills', tokens: 200 },
      { name: 'graficos', source: 'plugin', pluginName: 'dataviz', tokens: 400 },
      { name: 'ahorro', source: 'plugin', pluginName: 'toki', tokens: 500 },
      { name: 'init', source: 'built-in', tokens: 500 },
      { name: 'buscar', source: 'mcp', tokens: 500 },
    ]
    const d = armarDieta({ ...DESGLOSE, skills: { totalSkills: 8, includedSkills: 8, tokens: 2_850, skillFrontmatter: lista } } as never, { desde: 0, ultimo: {} })
    const usoSkills: Uso = { desde: AHORA - 30 * DIA, ultimo: { deploy: AHORA - DIA, pdf: AHORA - 2 * DIA } }
    const s = skillsSinUso(d, usoSkills, { ahora: AHORA, propio: 'toki' })
    expect(s.propias.map(k => k.nombre)).toEqual(['informe'])
    // anthropic-skills usó pdf: se queda.
    expect(s.plugins).toEqual([{ plugin: 'dataviz', skills: 1, tokens: 400 }])
    expect(s.tokens).toBe(700)
    // Toki recién empezó a contar: ninguna está abandonada.
    expect(skillsSinUso(d, { desde: AHORA - 2 * DIA, ultimo: {} }, { ahora: AHORA, propio: 'toki' }).tokens).toBe(0)
    const texto = textoDieta(d, opciones({ usoSkills, propio: 'toki' }))
    expect(texto).toContain('Skills tuyas sin usar en 7 días (~300 en cada pedido): informe. En /skills déjalas solo con su nombre o apágalas.')
    expect(texto).toContain('dataviz: su skill sin usar en 7 días (~400 en cada pedido). Si tampoco usas lo demás que trae, desactívalo en /plugin.')
    expect(nombreSkill('anthropic-skills:pdf')).toBe('pdf')
    expect(nombreSkill('/pdf')).toBe('pdf')
  })
})

function memoriaLargaDe(medidos: ArchivoMemoria[]): ArchivoMemoria[] {
  return arreglos(undefined, { ahora: AHORA, desde: 0, medidos }).memoria
}

type Mundo = {
  guardado: Map<string, unknown>
  /** Lo que Toki escribió en el disco. */
  escritos: Map<string, string>
  /** Cada cambio de opción que Toki pidió, como si fuera en /plugin. */
  cambios: { key: string; value: unknown }[]
  /** Lo que Toki dejó en el cuadro de texto. */
  fills: string[]
  logs: string[]
  invalidados: string[]
  preguntas: { pregunta: string; opciones: string[] }[]
}

/**
 * Lo que hay debajo de los plugins: el desglose de /context, los archivos de memoria, las
 * herramientas MCP respondiendo y, si hay alguien mirando, la app (`superficies`).
 * `elegir` responde las preguntas con algunas de sus opciones.
 */
function mundo(
  on: On,
  guardado: Map<string, unknown>,
  o: { archivos?: Record<string, string>; superficies?: string[]; elegir?: (opciones: string[]) => string } = {},
): Mundo {
  const m: Mundo = { guardado, escritos: new Map(), cambios: [], fills: [], logs: [], invalidados: [], preguntas: [] }
  on('store.get', ($, e) => ({ value: guardado.get(e.key) }))
  on('store.set', ($, e) => {
    guardado.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    guardado.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...guardado.keys()] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 71_500, window: 200_000, percent: 36, breakdown: DESGLOSE }, rateLimits: [] } }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    if (q === undefined) return { deny: 'sin pregunta' }
    const opciones = q.options.map(p => p.label)
    m.preguntas.push({ pregunta: q.question, opciones })
    return { result: { questions: [], answers: { [q.question]: o.elegir?.(opciones) ?? opciones[0] ?? '' } } } as never
  })
  on('tool.call', { tool: /^(mcp__|Skill$)/ }, () => ({ result: 'ok' }) as never)
  on('command.run', () => ({ text: '' }) as never)
  on('config.list', () => ({ value: [] }) as never)
  on('config.set', ($, e) => {
    m.cambios.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  on('fs.exists', ($, e) => ({ value: m.escritos.has(e.path) || o.archivos?.[e.path] !== undefined }))
  on('fs.write', ($, e) => {
    m.escritos.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const texto = m.escritos.get(e.path) ?? o.archivos?.[e.path]
    return texto !== undefined ? { value: texto } : { deny: 'no existe' }
  })
  on('fs.stat', () => ({ deny: 'no existe' }))
  on('fs.list', () => ({ value: [] }))
  on('prompt.fill', ($, e) => {
    m.fills.push(e.text)
    return { isFilled: true } as never
  })
  on('ui.log', ($, e) => {
    m.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', ($, e) => {
    m.invalidados.push(e.event)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'prueba' } }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('audio.play', () => ({ value: undefined }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('session.id', () => ({ value: 's1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: o.superficies ?? [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: {} }))
  return m
}

async function dieta($: Parameters<TestBody>[0], args = ''): Promise<string> {
  return ((await $.command.run({ command: 'toki-dieta', args } as never)) as { text: string }).text
}

describe('oportunidad en /toki', () => {
  test('un servidor MCP sin uso en 7 días va como oportunidad, aparte del ahorro y sin sumarse', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const guardado = new Map<string, unknown>([['usoMcp', { desde: AHORA - 30 * DIA, ultimo: { mcp__linear__list_issues: AHORA - DIA } }]])
    mundo(on, guardado)
    const toki = ((await $.command.run({ command: 'toki', args: '' } as never)) as { text: string }).text
    expect(toki).toContain(`Oportunidad (aún no ahorrado; no se suma):\n  • Dejar slack bajo demanda con /toki-dieta mcp, sin uso en ${DIAS_SIN_USO} días: ~3.0k tokens menos en cada pedido.\n`)
    // linear se usó ayer: no es oportunidad. Y nada de eso entra en lo ahorrado.
    expect(toki).not.toContain('linear bajo demanda')
    expect(toki).toMatch(/^Toki · \$0\.00 ahorrados en esta sesión/)
  })
})

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

/** El uso de MCP de hace un mes: linear se usó ayer, slack nunca. */
const USO_MES = (): Map<string, unknown> => new Map<string, unknown>([['usoMcp', { desde: AHORA - 30 * DIA, ultimo: { mcp__linear__list_issues: AHORA - DIA } }]])
/** Un CLAUDE.md del proyecto de 250 líneas y el tuyo, corto. */
const ARCHIVOS = { '/p/CLAUDE.md': `${Array.from({ length: 250 }, (_, i) => `- regla ${i}`).join('\n')}\n`, '/Users/yo/.claude/CLAUDE.md': 'corto\n' }
/** El día 100 desde 1970, en el nombre del respaldo. */
const RESPALDO = '.claude/toki/respaldos/1970-04-11-00-00-p_CLAUDE.md'
const SIN_RUTEO = { options: { recomendarModelo: 'no' } }

describe('dieta que arregla con el motor', () => {
  test('/toki-dieta mcp deja bajo demanda el MCP sin uso: cambia la opción después de responder', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, USO_MES())
    const texto = await dieta($, 'mcp')
    expect(texto).toMatch(
      /^Listo: slack queda bajo demanda desde tu próximo mensaje; Claude lo carga si lo busca\. Ese mensaje reescribe el caché una vez \(~\$[\d.]+ de más a precio de API\)\. Lo deshace \/toki-dieta restaurar\.$/,
    )
    // Cambiar la opción recarga el plugin: no a mitad del comando.
    expect(m.cambios).toEqual([])
    await reloj.advance(100)
    expect(m.cambios).toEqual([{ key: 'toki.mcpDiferidos', value: 'slack' }])
  })

  test('con la opción puesta, las herramientas de ese servidor quedan tras ToolSearch y las demás no', { options: { mcpDiferidos: 'slack, notion' } }, async ($, on) => {
    on('tool.describe', ($, e) => ({ description: e.description }))
    const slack = await $.tool.describe({ tool: 'mcp__slack__send', description: 'Envía', provider: { plugin: 'mcp:slack', tier: 'user' } } as never)
    expect(slack).toEqual({ description: 'Envía', isDeferred: true })
    const linear = await $.tool.describe({ tool: 'mcp__linear__create_issue', description: 'Crea', provider: { plugin: 'mcp:linear', tier: 'user' } } as never)
    expect(linear).toEqual({ description: 'Crea' })
  })

  test('con «Guardia de empresa» Toki no toca las herramientas ni lo ofrece', { options: { mcpDiferidos: 'slack', guardiaEmpresa: true } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mundo(on, USO_MES())
    on('tool.describe', ($, e) => ({ description: e.description }))
    expect(await $.tool.describe({ tool: 'mcp__slack__send', description: 'Envía', provider: { plugin: 'mcp:slack', tier: 'user' } } as never)).toEqual({ description: 'Envía' })
    expect(await dieta($, 'mcp')).toBe('Con «Guardia de empresa» prendida Toki no cambia las herramientas: apaga en /mcp lo que no uses.')
  })

  test('al empezar, si la lista cambió, Claude Code vuelve a preguntar por las herramientas; si no, no', { options: { recomendarModelo: 'no', mcpDiferidos: 'slack' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, new Map())
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true } as never)
    expect(m.invalidados.filter(i => i === 'tool.describe').length).toBe(1)
    expect(m.guardado.get('mcpDiferidosAplicados')).toBe('slack')
    await $.session.start({ cwd: '/p', surface: null, isInteractive: true } as never)
    expect(m.invalidados.filter(i => i === 'tool.describe').length).toBe(1)
  })

  test('/toki-dieta memoria respalda, deja el pedido en el cuadro y no edita la memoria; restaurar dice cómo volver', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, new Map(), { archivos: ARCHIVOS, superficies: ['app'] })
    const texto = await dieta($, 'memoria')
    expect(texto).toBe(
      [
        'Te dejé el pedido en el cuadro de texto: revísalo y envíalo; Claude te muestra cada cambio antes de hacerlo.',
        'Respaldo de cada archivo antes de tocarlo:',
        `  /p/CLAUDE.md → ${RESPALDO}`,
      ].join('\n'),
    )
    // El motor resuelve las rutas desde la carpeta de trabajo.
    expect([...m.escritos].find(([k]) => k.endsWith(`/${RESPALDO}`))?.[1]).toBe(ARCHIVOS['/p/CLAUDE.md'])
    // Toki solo escribe en su carpeta: la memoria la adelgaza Claude cuando envías el pedido.
    expect([...m.escritos.keys()].filter(k => !k.includes('/.claude/toki/'))).toEqual([])
    expect(m.fills).toEqual([])
    await reloj.advance(100)
    expect(m.fills.length).toBe(1)
    expect(m.fills[0]).toContain('- /p/CLAUDE.md (250 líneas): deja lo esencial en menos de 200 líneas.')
    expect(m.fills[0]).not.toContain('/Users/yo/.claude/CLAUDE.md')
    expect(await dieta($, 'restaurar')).toBe(['Para volver a la memoria de antes, copia su respaldo encima:', `  cp '${RESPALDO}' '/p/CLAUDE.md'`].join('\n'))
  })

  test('sin nadie mirando (-p), el pedido va en la respuesta', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, new Map(), { archivos: ARCHIVOS })
    const texto = await dieta($, 'memoria')
    expect(texto).toMatch(/^Envíale este pedido a Claude:\n\nAdelgaza estos archivos de memoria de Claude Code/)
    expect(texto).toContain(`  /p/CLAUDE.md → ${RESPALDO}`)
    expect(m.fills).toEqual([])
  })

  test('tras el informe, con alguien mirando, pregunta qué arreglar; elegir los dos hace los dos y restaurar los deshace', { options: { mcpDiferidos: 'notion' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, USO_MES(), { archivos: ARCHIVOS, superficies: ['app'], elegir: opciones => opciones.join(', ') })
    await dieta($)
    expect(m.preguntas).toEqual([])
    await reloj.advance(1_000)
    expect(m.preguntas).toEqual([{ pregunta: '¿Qué arreglo ahora, de forma reversible?', opciones: ['Adelgazar CLAUDE.md', 'slack bajo demanda'] }])
    await reloj.advance(100)
    expect(m.fills.length).toBe(1)
    // Los que ya estaban bajo demanda se quedan.
    expect(m.cambios).toEqual([{ key: 'toki.mcpDiferidos', value: 'notion, slack' }])
    expect(m.logs.some(l => l.startsWith('Te dejé el pedido en el cuadro de texto'))).toBe(true)
    expect(m.logs.some(l => l.startsWith('Listo: slack queda bajo demanda'))).toBe(true)
    // restaurar: la opción se vacía y la memoria se puede volver a copiar.
    const restaurar = await dieta($, 'restaurar')
    expect(restaurar).toContain('Listo: notion vuelve a cargarse desde tu próximo mensaje (reescribe el caché una vez).')
    expect(restaurar).toContain(`cp '${RESPALDO}' '/p/CLAUDE.md'`)
    await reloj.advance(100)
    expect(m.cambios.at(-1)).toEqual({ key: 'toki.mcpDiferidos', value: '' })
  })

  test('sin nada que arreglar no pregunta', SIN_RUTEO, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const m = mundo(on, new Map(), { superficies: ['app'] })
    await dieta($)
    await reloj.advance(1_000)
    expect(m.preguntas).toEqual([])
    expect(await dieta($, 'restaurar')).toBe('Nada que restaurar: Toki no tiene MCP bajo demanda ni respaldos de memoria.')
  })

  test('una skill usada por Claude o con /nombre queda anotada por su nombre; los comandos de Toki no', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const m = mundo(on, new Map())
    await $.tool.call({ tool: 'Skill', skill: 'anthropic-skills:pdf' } as never)
    await $.command.run({ command: 'informe', args: '' } as never)
    await dieta($)
    expect((m.guardado.get('usoSkills') as Uso).ultimo).toEqual({ pdf: AHORA, informe: AHORA })
  })
})
