// La dieta del contexto fijo: lo que va en cada pedido antes de tu conversación
// (instrucciones y herramientas de Claude Code, MCP, CLAUDE.md, skills, agentes),
// lo que cuesta, qué no usaste y cómo arreglarlo con tu permiso, de forma reversible.

import type { SessionContextBreakdown } from 'claude-code'

import { cifraUsd } from './ahorro'
import type { Idioma } from './idioma'
import { barra, formatearTokens } from './mascota'

const DIA = 86_400_000
/** Un servidor MCP sin usar en tantos días es candidato a apagarse. */
export const DIAS_SIN_USO = 7
/** Menos que esto en cada pedido no vale la pena recortarlo. */
const MCP_QUE_PESA = 1_000
const MEMORIA_QUE_PESA = 5_000
const SKILLS_QUE_PESAN = 4_000
const AGENTES_QUE_PESAN = 2_000
/** Herramientas MCP (o skills) recordadas: las usadas más recientemente. */
const MAX_HERRAMIENTAS = 300
/** Skills sin usar que juntas pesan menos que esto no se mencionan. */
const SKILLS_SIN_USO_QUE_PESAN = 500
/** De dónde vienen las skills que se ajustan en /skills: las tuyas, las del proyecto y las sincronizadas. */
const SKILLS_PROPIAS = new Set(['userSettings', 'projectSettings', 'syncedSkills'])
/** La meta de Claude Code para cada CLAUDE.md. */
const LINEAS_CLAUDE_MD = 200
/** De MEMORY.md, Claude Code carga solo las primeras 200 líneas o 25 KB: lo demás no llega. */
const LINEAS_INDICE = 200
const BYTES_INDICE = 25_000

/** La opción de Toki con los servidores MCP que deja bajo demanda. */
export const OPCION_DIFERIDOS = 'mcpDiferidos'

/** Cuándo se usó por última vez cada herramienta MCP (`mcp__linear__create_issue`) o skill, y desde cuándo se cuenta. */
export type Uso = { desde: number; ultimo: Record<string, number> }
export type UsoMcp = Uso

/** Lo guardado en el store, saneado; sin nada, la cuenta empieza en `ahora`. */
function leerUso(valor: unknown, ahora: number, vale: (clave: string) => boolean): Uso {
  if (valor === null || typeof valor !== 'object') return { desde: ahora, ultimo: {} }
  const v = valor as Record<string, unknown>
  const desde = typeof v['desde'] === 'number' && Number.isFinite(v['desde']) ? v['desde'] : ahora
  const ultimo: Record<string, number> = {}
  if (v['ultimo'] !== null && typeof v['ultimo'] === 'object') {
    for (const [k, ms] of Object.entries(v['ultimo'] as Record<string, unknown>)) {
      if (vale(k) && typeof ms === 'number' && Number.isFinite(ms)) ultimo[k] = ms
    }
  }
  return { desde, ultimo }
}

export function leerUsoMcp(valor: unknown, ahora: number): Uso {
  return leerUso(valor, ahora, k => k.startsWith('mcp__'))
}

/** Las skills se recuerdan por su nombre sin el plugin (nombreSkill). */
export function leerUsoSkills(valor: unknown, ahora: number): Uso {
  return leerUso(valor, ahora, k => k.length > 0 && !k.includes(':'))
}

/** Una llamada más a esa herramienta MCP o skill; guarda solo las más recientes. */
export function anotarUso(u: Uso, clave: string, ms: number): Uso {
  const ultimo = { ...u.ultimo, [clave]: ms }
  const claves = Object.keys(ultimo)
  if (claves.length > MAX_HERRAMIENTAS) {
    for (const k of claves.sort((a, b) => (ultimo[a] ?? 0) - (ultimo[b] ?? 0)).slice(0, claves.length - MAX_HERRAMIENTAS)) delete ultimo[k]
  }
  return { desde: u.desde, ultimo }
}

/** Una skill por su nombre, venga de donde venga: `anthropic-skills:pdf` y `/pdf` son `pdf`. */
export function nombreSkill(nombre: string): string {
  return nombre.trim().replace(/^\//, '').split(':').pop() ?? ''
}

/** Los servidores de la opción («linear, slack»), sin repetir. */
export function leerDiferidos(valor: unknown): string[] {
  const lista = typeof valor === 'string' ? valor.split(',') : Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
  return [...new Set(lista.map(n => n.trim()).filter(n => n.length > 0))]
}

/** Cómo empiezan las herramientas de un servidor: «claude.ai Gmail» → `mcp__claude_ai_Gmail__`. */
export function prefijoMcp(servidor: string): string {
  return `mcp__${servidor.replace(/[^A-Za-z0-9_-]/g, '_')}__`
}

/** Si la herramienta es de un servidor de la lista: por quién la provee (`mcp:linear`) o por su nombre. */
export function esDiferido(herramienta: string, proveedor: string | undefined, lista: readonly string[]): boolean {
  return lista.some(s => proveedor === `mcp:${s}` || herramienta.startsWith(prefijoMcp(s)))
}

export type ServidorMcp = {
  nombre: string
  /** Lo que pesan sus herramientas cargadas, en cada pedido. */
  tokens: number
  cargadas: number
  /** Herramientas que se cargan solo si Claude las busca: no pesan hasta entonces. */
  diferidas: number
  ultimoUso?: number
}

/** Una skill de la lista que va en cada pedido, con su origen (`userSettings`, `plugin`…). */
export type SkillListada = { nombre: string; origen: string; plugin?: string; tokens: number }

export type Dieta = {
  /** Lo que va en cada pedido antes de tu conversación. */
  fijo: number
  /** Todo el contexto de ahora, con la conversación: lo que se reescribe si cambian las herramientas. */
  total: number
  /** Claude Code deja herramientas tras ToolSearch en esta sesión: un MCP bajo demanda sigue a mano. */
  bajoDemanda: boolean
  partes: { nombre: string; tokens: number }[]
  servidores: ServidorMcp[]
  memoria: { ruta: string; tipo: string; tokens: number }[]
  skills?: { tokens: number; listadas: number; total: number; lista: SkillListada[] }
  agentes: number
}

/**
 * El desglose de /context, sin la conversación: lo fijo por categoría, los
 * servidores MCP con su último uso y los archivos de memoria.
 */
export function armarDieta(d: SessionContextBreakdown, uso: UsoMcp): Dieta {
  // La fila de la conversación solo se distingue por su nombre: lo demás de "used" es fijo.
  const partes = d.categories
    .filter(c => c.kind === 'used' && c.tokens > 0 && c.name !== 'Messages')
    .sort((a, b) => b.tokens - a.tokens)
    .map(c => ({ nombre: c.name, tokens: c.tokens }))
  const porServidor = new Map<string, ServidorMcp>()
  for (const h of d.mcpTools) {
    const s = porServidor.get(h.serverName) ?? { nombre: h.serverName, tokens: 0, cargadas: 0, diferidas: 0 }
    if (h.isLoaded) {
      s.tokens += h.tokens
      s.cargadas += 1
    } else s.diferidas += 1
    const ms = uso.ultimo[h.name]
    if (ms !== undefined && (s.ultimoUso === undefined || ms > s.ultimoUso)) s.ultimoUso = ms
    porServidor.set(h.serverName, s)
  }
  const skills = d.skills
  return {
    fijo: partes.reduce((suma, p) => suma + p.tokens, 0),
    total: d.totalTokens,
    bajoDemanda: d.categories.some(c => c.kind === 'deferred') || d.mcpTools.some(h => !h.isLoaded),
    partes,
    servidores: [...porServidor.values()].sort((a, b) => b.tokens - a.tokens || a.nombre.localeCompare(b.nombre)),
    memoria: d.memoryFiles.map(f => ({ ruta: f.path, tipo: f.type, tokens: f.tokens })).sort((a, b) => b.tokens - a.tokens),
    skills:
      skills !== undefined
        ? {
            tokens: skills.tokens,
            listadas: skills.includedSkills,
            total: skills.totalSkills,
            lista: skills.skillFrontmatter.map(f => ({ nombre: f.name, origen: f.source, ...(f.pluginName !== undefined ? { plugin: f.pluginName } : {}), tokens: f.tokens })),
          }
        : undefined,
    agentes: d.agents.reduce((suma, a) => suma + a.tokens, 0),
  }
}

/** La copia de un archivo de memoria que Toki guardó antes de adelgazarlo. */
export type Respaldo = { ruta: string; respaldo: string; ms: number }

/** Los respaldos guardados, saneados. */
export function leerRespaldos(valor: unknown): Respaldo[] {
  if (!Array.isArray(valor)) return []
  return valor.filter(
    (r): r is Respaldo => r !== null && typeof r === 'object' && typeof r.ruta === 'string' && typeof r.respaldo === 'string' && typeof r.ms === 'number' && Number.isFinite(r.ms),
  )
}

/** Un archivo de memoria medido en disco. */
export type ArchivoMemoria = { ruta: string; tipo: string; tokens: number; lineas: number; bytes: number }

/** Líneas y bytes (UTF-8) de un texto. */
export function medirTexto(texto: string): { lineas: number; bytes: number } {
  let bytes = 0
  for (const c of texto) {
    const p = c.codePointAt(0) ?? 0
    bytes += p < 0x80 ? 1 : p < 0x800 ? 2 : p < 0x10000 ? 3 : 4
  }
  const saltos = texto.split('\n').length - 1
  return { lineas: texto.length === 0 ? 0 : texto.endsWith('\n') ? saltos : saltos + 1, bytes }
}

/** El índice de la memoria automática: de él Claude Code carga solo el comienzo. */
function esIndice(a: Pick<ArchivoMemoria, 'ruta'>): boolean {
  return /(^|\/)MEMORY\.md$/.test(a.ruta)
}

/**
 * Los que pasan el límite: un CLAUDE.md (o regla) de más de 200 líneas pesa en cada pedido;
 * un MEMORY.md de más de 200 líneas o 25 KB pierde lo que sobra. Los de la organización no se tocan.
 */
export function memoriaLarga(archivos: readonly ArchivoMemoria[]): ArchivoMemoria[] {
  return archivos.filter(a =>
    a.tipo === 'Managed' ? false : esIndice(a) ? a.lineas > LINEAS_INDICE || a.bytes > BYTES_INDICE : a.tipo !== 'AutoMem' && a.lineas > LINEAS_CLAUDE_MD,
  )
}

export type OpcionesDieta = {
  ahora: number
  idioma?: Idioma
  /** El modelo con que se calcula el costo (`Opus`). */
  modelo: string
  /** Desde cuándo Toki cuenta el uso de MCP. */
  desde: number
  /** Pedidos de esta semana, para el costo de la semana. */
  pedidosSemana: number
  /** USD de leer esos tokens del caché, y de escribirlos con el caché vencido. */
  lectura: (tokens: number) => number
  escritura: (tokens: number) => number
  /** Los archivos de memoria medidos en disco. */
  medidos?: ArchivoMemoria[]
  /** El uso de skills que lleva Toki. */
  usoSkills?: Uso
  /** El plugin de Toki: sus propias skills no se cuentan. */
  propio?: string
  /** Los servidores que Toki ya deja bajo demanda. */
  diferidos?: readonly string[]
  /** «Guardia de empresa» prendida: Toki no cambia las herramientas. */
  guardia?: boolean
  /** Pagas con un plan: /usage también propone recortes. */
  suscripcion?: boolean
}

const TEXTOS = {
  es: {
    cmd: 'Cuánto pesa lo que va en cada pedido (MCP, CLAUDE.md, skills…) y arreglarlo con tu permiso',
    titulo: 'Toki · dieta del contexto fijo',
    sinDesglose: 'Todavía no hay desglose del contexto: pruébalo después del primer mensaje.',
    fijo: (t: string) => `Lo que va en cada pedido antes de tu conversación: ~${t} tokens.`,
    costo: (lectura: string, escritura: string, modelo: string) => `En ${modelo}: ${lectura} por pedido con el caché vivo; ${escritura} si el caché venció.`,
    semana: (p: number, t: string, total: string, u: string) => `Esta semana: ${p} ${p === 1 ? 'pedido' : 'pedidos'} × ~${t} ≈ ${total} tokens leídos, ${u} a precio de API (con el tamaño de hoy).`,
    partes: 'Qué lo compone:',
    nombres: {
      'System prompt': 'Instrucciones de Claude Code',
      'System tools': 'Herramientas de Claude Code',
      'MCP tools': 'Herramientas MCP',
      'Custom agents': 'Agentes propios',
      'Memory files': 'Memoria (CLAUDE.md…)',
      Skills: 'Skills',
    } as Record<string, string>,
    mcp: 'Servidores MCP (en cada pedido · último uso):',
    servidor: (t: string, n: number, diferidas: number) => `~${t} · ${n} ${n === 1 ? 'herramienta' : 'herramientas'}${diferidas > 0 ? ` (+${diferidas} bajo demanda)` : ''}`,
    hoy: 'usado hoy',
    ayer: 'usado ayer',
    haceDias: (n: number) => `usado hace ${n} días`,
    sinUso: (dias: number) => `sin usar en ${dias} días`,
    sinUsoAun: (dias: number) => (dias < 1 ? 'sin usar desde que Toki cuenta (hoy)' : `sin usar desde que Toki cuenta (${dias} ${dias === 1 ? 'día' : 'días'})`),
    memoria: 'Memoria:',
    skills: (t: string, listadas: number, total: number) => `Skills: ~${t} para listar ${listadas}${listadas < total ? ` de ${total}` : ''}`,
    recortar: 'Para adelgazar:',
    apagarMcp: (s: string, t: string, u: string) => `Apaga ${s} en /mcp si no lo vas a usar: no lo usaste en ${DIAS_SIN_USO} días y pesa ~${t} en cada pedido (${u} esta semana).`,
    memoriaGrande: (t: string) => `Tu memoria (CLAUDE.md y similares) pesa ~${t}: mueve los flujos específicos a skills y deja el CLAUDE.md por debajo de 200 líneas.`,
    skillsGrandes: (t: string) => `La lista de skills pesa ~${t}: desactiva en /plugin los plugins que no uses.`,
    agentesGrandes: (t: string) => `Tus agentes propios pesan ~${t}: borra los que no uses o déjalos solo en el proyecto que los necesita.`,
    liviano: 'Nada que recortar: el contexto fijo está liviano.',
    lineas: (n: number) => `${n} líneas`,
    diferirMcp: (s: string, t: string, u: string) =>
      `${s}: sin usar en ${DIAS_SIN_USO} días y ~${t} en cada pedido (${u} esta semana). /toki-dieta mcp lo deja bajo demanda (Claude lo carga si lo busca); si ya no lo usas, apágalo en /mcp.`,
    diferidos: (s: string) => `Bajo demanda por Toki: ${s}. Lo deshace /toki-dieta restaurar.`,
    claudeLargo: (r: string, n: number, t: string) => `${r} tiene ${n} líneas (la meta de Claude Code es menos de 200) y pesa ~${t} en cada pedido.`,
    indiceLargo: (r: string, n: number, kb: number) => `${r} tiene ${n} líneas (${kb} KB): Claude Code solo carga las primeras 200 líneas o 25 KB, lo demás no llega.`,
    arreglarMemoria: '/toki-dieta memoria guarda un respaldo y le pide a Claude que lo adelgace, mostrándote cada cambio.',
    usage: 'Con tu plan, /usage también marca lo que más pesa y la tecla f lo arregla.',
    skillsPropias: (lista: string, t: string) => `Skills tuyas sin usar en ${DIAS_SIN_USO} días (~${t} en cada pedido): ${lista}. En /skills déjalas solo con su nombre o apágalas.`,
    skillsPlugin: (p: string, n: number, t: string) =>
      `${p}: ${n === 1 ? 'su skill' : `sus ${n} skills`} sin usar en ${DIAS_SIN_USO} días (~${t} en cada pedido). Si tampoco usas lo demás que trae, desactívalo en /plugin.`,
    yMas: (n: number) => `y ${n} más`,
    pista: 'mcp | memoria | subagentes | restaurar',
    pregunta: '¿Lo arreglo ahora, de forma reversible?',
    preguntaVarios: '¿Qué arreglo ahora, de forma reversible?',
    opMcp: (s: readonly string[]) => (s.length === 1 ? `${s[0]} bajo demanda` : `${s.length} MCP bajo demanda`),
    opMemoria: (a: readonly string[]) => (a.length === 1 ? `Adelgazar ${a[0]}` : `Adelgazar ${a.length} archivos`),
    ahoraNo: 'Ahora no',
    mcpHecho: (s: string, u: string) =>
      `Listo: ${s} queda bajo demanda desde tu próximo mensaje; Claude lo carga si lo busca. Ese mensaje reescribe el caché una vez (${u} de más a precio de API). Lo deshace /toki-dieta restaurar.`,
    mcpNinguno: `Ningún servidor MCP cargado lleva ${DIAS_SIN_USO} días sin uso: nada que dejar bajo demanda.`,
    mcpSinBusqueda: 'En esta sesión Claude Code no deja herramientas tras ToolSearch: bajo demanda, Claude no encontraría el MCP. Apaga en /mcp lo que no uses.',
    mcpGuardia: 'Con «Guardia de empresa» prendida Toki no cambia las herramientas: apaga en /mcp lo que no uses.',
    mcpNegado: (m: string) => `Claude Code no dejó cambiar la opción (${m}). Puedes escribir los servidores en /plugin → Toki → «MCP bajo demanda».`,
    memoriaPedido: 'Te dejé el pedido en el cuadro de texto: revísalo y envíalo; Claude te muestra cada cambio antes de hacerlo.',
    memoriaCopia: 'Envíale este pedido a Claude:',
    respaldos: 'Respaldo de cada archivo antes de tocarlo:',
    memoriaNinguna: 'Ningún CLAUDE.md pasa de 200 líneas y MEMORY.md cabe entero: nada que adelgazar.',
    sinRespaldo: 'No pude guardar un respaldo, así que no toco nada.',
    restauradoMcp: (s: string) => `Listo: ${s} vuelve a cargarse desde tu próximo mensaje (reescribe el caché una vez).`,
    restaurarMemoria: 'Para volver a la memoria de antes, copia su respaldo encima:',
    nadaQueRestaurar: 'Nada que restaurar: Toki no tiene MCP bajo demanda, respaldos de memoria ni caché de 1 hora en los subagentes.',
    pedido: 'Adelgaza estos archivos de memoria de Claude Code sin perder lo importante. Muéstrame cada cambio antes de hacerlo.',
    pedidoClaude: (r: string, n: number) =>
      `- ${r} (${n} líneas): deja lo esencial en menos de 200 líneas. Lo que solo aplica a ciertas carpetas o tareas, muévelo a \`.claude/rules/\` con \`paths:\` o a una skill; quita lo repetido y lo que ya se deduce del código.`,
    pedidoUsuario: (r: string, n: number) => `- ${r} (${n} líneas): deja lo esencial en menos de 200 líneas. Lo que solo aplica a un proyecto, muévelo a ese proyecto; los flujos de trabajo largos, a skills.`,
    pedidoIndice: (r: string, n: number, kb: number) =>
      `- ${r} (${n} líneas, ${kb} KB): Claude Code solo carga las primeras 200 líneas o 25 KB. Déjalo como índice, una línea por recuerdo, y pasa el detalle a sus archivos de tema.`,
  },
  en: {
    cmd: 'How much rides along with every request (MCP, CLAUDE.md, skills…) and fixing it with your OK',
    titulo: 'Toki · fixed-context diet',
    sinDesglose: 'No context breakdown yet: try again after the first message.',
    fijo: (t: string) => `What goes with every request before your conversation: ~${t} tokens.`,
    costo: (lectura: string, escritura: string, modelo: string) => `On ${modelo}: ${lectura} per request with a warm cache; ${escritura} once the cache expired.`,
    semana: (p: number, t: string, total: string, u: string) => `This week: ${p} ${p === 1 ? 'request' : 'requests'} × ~${t} ≈ ${total} tokens read, ${u} at API prices (at today's size).`,
    partes: 'What it is made of:',
    nombres: {
      'System prompt': 'Claude Code instructions',
      'System tools': 'Claude Code tools',
      'MCP tools': 'MCP tools',
      'Custom agents': 'Custom agents',
      'Memory files': 'Memory (CLAUDE.md…)',
      Skills: 'Skills',
    } as Record<string, string>,
    mcp: 'MCP servers (per request · last used):',
    servidor: (t: string, n: number, diferidas: number) => `~${t} · ${n} ${n === 1 ? 'tool' : 'tools'}${diferidas > 0 ? ` (+${diferidas} on demand)` : ''}`,
    hoy: 'used today',
    ayer: 'used yesterday',
    haceDias: (n: number) => `used ${n} days ago`,
    sinUso: (dias: number) => `unused for ${dias} days`,
    sinUsoAun: (dias: number) => (dias < 1 ? 'unused since Toki started counting (today)' : `unused since Toki started counting (${dias} ${dias === 1 ? 'day' : 'days'})`),
    memoria: 'Memory:',
    skills: (t: string, listadas: number, total: number) => `Skills: ~${t} to list ${listadas}${listadas < total ? ` of ${total}` : ''}`,
    recortar: 'To slim down:',
    apagarMcp: (s: string, t: string, u: string) => `Turn ${s} off in /mcp if you won't use it: unused for ${DIAS_SIN_USO} days and ~${t} on every request (${u} this week).`,
    memoriaGrande: (t: string) => `Your memory (CLAUDE.md and the like) weighs ~${t}: move specific workflows into skills and keep CLAUDE.md under 200 lines.`,
    skillsGrandes: (t: string) => `The skill listing weighs ~${t}: disable in /plugin the plugins you don't use.`,
    agentesGrandes: (t: string) => `Your custom agents weigh ~${t}: delete the ones you don't use, or keep them only in the project that needs them.`,
    liviano: 'Nothing to trim: the fixed context is lean.',
    lineas: (n: number) => `${n} lines`,
    diferirMcp: (s: string, t: string, u: string) =>
      `${s}: unused for ${DIAS_SIN_USO} days and ~${t} on every request (${u} this week). /toki-dieta mcp loads it on demand (Claude loads it when it looks for it); if you no longer use it, turn it off in /mcp.`,
    diferidos: (s: string) => `On demand by Toki: ${s}. Undo with /toki-dieta restore.`,
    claudeLargo: (r: string, n: number, t: string) => `${r} has ${n} lines (Claude Code's target is under 200) and weighs ~${t} on every request.`,
    indiceLargo: (r: string, n: number, kb: number) => `${r} has ${n} lines (${kb} KB): Claude Code only loads the first 200 lines or 25 KB; the rest never arrives.`,
    arreglarMemoria: '/toki-dieta memory saves a backup and asks Claude to slim it down, showing you each change.',
    usage: 'On your plan, /usage also flags what weighs most and the f key fixes it.',
    skillsPropias: (lista: string, t: string) => `Your skills unused for ${DIAS_SIN_USO} days (~${t} on every request): ${lista}. In /skills set them to name-only or off.`,
    skillsPlugin: (p: string, n: number, t: string) =>
      `${p}: ${n === 1 ? 'its skill' : `its ${n} skills`} unused for ${DIAS_SIN_USO} days (~${t} on every request). If you don't use the rest it brings either, disable it in /plugin.`,
    yMas: (n: number) => `and ${n} more`,
    pista: 'mcp | memory | subagents | restore',
    pregunta: 'Fix it now, reversibly?',
    preguntaVarios: 'What should I fix now, reversibly?',
    opMcp: (s: readonly string[]) => (s.length === 1 ? `${s[0]} on demand` : `${s.length} MCP on demand`),
    opMemoria: (a: readonly string[]) => (a.length === 1 ? `Slim ${a[0]}` : `Slim ${a.length} files`),
    ahoraNo: 'Not now',
    mcpHecho: (s: string, u: string) =>
      `Done: ${s} loads on demand from your next message; Claude loads it when it looks for it. That message rewrites the cache once (${u} extra at API prices). Undo with /toki-dieta restore.`,
    mcpNinguno: `No loaded MCP server has gone ${DIAS_SIN_USO} days unused: nothing to load on demand.`,
    mcpSinBusqueda: "Claude Code isn't keeping tools behind ToolSearch in this session: on demand, Claude couldn't find the MCP. Turn off in /mcp what you don't use.",
    mcpGuardia: "With «Company guard» on, Toki doesn't change tools: turn off in /mcp what you don't use.",
    mcpNegado: (m: string) => `Claude Code didn't allow changing the option (${m}). You can type the servers in /plugin → Toki → «On-demand MCP».`,
    memoriaPedido: 'I left the request in the prompt box: review it and send it; Claude shows you each change before making it.',
    memoriaCopia: 'Send Claude this request:',
    respaldos: 'Backup of each file before touching it:',
    memoriaNinguna: 'No CLAUDE.md is over 200 lines and MEMORY.md fits whole: nothing to slim down.',
    sinRespaldo: "I couldn't save a backup, so I'm not touching anything.",
    restauradoMcp: (s: string) => `Done: ${s} loads again from your next message (it rewrites the cache once).`,
    restaurarMemoria: 'To go back to the earlier memory, copy its backup over it:',
    nadaQueRestaurar: 'Nothing to restore: Toki has no on-demand MCP, memory backups or 1-hour subagent cache.',
    pedido: 'Slim down these Claude Code memory files without losing what matters. Show me each change before making it.',
    pedidoClaude: (r: string, n: number) =>
      `- ${r} (${n} lines): keep the essentials under 200 lines. Move what only applies to certain folders or tasks into \`.claude/rules/\` with \`paths:\` or into a skill; drop repetition and anything the code already shows.`,
    pedidoUsuario: (r: string, n: number) => `- ${r} (${n} lines): keep the essentials under 200 lines. Move what only applies to one project into that project, and long workflows into skills.`,
    pedidoIndice: (r: string, n: number, kb: number) =>
      `- ${r} (${n} lines, ${kb} KB): Claude Code only loads the first 200 lines or 25 KB. Keep it as an index, one line per memory, and move the details into their topic files.`,
  },
}

/** La descripción del comando. */
export function cmdDieta(idioma: Idioma = 'es'): string {
  return TEXTOS[idioma].cmd
}

/** Los textos de /toki-dieta y sus arreglos. */
export function txDieta(idioma: Idioma = 'es'): (typeof TEXTOS)['es'] {
  return TEXTOS[idioma]
}

/** Un decimal más bajo los diez centavos: lo fijo de un pedido suele costar uno o dos centavos. */
export function cifraFina(n: number): string {
  return n > 0 && n < 0.1 ? `~$${n.toFixed(3)}` : cifraUsd(n)
}

/** Sin usar en DIAS_SIN_USO días, contados desde que Toki lleva la cuenta. */
function sinUsar(s: ServidorMcp, o: Pick<OpcionesDieta, 'ahora' | 'desde'>): boolean {
  const desde = s.ultimoUso ?? o.desde
  return o.ahora - desde >= DIAS_SIN_USO * DIA
}

function textoUso(s: ServidorMcp, o: OpcionesDieta, x: (typeof TEXTOS)['es']): string {
  if (s.ultimoUso === undefined) {
    const dias = Math.floor((o.ahora - o.desde) / DIA)
    return dias >= DIAS_SIN_USO ? x.sinUso(DIAS_SIN_USO) : x.sinUsoAun(dias)
  }
  const dias = Math.floor((o.ahora - s.ultimoUso) / DIA)
  return dias <= 0 ? x.hoy : dias === 1 ? x.ayer : dias >= DIAS_SIN_USO ? x.sinUso(dias) : x.haceDias(dias)
}

/** Los servidores MCP que pesan y no usaste en DIAS_SIN_USO días: apagarlos ahorra en cada pedido. */
export function mcpSinUso(d: Dieta, o: Pick<OpcionesDieta, 'ahora' | 'desde'>): ServidorMcp[] {
  return d.servidores.filter(s => s.tokens >= MCP_QUE_PESA && sinUsar(s, o))
}

/** Lo que Toki arregla con tu permiso: MCP sin uso bajo demanda (si hay ToolSearch y no hay guardia) y memoria larga. */
export type Arreglos = { mcp: ServidorMcp[]; memoria: ArchivoMemoria[] }

export function arreglos(d: Dieta | undefined, o: Pick<OpcionesDieta, 'ahora' | 'desde' | 'medidos' | 'guardia'>): Arreglos {
  return {
    mcp: d !== undefined && d.bajoDemanda && o.guardia !== true ? mcpSinUso(d, o) : [],
    memoria: memoriaLarga(o.medidos ?? []),
  }
}

export type SkillsSinUso = { propias: SkillListada[]; plugins: { plugin: string; skills: number; tokens: number }[]; tokens: number }

/**
 * Las skills sin usar en DIAS_SIN_USO días, contados desde que Toki lleva la cuenta: las tuyas
 * (se ajustan en /skills) y los plugins con todas sus skills sin usar (se desactivan en /plugin).
 * Ni las de Claude Code, ni las de un MCP, ni las de Toki; y juntas deben pesar algo.
 */
export function skillsSinUso(d: Dieta, uso: Uso, o: Pick<OpcionesDieta, 'ahora' | 'propio'>): SkillsSinUso {
  const lista = d.skills?.lista ?? []
  const sinUsarSkill = (s: SkillListada) => o.ahora - (uso.ultimo[nombreSkill(s.nombre)] ?? uso.desde) >= DIAS_SIN_USO * DIA
  const pesan = (ss: readonly SkillListada[]) => ss.reduce((suma, s) => suma + s.tokens, 0)
  const propias = lista.filter(s => SKILLS_PROPIAS.has(s.origen) && sinUsarSkill(s))
  const porPlugin = new Map<string, SkillListada[]>()
  for (const s of lista) {
    if (s.origen === 'plugin' && s.plugin !== undefined && s.plugin !== o.propio) porPlugin.set(s.plugin, [...(porPlugin.get(s.plugin) ?? []), s])
  }
  const plugins = [...porPlugin]
    .filter(([, ss]) => ss.every(sinUsarSkill))
    .map(([plugin, ss]) => ({ plugin, skills: ss.length, tokens: pesan(ss) }))
    .sort((a, b) => b.tokens - a.tokens || a.plugin.localeCompare(b.plugin))
    .slice(0, 3)
  const tokens = pesan(propias) + plugins.reduce((suma, p) => suma + p.tokens, 0)
  return tokens >= SKILLS_SIN_USO_QUE_PESAN ? { propias, plugins, tokens } : { propias: [], plugins: [], tokens: 0 }
}

/** KB como los cuenta el límite de MEMORY.md. */
function kb(bytes: number): number {
  return Math.ceil(bytes / 1000)
}

/** El pedido para que Claude adelgace esos archivos: nada de ningún proyecto en particular, Claude lo adapta a lo que encuentre. */
export function pedidoMemoria(archivos: readonly ArchivoMemoria[], idioma: Idioma = 'es'): string {
  const x = TEXTOS[idioma]
  const linea = (a: ArchivoMemoria) =>
    esIndice(a) ? x.pedidoIndice(a.ruta, a.lineas, kb(a.bytes)) : a.tipo === 'User' ? x.pedidoUsuario(a.ruta, a.lineas) : x.pedidoClaude(a.ruta, a.lineas)
  return [x.pedido, ...archivos.map(linea)].join('\n')
}

/** Hasta seis nombres; el resto, contado. */
function listaCorta(nombres: readonly string[], x: (typeof TEXTOS)['es']): string {
  return nombres.length <= 6 ? nombres.join(', ') : `${nombres.slice(0, 6).join(', ')} ${x.yMas(nombres.length - 6)}`
}

/** /toki-dieta en texto. Sin desglose, lo dice. */
export function textoDieta(d: Dieta | undefined, o: OpcionesDieta): string {
  const x = TEXTOS[o.idioma ?? 'es']
  if (d === undefined || d.fijo <= 0) return [x.titulo, '', x.sinDesglose].join('\n')
  const t = formatearTokens(d.fijo)
  const lineas = [x.titulo, '', x.fijo(t), x.costo(cifraFina(o.lectura(d.fijo)), cifraFina(o.escritura(d.fijo)), o.modelo)]
  if (o.pedidosSemana > 0) lineas.push(x.semana(o.pedidosSemana, t, formatearTokens(o.pedidosSemana * d.fijo), cifraUsd(o.pedidosSemana * o.lectura(d.fijo))))
  const nombres = d.partes.map(p => x.nombres[p.nombre] ?? p.nombre)
  const ancho = Math.max(...nombres.map(n => n.length))
  const mayor = d.partes[0]?.tokens ?? 1
  lineas.push('', x.partes)
  d.partes.forEach((p, i) => lineas.push(`  ${(nombres[i] ?? p.nombre).padEnd(ancho)}  ${barra((p.tokens / mayor) * 100, 10)}  ~${formatearTokens(p.tokens)}`))
  if (d.servidores.length > 0) {
    const anchoS = Math.max(...d.servidores.map(s => s.nombre.length))
    lineas.push('', x.mcp)
    for (const s of d.servidores) lineas.push(`  ${s.nombre.padEnd(anchoS)}  ${x.servidor(formatearTokens(s.tokens), s.cargadas, s.diferidas)} · ${textoUso(s, o, x)}`)
  }
  if (o.diferidos !== undefined && o.diferidos.length > 0 && o.guardia !== true) lineas.push('', x.diferidos(o.diferidos.join(', ')))
  if (d.memoria.length > 0) {
    lineas.push('', x.memoria)
    const medidos = new Map((o.medidos ?? []).map(m => [m.ruta, m]))
    for (const m of d.memoria.slice(0, 5)) {
      const medido = medidos.get(m.ruta)
      lineas.push(`  ${m.ruta}  ~${formatearTokens(m.tokens)}${medido !== undefined ? ` · ${x.lineas(medido.lineas)}` : ''}`)
    }
  }
  if (d.skills !== undefined && d.skills.tokens > 0) lineas.push('', x.skills(formatearTokens(d.skills.tokens), d.skills.listadas, d.skills.total))
  const sugerencias: string[] = []
  const a = arreglos(d, o)
  const aDiferir = new Set(a.mcp.map(s => s.nombre))
  for (const s of mcpSinUso(d, o)) {
    const semana = cifraUsd(o.pedidosSemana * o.lectura(s.tokens))
    sugerencias.push(aDiferir.has(s.nombre) ? x.diferirMcp(s.nombre, formatearTokens(s.tokens), semana) : x.apagarMcp(s.nombre, formatearTokens(s.tokens), semana))
  }
  if (a.memoria.length > 0) {
    for (const m of a.memoria) sugerencias.push(esIndice(m) ? x.indiceLargo(m.ruta, m.lineas, kb(m.bytes)) : x.claudeLargo(m.ruta, m.lineas, formatearTokens(m.tokens)))
    sugerencias.push(x.arreglarMemoria)
    if (o.suscripcion === true) sugerencias.push(x.usage)
  } else {
    const memoria = d.memoria.reduce((suma, m) => suma + m.tokens, 0)
    if (memoria > MEMORIA_QUE_PESA) sugerencias.push(x.memoriaGrande(formatearTokens(memoria)))
  }
  const skills = o.usoSkills !== undefined ? skillsSinUso(d, o.usoSkills, o) : undefined
  if (skills !== undefined && skills.tokens > 0) {
    if (skills.propias.length > 0) sugerencias.push(x.skillsPropias(listaCorta(skills.propias.map(s => s.nombre), x), formatearTokens(skills.propias.reduce((suma, s) => suma + s.tokens, 0))))
    for (const p of skills.plugins) sugerencias.push(x.skillsPlugin(p.plugin, p.skills, formatearTokens(p.tokens)))
  } else if ((d.skills?.tokens ?? 0) > SKILLS_QUE_PESAN) sugerencias.push(x.skillsGrandes(formatearTokens(d.skills?.tokens ?? 0)))
  if (d.agentes > AGENTES_QUE_PESAN) sugerencias.push(x.agentesGrandes(formatearTokens(d.agentes)))
  lineas.push('', ...(sugerencias.length > 0 ? [x.recortar, ...sugerencias.map(s => `  • ${s}`)] : [x.liviano]))
  return lineas.join('\n')
}
