// La tarjeta semanal: cuánto ahorró Toki, en qué, cuánto leyó Claude y un consejo con tus cifras.
// Funciones puras: el registro lo hace register.tsx.

import { claveDia } from './historial'
import type { Historial } from './historial'
import type { Idioma } from './idioma'
import { formatearTokens } from './mascota'

export type TipoAhorro = 'salida' | 'repetida' | 'busqueda' | 'pegado'

export const TIPOS_AHORRO: TipoAhorro[] = ['salida', 'busqueda', 'pegado', 'repetida']

export type ResumenSemana = {
  /** Tokens que no entraron al contexto, por tipo. */
  porTipo: Partial<Record<TipoAhorro, number>>
  /** Relecturas evitadas (neto). */
  relecturas: number
  /** Pedidos del hilo principal y tokens que la API leyó o escribió en ellos (más subagentes). */
  pedidos: number
  tokensLeidos: number
  /** Costo estimado en USD que reporta Claude Code (en suscripción es orientativo). */
  costo: number
  sesiones: number
  /** Lecturas enteras de archivos generados que Toki frenó. */
  frenos: number
  /** Pedidos con más de 150k de contexto: conversaciones que se alargaron. */
  pedidosLargos: number
}

export type Semanas = Record<string, ResumenSemana> // lunes 'AAAA-MM-DD' → resumen

export const SEMANAS_GUARDADAS = 12
export const CONTEXTO_LARGO = 150_000

export const SEMANA_VACIA: ResumenSemana = { porTipo: {}, relecturas: 0, pedidos: 0, tokensLeidos: 0, costo: 0, sesiones: 0, frenos: 0, pedidosLargos: 0 }

/** Lunes (hora local) de la semana de `ms`, como 'AAAA-MM-DD'. */
export function lunesDe(ms: number): string {
  const d = new Date(ms)
  const desdeLunes = (d.getDay() + 6) % 7
  return claveDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() - desdeLunes, 12).getTime())
}

function msDeClave(clave: string): number {
  const [a, m, d] = clave.split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1, 12).getTime()
}

export function semanaAnterior(clave: string): string {
  return claveDia(msDeClave(clave) - 7 * 86_400_000)
}

function leerResumen(valor: unknown): ResumenSemana {
  if (valor === null || typeof valor !== 'object') return { ...SEMANA_VACIA, porTipo: {} }
  const v = valor as Partial<ResumenSemana>
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  const porTipo: Partial<Record<TipoAhorro, number>> = {}
  for (const t of TIPOS_AHORRO) if (n(v.porTipo?.[t]) > 0) porTipo[t] = n(v.porTipo?.[t])
  return {
    porTipo,
    relecturas: n(v.relecturas),
    pedidos: n(v.pedidos),
    tokensLeidos: n(v.tokensLeidos),
    costo: n(v.costo),
    sesiones: n(v.sesiones),
    frenos: n(v.frenos),
    pedidosLargos: n(v.pedidosLargos),
  }
}

/** Lo guardado en el store, saneado. */
export function leerSemanas(valor: unknown): Semanas {
  if (valor === null || typeof valor !== 'object') return {}
  const salida: Semanas = {}
  for (const [clave, resumen] of Object.entries(valor as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(clave)) salida[clave] = leerResumen(resumen)
  }
  return salida
}

export type Delta = {
  tipo?: TipoAhorro
  ahorro?: number
  relecturas?: number
  pedidos?: number
  tokensLeidos?: number
  costo?: number
  sesiones?: number
  frenos?: number
  pedidosLargos?: number
}

/** Suma a la semana de `ms` y guarda solo las últimas 12. */
export function sumarSemana(semanas: Semanas, ms: number, d: Delta): Semanas {
  const clave = lunesDe(ms)
  const s = semanas[clave] ?? { ...SEMANA_VACIA, porTipo: {} }
  const porTipo = { ...s.porTipo }
  if (d.tipo !== undefined && (d.ahorro ?? 0) > 0) porTipo[d.tipo] = (porTipo[d.tipo] ?? 0) + (d.ahorro ?? 0)
  const nuevo: ResumenSemana = {
    porTipo,
    relecturas: s.relecturas + (d.relecturas ?? 0),
    pedidos: s.pedidos + (d.pedidos ?? 0),
    tokensLeidos: s.tokensLeidos + (d.tokensLeidos ?? 0),
    costo: s.costo + Math.max(0, d.costo ?? 0),
    sesiones: s.sesiones + (d.sesiones ?? 0),
    frenos: s.frenos + (d.frenos ?? 0),
    pedidosLargos: s.pedidosLargos + (d.pedidosLargos ?? 0),
  }
  const siguiente: Semanas = { ...semanas, [clave]: nuevo }
  const claves = Object.keys(siguiente).sort()
  for (const vieja of claves.slice(0, Math.max(0, claves.length - SEMANAS_GUARDADAS))) delete siguiente[vieja]
  return siguiente
}

export function ahorroDe(s: ResumenSemana | undefined): number {
  if (s === undefined) return 0
  return TIPOS_AHORRO.reduce((a, t) => a + (s.porTipo[t] ?? 0), 0)
}

/**
 * ¿Toca mostrar la tarjeta de la semana pasada? Al primer inicio de una semana nueva,
 * si la pasada tuvo actividad y no se mostró todavía. Devuelve el lunes de la semana pasada.
 */
export function tarjetaPendiente(semanas: Semanas, ms: number, ultimaMostrada: unknown): string | undefined {
  const pasada = semanaAnterior(lunesDe(ms))
  if (ultimaMostrada === pasada) return undefined
  const s = semanas[pasada]
  if (s === undefined || (ahorroDe(s) <= 0 && s.pedidos === 0)) return undefined
  return pasada
}

const MESES = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

const DIAS = {
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

const TEXTOS = {
  es: {
    titulo: (desde: string, hasta: string, actual: boolean) => `Toki · ${actual ? 'esta semana' : 'semana'} (${desde} – ${hasta})`,
    ahorre: (t: string) => `Te ahorré ~${t} tokens`,
    sinAhorro: 'Esta semana no hubo salidas grandes que recortar.',
    vsAnterior: (pct: number) => (pct >= 0 ? `▲ ${pct}% vs. la semana anterior` : `▼ ${-pct}% vs. la semana anterior`),
    tipos: { salida: 'salidas de terminal', busqueda: 'búsquedas enormes', pegado: 'textos pegados', repetida: 'salidas repetidas' } as Record<TipoAhorro, string>,
    relecturas: (t: string) => `Además, ~${t} tokens que Claude no tuvo que releer`,
    frenos: (n: number) => `${n} ${n === 1 ? 'lectura frenada' : 'lecturas frenadas'} de archivos generados`,
    leyo: (t: string, p: number, s: number) => `Claude leyó ~${t} tokens en ${p} pedidos (${s} ${s === 1 ? 'sesión' : 'sesiones'})`,
    costo: (usd: string) => ` · ~$${usd}`,
    proporcion: (pct: string) => `Lo que Toki evitó equivale al ${pct}% de lo que Claude leyó.`,
    mejorDia: (d: string, t: string) => `Mejor día: ${d} (~${t})`,
    racha: (n: number) => `racha de ${n} ${n === 1 ? 'día' : 'días'}`,
    consejo: 'Consejo:',
    consejoLargos: (pct: number) =>
      `el ${pct}% de tus pedidos pasó de 150k de contexto. Un /clear al cambiar de tarea (o /compact a mitad de una larga) abarata cada mensaje que sigue.`,
    consejoPegado: 'pegaste textos enormes varias veces. Si es un log, guárdalo en un archivo y pídele a Claude que lo lea: así no se relee entero en cada mensaje.',
    consejoFrenos: 'Claude intentó leer archivos generados varias veces. Agregarlos a un CLAUDE.md ("no leas package-lock.json entero") lo evita desde el principio.',
    consejoBien: 'vas bien. Mira /toki para ver a dónde se va cada token de la sesión.',
    vacia: 'Toki todavía no tiene cifras de esta semana.',
    aviso: (t: string, cambio: string) => `Toki: la semana pasada te ahorré ~${t} tokens${cambio}. Escribe /toki-semana para ver la tarjeta.`,
  },
  en: {
    titulo: (desde: string, hasta: string, actual: boolean) => `Toki · ${actual ? 'this week' : 'week'} (${desde} – ${hasta})`,
    ahorre: (t: string) => `I saved you ~${t} tokens`,
    sinAhorro: 'No big outputs to trim this week.',
    vsAnterior: (pct: number) => (pct >= 0 ? `▲ ${pct}% vs. the week before` : `▼ ${-pct}% vs. the week before`),
    tipos: { salida: 'terminal output', busqueda: 'huge searches', pegado: 'pasted text', repetida: 'repeated output' } as Record<TipoAhorro, string>,
    relecturas: (t: string) => `Plus ~${t} tokens Claude didn't have to re-read`,
    frenos: (n: number) => `${n} full ${n === 1 ? 'read' : 'reads'} of generated files held back`,
    leyo: (t: string, p: number, s: number) => `Claude read ~${t} tokens over ${p} requests (${s} ${s === 1 ? 'session' : 'sessions'})`,
    costo: (usd: string) => ` · ~$${usd}`,
    proporcion: (pct: string) => `What Toki avoided equals ${pct}% of what Claude read.`,
    mejorDia: (d: string, t: string) => `Best day: ${d} (~${t})`,
    racha: (n: number) => `${n}-day streak`,
    consejo: 'Tip:',
    consejoLargos: (pct: number) =>
      `${pct}% of your requests went past 150k of context. A /clear when you switch tasks (or /compact in the middle of a long one) makes every following message cheaper.`,
    consejoPegado: 'you pasted huge texts several times. If it is a log, save it to a file and ask Claude to read it, so it is not re-read on every message.',
    consejoFrenos: 'Claude tried to read generated files several times. A line in CLAUDE.md ("don\'t read package-lock.json whole") prevents it from the start.',
    consejoBien: "you're doing well. Open /toki to see where each token of the session goes.",
    vacia: 'Toki has no numbers for this week yet.',
    aviso: (t: string, cambio: string) => `Toki: last week I saved you ~${t} tokens${cambio}. Type /toki-semana to see the card.`,
  },
}

function fecha(ms: number, idioma: Idioma): string {
  const d = new Date(ms)
  return idioma === 'en' ? `${MESES.en[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MESES.es[d.getMonth()]}`
}

function cambioPct(actual: number, anterior: number): number | undefined {
  if (anterior <= 0) return undefined
  return Math.round(((actual - anterior) / anterior) * 100)
}

/** Consejo con las cifras de la semana: el más útil que aplique. */
export function consejoDe(s: ResumenSemana, idioma: Idioma = 'es'): string {
  const x = TEXTOS[idioma]
  const pctLargos = s.pedidos > 0 ? Math.round((s.pedidosLargos / s.pedidos) * 100) : 0
  if (s.pedidos >= 20 && pctLargos >= 30) return x.consejoLargos(pctLargos)
  if ((s.porTipo.pegado ?? 0) >= 30_000) return x.consejoPegado
  if (s.frenos >= 3) return x.consejoFrenos
  return x.consejoBien
}

function barra(valor: number, maximo: number, ancho: number): string {
  const lleno = valor <= 0 ? 0 : Math.max(1, Math.round((valor / Math.max(1, maximo)) * ancho))
  return '█'.repeat(lleno) + '░'.repeat(ancho - lleno)
}

/** La tarjeta en texto. `lunes` es la semana a mostrar; `ms` el momento actual (para saber si está en curso). */
export function tarjetaSemana(
  semanas: Semanas,
  lunes: string,
  ms: number,
  historial: Historial,
  opciones: { idioma?: Idioma; mostrarCosto?: boolean; racha?: number } = {},
): string {
  const idioma = opciones.idioma ?? 'es'
  const x = TEXTOS[idioma]
  const s = semanas[lunes]
  if (s === undefined) return x.vacia
  const inicio = msDeClave(lunes)
  const fin = inicio + 6 * 86_400_000
  const actual = lunesDe(ms) === lunes
  const lineas: string[] = [x.titulo(fecha(inicio, idioma), fecha(fin, idioma), actual), '']
  const ahorro = ahorroDe(s)
  if (ahorro > 0) {
    const cambio = cambioPct(ahorro, ahorroDe(semanas[semanaAnterior(lunes)]))
    lineas.push(`${x.ahorre(formatearTokens(ahorro))}${cambio !== undefined && !actual ? `  (${x.vsAnterior(cambio)})` : ''}`)
    const tipos = TIPOS_AHORRO.filter(t => (s.porTipo[t] ?? 0) > 0).sort((a, b) => (s.porTipo[b] ?? 0) - (s.porTipo[a] ?? 0))
    const maximo = Math.max(...tipos.map(t => s.porTipo[t] ?? 0))
    const ancho = Math.max(...tipos.map(t => x.tipos[t].length))
    for (const t of tipos) {
      const v = s.porTipo[t] ?? 0
      lineas.push(`  ${x.tipos[t].padEnd(ancho)}  ${barra(v, maximo, 12)}  ~${formatearTokens(v)}`)
    }
  } else {
    lineas.push(x.sinAhorro)
  }
  if (s.relecturas > 0) lineas.push(x.relecturas(formatearTokens(s.relecturas)))
  if (s.frenos > 0) lineas.push(x.frenos(s.frenos))
  if (s.pedidos > 0) {
    lineas.push('')
    lineas.push(`${x.leyo(formatearTokens(s.tokensLeidos), s.pedidos, Math.max(1, s.sesiones))}${opciones.mostrarCosto && s.costo > 0 ? x.costo(s.costo.toFixed(2)) : ''}`)
    const evitado = ahorro + Math.max(0, s.relecturas)
    if (evitado > 0 && s.tokensLeidos > 0) {
      const pct = (evitado / s.tokensLeidos) * 100
      lineas.push(x.proporcion(pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1)))
    }
  }
  // Mejor día de la semana, con el historial diario.
  let mejor: { dia: number; tokens: number } | undefined
  for (let i = 0; i < 7; i++) {
    const dia = inicio + i * 86_400_000
    const tokens = historial[claveDia(dia)] ?? 0
    if (tokens > 0 && (mejor === undefined || tokens > mejor.tokens)) mejor = { dia, tokens }
  }
  const extras: string[] = []
  if (mejor !== undefined) extras.push(x.mejorDia(`${DIAS[idioma][new Date(mejor.dia).getDay()]} ${new Date(mejor.dia).getDate()}`, formatearTokens(mejor.tokens)))
  if (actual && (opciones.racha ?? 0) >= 2) extras.push(x.racha(opciones.racha ?? 0))
  if (extras.length > 0) lineas.push(extras.join(' · '))
  lineas.push('', `${x.consejo} ${consejoDe(s, idioma)}`)
  return lineas.join('\n')
}

/** El aviso corto del lunes. */
export function avisoSemana(semanas: Semanas, lunes: string, idioma: Idioma = 'es'): string {
  const x = TEXTOS[idioma]
  const ahorro = ahorroDe(semanas[lunes])
  const cambio = cambioPct(ahorro, ahorroDe(semanas[semanaAnterior(lunes)]))
  return x.aviso(formatearTokens(ahorro), cambio !== undefined ? ` (${x.vsAnterior(cambio)})` : '')
}
