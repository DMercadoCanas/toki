// Scripts repetidos (idea de Token Optimizer, «deterministic-candidates»): si Claude corre otra vez,
// igual, un comando largo (un heredoc, un `python -c`, un pipeline), Toki lo guarda tal cual en un
// archivo y le pasa cómo correrlo desde ahí: repetirlo deja de costar el comando entero en tokens de
// salida. Funciones puras.

import { tokensAprox } from './compresor'
import { huella } from './gasto'
import type { Idioma } from './idioma'

/** Más corto que esto, escribirlo de nuevo cuesta casi lo mismo que la ruta. */
export const MIN_SCRIPT = 300
/** A la segunda vez igual, Toki lo guarda: la tercera ya puede salir corta. */
export const VECES_SCRIPT = 2
/** Avisos por conversación: más ya sería ruido. */
export const MAX_AVISOS_SCRIPT = 5
/** Comandos largos distintos que se recuerdan por conversación. */
const MAX_VISTOS = 60
export const CARPETA_SCRIPTS = '.claude/toki/scripts'

/**
 * Lo que Toki lleva de la conversación: cuántas veces corrió cada comando largo (por su huella), en
 * qué época (cuántas compactaciones iban) se avisó cada uno, cuántos avisos van y cuánto medía el
 * comando de cada archivo guardado.
 */
export type Scripts = { veces: Record<string, number>; avisados: Record<string, number>; avisos: number; guardados: Record<string, number> }
export const SCRIPTS_VACIO: Scripts = { veces: {}, avisados: {}, avisos: 0, guardados: {} }

function clave(texto: string): string {
  return huella(texto)
}

export type Cuenta = { s: Scripts; veces: number; toca: boolean; yaAvisado: boolean }

/**
 * Un comando que va a correr. Los cortos no cuentan. `toca`: ya corrió igual VECES_SCRIPT veces o
 * más, no se avisó desde la última compactación (`epoca`), quedan avisos y no parece llevar una
 * credencial. `yaAvisado`: Toki lo guardó y Claude lo volvió a escribir entero.
 */
export function contarScript(s: Scripts, comando: string, epoca: number): Cuenta {
  const texto = comando.trim()
  if (texto.length < MIN_SCRIPT) return { s, veces: 0, toca: false, yaAvisado: false }
  const k = clave(texto)
  const veces = (s.veces[k] ?? 0) + 1
  const llaves = Object.keys(s.veces)
  // Que no crezca sin límite en sesiones largas: se quedan los más recientes.
  const previas = llaves.length >= MAX_VISTOS && s.veces[k] === undefined ? Object.fromEntries(llaves.slice(-(MAX_VISTOS - 20)).map(l => [l, s.veces[l] as number])) : s.veces
  const yaAvisado = s.avisados[k] === epoca
  const toca = veces >= VECES_SCRIPT && !yaAvisado && s.avisos < MAX_AVISOS_SCRIPT && !pareceSecreto(texto)
  return { s: { ...s, veces: { ...previas, [k]: veces } }, veces, toca, yaAvisado }
}

/** Toki lo guardó y se lo dijo a Claude: no se avisa otra vez hasta la próxima compactación. */
export function marcarGuardado(s: Scripts, comando: string, epoca: number): Scripts {
  const texto = comando.trim()
  return { ...s, avisados: { ...s.avisados, [clave(texto)]: epoca }, avisos: s.avisos + 1, guardados: { ...s.guardados, [nombreScript(texto)]: texto.length } }
}

/** El mismo comando, el mismo archivo: el nombre sale de su huella. */
export function nombreScript(comando: string): string {
  return `script-${(clave(comando.trim()).split(':')[0] ?? '').padStart(8, '0')}.sh`
}

export function rutaScript(comando: string): string {
  return `${CARPETA_SCRIPTS}/${nombreScript(comando)}`
}

/** El archivo trae el comando tal cual: correrlo con `source` es correr el original. */
export function contenidoScript(comando: string): string {
  return `${comando.trim()}\n`
}

/** Cómo lo corre Claude: con `source`, en el mismo shell que el original (con `bash` cambiarían, por ejemplo, los `**`). */
export function comandoScript(rutaAbsoluta: string): string {
  const ruta = rutaAbsoluta.replace(/\\/g, '/')
  return `source ${/^[\w@%+=:,./-]+$/.test(ruta) ? ruta : `'${ruta.replace(/'/g, `'\\''`)}'`}`
}

const CORRE_GUARDADO = /^(?:source|\.|bash|sh|zsh)\s+(['"]?)[^'"]*?\.claude[\\/]toki[\\/]scripts[\\/](script-[0-9a-f]{8}\.sh)\1\s*$/

/** El archivo guardado por Toki que corre este comando, si es eso lo que hace. */
export function scriptCorrido(comando: string): string | undefined {
  return CORRE_GUARDADO.exec(comando.trim())?.[2]
}

const SECRETO =
  /\b(?:authorization|bearer|api[-_]?key|secret|passw(?:or)?d|token|credentials?)\b["']?\s*[:=]|\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/i

/** Un comando que parece llevar una credencial no se guarda en disco. */
export function pareceSecreto(comando: string): boolean {
  return SECRETO.test(comando)
}

type TextosScripts = {
  aviso: (veces: number, caracteres: number, correr: string) => string
}

const TEXTOS: Record<Idioma, TextosScripts> = {
  es: {
    aviso: (v, c, cmd) =>
      `[Toki] Este mismo comando (~${tokensAprox(c)} tokens) ya corrió igual ${v} veces. Toki lo guardó tal cual: para repetirlo, corre \`${cmd}\` (mismo shell, mismo efecto) en vez de escribirlo entero; para cambiarlo, edita ese archivo.`,
  },
  en: {
    aviso: (v, c, cmd) =>
      `[Toki] This exact command (~${tokensAprox(c)} tokens) has now run ${v} times unchanged. Toki saved it as is: to run it again, use \`${cmd}\` (same shell, same effect) instead of writing it out in full; to change it, edit that file.`,
  },
}

export function txScripts(idioma: Idioma = 'es'): TextosScripts {
  return TEXTOS[idioma]
}
