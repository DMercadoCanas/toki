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

export const LIMITES_MAPA = { maxArchivos: 1500, maxBytes: 150_000, maxSimbolos: 12, maxXml: 3000, maxLineasFramework: 400, maxPorLineaFramework: 6 } as const

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

// ---------- Detectores de framework ----------
// El mapa es genérico; cada framework es un detector que se activa solo si el proyecto tiene su marca
// (Odoo: __manifest__.py; Django: manage.py). Para sumar uno, se agrega a DETECTORES.

export type Hallazgo = { grupo: string; clave: string; valor: string; papel?: 'define' | 'hereda' }
export type FichaFramework = { ruta: string; framework: string; hallazgos: Hallazgo[] }

type Detector = {
  id: string
  nombre: string
  marca: RegExp
  grupos: Record<string, { es: string; en: string }>
  extraer: (ruta: string, texto: string) => Hallazgo[]
}

function cadenas(texto: string): string[] {
  return [...texto.matchAll(/['"]([\w.]+)['"]/g)].map(m => m[1] ?? '')
}

function carpetaDe(ruta: string): string {
  return ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/')) : '.'
}

const ODOO: Detector = {
  id: 'odoo',
  nombre: 'Odoo',
  marca: /(^|\/)__manifest__\.py$/,
  grupos: {
    modulos: { es: 'Módulos y lo que necesitan (depends)', en: 'Modules and what they need (depends)' },
    modelos: { es: 'Modelos: dónde se definen (_name) y dónde se heredan (_inherit)', en: 'Models: where they are defined (_name) and extended (_inherit)' },
    vistas: { es: 'Vistas por modelo (id ← vista que hereda)', en: 'Views by model (id ← view it extends)' },
  },
  extraer(ruta, texto) {
    const h: Hallazgo[] = []
    if (ODOO.marca.test(ruta)) {
      const m = texto.match(/['"]depends['"]\s*:\s*\[([^\]]*)\]/)
      const depends = m ? cadenas(m[1] ?? '') : []
      return [{ grupo: 'modulos', clave: carpetaDe(ruta), valor: depends.join(', ') }]
    }
    if (ruta.endsWith('.py')) {
      // Con _name propio la clase define el modelo (los _inherit son mixins); sin él, o igual al _inherit, lo hereda.
      for (const clase of texto.split(/^class\s/m).slice(1)) {
        const nombre = clase.match(/^\s+_name\s*=\s*['"]([\w.]+)['"]/m)?.[1]
        const herencia = clase.match(/^\s+_inherit\s*=\s*(\[[^\]]*\]|['"][\w.]+['"])/m)?.[1]
        const heredados = herencia !== undefined ? cadenas(herencia) : []
        if (nombre !== undefined && !heredados.includes(nombre)) h.push({ grupo: 'modelos', clave: nombre, valor: ruta, papel: 'define' })
        else for (const n of nombre !== undefined ? [nombre] : heredados) h.push({ grupo: 'modelos', clave: n, valor: ruta, papel: 'hereda' })
      }
    } else if (ruta.endsWith('.xml')) {
      for (const r of texto.matchAll(/<record\b([^>]*)>([\s\S]*?)<\/record>/g)) {
        const atributos = r[1] ?? ''
        const cuerpo = r[2] ?? ''
        if (!/\bmodel=["']ir\.ui\.view["']/.test(atributos)) continue
        const id = atributos.match(/\bid=["']([\w.]+)["']/)?.[1]
        if (id === undefined) continue
        const modelo = cuerpo.match(/<field\s+name=["']model["'][^>]*>\s*([\w.]+)\s*</)?.[1] ?? '?'
        const hereda = cuerpo.match(/<field\s+name=["']inherit_id["'][^>]*\bref=["']([\w.]+)["']/)?.[1]
        h.push({ grupo: 'vistas', clave: modelo, valor: `${id}${hereda !== undefined ? ` ← ${hereda}` : ''} (${ruta})` })
      }
    }
    return h
  },
}

const DJANGO: Detector = {
  id: 'django',
  nombre: 'Django',
  marca: /(^|\/)manage\.py$/,
  grupos: {
    modelos: { es: 'Modelos', en: 'Models' },
    urls: { es: 'URLs con nombre (name ← ruta)', en: 'Named URLs (name ← route)' },
  },
  extraer(ruta, texto) {
    const h: Hallazgo[] = []
    if (!ruta.endsWith('.py')) return h
    for (const m of texto.matchAll(/^class\s+(\w+)\s*\([^)]*\bmodels\.Model\b[^)]*\)/gm)) h.push({ grupo: 'modelos', clave: m[1] ?? '', valor: ruta, papel: 'define' })
    if (/(^|\/)urls\.py$/.test(ruta)) {
      for (const m of texto.matchAll(/\b(?:re_)?path\(\s*r?['"]([^'"]*)['"][^)]*?\bname\s*=\s*['"]([\w:-]+)['"]/g)) {
        h.push({ grupo: 'urls', clave: m[2] ?? '', valor: `/${m[1] ?? ''} (${ruta})` })
      }
    }
    return h
  },
}

const DETECTORES: Detector[] = [ODOO, DJANGO]

/** ¿Lo lee algún detector aunque no sea código? (las vistas .xml de Odoo). */
export function leeDetector(ruta: string): boolean {
  return ruta.endsWith('.xml')
}

/** Lo que cada detector encuentra en un archivo. Solo cuenta si el proyecto tiene la marca del framework. */
export function extraerFrameworks(ruta: string, texto: string): FichaFramework[] {
  const fichas: FichaFramework[] = []
  for (const d of DETECTORES) {
    const hallazgos = d.extraer(ruta, texto).filter(x => x.clave !== '')
    if (hallazgos.length > 0 || d.marca.test(ruta)) fichas.push({ ruta, framework: d.id, hallazgos })
  }
  return fichas
}

function lista(cosas: string[]): string {
  const max = LIMITES_MAPA.maxPorLineaFramework
  return cosas.slice(0, max).join(', ') + (cosas.length > max ? `, +${cosas.length - max}` : '')
}

function seccionesFrameworks(fichas: FichaFramework[], idioma: Idioma): string[] {
  const x = t(idioma)
  const lineas: string[] = []
  for (const d of DETECTORES) {
    const propias = fichas.filter(f => f.framework === d.id)
    if (!propias.some(f => d.marca.test(f.ruta))) continue // Sin la marca, no es ese framework.
    const bloque: string[] = []
    for (const [grupo, titulo] of Object.entries(d.grupos)) {
      const porClave = new Map<string, string[]>()
      for (const f of propias) {
        for (const h of f.hallazgos.filter(h => h.grupo === grupo)) {
          const valor = h.papel === 'define' ? `${x.mapaDefine} ${h.valor}` : h.papel === 'hereda' ? `${x.mapaHereda} ${h.valor}` : h.valor
          const l = porClave.get(h.clave) ?? []
          if (!l.includes(valor)) l.push(valor)
          porClave.set(h.clave, l)
        }
      }
      if (porClave.size === 0) continue
      const filas = [...porClave.keys()].sort().map(c => {
        const valores = (porClave.get(c) ?? []).filter(v => v !== '')
        return valores.length > 0 ? `- ${c}: ${lista(valores)}` : `- ${c}`
      })
      const tope = LIMITES_MAPA.maxLineasFramework
      bloque.push(`### ${titulo[idioma]}`, '', ...filas.slice(0, tope), ...(filas.length > tope ? [`- … +${filas.length - tope}`] : []), '')
    }
    if (bloque.length > 0) lineas.push(`## ${d.nombre}`, '', ...bloque)
  }
  return lineas
}

/** Arma el MAPA.md: módulos más conectados y, por carpeta, cada archivo con sus símbolos. */
export function construirMapa(fichas: FichaArchivo[], fecha: string, truncado: boolean, idioma: Idioma = 'es', frameworks: FichaFramework[] = []): string {
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
  // Los frameworks antes de los archivos: dónde se define o se hereda algo es lo que más se busca con grep.
  lineas.push(...seccionesFrameworks(frameworks, idioma))
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
