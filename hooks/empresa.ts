// El guardia de empresa: en las cuentas Team y Enterprise, Claude Code corre antes que los
// plugins un guardia (cc-plugin-sec-default) que se salta algunos de sus hooks, y por cada
// hook saltado le deja a Claude un aviso de ~200 tokens, otra vez tras cada compactación.
// Con la opción «Guardia de empresa», Toki no registra esos hooks y usa sus alternativas.
// Toki la prende al notar el guardia y la apaga cada 30 días para ver si sigue; también
// la puedes cambiar tú en /plugin. Funciones puras: register.tsx guarda y cambia la opción.

/** El campo de userConfig: la fila de /plugin es `<plugin>.guardiaEmpresa`. */
export const OPCION_EMPRESA = 'guardiaEmpresa'

/** Cada cuánto Toki apaga la opción para ver si el guardia sigue (por si cambiaste de cuenta). */
export const DIAS_REVISION_EMPRESA = 30

const DIA = 86_400_000

/** Lo que Toki recuerda del guardia entre sesiones. */
export type EstadoEmpresa = {
  /** Desde cuándo está prendida la opción (por Toki o por ti): de ahí corren los 30 días. */
  desde?: number
  /** Toki la apagó para revisar: si el guardia sigue, la vuelve a prender sin avisar. */
  revisando?: boolean
  /** Toki la prendió: al recargar, un aviso dice qué hizo y cómo apagarla. */
  avisar?: boolean
  /** La conversación donde ya se mandó la nota de respuestas breves antes de recargar. */
  nota?: string
  /** Claude Code no dejó prenderla: ya se avisó que puedes hacerlo tú. */
  negada?: boolean
}

/** Sin los campos vacíos: así se guarda y así se compara. */
function limpiar(estado: EstadoEmpresa): EstadoEmpresa {
  return Object.fromEntries(Object.entries(estado).filter(([, v]) => v !== undefined && v !== false)) as EstadoEmpresa
}

export function leerEstadoEmpresa(valor: unknown): EstadoEmpresa {
  if (typeof valor !== 'object' || valor === null) return {}
  const v = valor as Record<string, unknown>
  return limpiar({
    desde: typeof v.desde === 'number' && Number.isFinite(v.desde) ? v.desde : undefined,
    revisando: v.revisando === true,
    avisar: v.avisar === true,
    nota: typeof v.nota === 'string' && v.nota !== '' ? v.nota : undefined,
    negada: v.negada === true,
  })
}

/**
 * Al empezar o al recargar: con la opción prendida corren los 30 días (desde hoy si la
 * prendiste tú); cumplidos, Toki la apaga para revisar. Apagada, el plazo se olvida.
 * `avisar`: Toki acaba de prenderla y hay que decirlo.
 */
export function revisarEmpresa(estado: EstadoEmpresa, prendida: boolean, ahora: number): { estado: EstadoEmpresa; apagar: boolean; avisar: boolean } {
  if (!prendida) return { estado: limpiar({ ...estado, desde: undefined, avisar: undefined }), apagar: false, avisar: false }
  const desde = estado.desde ?? ahora
  if (ahora - desde >= DIAS_REVISION_EMPRESA * DIA) {
    return { estado: limpiar({ ...estado, desde: undefined, avisar: undefined, revisando: true }), apagar: true, avisar: false }
  }
  return { estado: limpiar({ ...estado, desde, avisar: undefined, revisando: undefined, negada: undefined }), apagar: false, avisar: estado.avisar === true }
}

/**
 * El guardia se saltó prompt.compose en un turno que Toki vio entero: la opción se prende
 * desde ahora. Si fue la revisión de los 30 días, sin aviso: ya lo sabías.
 */
export function detectarEmpresa(estado: EstadoEmpresa, ahora: number, nota: string | undefined): EstadoEmpresa {
  return limpiar({ desde: ahora, avisar: estado.revisando !== true, nota, negada: estado.negada })
}

/** Tras la revisión prompt.compose corrió: el guardia ya no está y la opción queda apagada. */
export function terminarRevision(estado: EstadoEmpresa): EstadoEmpresa {
  return limpiar({ ...estado, revisando: undefined })
}
