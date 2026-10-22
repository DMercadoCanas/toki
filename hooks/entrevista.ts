/**
 * Pedidos grandes: cuándo conviene que Claude entreviste primero, y los consejos
 * para pedir mejor. La guía de Anthropic para funciones grandes es esa: dejar que
 * Claude pregunte (AskUserQuestion), escribir un spec y ejecutarlo en una sesión limpia.
 *
 * Todo aquí es puro: sin `$`, para probarlo sin Claude Code.
 */

import type { Idioma } from './idioma'
import { limpiarPrompt, type Nivel } from './modelo'
import { conAcentos } from './palabras'

export type ModoEntrevista = 'auto' | 'preguntar' | 'no'

export function leerModoEntrevista(v: unknown): ModoEntrevista {
  if (v === 'preguntar' || v === 'no') return v
  if (v === false || v === 'off' || v === 'apagado' || v === 'apagada') return 'no'
  return 'auto'
}

/** Cuántas veces seguidas dices "sin preguntas" antes de que Toki deje de proponerlas. */
export const SALTOS_PARA_CALLAR = 3
/** Cada consejo sale esta cantidad de veces como máximo: pasado eso, ya lo sabes. */
export const VECES_POR_CONSEJO = 2
/** Con menos contexto que esto, empezar en limpio casi no ahorra. */
export const CONTEXTO_PARA_LIMPIAR = 60_000
/** Un cambio de tema con tanto contexto a cuestas vale la pena limpiarlo. */
export const CONTEXTO_CAMBIO_DE_TEMA = 100_000

// ---------- Leer el mensaje ----------

const SIN_PREGUNTAS =
  conAcentos(/\b(sin preguntas|sin entrevista|no (me )?(hagas |preguntes|des )?(preguntas|preguntes)|no quiero (que me hagas )?preguntas|hazlo directamente|solo hazlo|no questions|don'?t ask( me)?( any)?( questions)?|skip the (questions|interview)|just do it)\b/i)
const VERIFICA =
  conAcentos(/\b(tests?|pruebas?|verifica\w*|comprueba\w*|compila\w*|build|lint\w*|typecheck|ejecuta\w*|corre\w*|run|screenshot|captura|deber[ií]a|debe(n)?|should|expected|esperad[oa]s?|que pase\w*|passes|passing|criterios?|acceptance|resultado esperado|salida esperada)\b/i)
const RUTA =
  /(?:^|[\s(])@?(?:\.{0,2}\/)?[\w.-]+\/[\w./-]+|\b[\w-]+\.(?:tsx?|jsx?|py|rs|go|java|kt|swift|rb|php|css|html|json|ya?ml|toml|md|sql|sh|cs|cpp)\b|@[\w./-]+/i
const NOMBRES =
  'app|aplicaci[oó]n|proyecto|sistema|plataforma|sitio|p[aá]gina|web|api|bot|herramienta|plugin|extensi[oó]n|dashboard|tienda|juego|backend|frontend|servicio|cli|project|system|platform|site|website|tool|extension|store|game|service'
const PROYECTO = conAcentos(new RegExp(
  `\\b(?:cre[ao]r?|cr[eé]ame|constru\\w+|arma\\w*|haz(?:me)?|hacer|desarroll\\w+|programa\\w*|implementa\\w*|quiero|necesito|build|create|develop|make|i want|i need)\\b[^.?!]{0,40}?\\b(?:una?|nuev[oa]s?|mi|nuestra|a|an|new|my)\\b(?:\\s+[\\w-]+){0,2}?\\s+(?:${NOMBRES})\\b`,
  'i',
))
const ACCION =
  conAcentos(/\b(arregla\w*|corrige\w*|cambia\w*|agrega\w*|a[ñn]ade\w*|implementa\w*|crea\w*|elimina\w*|borra\w*|modifica\w*|actualiza\w*|refactoriza\w*|reescribe\w*|fix|change|add|implement|create|remove|delete|update|modify|refactor|rewrite)\b/i)
const MEZCLA = conAcentos(/\b(adem[aá]s|aparte de eso|otra cosa|por otro lado|y tambi[eé]n necesito|another thing|separately|on another note|unrelated)\b/i)
const AMPLIO =
  conAcentos(/\b(revisa|analiza|audita|examina|review|audit|check|analy[sz]e)\b[^.]{0,20}\b(todo|todos|toda|todas|everything|the whole|entire|all the)\b/i)
const CORRECCION =
  conAcentos(/\b(no,? (as[ií]|eso|esto) no|no era (eso|as[ií])|eso no es lo que|no (es|era) lo que (ped[ií]|quer[ií]a)|te ped[ií]|ya te dije|sigue (mal|igual|fallando)|a[uú]n (falla|no funciona)|todav[ií]a (falla|no funciona)|sigue sin|otra vez (falla|mal|lo mismo)|no funcion[oó]|no sirvi[oó]|est[aá] mal|incorrecto|that'?s (not what|wrong)|not what i (asked|meant|wanted)|i (asked|said)|still (fails?|broken|wrong|not working)|didn'?t work|undo|deshaz|revierte)\b/i)
const LISTA = /^\s*(?:[-*]|\d+[.)])\s/gm

function palabrasDe(texto: string): number {
  const l = limpiarPrompt(texto)
  return l === '' ? 0 : l.split(' ').length
}

/** El pedido ya trae todo lo que la entrevista iba a preguntar. */
export function esDetallado(texto: string): boolean {
  const rutas = (texto.match(new RegExp(RUTA.source, 'gi')) ?? []).length
  const palabras = palabrasDe(texto)
  if (rutas >= 2 && VERIFICA.test(texto)) return true
  if (palabras > 400) return true
  return palabras > 150 && (texto.match(LISTA) ?? []).length >= 3 && VERIFICA.test(texto)
}

export function esCorreccion(texto: string): boolean {
  return CORRECCION.test(limpiarPrompt(texto))
}

export function pideSinPreguntas(texto: string): boolean {
  return SIN_PREGUNTAS.test(limpiarPrompt(texto))
}

const PALABRAS_VACIAS = new Set(
  'para como cuando donde desde hasta sobre entre porque aunque tambien ahora todos todas esto esta este estos estas pero cada otra otro mismo quiero necesito puedes favor with from that this have will would there their about into your what when which also them then than only just like make need want please'.split(' '),
)

function clave(texto: string): Set<string> {
  const salida = new Set<string>()
  for (const w of limpiarPrompt(texto).replace(new RegExp(SIN_PREGUNTAS.source, 'giu'), ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)) {
    if (w.length >= 5 && !PALABRAS_VACIAS.has(w)) salida.add(w.slice(0, 6))
  }
  return salida
}

/** ¿Este mensaje habla de otra cosa que los últimos? Cuenta las palabras de fondo que comparten. */
export function cambioDeTema(recientes: readonly string[], texto: string): boolean {
  if (recientes.length === 0) return false
  const nuevo = clave(texto)
  if (nuevo.size < 4) return false
  const antes = new Set<string>()
  for (const r of recientes) for (const w of clave(r)) antes.add(w)
  let comunes = 0
  for (const w of nuevo) if (antes.has(w)) comunes += 1
  return comunes / nuevo.size < 0.15
}

// ---------- ¿Entrevistar? ----------

export type PorQueEntrevistar = 'proyecto' | 'grande'
export type Evaluacion = { entrevistar: false; omitido?: 'sin-preguntas' } | { entrevistar: true; porque: PorQueEntrevistar }

export type Entrada = {
  texto: string
  nivel: Nivel
  /** El motivo del nivel (`seguimiento` = "sí", "dale", "sigue"). */
  motivo: string
  interactivo: boolean
  /** Cuántos mensajes tuyos van en esta conversación (0 = el primero, o recién después de /clear). */
  mensajes: number
  recientes: readonly string[]
}

/** ¿Es el primer mensaje de la conversación, o habla de otra cosa que los últimos? */
function esTareaNueva(e: Pick<Entrada, 'mensajes' | 'recientes' | 'texto'>): boolean {
  return e.mensajes === 0 || cambioDeTema(e.recientes, e.texto)
}

/** Un pedido grande al empezar algo nuevo, con o sin entrevista: es lo que se compara después. */
export function esPedidoGrande(e: Entrada): boolean {
  if (e.nivel === 'trivial' || e.motivo === 'seguimiento' || esCorreccion(e.texto) || palabrasDe(e.texto) < 6) return false
  if (!esTareaNueva(e)) return false
  return e.nivel === 'complejo' || e.nivel === 'profundo' || PROYECTO.test(limpiarPrompt(e.texto))
}

/** Un pedido grande y vago al empezar algo nuevo: ahí es donde una pregunta a tiempo ahorra iteraciones. */
export function evaluarEntrevista(e: Entrada): Evaluacion {
  if (!e.interactivo || !esPedidoGrande(e) || esDetallado(e.texto)) return { entrevistar: false }
  const proyecto = PROYECTO.test(limpiarPrompt(e.texto))
  const rutas = (e.texto.match(new RegExp(RUTA.source, 'gi')) ?? []).length
  // Una tarea grande con archivo y criterio de "listo" ya dice lo que la entrevista iba a preguntar.
  if (!proyecto && rutas >= 1 && VERIFICA.test(e.texto)) return { entrevistar: false }
  if (pideSinPreguntas(e.texto)) return { entrevistar: false, omitido: 'sin-preguntas' }
  return { entrevistar: true, porque: proyecto ? 'proyecto' : 'grande' }
}

// ---------- Textos ----------

export const RUTA_SPEC = '.claude/toki/spec.md'

export type TextosEntrevista = {
  /** Lo que Claude lee junto a tu mensaje (no lo ves, tú escribes lo mismo de siempre). */
  instruccion: (porque: PorQueEntrevistar) => string
  aviso: string
  pregunta: string
  opcionesPregunta: { si: string; no: string }
  saltada: string
  callada: string
  cmd: string
  estado: (modo: ModoEntrevista, s: { con: number; conCorr: number; sin: number; sinCorr: number }) => string[]
  modoCambiado: (modo: string) => string
  uso: string
  modos: Record<ModoEntrevista, string>
  /** Empezar en limpio por cambio de tema. */
  tema: { pregunta: (tokens: string) => string; si: string; no: string }
  /** Empezar en limpio con un pedido mejor, después de dos correcciones. */
  correccion: { pregunta: (tokens: string) => string; si: string; no: string }
  limpiando: string
  pulsaEnter: string
  consejos: Record<Consejo, string>
  pedidoMejorado: { corregido: string; sigue: string }
}

export const textosEntrevista: Record<Idioma, TextosEntrevista> = {
  es: {
    instruccion: porque =>
      [
        porque === 'proyecto'
          ? '[Toki] Es un proyecto nuevo y el pedido deja decisiones abiertas.'
          : '[Toki] Pedido grande y el mensaje deja decisiones abiertas.',
        'Antes de leer archivos grandes o escribir código, entrevista a la persona con la herramienta AskUserQuestion:',
        `2 a 4 preguntas de opción múltiple por ronda${porque === 'proyecto' ? ' (una segunda ronda solo si hace falta)' : ''}, con la opción recomendada primero y marcada "(Recomendado)".`,
        'Pregunta solo lo que cambia el resultado y no puedes deducir del proyecto: alcance, tecnología o formato, datos y casos límite, y qué cuenta como "listo" (cómo se comprueba).',
        'Si necesitas ver el proyecto, mira solo su estructura (ls, README).',
        `Con las respuestas, guarda un resumen del pedido (máx. 15 líneas, con el criterio de "listo") en ${RUTA_SPEC} y sigue con el trabajo.`,
        'Si la persona no quiere preguntas, continúa sin ellas.',
      ].join(' '),
    aviso: 'Pedido grande: Claude te hará unas preguntas antes de empezar (tres respuestas rápidas evitan varias correcciones). Escribe «sin preguntas» para saltarlas.',
    pregunta: 'Este pedido es grande y deja decisiones abiertas. ¿Dejo que Claude te haga unas preguntas de opción múltiple antes de empezar? Cuesta ~1-2k tokens y suele ahorrar correcciones.',
    opcionesPregunta: { si: 'Sí, que pregunte (Recomendado)', no: 'Enviar así' },
    saltada: 'Listo: sin preguntas.',
    callada: 'Toki ya no propondrá la entrevista en esta sesión. Con /toki-entrevista auto la reactivas.',
    cmd: 'Toki: preguntas antes de un pedido grande',
    estado: (modo, s) => {
      const filas = [`Entrevista antes de pedidos grandes: ${textosEntrevista.es.modos[modo]}`]
      const tasa = (c: number, n: number): string => (n === 0 ? '—' : `${((c / n) * 100).toFixed(0)} %`)
      filas.push(`  Con entrevista: ${s.con} pedido${s.con === 1 ? '' : 's'}, correcciones después: ${s.conCorr} (${tasa(s.conCorr, s.con)})`)
      filas.push(`  Sin entrevista: ${s.sin} pedido${s.sin === 1 ? '' : 's'}, correcciones después: ${s.sinCorr} (${tasa(s.sinCorr, s.sin)})`)
      if (s.con + s.sin < 6) filas.push('  (muy pocos pedidos todavía para sacar conclusiones)')
      return filas
    },
    modoCambiado: modo => `Entrevista antes de pedidos grandes: ${modo}.`,
    uso: 'Cambia con /toki-entrevista auto | preguntar | no.',
    modos: { auto: 'automática (avisa y Claude pregunta)', preguntar: 'te consulta antes', no: 'apagada' },
    tema: {
      pregunta: t => `Esto parece otro tema y la conversación ya lleva ~${t} tokens que se releen en cada mensaje. ¿Empiezo en limpio? Tu mensaje vuelve al cuadro.`,
      si: 'Empezar en limpio (Recomendado)',
      no: 'Seguir aquí',
    },
    correccion: {
      pregunta: t =>
        `Ya corregiste dos veces lo mismo y la conversación (~${t} tokens) está llena de intentos fallidos. Lo que mejor funciona es empezar en limpio con un pedido mejor: armé uno con tus correcciones. ¿Empiezo?`,
      si: 'Empezar en limpio con el pedido mejorado (Recomendado)',
      no: 'Seguir aquí',
    },
    limpiando: 'Toki: empezando en limpio…',
    pulsaEnter: 'Toki: pulsa Enter para limpiar la conversación; tu mensaje vuelve después.',
    consejos: {
      verificar: 'Tip de Toki: dile cómo comprobar que quedó bien (una prueba, un comando, lo que debería verse). Así Claude se corrige solo y tú no iteras.',
      ubicar: 'Tip de Toki: nombra el archivo o usa @archivo. Si no, Claude busca y lee de más.',
      mezcla: 'Tip de Toki: esto mezcla varias tareas. Una por mensaje (o /clear entre ellas) rinde más y gasta menos.',
      amplio: 'Tip de Toki: «todo» es mucho. Acótalo (carpeta o módulo) o pídele que use un subagente para no llenar el contexto.',
    },
    pedidoMejorado: { corregido: 'Ya probé esto y no sirvió; tenlo en cuenta desde el inicio:', sigue: 'Antes de dar algo por hecho, comprueba que cumple lo anterior.' },
  },
  en: {
    instruccion: porque =>
      [
        porque === 'proyecto' ? '[Toki] This is a new project and the request leaves decisions open.' : '[Toki] This is a big request and the message leaves decisions open.',
        'Before reading big files or writing code, interview the person with the AskUserQuestion tool:',
        `2 to 4 multiple-choice questions per round${porque === 'proyecto' ? ' (a second round only if needed)' : ''}, recommended option first and marked "(Recommended)".`,
        'Ask only what changes the result and you cannot infer from the project: scope, technology or format, data and edge cases, and what counts as "done" (how it is checked).',
        'If you need to see the project, look only at its structure (ls, README).',
        `With the answers, save a summary of the request (max 15 lines, including the "done" criterion) to ${RUTA_SPEC} and carry on.`,
        'If the person does not want questions, continue without them.',
      ].join(' '),
    aviso: 'Big request: Claude will ask a few questions before starting (three quick answers save several corrections). Type "no questions" to skip them.',
    pregunta: 'This request is big and leaves decisions open. Should Claude ask a few multiple-choice questions before starting? It costs ~1-2k tokens and usually saves corrections.',
    opcionesPregunta: { si: 'Yes, let it ask (Recommended)', no: 'Send as is' },
    saltada: 'Done: no questions.',
    callada: 'Toki will not propose the interview again this session. /toki-entrevista auto turns it back on.',
    cmd: 'Toki: questions before a big request',
    estado: (modo, s) => {
      const filas = [`Interview before big requests: ${textosEntrevista.en.modos[modo]}`]
      const tasa = (c: number, n: number): string => (n === 0 ? '—' : `${((c / n) * 100).toFixed(0)}%`)
      filas.push(`  With interview: ${s.con} request${s.con === 1 ? '' : 's'}, corrections after: ${s.conCorr} (${tasa(s.conCorr, s.con)})`)
      filas.push(`  Without interview: ${s.sin} request${s.sin === 1 ? '' : 's'}, corrections after: ${s.sinCorr} (${tasa(s.sinCorr, s.sin)})`)
      if (s.con + s.sin < 6) filas.push('  (too few requests yet to conclude anything)')
      return filas
    },
    modoCambiado: modo => `Interview before big requests: ${modo}.`,
    uso: 'Change with /toki-entrevista auto | preguntar | no.',
    modos: { auto: 'automatic (notifies and Claude asks)', preguntar: 'asks you first', no: 'off' },
    tema: {
      pregunta: t => `This looks like a different topic and the conversation already carries ~${t} tokens that are re-read on every message. Start clean? Your message goes back to the box.`,
      si: 'Start clean (Recommended)',
      no: 'Stay here',
    },
    correccion: {
      pregunta: t =>
        `You have corrected the same thing twice and the conversation (~${t} tokens) is full of failed attempts. What works best is starting clean with a better request: I built one from your corrections. Start?`,
      si: 'Start clean with the improved request (Recommended)',
      no: 'Stay here',
    },
    limpiando: 'Toki: starting clean…',
    pulsaEnter: 'Toki: press Enter to clear the conversation; your message comes back afterwards.',
    consejos: {
      verificar: 'Toki tip: tell it how to check the result (a test, a command, what you should see). Claude then fixes itself and you do not iterate.',
      ubicar: 'Toki tip: name the file or use @file. Otherwise Claude searches and reads too much.',
      mezcla: 'Toki tip: this mixes several tasks. One per message (or /clear between them) works better and costs less.',
      amplio: 'Toki tip: "everything" is a lot. Narrow it (a folder or module) or ask it to use a subagent so the context does not fill up.',
    },
    pedidoMejorado: { corregido: 'I already tried this and it did not work; keep it in mind from the start:', sigue: 'Before calling anything done, check that it meets the above.' },
  },
}

// ---------- Consejos para pedir mejor ----------

export type Consejo = 'verificar' | 'ubicar' | 'mezcla' | 'amplio'

/** Un consejo corto para este mensaje, o nada. Primero lo que más iteraciones evita. */
export function consejoDe(texto: string, nivel: Nivel, vistos: Partial<Record<Consejo, number>> = {}): Consejo | undefined {
  const palabras = palabrasDe(texto)
  if (nivel === 'trivial' || palabras < 8) return undefined
  const permitido = (c: Consejo): boolean => (vistos[c] ?? 0) < VECES_POR_CONSEJO
  const tieneRuta = RUTA.test(texto) || /`[^`\n]+`/.test(texto)
  const accion = ACCION.test(texto)
  if (permitido('mezcla') && palabras >= 30 && ((texto.match(LISTA) ?? []).length >= 4 || MEZCLA.test(texto))) return 'mezcla'
  if (permitido('amplio') && AMPLIO.test(limpiarPrompt(texto)) && !tieneRuta) return 'amplio'
  if (permitido('ubicar') && accion && !tieneRuta && !PROYECTO.test(limpiarPrompt(texto))) return 'ubicar'
  if (permitido('verificar') && accion && palabras >= 10 && !VERIFICA.test(texto)) return 'verificar'
  return undefined
}

// ---------- Pedido mejorado después de dos correcciones ----------

/** La tarea de antes con lo que ya corregiste, para empezar en limpio sin repetir los mismos errores. */
export function armarPedidoMejorado(original: string, correcciones: readonly string[], idioma: Idioma): string {
  const x = textosEntrevista[idioma].pedidoMejorado
  const lineas = correcciones.slice(-4).map(c => `- ${limpiarPrompt(c).slice(0, 300)}`)
  return [original.trim(), '', x.corregido, ...lineas, '', x.sigue].join('\n')
}
