// Respuestas breves: una sección al final del system prompt que le pide a Claude
// las mínimas palabras que conserven todo lo técnico. Medido sin Toki en Opus 5.5:
// ~12 % menos salida con tareas de código y ~15 % con preguntas abiertas
// (evals/modo-breve). Funciones puras.

/** El id de la sección en el system prompt (se ve en /context). */
export const ID_BREVE = 'toki:breve'

/** El estilo de Toki que pide lo mismo: /output-style → toki:conciso. */
export const ESTILO_TOKI = 'toki:conciso'

/**
 * La sección, en inglés y siempre igual: si el texto cambiara (por ejemplo al
 * detectar tu idioma), el pedido siguiente reescribiría en el caché toda la
 * conversación. Claude te responde en tu idioma igual.
 */
export const SECCION_BREVE = [
  '# Brief replies',
  'Use the fewest words that keep all the technical information.',
  '- No greetings, preambles, closing summaries or pleasantries.',
  "- Don't announce what you're about to do or narrate each tool call: just do it.",
  '- Short, direct sentences. Use lists only when they help reading.',
  "- Explain the why only when it's needed to decide something or to understand a risk, in one sentence.",
  '- Never cut code, commands, paths, error messages, numbers, security warnings or steps the person needs.',
  '- If the person asks for detail or a longer explanation, give it.',
  "- Reply in the person's language.",
].join('\n')

/**
 * Qué hacer con un system prompt:
 * - `agregar`: el estilo por defecto y la opción prendida, va la sección.
 * - `estilo`: elegiste el estilo de Toki (pide lo mismo): no se agrega, pero cuenta.
 * - `tuyo`: elegiste otro estilo: se respeta, ni sección ni aviso de conciso.
 * - `apagado`: la opción está apagada en /plugin.
 * - `bare`: Claude Code corre con el prompt de una línea (--bare): no se toca.
 */
export type DecisionBreve = 'agregar' | 'estilo' | 'tuyo' | 'apagado' | 'bare'

export function decidirBreve(a: { activo: boolean; estilo: string | null | undefined; traits: readonly string[] }): DecisionBreve {
  if (a.traits.includes('bare')) return 'bare'
  if (a.estilo === ESTILO_TOKI) return 'estilo'
  if (a.estilo !== null && a.estilo !== undefined) return 'tuyo'
  return a.activo ? 'agregar' : 'apagado'
}

/** Las respuestas breves están puestas (la sección o el estilo de Toki): la salida de cada pedido cuenta. */
export function breveActivo(d: DecisionBreve | undefined): boolean {
  return d === 'agregar' || d === 'estilo'
}
