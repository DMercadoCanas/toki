/**
 * Familias de comandos: lo que Toki aprende cuando Claude abre la copia completa de una salida
 * compactada, y las salidas largas que nunca pasaron por Toki (al estilo de `rtk discover`).
 *
 * - Una familia es el programa y su subcomando (`npm test`, `cargo build`, `terraform plan`), sin
 *   importar la carpeta, las variables ni el lanzador (`npx`, `uv run`, `python -m`).
 * - Si Claude abre la copia de una familia, la próxima vez Toki guarda más contexto. Si aun así la
 *   lee entera dos veces, esa familia va entera un mes. Quince compactaciones seguidas sin abrir la
 *   copia la devuelven a lo normal.
 * - Las salidas largas de comandos que Toki no conoce se anotan con lo que habría ahorrado:
 *   /toki-por-que las lista y, con tu OK, las compacta también.
 *
 * Todo aquí es puro: sin `$`, para probarlo sin Claude Code.
 */

import type { Idioma } from './idioma'

const DIA = 86_400_000

// ---------- La familia de un comando ----------

/** Lo que va antes del programa sin cambiarlo: `sudo`, `time`, `env`, `timeout 60`. */
const ENVOLTORIOS = new Set(['sudo', 'time', 'env', 'command', 'exec', 'nice', 'nohup', 'timeout', 'stdbuf', 'caffeinate'])
/** Lanzadores: la familia es el programa que lanzan (`npx jest` → jest). */
const LANZADORES = new Set(['npx', 'bunx', 'pnpx', 'uvx'])
const LANZADORES_CON_SUB: Record<string, readonly string[]> = {
  npm: ['exec'],
  pnpm: ['dlx', 'exec'],
  yarn: ['dlx', 'exec'],
  bun: ['x'],
  uv: ['run'],
  poetry: ['run'],
  pipenv: ['run'],
  pdm: ['run'],
  hatch: ['run'],
  pipx: ['run'],
  bundle: ['exec'],
}
/** Opciones de un lanzador que llevan valor: `npx -p typescript tsc`. */
const OPCIONES_CON_VALOR = new Set(['-p', '--package', '--from', '--with'])
/** Intérpretes: la familia es el módulo o el script (`python -m pytest` → pytest, `node build.js` → build.js). */
const INTERPRETES = /^(python[\d.]*|py|pypy[\d.]*|node|nodejs|ruby|perl|php|bash|sh|zsh|tsx|ts-node)$/
/** Subcomandos que agrupan: la familia lleva también la palabra siguiente (`npm run build`, `docker compose up`). */
const AGRUPADORES = new Set(['run', 'compose', 'pip', 'mod', 'pub'])
/** Lo que Claude agrega al final y no es el comando: `; echo "EXIT=$?"`. */
const FINALES = /^(echo|printf|true|false|exit|cd|write-output|write-host|:)$/
/** Un subcomando: una palabra simple, sin rutas ni archivos. */
const PALABRA = /^[a-z][a-z0-9:_-]{0,23}$/

/** El nombre de un programa: sin comillas, carpeta, versión (`typescript@5`) ni extensión de Windows. */
function nombre(palabra: string): string {
  const base = palabra.replace(/^["'({]+|["')}]+$/g, '').split(/[\\/]/).pop() ?? ''
  return base.replace(/(.)@.*$/, '$1').replace(/\.(exe|cmd|bat)$/i, '').toLowerCase()
}

/** Sin `VAR=valor` ni envoltorios (con sus opciones y la duración de `timeout`). */
function sinEnvoltorios(palabras: string[]): string[] {
  let i = 0
  while (i < palabras.length) {
    const p = palabras[i] ?? ''
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(p)) i += 1
    else if (ENVOLTORIOS.has(nombre(p))) {
      i += 1
      while (i < palabras.length && /^(-|\d+(\.\d+)?[smhd]?$)/.test(palabras[i] ?? '')) i += 1
    } else break
  }
  return palabras.slice(i)
}

/**
 * La familia de un comando: el programa y su subcomando, del último comando de la línea
 * (`cd app && npm test` → npm test; `CI=1 npx jest --ci` → jest; `python -m pytest -x` → pytest).
 */
export function familiaDeComando(comando: string): string {
  const segmentos = comando.split(/&&|\|\||;|\n/).map(s => s.trim()).filter(Boolean)
  while (segmentos.length > 1 && FINALES.test(nombre((segmentos[segmentos.length - 1] ?? '').split(/\s+/)[0] ?? ''))) segmentos.pop()
  // En una tubería, el que produce la salida: `npm test 2>&1 | tee log` → npm test.
  const productor = (segmentos[segmentos.length - 1] ?? '').split('|')[0] ?? ''
  let palabras = sinEnvoltorios(productor.trim().split(/\s+/).filter(p => p !== '' && !/^(\d*|&)[<>]/.test(p)))
  let programa = nombre(palabras[0] ?? '')
  // Lanzadores: `npx jest`, `pnpm dlx vitest`, `uv run pytest`.
  const dobles = LANZADORES_CON_SUB[programa]
  const lanza = LANZADORES.has(programa) ? 1 : dobles?.includes((palabras[1] ?? '').toLowerCase()) ? 2 : 0
  if (lanza > 0) {
    let i = lanza
    while (i < palabras.length && (palabras[i] ?? '').startsWith('-')) i += OPCIONES_CON_VALOR.has(palabras[i] ?? '') ? 2 : 1
    palabras = palabras.slice(i)
    programa = nombre(palabras[0] ?? '')
  }
  // Intérpretes: `python -m pytest`, `bash -c '…'`, `python manage.py test`.
  if (INTERPRETES.test(programa)) {
    let i = 1
    while (i < palabras.length && (palabras[i] ?? '').startsWith('-')) {
      const opcion = palabras[i] ?? ''
      if (opcion === '-c' || opcion === '-e' || opcion === '--eval') return `${programa} ${opcion}`
      i += 1
      if (opcion === '-m') break
    }
    if (i < palabras.length) {
      palabras = palabras.slice(i)
      programa = nombre(palabras[0] ?? '')
    }
  }
  const partes = [programa]
  const segunda = (palabras[1] ?? '').toLowerCase()
  if (PALABRA.test(segunda)) {
    partes.push(segunda)
    const tercera = (palabras[2] ?? '').toLowerCase()
    if (AGRUPADORES.has(segunda) && PALABRA.test(tercera)) partes.push(tercera)
  }
  return partes.join(' ').slice(0, 40).trim()
}

// ---------- Lo que Toki aprende de cada familia ----------

/** 0: normal; 1: con más contexto (Claude abrió la copia); 2: entera, sin compactar. */
export type NivelFamilia = 0 | 1 | 2

export type Aprendida = {
  nivel: NivelFamilia
  /** Veces compactada y veces que Claude abrió la copia, en total. */
  compactadas: number
  abiertas: number
  /** Copias compactadas con más contexto que Claude igual leyó enteras (la mitad o más). */
  enteras: number
  /** Compactaciones seguidas sin abrir la copia. */
  limpias: number
  /** Desde cuándo está en este nivel, y la última vez que se compactó o se abrió. */
  desde: number
  ultima: number
}

export type Aprendizaje = Record<string, Aprendida>

export const APRENDIZAJE = {
  /** Copias leídas enteras, ya con más contexto, para que la familia vaya entera. */
  enterasParaDejar: 2,
  /** Compactaciones seguidas sin abrir la copia para volver a lo normal. */
  limpiasParaVolver: 15,
  /** Días que va entera antes de volver a probar, con más contexto. */
  diasEntera: 30,
  /** Familias que se recuerdan: las aprendidas primero, luego las más recientes. */
  maxFamilias: 100,
} as const

/** Lo aprendido tras un evento, y el nivel nuevo si la familia cambió de nivel. */
export type CambioFamilia = { aprendizaje: Aprendizaje; nivel?: NivelFamilia }

function nueva(ahora: number): Aprendida {
  return { nivel: 0, compactadas: 0, abiertas: 0, enteras: 0, limpias: 0, desde: ahora, ultima: ahora }
}

function cuenta(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
}

/** Lo guardado, validado. Una familia que va entera hace un mes vuelve a probarse, con más contexto. */
export function leerAprendizaje(v: unknown, ahora: number): Aprendizaje {
  const a: Aprendizaje = {}
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return a
  for (const [familia, d] of Object.entries(v as Record<string, unknown>)) {
    if (familia === '' || d === null || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const nivel: NivelFamilia = o['nivel'] === 1 || o['nivel'] === 2 ? o['nivel'] : 0
    const f: Aprendida = {
      nivel,
      compactadas: cuenta(o['compactadas']),
      abiertas: cuenta(o['abiertas']),
      enteras: cuenta(o['enteras']),
      limpias: cuenta(o['limpias']),
      desde: cuenta(o['desde']),
      ultima: cuenta(o['ultima']),
    }
    a[familia] = f.nivel === 2 && ahora - f.desde >= APRENDIZAJE.diasEntera * DIA ? { ...f, nivel: 1, enteras: 0, limpias: 0, desde: ahora } : f
  }
  return a
}

export function nivelDe(a: Aprendizaje, familia: string): NivelFamilia {
  return a[familia]?.nivel ?? 0
}

function podar(a: Aprendizaje): Aprendizaje {
  const familias = Object.entries(a)
  if (familias.length <= APRENDIZAJE.maxFamilias) return a
  familias.sort(([, x], [, y]) => (y.nivel > 0 ? 1 : 0) - (x.nivel > 0 ? 1 : 0) || y.ultima - x.ultima)
  return Object.fromEntries(familias.slice(0, APRENDIZAJE.maxFamilias))
}

/** Toki compactó una salida de la familia. Con quince seguidas sin abrir la copia, vuelve a lo normal. */
export function trasCompactar(a: Aprendizaje, familia: string, ahora: number): CambioFamilia {
  const f = a[familia] ?? nueva(ahora)
  const limpias = f.limpias + 1
  const vuelve = f.nivel === 1 && limpias >= APRENDIZAJE.limpiasParaVolver
  const r: Aprendida = vuelve
    ? { ...f, nivel: 0, compactadas: f.compactadas + 1, enteras: 0, limpias: 0, desde: ahora, ultima: ahora }
    : { ...f, compactadas: f.compactadas + 1, limpias, ultima: ahora }
  return { aprendizaje: podar({ ...a, [familia]: r }), ...(vuelve ? { nivel: 0 as const } : {}) }
}

/** Claude abrió la copia de una salida compactada: la próxima vez, con más contexto. */
export function trasAbrir(a: Aprendizaje, familia: string, ahora: number): CambioFamilia {
  const f = a[familia] ?? nueva(ahora)
  const sube = f.nivel === 0
  const r: Aprendida = sube
    ? { ...f, nivel: 1, abiertas: f.abiertas + 1, enteras: 0, limpias: 0, desde: ahora, ultima: ahora }
    : { ...f, abiertas: f.abiertas + 1, limpias: 0, ultima: ahora }
  return { aprendizaje: podar({ ...a, [familia]: r }), ...(sube ? { nivel: 1 as const } : {}) }
}

/**
 * Claude leyó la mitad o más de una copia que Toki ya compactó con más contexto (`nivelCopia`, el
 * nivel con que se compactó). Con dos, la compactación no le sirve: la familia va entera.
 */
export function trasLeerEntera(a: Aprendizaje, familia: string, nivelCopia: NivelFamilia, ahora: number): CambioFamilia {
  const f = a[familia]
  if (f === undefined || f.nivel !== 1 || nivelCopia !== 1) return { aprendizaje: a }
  const enteras = f.enteras + 1
  const deja = enteras >= APRENDIZAJE.enterasParaDejar
  const r: Aprendida = deja ? { ...f, nivel: 2, enteras: 0, limpias: 0, desde: ahora, ultima: ahora } : { ...f, enteras, ultima: ahora }
  return { aprendizaje: { ...a, [familia]: r }, ...(deja ? { nivel: 2 as const } : {}) }
}

/** Las familias que Toki trata distinto, para /toki-por-que: las enteras primero. */
export function aprendidas(a: Aprendizaje): [string, Aprendida][] {
  return Object.entries(a)
    .filter(([, f]) => f.nivel > 0)
    .sort(([, x], [, y]) => y.nivel - x.nivel || y.desde - x.desde)
}

/** Hasta cuándo va entera una familia de nivel 2. */
export function enteraHasta(f: Aprendida): number {
  return f.desde + APRENDIZAJE.diasEntera * DIA
}

/** Olvida lo aprendido de una familia, o de todas. */
export function olvidar<T>(registro: Record<string, T>, familia?: string): Record<string, T> {
  if (familia === undefined) return {}
  return Object.fromEntries(Object.entries(registro).filter(([f]) => f !== familia))
}

// ---------- Oportunidades: salidas largas que Toki no compactó ----------

export type Oportunidad = { veces: number; tokens: number; desde: number; ultima: number }
export type Oportunidades = Record<string, Oportunidad>

export const OPORTUNIDADES = {
  /** Una familia cuenta a lo más estos días; pasados, empieza de nuevo. */
  dias: 30,
  /** Familias que se recuerdan: las que más habrían ahorrado. */
  max: 40,
  /** Para proponerla: vista al menos estas veces… */
  minimoVeces: 2,
  /** …y con al menos estos tokens ahorrables en total. */
  minimoTokens: 2000,
} as const

/** Lo guardado, validado; sin las familias que no se ven hace más de un mes. */
export function leerOportunidades(v: unknown, ahora: number): Oportunidades {
  const o: Oportunidades = {}
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return o
  for (const [familia, d] of Object.entries(v as Record<string, unknown>)) {
    if (familia === '' || d === null || typeof d !== 'object') continue
    const x = d as Record<string, unknown>
    const r: Oportunidad = { veces: cuenta(x['veces']), tokens: cuenta(x['tokens']), desde: cuenta(x['desde']), ultima: cuenta(x['ultima']) }
    if (ahora - r.desde < OPORTUNIDADES.dias * DIA) o[familia] = r
  }
  return o
}

/** Una salida larga que Toki no compactó y cuántos tokens habría ahorrado. */
export function anotarOportunidad(o: Oportunidades, familia: string, tokens: number, ahora: number): Oportunidades {
  const previa = o[familia]
  const vigente = previa !== undefined && ahora - previa.desde < OPORTUNIDADES.dias * DIA ? previa : undefined
  const r: Oportunidad =
    vigente === undefined
      ? { veces: 1, tokens, desde: ahora, ultima: ahora }
      : { veces: vigente.veces + 1, tokens: vigente.tokens + tokens, desde: vigente.desde, ultima: ahora }
  const todas = Object.entries({ ...o, [familia]: r }).sort(([, x], [, y]) => y.tokens - x.tokens)
  return Object.fromEntries(todas.slice(0, OPORTUNIDADES.max))
}

/** Las que vale la pena proponer, de la que más habría ahorrado a la que menos, sin las que ya compactas. */
export function mejoresOportunidades(o: Oportunidades, yaCompacta: readonly string[], max = 4): [string, Oportunidad][] {
  return Object.entries(o)
    .filter(([f, x]) => !yaCompacta.includes(f) && x.veces >= OPORTUNIDADES.minimoVeces && x.tokens >= OPORTUNIDADES.minimoTokens)
    .sort(([, x], [, y]) => y.tokens - x.tokens)
    .slice(0, max)
}

/** La opción «Compactar también»: familias separadas por coma. */
export function leerExtras(v: unknown): string[] {
  const lista = typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return [...new Set(lista.map(normalizarFamilia).filter(f => f !== ''))]
}

/** Cómo escribiste la familia (`/toki-por-que olvidar NPM  test`) → como la guarda Toki. */
export function normalizarFamilia(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ---------- Textos ----------

export type TextosFamilias = {
  aprendidoTitulo: string
  conCuidado: string
  entera: (hasta: string) => string
  aprendida: (familia: string, estado: string, abiertas: number, compactadas: number) => string
  oportunidadesTitulo: string
  oportunidad: (familia: string, veces: number, tokens: string, desde: string) => string
  tambien: (lista: string) => string
  pistaOlvidar: string
  olvidadoTodo: string
  olvidada: (familia: string, quitada: boolean) => string
  nadaQueOlvidar: (familia?: string) => string
  pregunta: (familia: string, tokens: string) => string
  preguntaVarias: string
  etiqueta: (familia: string, tokens: string) => string
  ahoraNo: string
  agregadas: (lista: string) => string
  negado: (motivo: string) => string
  /** Al final del detalle de /toki-por-que cuando se compactó con más contexto. */
  detalleCuidado: string
  /** El aviso cuando una familia cambia de nivel. */
  aviso: Record<NivelFamilia, (familia: string) => string>
  pista: string
}

export const textosFamilias: Record<Idioma, TextosFamilias> = {
  es: {
    aprendidoTitulo: 'Lo que Toki aprendió de las copias que Claude abrió:',
    conCuidado: 'con más contexto',
    entera: h => `entera hasta el ${h}`,
    aprendida: (f, e, a, c) => `  · ${f}: ${e} (Claude abrió la copia ${a} de ${Math.max(a, c)} ${Math.max(a, c) === 1 ? 'vez' : 'veces'})`,
    oportunidadesTitulo: 'Salidas largas que Toki no compactó (comandos que no conoce):',
    oportunidad: (f, v, t, d) => `  · ${f}: ${v} ${v === 1 ? 'vez' : 'veces'} desde el ${d}, ~${t} tokens que habría ahorrado`,
    tambien: l => `Compactas también: ${l}.`,
    pistaOlvidar: '/toki-por-que olvidar [familia] borra lo aprendido (y, si la agregaste, deja de compactarla).',
    olvidadoTodo: 'Listo: Toki olvidó lo que aprendió de cada familia (vuelven a compactarse como al principio) y las salidas largas que no compactó.',
    olvidada: (f, q) => `Listo: Toki olvidó lo que aprendió de ${f}${q ? ' y deja de compactarla' : ''}.`,
    nadaQueOlvidar: f => (f === undefined ? 'Toki no ha aprendido nada todavía: nada que olvidar.' : `Toki no ha aprendido nada de ${f}: nada que olvidar.`),
    pregunta: (f, t) => `¿Compacto también ${f}? Habría ahorrado ~${t} tokens; el original siempre queda guardado`,
    preguntaVarias: '¿Cuáles compacto también? El original siempre queda guardado',
    etiqueta: (f, t) => `${f} (~${t} tokens)`,
    ahoraNo: 'Ahora no',
    agregadas: l => `Listo: Toki compacta también ${l} desde ahora (opción «Compactar también»). /toki-por-que olvidar <familia> lo deshace.`,
    negado: m => `Claude Code no dejó cambiar la opción «Compactar también»: ${m}`,
    detalleCuidado: ', con más contexto (Claude abrió la copia de esta familia antes)',
    aviso: {
      0: f => `Toki: «${f}» vuelve a compactarse como siempre (Claude ya no abre la copia)`,
      1: f => `Toki: Claude abrió la copia de «${f}»; la próxima vez guardo más contexto`,
      2: f => `Toki: «${f}» va entera un mes; Claude leía la copia completa aun con más contexto`,
    },
    pista: 'olvidar [familia]',
  },
  en: {
    aprendidoTitulo: 'What Toki learned from the copies Claude opened:',
    conCuidado: 'with more context',
    entera: h => `whole until ${h}`,
    aprendida: (f, e, a, c) => `  · ${f}: ${e} (Claude opened the copy ${a} of ${Math.max(a, c)} ${Math.max(a, c) === 1 ? 'time' : 'times'})`,
    oportunidadesTitulo: 'Long outputs Toki did not compact (commands it does not know):',
    oportunidad: (f, v, t, d) => `  · ${f}: ${v} ${v === 1 ? 'time' : 'times'} since ${d}, ~${t} tokens it would have saved`,
    tambien: l => `You also compact: ${l}.`,
    pistaOlvidar: '/toki-por-que forget [family] erases what was learned (and, if you added it, stops compacting it).',
    olvidadoTodo: 'Done: Toki forgot what it learned from each family (they are compacted as at first again) and the long outputs it did not compact.',
    olvidada: (f, q) => `Done: Toki forgot what it learned from ${f}${q ? ' and stops compacting it' : ''}.`,
    nadaQueOlvidar: f => (f === undefined ? 'Toki has not learned anything yet: nothing to forget.' : `Toki has not learned anything from ${f}: nothing to forget.`),
    pregunta: (f, t) => `Also compact ${f}? It would have saved ~${t} tokens; the original is always kept`,
    preguntaVarias: 'Which ones should Toki also compact? The original is always kept',
    etiqueta: (f, t) => `${f} (~${t} tokens)`,
    ahoraNo: 'Not now',
    agregadas: l => `Done: Toki also compacts ${l} from now on ("Also compact" setting). /toki-por-que forget <family> undoes it.`,
    negado: m => `Claude Code did not allow changing the "Also compact" setting: ${m}`,
    detalleCuidado: ', with more context (Claude opened this family’s copy before)',
    aviso: {
      0: f => `Toki: "${f}" is compacted as usual again (Claude no longer opens the copy)`,
      1: f => `Toki: Claude opened the copy of "${f}"; next time I keep more context`,
      2: f => `Toki: "${f}" goes through whole for a month; Claude read the full copy even with more context`,
    },
    pista: 'forget [family]',
  },
}
