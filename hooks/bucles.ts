// Detector de bucles (idea de Token Optimizer): el mismo comando fallando
// una y otra vez quema contexto en cada intento. Funciones puras.

export const UMBRAL_FALLOS = 3

export type Fallos = Record<string, number>

export function normalizarComando(comando: string): string {
  return comando.trim().replace(/\s+/g, ' ')
}

/**
 * Registra el resultado de un comando y dice si hay que avisar.
 * Avisa una sola vez, justo al llegar al umbral; un éxito reinicia la cuenta.
 */
export function registrar(fallos: Fallos, comando: string, fallo: boolean): { fallos: Fallos; avisar: boolean } {
  const llave = normalizarComando(comando)
  const siguiente: Fallos = { ...fallos }
  if (!fallo) {
    delete siguiente[llave]
    return { fallos: siguiente, avisar: false }
  }
  const cuenta = (siguiente[llave] ?? 0) + 1
  siguiente[llave] = cuenta
  // Que el registro no crezca sin límite en sesiones largas.
  const llaves = Object.keys(siguiente)
  if (llaves.length > 50) delete siguiente[llaves[0] as string]
  return { fallos: siguiente, avisar: cuenta === UMBRAL_FALLOS }
}

export const AVISO_BUCLE =
  `[ahorro-tokens] Este mismo comando ya falló ${UMBRAL_FALLOS} veces seguidas. ` +
  'Antes de reintentar, revisa la causa o cambia de enfoque: cada intento repetido vuelve a enviar todo el contexto.'
