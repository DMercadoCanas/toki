// Compresor de salidas de comandos.
// Ideas tomadas de RTK (filtros por familia de comando, agrupar repetidas)
// y de Token Optimizer (archivar el original, conservar cada error y el final).
// Funciones puras: sin $, sin archivos. Se prueban en tests/compresor.test.ts.

import { t } from './idioma'
import type { Idioma } from './idioma'

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
  /\b(npm|pnpm|yarn|bun)\s+run\s+(?!(dev|start|serve|watch|preview)\b)[\w:.-]+/,
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
  // Móvil: Flutter, Dart, iOS, Android
  /\bflutter\s+(test|build|analyze|run|pub\s+(get|upgrade|outdated)|doctor|clean|drive)\b/,
  /\bdart\s+(test|analyze|pub\s+(get|upgrade)|run\s+build_runner|format|fix)\b/,
  /\bxcodebuild\b/,
  /\bpod\s+(install|update)\b/,
  /\bswift\s+(build|test|package)\b/,
  /\bfastlane\b/,
  /\badb\s+logcat\b/,
  /\bxcrun\s+simctl\b/,
]

// Comandos cuyo contenido exacto importa: nunca se tocan.
const LECTORES = /^(cat|head|tail|sed|awk|less|more|bat|jq|yq|nl|od|xxd|base64|diff|cmp|grep|rg|ag|echo|printf)$/
// Estos leen contenido exacto en cualquier parte del comando (`npm test && cat x`, `cat x || find .`).
const LECTORES_EN_CUALQUIER_PARTE = /^(cat|head|sed|awk|less|more|bat|jq|yq|nl|od|xxd|base64|diff|cmp|grep|rg|ag)$/
// Lo mismo en PowerShell (no distingue mayúsculas).
const LECTORES_PS = /^(get-content|gc|type|select-string|sls|format-hex|write-output|write-host)$/i
const CONTENIDO_EXACTO = /\bgit\s+(diff|show|blame)\b|\bgit\s+log\b[^|;&]*\s(-p|--patch)\b/
// Si la persona (o Claude) ya filtró la salida, se respeta.
const YA_FILTRADO = /\|\s*(head|tail|grep|rg|awk|sed|jq|less|more|wc|sort|uniq|cut)\b|\|\s*(select-object|select|select-string|sls|where-object|where|measure-object|sort-object|group-object|out-string|format-table|ft)\b/i

function primerPrograma(segmento: string): string {
  const palabras = segmento.trim().split(/\s+/).filter(p => !/^\w+=/.test(p))
  const omitir = new Set(['sudo', 'time', 'env', 'command', 'exec', 'nice'])
  const programa = (palabras.find(p => !omitir.has(p.replace(/^[({]+/, ''))) ?? '').replace(/^[({]+/, '')
  return programa.replace(/^.*\//, '')
}

/** ¿Vale la pena compactar la salida de este comando? Devuelve el motivo si no. */
export function porQueNoCompactable(comando: string): 'filtrado' | 'lector' | 'familia' | undefined {
  if (YA_FILTRADO.test(comando)) return 'filtrado'
  if (CONTENIDO_EXACTO.test(comando)) return 'lector'
  // Se ignoran los `echo` finales que Claude agrega (p. ej. `; echo "EXIT_CODE=$?"`).
  const segmentos = comando.split(/&&|\|\||;|\|/).map(s => s.trim()).filter(Boolean)
  while (segmentos.length > 1 && /^(echo|printf|write-output|write-host)$/i.test(primerPrograma(segmentos[segmentos.length - 1] ?? ''))) segmentos.pop()
  const ultimo = segmentos[segmentos.length - 1] ?? ''
  if (LECTORES.test(primerPrograma(ultimo)) || LECTORES_PS.test(primerPrograma(ultimo))) return 'lector'
  if (segmentos.some(s => LECTORES_EN_CUALQUIER_PARTE.test(primerPrograma(s)) || LECTORES_PS.test(primerPrograma(s)))) return 'lector'
  return RUIDOSOS.some(patron => patron.test(comando)) ? undefined : 'familia'
}

export function esCompactable(comando: string): boolean {
  return porQueNoCompactable(comando) === undefined
}

/** ¿Es de una familia ruidosa (tests, builds, instalaciones…), filtre o no su salida? */
export function esRuidoso(comando: string): boolean {
  return RUIDOSOS.some(patron => patron.test(comando))
}

const IMPORTANTE =
  /\b(errors?|err!|fail(ed|ing|ures?)?|exception|traceback|panic(ked)?|fatal|warn(ing|ings)?|deprecated|assert(ion)?(error)?|expected|received|undefined reference|cannot|could not|not found|denied|refused|timed? ?out|segmentation)\b|[✕✗✖❌⚠]|\bFAIL\b|\bERROR\b/i

// La marca que deja Claude Code cuando recorta una salida: `... [16582 characters truncated] ...`.
const MARCA_RECORTE = /^\.\.\. \[(\d+) characters truncated\] \.\.\.$/

/** Cuántos caracteres recortó Claude Code antes de que Toki viera la salida. */
export function caracteresRecortados(texto: string): number {
  let total = 0
  for (const linea of texto.split('\n')) {
    const m = linea.trim().match(MARCA_RECORTE)
    if (m) total += Number(m[1])
  }
  return total
}

/** Errores, advertencias y la marca de recorte de Claude Code: nunca se omiten. */
export function esImportante(linea: string): boolean {
  return IMPORTANTE.test(linea) || MARCA_RECORTE.test(linea.trim())
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

function renderItem(item: Item, idioma: Idioma): string[] {
  if (item.repeticiones > 1 && item.texto.trim() === '') return ['']
  if (item.repeticiones > 1) return [`${item.texto}  [×${item.repeticiones}]`]
  if (item.parecidas === 0) return [item.texto]
  if (item.parecidas === 1) return [item.texto, item.ultima ?? '']
  return [item.texto, t(idioma).lineasParecidas(item.parecidas - 1), item.ultima ?? '']
}

export type Compactado = {
  texto: string
  lineasAntes: number
  lineasDespues: number
  caracteresAntes: number
  caracteresDespues: number
  /** Líneas con errores o advertencias que no cupieron (solo cuando hay cientos). */
  importantesOmitidas: number
  /** Caracteres que Claude Code ya había recortado antes de que Toki viera la salida. */
  recortadoAntes: number
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
export function compactar(salida: string, idioma: Idioma = 'es'): Compactado | null {
  const lineas = limpiar(salida)
  while (lineas.length > 0 && lineas[lineas.length - 1] === '') lineas.pop()
  if (esCorta(salida)) return null

  const items = agrupar(lineas)
  const elegidos = seleccionar(items)

  const salidaLineas: string[] = []
  let omitidas = 0
  items.forEach((item, i) => {
    if (elegidos.has(i)) {
      if (omitidas > 0) {
        salidaLineas.push(t(idioma).lineasOmitidas(omitidas))
        omitidas = 0
      }
      salidaLineas.push(...renderItem(item, idioma))
    } else {
      omitidas += item.repeticiones + item.parecidas
    }
  })
  if (omitidas > 0) salidaLineas.push(t(idioma).lineasOmitidas(omitidas))

  const texto = salidaLineas.join('\n')
  if (texto.length > salida.length * LIMITES.fraccionMaxima) return null
  const importantesOmitidas = items.filter((item, i) => !elegidos.has(i) && (esImportante(item.texto) || (item.ultima !== undefined && esImportante(item.ultima)))).length
  return {
    texto,
    lineasAntes: lineas.length,
    lineasDespues: salidaLineas.length,
    caracteresAntes: salida.length,
    caracteresDespues: texto.length,
    importantesOmitidas,
    recortadoAntes: caracteresRecortados(salida),
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

// ---------- PowerShell (Windows sin Git Bash) ----------

const PREFIJO_PS = /^((?:cd|set-location|sl|chdir|push-location|pushd)\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:;|&&)\s*)([\s\S]+)$/i

/** Un comando de PowerShell simple (con un `cd carpeta;` opcional al inicio) que se puede envolver. */
export function separarComandoPs(comando: string): { prefijo: string; cuerpo: string } | undefined {
  const texto = comando.trim()
  if (texto === '' || /[\n`]/.test(texto) || /&\s*$/.test(texto)) return undefined
  const m = texto.match(PREFIJO_PS)
  const prefijo = m?.[1] ?? ''
  const cuerpo = (m?.[2] ?? texto).trim()
  if (/[;|]|&&/.test(cuerpo) || cuerpo.startsWith('$') || /^[.&]\s/.test(cuerpo)) return undefined
  return { prefijo, cuerpo }
}

/** Comillas simples de PowerShell: una comilla se escribe doble. */
export function citarPs(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`
}

/** Mismo comando, mismo código de salida; además, la copia completa en `ruta` (Tee-Object). */
export function envolverPs(prefijo: string, cuerpo: string, ruta: string): string {
  const redireccion = /\s2>&1\s*$/.test(cuerpo) ? '' : ' 2>&1'
  return `${prefijo}${cuerpo}${redireccion} | Tee-Object -FilePath ${citarPs(ruta)} # Toki: guarda una copia completa de la salida`
}

/** Separa un `| Select-Object -Last N` final, el `| tail` de PowerShell. */
export function separarSelectLast(comando: string): { base: string; filtro: string } | undefined {
  const texto = comando.trim()
  if (/[\n`]/.test(texto)) return undefined
  const m = texto.match(/^(.+?)\s*\|\s*((?:select-object|select)\s+-last\s+\d+)\s*$/i)
  if (m === null) return undefined
  return { base: m[1] ?? '', filtro: m[2] ?? '' }
}

/** Mismo comando y mismo corte; además, la copia completa en `ruta`. */
export function envolverRescatePs(prefijo: string, cuerpo: string, filtro: string, ruta: string): string {
  return `${prefijo}${cuerpo} | Tee-Object -FilePath ${citarPs(ruta)} | ${filtro} # Toki: guarda una copia completa de la salida`
}

/** Windows PowerShell 5.1 guarda las copias en UTF-16: se pasan a texto. */
export function decodificarUtf16(bytes: Uint8Array): string {
  const partes: string[] = []
  let i = bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0
  while (i + 1 < bytes.length) {
    const fin = Math.min(bytes.length - 1, i + 16_384)
    const codigos: number[] = []
    for (; i < fin; i += 2) codigos.push((bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8))
    partes.push(String.fromCharCode(...codigos))
  }
  return partes.join('')
}

const ALFABETO_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function bytesDeBase64(b64: string): Uint8Array {
  const limpio = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const salida = new Uint8Array(Math.floor((limpio.length * 3) / 4))
  let j = 0
  for (let i = 0; i + 1 < limpio.length; i += 4) {
    const a = ALFABETO_B64.indexOf(limpio[i] ?? 'A')
    const b = ALFABETO_B64.indexOf(limpio[i + 1] ?? 'A')
    const c = i + 2 < limpio.length ? ALFABETO_B64.indexOf(limpio[i + 2] ?? 'A') : -1
    const d = i + 3 < limpio.length ? ALFABETO_B64.indexOf(limpio[i + 3] ?? 'A') : -1
    salida[j++] = (a << 2) | (b >> 4)
    if (c >= 0) salida[j++] = ((b & 15) << 4) | (c >> 2)
    if (d >= 0) salida[j++] = ((c & 3) << 6) | d
  }
  return salida.slice(0, j)
}

/** Comillas simples seguras para el shell. */
export function citar(texto: string): string {
  return `'${texto.replace(/'/g, `'\\''`)}'`
}

/** El comando envuelto: misma salida en vivo, mismo código de salida, copia completa en `ruta`. */
export function envolver(prefijo: string, cuerpo: string, ruta: string): string {
  return `${prefijo}( set -o pipefail; { ${cuerpo}\n} 2>&1 | tee ${citar(ruta)} ) # Toki: guarda una copia completa de la salida`
}

// ---------- Rescate: lo que un `| tail` deja fuera ----------
// Claude suele cortar la salida de los tests con `| tail -n 80`, y el fallo
// queda en medio, fuera del corte: luego tiene que volver a correr todo para
// encontrarlo. Toki guarda la salida completa en el camino y le agrega solo los
// errores que el corte escondió.

const ERROR_GRAVE =
  /\b(errors?|err!|fail(ed|ing|ure|ures)?|exception|traceback|panic(ked)?|fatal|assert(ion)?(error)?|segmentation fault|undefined reference)\b|[✕✗✖❌]|\bFAIL\b|\bERROR\b/i
const EXITO = /^\s*(✓|✔|√|PASS\b|ok\s|passed\b)/i

/** Una línea de error de verdad (no un test que pasó y se llama "maneja errores"). */
export function esError(linea: string): boolean {
  return ERROR_GRAVE.test(linea) && !EXITO.test(linea)
}

/** Separa un `| tail` final: `npm test 2>&1 | tail -n 80` → base y filtro. Solo un filtro, sin `tail -f`. */
export function separarTail(comando: string): { base: string; filtro: string } | undefined {
  const texto = comando.trim()
  if (texto.includes('\n')) return undefined
  const m = texto.match(/^(.+?)\s*\|\s*(tail(?:\s+-n\s*\d+|\s+-\d+|\s+--lines=\d+)?)\s*$/)
  if (m === null) return undefined
  const base = m[1] ?? ''
  const filtro = m[2] ?? ''
  if (base.includes('|') || /&\s*$/.test(base)) return undefined
  return { base, filtro }
}

/**
 * Mismo comando, mismo corte, mismo código de salida; además, la copia completa en `ruta`.
 * Va entre llaves: así los permisos de Claude Code lo ven igual que el original.
 */
export function envolverRescate(prefijo: string, cuerpo: string, filtro: string, ruta: string): string {
  return `${prefijo}{ ${cuerpo} | tee ${citar(ruta)}; } | ${filtro} # Toki: guarda una copia completa de la salida`
}

export type Rescate = { texto: string[]; errores: number; incluidos: number; total: number }

/** Los errores de la salida completa que no llegaron en lo entregado, con un poco de contexto. */
export function rescatarErrores(completa: string, entregado: string, maxLineas = 40): Rescate | undefined {
  const lineas = limpiar(completa)
  while (lineas.length > 0 && lineas[lineas.length - 1] === '') lineas.pop()
  const vistas = new Set(limpiar(entregado).map(l => l.trim()).filter(l => l !== ''))
  const errores: number[] = []
  lineas.forEach((l, i) => {
    if (esError(l) && !vistas.has(l.trim())) errores.push(i)
  })
  if (errores.length === 0) return undefined
  const elegidas = new Set<number>()
  let incluidos = 0
  for (const i of errores) {
    const nuevas: number[] = []
    for (let j = Math.max(0, i - 2); j <= Math.min(lineas.length - 1, i + 3); j++) {
      if (!elegidas.has(j) && (j === i || !vistas.has((lineas[j] ?? '').trim()))) nuevas.push(j)
    }
    if (elegidas.size + nuevas.length > maxLineas) break
    for (const j of nuevas) elegidas.add(j)
    incluidos += 1
  }
  const texto: string[] = []
  let anterior = -1
  for (const j of [...elegidas].sort((a, b) => a - b)) {
    if (anterior >= 0 && j > anterior + 1) texto.push('  …')
    const linea = lineas[j] ?? ''
    texto.push(linea.length > 400 ? `${linea.slice(0, 399)}…` : linea)
    anterior = j
  }
  return { texto, errores: errores.length, incluidos, total: lineas.length }
}

/** Salidas cortas: se dejan intactas. */
export function esCorta(salida: string): boolean {
  const lineas = limpiar(salida)
  while (lineas.length > 0 && lineas[lineas.length - 1] === '') lineas.pop()
  return lineas.length < LIMITES.minLineas && salida.length < LIMITES.minCaracteres
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

/** Encabezado honesto: Claude sabe que la salida fue compactada y dónde está la copia. */
export function encabezado(c: Compactado, rutaOriginal: string, copiaCompleta = true, tokensAhorrados?: number, idioma: Idioma = 'es'): string {
  const x = t(idioma)
  const ahorro = tokensAhorrados ?? tokensAprox(c.caracteresAntes - c.caracteresDespues)
  const kb = (n: number) => `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB`
  const copia = copiaCompleta ? x.copiaCompleta(rutaOriginal) : x.copiaParcial(kb(c.caracteresAntes), rutaOriginal)
  // Si Claude Code ya había recortado la salida, Toki no puede prometer que están todos los errores.
  const conservado = !copiaCompleta && c.recortadoAntes > 0 ? x.recortadoAntes(kb(c.recortadoAntes)) : x.conservado(c.importantesOmitidas)
  return x.encabezado(kb(c.caracteresAntes), kb(c.caracteresDespues), c.lineasAntes, c.lineasDespues, ahorro > 0 ? formatearTokens(ahorro) : undefined, conservado, copia)
}
