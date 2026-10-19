// Mapa del proyecto (idea de Graphify): estructura del código sin usar el LLM,
// para que Claude se oriente sin leer archivos a ciegas. Funciones puras.

export const RUTA_MAPA = '.claude/ahorro-tokens/MAPA.md'

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

export const LIMITES_MAPA = { maxArchivos: 1500, maxBytes: 150_000, maxSimbolos: 12 } as const

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

/** Arma el MAPA.md: módulos más conectados y, por carpeta, cada archivo con sus símbolos. */
export function construirMapa(fichas: FichaArchivo[], fecha: string, truncado: boolean): string {
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

  const lineas: string[] = [
    '# Mapa del proyecto',
    '',
    `Generado por ahorro-tokens el ${fecha}, sin usar el modelo (solo análisis de texto). ${fichas.length} archivos de código${truncado ? ' (recortado: el proyecto es más grande)' : ''}.`,
    'Úsalo para ubicar archivos y símbolos antes de buscar con grep o leer archivos completos. Puede estar desactualizado: confirma leyendo el archivo antes de editar.',
    '',
  ]
  if (conectados.length > 0) {
    lineas.push('## Módulos más usados (importados por más archivos)', '')
    for (const [destino, n] of conectados) lineas.push(`- ${porBase.get(destino)} ← ${n}`)
    lineas.push('')
  }
  lineas.push('## Archivos y símbolos', '')
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

export const AVISO_MAPA =
  `[ahorro-tokens] Hay un mapa del proyecto en ${RUTA_MAPA} con los archivos, sus símbolos y los módulos más usados. ` +
  'Consúltalo para ubicar código antes de buscar o leer archivos completos.'
