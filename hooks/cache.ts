// Mantener el caché caliente (solo para quien paga por token en la API).
//
// En la API el caché del prompt dura 5 minutos. Si vuelves de una pausa corta,
// tu siguiente mensaje reescribe todo el contexto en el caché (1,25× el precio
// normal). Un "ping" que solo lee el caché (0,1×) antes de que venza lo mantiene
// vivo. Con una suscripción el caché dura 1 hora y esto no hace falta.
// Funciones puras: aquí solo se decide; register.tsx hace el ping.

export const CACHE = {
  /** Cada cuánto se refresca: antes de los 5 min del caché, con margen. */
  intervaloMs: 255_000,
  /** Cuánto seguir después de tu último mensaje: más allá, probablemente te fuiste. */
  ventanaMs: 30 * 60_000,
  /** Máximo de pings por pausa (7 × 4¼ min ≈ 30 min). */
  maxPings: 7,
  /** Con menos contexto que esto, el ahorro no compensa. */
  minTokens: 10_000,
  /** Lo que dura el caché en la API. */
  ttlApiMs: 5 * 60_000,
} as const

export type EstadoCache = {
  /** La opción "Mantener el caché caliente" está encendida. */
  activo: boolean
  /** Pagas por token (sin límites de suscripción). */
  esApi: boolean
  /** Hay un turno en curso: Claude ya está usando el caché. */
  trabajando: boolean
  ahora: number
  /** La última vez que algo leyó o escribió el caché (un turno o un ping). */
  ultimoUsoCache: number
  /** Tu último mensaje (fin del último turno). */
  ultimaInteraccion: number
  pingsEnPausa: number
  /** Un ping no leyó del caché, falló o no había nada que reusar: se para hasta tu próximo mensaje. */
  apagadoEnPausa: boolean
  contextoTokens: number | undefined
  /** Cambiaste de modelo después del último turno: el caché del modelo anterior ya no sirve. */
  modeloCambio: boolean
}

export function debeMantenerCache(s: EstadoCache): boolean {
  if (!s.activo || !s.esApi || s.trabajando || s.apagadoEnPausa || s.modeloCambio) return false
  if (s.ultimaInteraccion <= 0 || s.ultimoUsoCache <= 0) return false
  if ((s.contextoTokens ?? 0) < CACHE.minTokens) return false
  if (s.pingsEnPausa >= CACHE.maxPings) return false
  if (s.ahora - s.ultimaInteraccion > CACHE.ventanaMs) return false
  // Si el caché ya venció, un ping pagaría todo el contexto otra vez: no se hace.
  if (s.ahora - s.ultimoUsoCache >= CACHE.ttlApiMs) return false
  return s.ahora - s.ultimoUsoCache >= CACHE.intervaloMs
}

export type ResultadoPing =
  | { isAnswered: true; usage: { cache_read_input_tokens: number } }
  | { isAnswered: false; reason: string; usage?: { cache_read_input_tokens: number } }

/** ¿El ping sirvió? Solo si leyó del caché; si no, el caché ya estaba frío y se para. */
export function evaluarPing(r: ResultadoPing): { sirvio: boolean; leidos: number } {
  const leidos = r.usage?.cache_read_input_tokens ?? 0
  return { sirvio: leidos > 0 && (r.isAnswered || r.reason === 'empty-reply'), leidos }
}
