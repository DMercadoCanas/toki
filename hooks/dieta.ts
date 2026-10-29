// La dieta del contexto fijo: lo que va en cada pedido antes de tu conversación
// (instrucciones y herramientas de Claude Code, MCP, CLAUDE.md, skills, agentes),
// lo que cuesta y qué servidores MCP no usaste.

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
/** Herramientas MCP recordadas: las usadas más recientemente. */
const MAX_HERRAMIENTAS = 300

/** Cuándo se usó por última vez cada herramienta MCP (`mcp__linear__create_issue`), y desde cuándo se cuenta. */
export type UsoMcp = { desde: number; ultimo: Record<string, number> }

/** Lo guardado en el store, saneado; sin nada, la cuenta empieza en `ahora`. */
export function leerUsoMcp(valor: unknown, ahora: number): UsoMcp {
  if (valor === null || typeof valor !== 'object') return { desde: ahora, ultimo: {} }
  const v = valor as Record<string, unknown>
  const desde = typeof v['desde'] === 'number' && Number.isFinite(v['desde']) ? v['desde'] : ahora
  const ultimo: Record<string, number> = {}
  if (v['ultimo'] !== null && typeof v['ultimo'] === 'object') {
    for (const [k, ms] of Object.entries(v['ultimo'] as Record<string, unknown>)) {
      if (k.startsWith('mcp__') && typeof ms === 'number' && Number.isFinite(ms)) ultimo[k] = ms
    }
  }
  return { desde, ultimo }
}

/** Una llamada más a esa herramienta MCP; guarda solo las más recientes. */
export function anotarUsoMcp(u: UsoMcp, herramienta: string, ms: number): UsoMcp {
  const ultimo = { ...u.ultimo, [herramienta]: ms }
  const claves = Object.keys(ultimo)
  if (claves.length > MAX_HERRAMIENTAS) {
    for (const k of claves.sort((a, b) => (ultimo[a] ?? 0) - (ultimo[b] ?? 0)).slice(0, claves.length - MAX_HERRAMIENTAS)) delete ultimo[k]
  }
  return { desde: u.desde, ultimo }
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

export type Dieta = {
  /** Lo que va en cada pedido antes de tu conversación. */
  fijo: number
  partes: { nombre: string; tokens: number }[]
  servidores: ServidorMcp[]
  memoria: { ruta: string; tokens: number }[]
  skills?: { tokens: number; listadas: number; total: number }
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
  return {
    fijo: partes.reduce((suma, p) => suma + p.tokens, 0),
    partes,
    servidores: [...porServidor.values()].sort((a, b) => b.tokens - a.tokens || a.nombre.localeCompare(b.nombre)),
    memoria: d.memoryFiles.map(f => ({ ruta: f.path, tokens: f.tokens })).sort((a, b) => b.tokens - a.tokens),
    skills: d.skills !== undefined ? { tokens: d.skills.tokens, listadas: d.skills.includedSkills, total: d.skills.totalSkills } : undefined,
    agentes: d.agents.reduce((suma, a) => suma + a.tokens, 0),
  }
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
}

const TEXTOS = {
  es: {
    cmd: 'Cuánto pesa lo que va en cada pedido (herramientas, MCP, CLAUDE.md, skills) y qué recortar',
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
  },
  en: {
    cmd: 'How much rides along with every request (tools, MCP, CLAUDE.md, skills) and what to trim',
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
  },
}

/** La descripción del comando. */
export function cmdDieta(idioma: Idioma = 'es'): string {
  return TEXTOS[idioma].cmd
}

/** Un decimal más bajo los diez centavos: lo fijo de un pedido suele costar uno o dos centavos. */
function cifraFina(n: number): string {
  return n > 0 && n < 0.1 ? `~$${n.toFixed(3)}` : cifraUsd(n)
}

/** Sin usar en DIAS_SIN_USO días, contados desde que Toki lleva la cuenta. */
function sinUsar(s: ServidorMcp, o: OpcionesDieta): boolean {
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
  if (d.memoria.length > 0) {
    lineas.push('', x.memoria)
    for (const m of d.memoria.slice(0, 5)) lineas.push(`  ${m.ruta}  ~${formatearTokens(m.tokens)}`)
  }
  if (d.skills !== undefined && d.skills.tokens > 0) lineas.push('', x.skills(formatearTokens(d.skills.tokens), d.skills.listadas, d.skills.total))
  const sugerencias: string[] = []
  for (const s of d.servidores) {
    if (s.tokens >= MCP_QUE_PESA && sinUsar(s, o)) sugerencias.push(x.apagarMcp(s.nombre, formatearTokens(s.tokens), cifraUsd(o.pedidosSemana * o.lectura(s.tokens))))
  }
  const memoria = d.memoria.reduce((suma, m) => suma + m.tokens, 0)
  if (memoria > MEMORIA_QUE_PESA) sugerencias.push(x.memoriaGrande(formatearTokens(memoria)))
  if ((d.skills?.tokens ?? 0) > SKILLS_QUE_PESAN) sugerencias.push(x.skillsGrandes(formatearTokens(d.skills?.tokens ?? 0)))
  if (d.agentes > AGENTES_QUE_PESAN) sugerencias.push(x.agentesGrandes(formatearTokens(d.agentes)))
  lineas.push('', ...(sugerencias.length > 0 ? [x.recortar, ...sugerencias.map(s => `  • ${s}`)] : [x.liviano]))
  return lineas.join('\n')
}
