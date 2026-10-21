// Búsquedas enormes por la terminal (grep -r, rg, git grep, find, fd): pasados 30 KB, Claude Code recorta la
// salida sin mirar qué hay. Toki entrega un resumen por archivo o carpeta y deja la salida completa en una copia.
// Lógica pura: sin dependencias.

import { formatearTokens, tokensAprox } from './compresor'
import type { Idioma } from './idioma'

export const BUSQUEDA = {
  /** Lo que Claude Code entrega de una salida exitosa: más que esto, recorta. */
  umbral: 30_000,
  archivos: 40,
  conMuestras: 12,
  muestrasPorArchivo: 3,
  largoLinea: 200,
  rutas: 40,
}

export type TipoBusqueda = 'contenido' | 'rutas'

const YA_FILTRADO = /\|\s*(head|tail|grep|rg|awk|sed|jq|less|more|wc|sort|uniq|cut|xargs)\b/

function programa(segmento: string): { nombre: string; args: string[] } {
  const palabras = segmento.trim().split(/\s+/).filter(p => !/^\w+=/.test(p))
  const omitir = new Set(['sudo', 'time', 'env', 'command', 'exec', 'nice'])
  const i = palabras.findIndex(p => !omitir.has(p))
  return { nombre: (palabras[i] ?? '').replace(/^.*\//, ''), args: palabras.slice(i + 1) }
}

/** ¿Es una búsqueda sin filtrar? `cd x && rg foo` cuenta; `rg foo | head` o `rg foo && npm test` no. */
export function tipoBusqueda(comando: string): TipoBusqueda | undefined {
  const texto = comando.trim()
  if (texto.includes('\n') || YA_FILTRADO.test(texto) || /[|;]|\|\||>/.test(texto.replace(/^cd\s+\S+\s*&&\s*/, '').replace(/2>&1|2>\/dev\/null/g, ''))) return undefined
  const segmentos = texto.split('&&').map(s => s.trim()).filter(Boolean)
  if (segmentos.length > 2 || (segmentos.length === 2 && programa(segmentos[0] ?? '').nombre !== 'cd')) return undefined
  const { nombre, args } = programa(segmentos[segmentos.length - 1] ?? '')
  const banderas = args.filter(a => a.startsWith('-')).join(' ')
  const soloRutas = /(^|\s)(-l|-L|--files-with-matches|--files-without-match|--files)\b/.test(banderas)
  if (nombre === 'rg' || nombre === 'ag' || nombre === 'ack') return soloRutas ? 'rutas' : 'contenido'
  if (nombre === 'grep' || nombre === 'egrep' || nombre === 'fgrep') {
    if (!/(^|\s)(-\w*[rR]\w*|--recursive|--dereference-recursive)\b/.test(banderas)) return undefined
    return soloRutas ? 'rutas' : 'contenido'
  }
  if (nombre === 'git' && args[0] === 'grep') return soloRutas ? 'rutas' : 'contenido'
  if (nombre === 'git' && args[0] === 'ls-files') return 'rutas'
  if (nombre === 'find' || nombre === 'fd' || nombre === 'fdfind') return /-exec|-delete|-ok\b/.test(texto) ? undefined : 'rutas'
  return undefined
}

function corta(linea: string): string {
  return linea.length > BUSQUEDA.largoLinea ? `${linea.slice(0, BUSQUEDA.largoLinea)}…` : linea
}

/** `ruta:12:texto` o `ruta:texto`; en Windows la ruta puede empezar con `C:\`. */
function separar(linea: string): { archivo: string; resto: string } | undefined {
  const m = /^((?:[A-Za-z]:[\\/])?[^:\n]+?):(\d+[:-])?(.*)$/.exec(linea)
  if (m === null || m[1] === undefined || /\s{2,}/.test(m[1])) return undefined
  return { archivo: m[1], resto: `${m[2] ?? ''}${m[3] ?? ''}` }
}

const TEXTOS = {
  es: {
    cabecera: (lineas: number, grupos: number, unidad: string, tokens: string, ruta: string) =>
      `[Toki] La búsqueda devolvió ${lineas} líneas en ${grupos} ${unidad} (~${tokens} tokens); Claude Code la habría cortado a ciegas en 30 KB. Va el resumen. La salida completa está en ${ruta}: busca ahí con grep o léela por tramos, o afina la búsqueda (una carpeta, --glob, -l).`,
    archivos: 'archivos',
    carpetas: 'carpetas',
    porArchivo: 'Coincidencias por archivo:',
    porCarpeta: 'Rutas por carpeta:',
    muestras: 'Primeras coincidencias de los archivos con más:',
    primeras: 'Primeras rutas:',
    otros: (n: number, l: number) => `… y ${n} archivos más (${l} líneas)`,
    otrasCarpetas: (n: number, l: number) => `… y ${n} carpetas más (${l} rutas)`,
    sueltas: (n: number) => `${n} líneas sin archivo reconocible (están en la copia).`,
  },
  en: {
    cabecera: (lineas: number, grupos: number, unidad: string, tokens: string, ruta: string) =>
      `[Toki] The search returned ${lineas} lines in ${grupos} ${unidad} (~${tokens} tokens); Claude Code would have cut it blindly at 30 KB. Here is the summary. The full output is in ${ruta}: grep inside it or read it in slices, or narrow the search (one folder, --glob, -l).`,
    archivos: 'files',
    carpetas: 'folders',
    porArchivo: 'Matches per file:',
    porCarpeta: 'Paths per folder:',
    muestras: 'First matches from the files with the most:',
    primeras: 'First paths:',
    otros: (n: number, l: number) => `… and ${n} more files (${l} lines)`,
    otrasCarpetas: (n: number, l: number) => `… and ${n} more folders (${l} paths)`,
    sueltas: (n: number) => `${n} lines with no recognizable file (they are in the copy).`,
  },
}

function contar<T>(items: T[], clave: (x: T) => string): [string, number][] {
  const mapa = new Map<string, number>()
  for (const it of items) mapa.set(clave(it), (mapa.get(clave(it)) ?? 0) + 1)
  return [...mapa.entries()].sort((a, b) => b[1] - a[1])
}

function carpetaDe(ruta: string): string {
  const partes = ruta.replace(/^\.\//, '').split(/[\\/]/).filter(Boolean)
  return partes.length <= 1 ? '.' : partes.slice(0, Math.min(2, partes.length - 1)).join('/')
}

export interface ResumenBusqueda {
  texto: string
  lineas: number
  caracteresAntes: number
  caracteresDespues: number
}

/** Resumen de una búsqueda grande. undefined si es chica o si no se reconoce el formato. */
export function resumirBusqueda(salida: string, tipo: TipoBusqueda, ruta: string, idioma: Idioma = 'es'): ResumenBusqueda | undefined {
  if (salida.length <= BUSQUEDA.umbral) return undefined
  const x = TEXTOS[idioma]
  const todas = salida.split('\n').filter(l => l.trim() !== '' && l !== '--')
  const tokens = formatearTokens(tokensAprox(salida.length))
  const partes: string[] = []
  if (tipo === 'contenido') {
    const separadas = todas.map(separar)
    const validas = separadas.filter((s): s is { archivo: string; resto: string } => s !== undefined)
    // Un solo archivo (`grep -r foo archivo`) o un formato desconocido: no hay nada que agrupar.
    if (validas.length < todas.length * 0.8) return undefined
    const porArchivo = contar(validas, s => s.archivo)
    if (porArchivo.length < 2) return undefined
    partes.push(x.cabecera(todas.length, porArchivo.length, x.archivos, tokens, ruta), '', x.porArchivo)
    for (const [archivo, n] of porArchivo.slice(0, BUSQUEDA.archivos)) partes.push(`${String(n).padStart(6)}  ${archivo}`)
    const resto = porArchivo.slice(BUSQUEDA.archivos)
    if (resto.length > 0) partes.push(x.otros(resto.length, resto.reduce((a, [, n]) => a + n, 0)))
    partes.push('', x.muestras)
    for (const [archivo] of porArchivo.slice(0, BUSQUEDA.conMuestras)) {
      const muestras = validas.filter(s => s.archivo === archivo).slice(0, BUSQUEDA.muestrasPorArchivo)
      partes.push(archivo, ...muestras.map(s => `  ${corta(s.resto.trim())}`))
    }
    if (validas.length < todas.length) partes.push('', x.sueltas(todas.length - validas.length))
  } else {
    const porCarpeta = contar(todas, carpetaDe)
    partes.push(x.cabecera(todas.length, porCarpeta.length, x.carpetas, tokens, ruta), '', x.porCarpeta)
    for (const [carpeta, n] of porCarpeta.slice(0, BUSQUEDA.archivos)) partes.push(`${String(n).padStart(6)}  ${carpeta}/`)
    const resto = porCarpeta.slice(BUSQUEDA.archivos)
    if (resto.length > 0) partes.push(x.otrasCarpetas(resto.length, resto.reduce((a, [, n]) => a + n, 0)))
    partes.push('', x.primeras, ...todas.slice(0, BUSQUEDA.rutas).map(corta))
  }
  const texto = partes.join('\n')
  if (texto.length >= Math.min(salida.length, BUSQUEDA.umbral) * 0.6) return undefined
  return { texto, lineas: todas.length, caracteresAntes: salida.length, caracteresDespues: texto.length }
}
