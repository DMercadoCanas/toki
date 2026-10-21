// Textos pegados enormes (un log, un JSON, un archivo entero): quedan en la conversación y se releen
// en cada mensaje siguiente. Toki los guarda en un archivo y manda principio, final y errores. Lógica pura.

import { esError, formatearTokens, tokensAprox } from './compresor'
import type { Idioma } from './idioma'

export const PEGADO = {
  /** Desde aquí se pregunta: ~10k tokens. */
  umbral: 40_000,
  cabeza: { lineas: 25, caracteres: 2_500 },
  cola: { lineas: 80, caracteres: 6_000 },
  errores: 25,
  largoError: 300,
  maxRechazos: 2,
}

export interface Recorte {
  texto: string
  lineas: number
  tokensAntes: number
  tokensDespues: number
}

/** Corta por líneas y por caracteres; una línea gigante (JSON minificado) se corta por dentro. */
function cabeza(lineas: string[], max: { lineas: number; caracteres: number }): { texto: string; usadas: number } {
  const salida: string[] = []
  let total = 0
  for (const linea of lineas) {
    if (salida.length >= max.lineas || total >= max.caracteres) break
    const cabe = max.caracteres - total
    salida.push(linea.length > cabe ? `${linea.slice(0, cabe)}…` : linea)
    total += Math.min(linea.length, cabe) + 1
  }
  return { texto: salida.join('\n'), usadas: salida.length }
}

function cola(lineas: string[], max: { lineas: number; caracteres: number }): { texto: string; usadas: number } {
  const salida: string[] = []
  let total = 0
  for (let i = lineas.length - 1; i >= 0; i--) {
    if (salida.length >= max.lineas || total >= max.caracteres) break
    const linea = lineas[i] ?? ''
    const cabe = max.caracteres - total
    salida.unshift(linea.length > cabe ? `…${linea.slice(linea.length - cabe)}` : linea)
    total += Math.min(linea.length, cabe) + 1
  }
  return { texto: salida.join('\n'), usadas: salida.length }
}

const TEXTOS = {
  es: {
    omitido: (desde: number, hasta: number, total: number, tokens: string, ruta: string) =>
      `[Toki] Pegaste ${total} líneas (~${tokens} tokens). Para no releerlas en cada mensaje, el texto completo está en ${ruta}. Aquí van el principio y el final; se omitieron las líneas ${desde}–${hasta}. Si necesitas algo de ahí, búscalo con Grep o léelo con Read y offset/limit.`,
    errores: 'Líneas con error en la parte omitida:',
  },
  en: {
    omitido: (desde: number, hasta: number, total: number, tokens: string, ruta: string) =>
      `[Toki] The user pasted ${total} lines (~${tokens} tokens). So they aren't re-read on every message, the full text is in ${ruta}. Here are the start and the end; lines ${desde}–${hasta} were left out. If you need something from there, search it with Grep or read it with Read and offset/limit.`,
    errores: 'Error lines in the omitted part:',
  },
}

/** Principio, final y errores del medio, con la ruta de la copia completa. undefined si no hay nada que omitir. */
export function recortarPegado(texto: string, ruta: string, idioma: Idioma = 'es'): Recorte | undefined {
  if (texto.length < PEGADO.umbral) return undefined
  const lineas = texto.split('\n')
  const c = cabeza(lineas, PEGADO.cabeza)
  const restantes = lineas.slice(c.usadas)
  const f = cola(restantes, PEGADO.cola)
  const medio = restantes.slice(0, restantes.length - f.usadas)
  const desde = c.usadas + 1
  const hasta = c.usadas + medio.length
  const x = TEXTOS[idioma]
  const errores = medio
    .map((l, i) => ({ l, n: desde + i }))
    .filter(({ l }) => esError(l))
    .slice(0, PEGADO.errores)
    .map(({ l, n }) => `${n}: ${l.length > PEGADO.largoError ? `${l.slice(0, PEGADO.largoError)}…` : l}`)
  const partes = [c.texto, '', x.omitido(desde, Math.max(desde, hasta), lineas.length, formatearTokens(tokensAprox(texto.length)), ruta)]
  if (errores.length > 0) partes.push(x.errores, ...errores)
  partes.push('', f.texto)
  const nuevo = partes.join('\n')
  if (nuevo.length >= texto.length * 0.6) return undefined
  return { texto: nuevo, lineas: lineas.length, tokensAntes: tokensAprox(texto.length), tokensDespues: tokensAprox(nuevo.length) }
}

export interface TextosPegado {
  pregunta: (lineas: number, tokens: string) => string
  guardar: (antes: string, despues: string) => string
  enviar: string
  hecho: (ruta: string, ahorro: string) => string
  callado: string
}

export const textosPegado: Record<Idioma, TextosPegado> = {
  es: {
    pregunta: (lineas, tokens) =>
      `Pegaste ${lineas} líneas (~${tokens} tokens). Eso se queda en la conversación y se relee en cada mensaje que sigue. ¿Lo guardo en un archivo y le mando a Claude solo el principio, el final y los errores? Claude puede leer el resto cuando lo necesite.`,
    guardar: (antes, despues) => `Guardar en archivo y enviar lo esencial (~${despues} en vez de ~${antes}) ★`,
    enviar: 'Enviar completo',
    hecho: (ruta, ahorro) => `Toki: guardé lo que pegaste en ${ruta} y te ahorro ~${ahorro} tokens en cada mensaje.`,
    callado: 'Toki: entendido, no vuelvo a preguntar por textos pegados en esta sesión.',
  },
  en: {
    pregunta: (lineas, tokens) =>
      `You pasted ${lineas} lines (~${tokens} tokens). That stays in the conversation and is re-read on every following message. Save it to a file and send Claude only the start, the end and the errors? Claude can read the rest when it needs it.`,
    guardar: (antes, despues) => `Save to a file and send the essentials (~${despues} instead of ~${antes}) ★`,
    enviar: 'Send it all',
    hecho: (ruta, ahorro) => `Toki: saved your paste to ${ruta}, ~${ahorro} tokens saved on every message.`,
    callado: "Toki: got it, I won't ask about pastes again this session.",
  },
}
