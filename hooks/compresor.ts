// Compresor de salidas de comandos.
// Ideas tomadas de RTK (filtros por familia de comando, agrupar repetidas)
// y de Token Optimizer (archivar el original, conservar cada error y el final).
// Funciones puras: sin $, sin archivos. Se prueban en tests/compresor.test.ts.

/** Límites. Por debajo de esto, la salida se deja intacta (calidad primero). */
export const LIMITES = {
  minLineas: 60,
  minCaracteres: 4000,
  cabeza: 15,
  cola: 40,
  contextoAntes: 2,
  contextoDespues: 6,
  maxLineasConservadas: 220,
  /** Solo se compacta si el resultado queda en menos de esta fracción del original. */
  fraccionMaxima: 0.7,
} as const

const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g

/** Quita colores ANSI y deja solo el último estado de las barras de progreso (\r). */
export function limpiar(salida: string): string[] {
  return salida
    .replace(ANSI, '')
    .split('\n')
    .map(linea => {
      const sinFinal = linea.replace(/\r+$/, '')
      const corte = sinFinal.lastIndexOf('\r')
      return (corte >= 0 ? sinFinal.slice(corte + 1) : sinFinal).replace(/\s+$/, '')
    })
}

// Familias de comandos ruidosos: tests, builds, instalaciones, linters, logs, listados.
const RUIDOSOS: RegExp[] = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|install|ci|add|lint|typecheck|check|i)\b/,
  /\b(npx|bunx|pnpm\s+(dlx|exec)|yarn\s+dlx)\s+(jest|vitest|mocha|playwright|cypress|tsc|eslint|prettier|webpack|vite|next|nuxt|astro|turbo|nx|biome)\b/,
  /(^|[\s;&|(])(jest|vitest|mocha|playwright|cypress|tsc|eslint|webpack|turbo|nx|biome)\b/,
  /(^|[\s;&|(])(pytest|tox|nox|mypy|ruff|flake8|pylint)\b/,
  /\bpython3?\s+-m\s+(pytest|unittest|pip|mypy)\b/,
  /\bpip3?\s+install\b/,
  /\buv\s+(pip|sync|add)\b/,
  /\bpoetry\s+(install|add|update)\b/,
  /\bgo\s+(test|build|vet|mod\s+(download|tidy))\b/,
  /\bgolangci-lint\b/,
  /\bcargo\s+(test|build|check|clippy|install)\b/,
  /(^|[\s;&|(])(\.\/)?(mvn|mvnw|gradle|gradlew)\b/,
  /\bdotnet\s+(test|build|restore)\b/,
  /(^|[\s;&|(])(make|cmake|ninja|bazel)\b/,
  /\b(rspec|phpunit)\b/,
  /\b(bundle|composer)\s+install\b/,
  /\bdocker(\s+compose|-compose)?\s+(build|pull|logs|up)\b/,
  /\bkubectl\s+logs\b/,
  /\bjournalctl\b/,
  /\bgit\s+log\b/,
  /(^|[\s;&|(])(find|tree|du)\b/,
  /(^|[\s;&|(])ls\s+(-\w*R|--recursive)/,
  /\bbrew\s+(install|upgrade)\b/,
  /\bapt(-get)?\s+install\b/,
]

// Comandos cuyo contenido exacto importa: nunca se tocan.
const LECTORES = /^(cat|head|tail|sed|awk|less|more|bat|jq|yq|nl|od|xxd|base64|diff|cmp|grep|rg|ag|echo|printf)$/
const CONTENIDO_EXACTO = /\bgit\s+(diff|show|blame)\b|\bgit\s+log\b[^|;&]*\s(-p|--patch)\b/
// Si la persona (o Claude) ya filtró la salida, se respeta.
const YA_FILTRADO = /\|\s*(head|tail|grep|rg|awk|sed|jq|less|more|wc|sort|uniq|cut)\b/

function primerPrograma(segmento: string): string {
  const palabras = segmento.trim().split(/\s+/).filter(p => !/^\w+=/.test(p))
  const omitir = new Set(['sudo', 'time', 'env', 'command', 'exec', 'nice'])
  const programa = palabras.find(p => !omitir.has(p)) ?? ''
  return programa.replace(/^.*\//, '')
}

/** ¿Vale la pena compactar la salida de este comando? */
export function esCompactable(comando: string): boolean {
  if (YA_FILTRADO.test(comando) || CONTENIDO_EXACTO.test(comando)) return false
  const segmentos = comando.split(/&&|\|\||;|\|/).map(s => s.trim()).filter(Boolean)
  const ultimo = segmentos[segmentos.length - 1] ?? ''
  if (LECTORES.test(primerPrograma(ultimo))) return false
  return RUIDOSOS.some(patron => patron.test(comando))
}

const IMPORTANTE =
  /\b(errors?|err!|fail(ed|ing|ures?)?|exception|traceback|panic(ked)?|fatal|warn(ing|ings)?|deprecated|assert(ion)?(error)?|expected|received|undefined reference|cannot|could not|not found|denied|refused|timed? ?out|segmentation)\b|[✕✗✖❌⚠]|\bFAIL\b|\bERROR\b/i

export function esImportante(linea: string): boolean {
  return IMPORTANTE.test(linea)
}

type Item = { texto: string; repeticiones: number; parecidas: number; ultima?: string }

/** Clave para detectar líneas "parecidas": mismos textos, distintos números. */
function clave(linea: string): string {
  return linea.replace(/0x[0-9a-f]+/gi, '#').replace(/\d+(\.\d+)?/g, '#').trim()
}

/** Agrupa repetidas exactas (×N) y rachas de líneas parecidas (progreso, descargas). */
export function agrupar(lineas: string[]): Item[] {
  const items: Item[] = []
  for (const linea of lineas) {
    const anterior = items[items.length - 1]
    if (anterior && anterior.parecidas === 0 && anterior.texto === linea) {
      anterior.repeticiones += 1
      continue
    }
    const base = anterior?.ultima ?? anterior?.texto
    if (
      anterior &&
      anterior.repeticiones === 1 &&
      linea.trim() !== '' &&
      !esImportante(linea) &&
      base !== undefined &&
      clave(base) === clave(linea) &&
      /\d/.test(linea)
    ) {
      anterior.parecidas += 1
      anterior.ultima = linea
      continue
    }
    items.push({ texto: linea, repeticiones: 1, parecidas: 0 })
  }
  return items
}

function renderItem(item: Item): string[] {
  if (item.repeticiones > 1 && item.texto.trim() === '') return ['']
  if (item.repeticiones > 1) return [`${item.texto}  [×${item.repeticiones}]`]
  if (item.parecidas === 0) return [item.texto]
  if (item.parecidas === 1) return [item.texto, item.ultima ?? '']
  return [item.texto, `  … [${item.parecidas - 1} líneas parecidas] …`, item.ultima ?? '']
}

export type Compactado = {
  texto: string
  lineasAntes: number
  lineasDespues: number
  caracteresAntes: number
  caracteresDespues: number
}

/** Elige qué conservar: cabeza, cola y cada línea importante con su contexto. */
function seleccionar(items: Item[]): Set<number> {
  const conservar = new Set<number>()
  const n = items.length
  for (let i = 0; i < Math.min(LIMITES.cabeza, n); i++) conservar.add(i)
  for (let i = Math.max(0, n - LIMITES.cola); i < n; i++) conservar.add(i)

  const importantes: number[] = []
  items.forEach((item, i) => {
    if (esImportante(item.texto) || (item.ultima !== undefined && esImportante(item.ultima))) importantes.push(i)
  })

  let conContexto = new Set<number>(conservar)
  for (const i of importantes) {
    for (let j = Math.max(0, i - LIMITES.contextoAntes); j <= Math.min(n - 1, i + LIMITES.contextoDespues); j++) {
      conContexto.add(j)
    }
  }
  if (conContexto.size <= LIMITES.maxLineasConservadas) return conContexto

  // Demasiados errores: primero sin contexto, y si aún sobra, los primeros y los últimos.
  conContexto = new Set<number>(conservar)
  importantes.forEach(i => conContexto.add(i))
  if (conContexto.size <= LIMITES.maxLineasConservadas) return conContexto

  const cupo = Math.max(0, LIMITES.maxLineasConservadas - conservar.size)
  const primeros = importantes.slice(0, Math.ceil(cupo / 2))
  const ultimos = importantes.slice(importantes.length - Math.floor(cupo / 2))
  const recorte = new Set<number>(conservar)
  for (const i of [...primeros, ...ultimos]) recorte.add(i)
  return recorte
}

/**
 * Compacta una salida larga. Devuelve null si no vale la pena
 * (salida corta, o el ahorro sería menor al 30%).
 */
export function compactar(salida: string): Compactado | null {
  const lineas = limpiar(salida)
  while (lineas.length > 0 && lineas[lineas.length - 1] === '') lineas.pop()
  if (lineas.length < LIMITES.minLineas && salida.length < LIMITES.minCaracteres) return null

  const items = agrupar(lineas)
  const elegidos = seleccionar(items)

  const salidaLineas: string[] = []
  let omitidas = 0
  items.forEach((item, i) => {
    if (elegidos.has(i)) {
      if (omitidas > 0) {
        salidaLineas.push(`  … [${omitidas} líneas omitidas] …`)
        omitidas = 0
      }
      salidaLineas.push(...renderItem(item))
    } else {
      omitidas += item.repeticiones + item.parecidas
    }
  })
  if (omitidas > 0) salidaLineas.push(`  … [${omitidas} líneas omitidas] …`)

  const texto = salidaLineas.join('\n')
  if (texto.length > salida.length * LIMITES.fraccionMaxima) return null
  return {
    texto,
    lineasAntes: lineas.length,
    lineasDespues: salidaLineas.length,
    caracteresAntes: salida.length,
    caracteresDespues: texto.length,
  }
}

/**
 * Prepara la captura completa de la salida (Claude Code recorta a la mitad las
 * salidas largas de los comandos que fallan, y ahí suele estar el error).
 * Separa un `cd carpeta &&` inicial para que el cambio de carpeta siga valiendo,
 * y rechaza comandos en segundo plano o que cambian el estado del shell.
 */
export function separarComando(comando: string): { prefijo: string; cuerpo: string } | undefined {
  const texto = comando.trim()
  if (texto === '' || /(^|[^&])&\s*$/.test(texto)) return undefined
  const cd = texto.match(/^(cd\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*&&\s*)([\s\S]+)$/)
  const prefijo = cd?.[1] ?? ''
  const cuerpo = cd?.[2] ?? texto
  if (/(^|[;&|(]\s*|\n\s*)(cd|pushd|popd|export|source|alias|unalias|unset|set|shopt|ulimit|umask|\.)(\s|$)/.test(cuerpo)) {
    return undefined
  }
  return { prefijo, cuerpo }
}

/** Comillas simples seguras para el shell. */
export function citar(texto: string): string {
  return `'${texto.replace(/'/g, `'\\''`)}'`
}

/** El comando envuelto: misma salida en vivo, mismo código de salida, copia completa en `ruta`. */
export function envolver(prefijo: string, cuerpo: string, ruta: string): string {
  return `${prefijo}( set -o pipefail; { ${cuerpo}\n} 2>&1 | tee ${citar(ruta)} )`
}

/** Estimación de tokens: ~4 caracteres por token. Siempre se muestra como aproximada. */
export function tokensAprox(caracteres: number): number {
  return Math.max(0, Math.round(caracteres / 4))
}

export function formatearTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return String(tokens)
}

/** Encabezado honesto: Claude sabe que la salida fue compactada y dónde está el original. */
export function encabezado(c: Compactado, rutaOriginal: string): string {
  const ahorro = formatearTokens(tokensAprox(c.caracteresAntes - c.caracteresDespues))
  return (
    `[ahorro-tokens] Salida compactada: ${c.lineasAntes} → ${c.lineasDespues} líneas (~${ahorro} tokens menos). ` +
    `Se conservaron errores, advertencias, el inicio y el final. Original completo: ${rutaOriginal}`
  )
}
