// Mapa del proyecto (idea de Graphify): estructura del código sin usar el LLM,
// para que Claude se oriente sin leer archivos a ciegas. Funciones puras.

import { t } from './idioma'
import type { Idioma } from './idioma'

export const RUTA_MAPA = '.claude/toki/MAPA.md'

export const CARPETAS_IGNORADAS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.turbo',
  'coverage', '.cache', 'vendor', 'target', '.venv', 'venv', 'env', '__pycache__', '.mypy_cache',
  '.pytest_cache', '.tox', '.gradle', '.idea', '.vscode', 'bin', 'obj', 'Pods', '.claude',
  '.terraform', 'tmp', 'logs',
])

const EXTENSIONES: Record<string, string> = {
  ts: 'js', tsx: 'js', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', mts: 'js', cts: 'js', vue: 'js', svelte: 'js',
  py: 'py', go: 'go', rs: 'rs', java: 'jvm', kt: 'jvm', cs: 'cs', rb: 'rb', php: 'php', swift: 'swift',
}

export const LIMITES_MAPA = { maxArchivos: 1500, maxBytes: 150_000, maxSimbolos: 12, maxXml: 3000, maxLineasOdoo: 400, maxPorLineaOdoo: 6 } as const

export function lenguaje(ruta: string): string | undefined {
  const ext = ruta.split('.').pop()?.toLowerCase() ?? ''
  if (/\.d\.ts$/.test(ruta) || /\.(min|test|spec)\.\w+$/.test(ruta)) return undefined
  return EXTENSIONES[ext]
}

const PATRONES_SIMBOLOS: Record<string, RegExp[]> = {
  js: [
    /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
    /^(?:async\s+)?(function\*?|class)\s+([A-Za-z_$][\w$]*)/gm,
  ],
  py: [/^(?:async\s+)?(def|class)\s+(\w+)/gm],
  go: [/^(func)\s+(?:\([^)]*\)\s*)?(\w+)/gm, /^(type)\s+(\w+)/gm],
  rs: [/^\s*pub(?:\([^)]*\))?\s+(?:async\s+)?(fn|struct|enum|trait|mod|type)\s+(\w+)/gm],
  jvm: [/^\s*(?:public\s+|internal\s+|open\s+|data\s+|sealed\s+|abstract\s+|final\s+|static\s+)*(class|interface|enum|record|object|fun)\s+(\w+)/gm],
  cs: [/^\s*(?:public|internal)\s+(?:static\s+|sealed\s+|abstract\s+|partial\s+)*(class|interface|enum|record|struct)\s+(\w+)/gm],
  rb: [/^\s*(class|module)\s+([\w:]+)/gm, /^\s{0,2}(def)\s+(?:self\.)?(\w+[?!]?)/gm],
  php: [/^\s*(?:abstract\s+|final\s+)?(class|interface|trait|enum)\s+(\w+)/gm, /^(function)\s+(\w+)/gm],
  swift: [/^\s*(?:public\s+|open\s+|final\s+)*(class|struct|enum|protocol|func|extension)\s+(\w+)/gm],
}

const PATRONES_IMPORTS: Record<string, RegExp[]> = {
  js: [/(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g, /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g, /import\s+['"](\.{1,2}\/[^'"]+)['"]/g],
  py: [/^from\s+(\.+[\w.]*)\s+import/gm],
}

export type FichaArchivo = { ruta: string; simbolos: string[]; imports: string[] }

function etiqueta(tipo: string, nombre: string): string {
  if (tipo === 'class' || tipo === 'struct' || tipo === 'interface' || tipo === 'trait' || tipo === 'enum' || tipo === 'protocol' || tipo === 'record' || tipo === 'object' || tipo === 'module') {
    return `${tipo} ${nombre}`
  }
  if (tipo === 'function' || tipo === 'function*' || tipo === 'def' || tipo === 'func' || tipo === 'fn' || tipo === 'fun') return `${nombre}()`
  return nombre
}

export function extraerFicha(ruta: string, texto: string): FichaArchivo | undefined {
  const lang = lenguaje(ruta)
  if (lang === undefined) return undefined
  const simbolos: string[] = []
  for (const patron of PATRONES_SIMBOLOS[lang] ?? []) {
    for (const m of texto.matchAll(patron)) {
      const tipo = m[1] ?? ''
      const nombre = m[2] ?? ''
      if (nombre === '' || nombre.startsWith('_') && lang === 'py') continue
      const e = etiqueta(tipo, nombre)
      if (!simbolos.includes(e)) simbolos.push(e)
    }
  }
  const imports: string[] = []
  for (const patron of PATRONES_IMPORTS[lang] ?? []) {
    for (const m of texto.matchAll(patron)) {
      const destino = resolverImport(ruta, m[1] ?? '', lang)
      if (destino !== undefined && !imports.includes(destino)) imports.push(destino)
    }
  }
  return { ruta, simbolos, imports }
}

/** Resuelve un import relativo a una ruta del proyecto, sin extensión. */
export function resolverImport(desde: string, especificador: string, lang: string): string | undefined {
  const partes = desde.split('/').slice(0, -1)
  if (lang === 'py') {
    const puntos = especificador.match(/^\.+/)?.[0].length ?? 0
    for (let i = 1; i < puntos; i++) partes.pop()
    const resto = especificador.slice(puntos)
    if (resto !== '') partes.push(...resto.split('.'))
    return partes.join('/') || undefined
  }
  for (const segmento of especificador.split('/')) {
    if (segmento === '.' || segmento === '') continue
    if (segmento === '..') partes.pop()
    else partes.push(segmento)
  }
  return partes.join('/').replace(/\.(tsx?|jsx?|mjs|cjs|mts|cts)$/, '').replace(/\/index$/, '')
}

function sinExtension(ruta: string): string {
  return ruta.replace(/\.[^./]+$/, '').replace(/\/(index|__init__)$/, '')
}

// ---------- Odoo: modelos, vistas y depends ----------

/** Lo que un archivo aporta al mapa de Odoo: el manifiesto, los modelos de un .py o las vistas de un .xml. */
export type FichaOdoo = {
  ruta: string
  depends?: string[]
  modelos: { nombre: string; hereda: boolean }[]
  vistas: { id: string; modelo?: string; hereda?: string }[]
}

function cadenas(texto: string): string[] {
  return [...texto.matchAll(/['"]([\w.]+)['"]/g)].map(m => m[1] ?? '')
}

/** Lee un archivo de Odoo sin usar el modelo. undefined si no aporta nada. */
export function extraerOdoo(ruta: string, texto: string): FichaOdoo | undefined {
  const ficha: FichaOdoo = { ruta, modelos: [], vistas: [] }
  if (/(^|\/)__manifest__\.py$/.test(ruta)) {
    const m = texto.match(/['"]depends['"]\s*:\s*\[([^\]]*)\]/)
    ficha.depends = m ? cadenas(m[1] ?? '') : []
    return ficha
  }
  if (ruta.endsWith('.py')) {
    // Cada clase: con _name propio define el modelo (los _inherit son mixins); sin él, o igual al _inherit, lo hereda.
    for (const clase of texto.split(/^class\s/m).slice(1)) {
      const nombre = clase.match(/^\s+_name\s*=\s*['"]([\w.]+)['"]/m)?.[1]
      const herencia = clase.match(/^\s+_inherit\s*=\s*(\[[^\]]*\]|['"][\w.]+['"])/m)?.[1]
      const heredados = herencia !== undefined ? cadenas(herencia) : []
      if (nombre !== undefined && !heredados.includes(nombre)) ficha.modelos.push({ nombre, hereda: false })
      else for (const h of nombre !== undefined ? [nombre] : heredados) ficha.modelos.push({ nombre: h, hereda: true })
    }
  } else if (ruta.endsWith('.xml')) {
    for (const r of texto.matchAll(/<record\b([^>]*)>([\s\S]*?)<\/record>/g)) {
      const atributos = r[1] ?? ''
      const cuerpo = r[2] ?? ''
      if (!/\bmodel=["']ir\.ui\.view["']/.test(atributos)) continue
      const id = atributos.match(/\bid=["']([\w.]+)["']/)?.[1]
      if (id === undefined) continue
      const modelo = cuerpo.match(/<field\s+name=["']model["'][^>]*>\s*([\w.]+)\s*</)?.[1]
      const hereda = cuerpo.match(/<field\s+name=["']inherit_id["'][^>]*\bref=["']([\w.]+)["']/)?.[1]
      ficha.vistas.push({ id, modelo, hereda })
    }
  }
  return ficha.modelos.length > 0 || ficha.vistas.length > 0 ? ficha : undefined
}

function lista(cosas: string[]): string {
  const max = LIMITES_MAPA.maxPorLineaOdoo
  return cosas.slice(0, max).join(', ') + (cosas.length > max ? `, +${cosas.length - max}` : '')
}

function seccionOdoo(odoo: FichaOdoo[], idioma: Idioma): string[] {
  const x = t(idioma)
  const lineas: string[] = []
  const tope = (bloque: string[]): string[] =>
    bloque.length > LIMITES_MAPA.maxLineasOdoo ? [...bloque.slice(0, LIMITES_MAPA.maxLineasOdoo), `- … +${bloque.length - LIMITES_MAPA.maxLineasOdoo}`] : bloque
  const carpeta = (ruta: string): string => (ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/')) : '.')

  const modulos = odoo.filter(f => f.depends !== undefined).sort((a, b) => a.ruta.localeCompare(b.ruta))
  if (modulos.length > 0) {
    lineas.push(`### ${x.mapaOdooModulos}`, '')
    lineas.push(...tope(modulos.map(f => `- ${carpeta(f.ruta)}${f.depends?.length ? ` → ${f.depends.join(', ')}` : ''}`)), '')
  }

  const modelos = new Map<string, { define: string[]; hereda: string[] }>()
  for (const f of odoo) {
    for (const m of f.modelos) {
      const e = modelos.get(m.nombre) ?? { define: [], hereda: [] }
      const destino = m.hereda ? e.hereda : e.define
      if (!destino.includes(f.ruta)) destino.push(f.ruta)
      modelos.set(m.nombre, e)
    }
  }
  if (modelos.size > 0) {
    lineas.push(`### ${x.mapaOdooModelos}`, '')
    const bloque = [...modelos.keys()].sort().map(nombre => {
      const e = modelos.get(nombre) ?? { define: [], hereda: [] }
      const partes = [e.define.length > 0 ? `${x.mapaOdooDefine} ${lista(e.define)}` : '', e.hereda.length > 0 ? `${x.mapaOdooHereda} ${lista(e.hereda)}` : '']
      return `- ${nombre}: ${partes.filter(p => p !== '').join('; ')}`
    })
    lineas.push(...tope(bloque), '')
  }

  const vistas = new Map<string, string[]>()
  for (const f of odoo) {
    for (const v of f.vistas) {
      const clave = v.modelo ?? '?'
      const l = vistas.get(clave) ?? []
      l.push(`${v.id}${v.hereda !== undefined ? ` ← ${v.hereda}` : ''} (${f.ruta})`)
      vistas.set(clave, l)
    }
  }
  if (vistas.size > 0) {
    lineas.push(`### ${x.mapaOdooVistas}`, '')
    lineas.push(...tope([...vistas.keys()].sort().map(m => `- ${m}: ${lista(vistas.get(m) ?? [])}`)), '')
  }
  return lineas.length > 0 ? [`## ${x.mapaOdoo}`, '', ...lineas] : []
}

/** Arma el MAPA.md: módulos más conectados y, por carpeta, cada archivo con sus símbolos. */
export function construirMapa(fichas: FichaArchivo[], fecha: string, truncado: boolean, idioma: Idioma = 'es', odoo: FichaOdoo[] = []): string {
  const x = t(idioma)
  const entradas = new Map<string, number>()
  for (const f of fichas) for (const destino of f.imports) entradas.set(destino, (entradas.get(destino) ?? 0) + 1)

  const porBase = new Map(fichas.map(f => [sinExtension(f.ruta), f.ruta]))
  const conectados = [...entradas.entries()]
    .filter(([destino]) => porBase.has(destino))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)

  const carpetas = new Map<string, FichaArchivo[]>()
  for (const f of fichas) {
    const carpeta = f.ruta.includes('/') ? f.ruta.slice(0, f.ruta.lastIndexOf('/')) : '.'
    const lista = carpetas.get(carpeta) ?? []
    lista.push(f)
    carpetas.set(carpeta, lista)
  }

  const lineas: string[] = [`# ${x.mapaTitulo}`, '', x.mapaCabecera(fecha, fichas.length, truncado), x.mapaUso, '']
  if (conectados.length > 0) {
    lineas.push(`## ${x.mapaModulos}`, '')
    for (const [destino, n] of conectados) lineas.push(`- ${porBase.get(destino)} ← ${n}`)
    lineas.push('')
  }
  // Odoo antes de los archivos: dónde se define o se hereda un modelo es lo que más se busca con grep.
  lineas.push(...seccionOdoo(odoo, idioma))
  lineas.push(`## ${x.mapaArchivos}`, '')
  for (const carpeta of [...carpetas.keys()].sort()) {
    const lista = carpetas.get(carpeta) ?? []
    lineas.push(`### ${carpeta}/`)
    for (const f of lista.sort((a, b) => a.ruta.localeCompare(b.ruta))) {
      const nombre = f.ruta.slice(f.ruta.lastIndexOf('/') + 1)
      const visibles = f.simbolos.slice(0, LIMITES_MAPA.maxSimbolos)
      const extra = f.simbolos.length > visibles.length ? `, +${f.simbolos.length - visibles.length}` : ''
      lineas.push(visibles.length > 0 ? `- ${nombre}: ${visibles.join(', ')}${extra}` : `- ${nombre}`)
    }
    lineas.push('')
  }
  return lineas.join('\n')
}

/** ¿Es un comando de búsqueda? (en las versiones nativas, Claude busca con Bash). */
export function esBusqueda(herramienta: string, comando?: string): boolean {
  if (herramienta === 'Grep' || herramienta === 'Glob') return true
  if (herramienta !== 'Bash' || comando === undefined) return false
  return /^\s*(grep|rg|ag|find|fd|git\s+grep)\b/.test(comando)
}

export function avisoMapa(idioma: Idioma = 'es'): string {
  return t(idioma).avisoMapa(RUTA_MAPA)
}
