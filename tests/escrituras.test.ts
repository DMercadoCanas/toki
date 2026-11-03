import { describe, expect, test } from 'claude-code/testing'

import {
  anotar,
  causasPorCosto,
  clasificarEscritura,
  conSesion,
  costoReescritura,
  leerCachePorSesion,
  leerLibro,
  leerPedidoCache,
  lineaReescritura,
  MIN_REESCRITURA,
  porCausa,
  SESIONES_GUARDADAS,
  totalLibro,
} from '../hooks/escrituras'
import type { PedidoCache } from '../hooks/escrituras'
import { leerSemanas, sumarSemana, tarjetaSemana } from '../hooks/semana'

// Las reescrituras del caché: lo que un pedido volvió a escribir aunque el anterior lo había
// dejado en el caché, con su causa probable y lo que costó de más frente a leerlo.

const MIN = 60_000
const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const T0 = 10_000_000
/** El pedido anterior: 100k en el caché de Opus con esfuerzo medio. */
const PREVIO: PedidoCache = { cacheado: 100_000, modelo: OPUS, esfuerzo: 'medium', cuando: T0 }
/** Este pedido salió `min` minutos después, con lo que cambie `cambio`. */
const actual = (min: number, cambio: Partial<PedidoCache> = {}): PedidoCache => ({ cacheado: 102_000, modelo: OPUS, esfuerzo: 'medium', cuando: T0 + min * MIN, ...cambio })
const UNA_HORA = 60 * MIN

describe('reescrituras del caché (puro)', () => {
  test('lo que no se leyó de lo que había y sí se escribió es la reescritura; poco es ruido', () => {
    // Sin pedido anterior (una conversación nueva) no hay nada que reescribir.
    expect(clasificarEscritura({ actual: actual(1), leido: 0, escrito: 102_000, comienzo: 20_000, ttlMs: UNA_HORA })).toBe(undefined)
    // Leyó todo y escribió lo nuevo: nada.
    expect(clasificarEscritura({ previo: PREVIO, actual: actual(1), leido: 100_000, escrito: 2_000, comienzo: 20_000, ttlMs: UNA_HORA })).toBe(undefined)
    // Le faltaron menos de MIN_REESCRITURA: se confunde con lo nuevo.
    const poco = 100_000 - (MIN_REESCRITURA - 1)
    expect(clasificarEscritura({ previo: PREVIO, actual: actual(1), leido: poco, escrito: 7_000, comienzo: 20_000, ttlMs: UNA_HORA })).toBe(undefined)
    // Escribió más de lo que había: solo lo que había cuenta.
    expect(clasificarEscritura({ previo: PREVIO, actual: actual(90), leido: 0, escrito: 102_000, comienzo: 20_000, ttlMs: UNA_HORA })?.tokens).toBe(100_000)
  })

  test('la causa: venció el plazo, cambió el modelo o el esfuerzo, una pausa larga, compactar u otro cambio', () => {
    const base = { previo: PREVIO, leido: 0, escrito: 102_000, comienzo: 20_000, ttlMs: UNA_HORA }
    expect(clasificarEscritura({ ...base, actual: actual(61) })).toEqual({ causa: 'pausa', tokens: 100_000, minutos: 61 })
    // Con la pausa vencida da igual que cambiara el modelo: el caché ya no estaba.
    expect(clasificarEscritura({ ...base, actual: actual(61, { modelo: SONNET, modeloToki: true }) })?.causa).toBe('pausa')
    expect(clasificarEscritura({ ...base, actual: actual(1, { modelo: SONNET }) })).toEqual({ causa: 'modelo', tokens: 100_000, porToki: false })
    expect(clasificarEscritura({ ...base, actual: actual(1, { modelo: SONNET, modeloToki: true }) })?.porToki).toBe(true)
    // Volver a tu modelo después de un mensaje que Toki mandó a otro también es por Toki.
    expect(clasificarEscritura({ ...base, previo: { ...PREVIO, modelo: SONNET, modeloToki: true }, actual: actual(1) })?.porToki).toBe(true)
    expect(clasificarEscritura({ ...base, actual: actual(1, { esfuerzo: 'low', esfuerzoToki: true }) })).toEqual({ causa: 'esfuerzo', tokens: 100_000, porToki: true })
    // Con suscripción el plazo es 1 h, pero con créditos de uso es 5 min: 12 min sin otro cambio es la pausa.
    expect(clasificarEscritura({ ...base, actual: actual(12) })).toEqual({ causa: 'pausa', tokens: 100_000, minutos: 12 })
    expect(clasificarEscritura({ ...base, actual: actual(2) })).toEqual({ causa: 'otro', tokens: 100_000 })
    // Un ping de Toki leyó el caché hace 2 min: la pausa cuenta desde ahí.
    expect(clasificarEscritura({ ...base, ttlMs: 5 * MIN, actual: actual(30), ultimoPing: T0 + 28 * MIN })?.causa).toBe('otro')
    expect(clasificarEscritura({ ...base, ttlMs: 5 * MIN, actual: actual(30), ultimoPing: T0 + 20 * MIN })).toEqual({ causa: 'pausa', tokens: 100_000, minutos: 10 })
  })

  test('tras compactar o /clear solo cuenta el comienzo: el resumen es nuevo, no una reescritura', () => {
    const base = { previo: PREVIO, comienzo: 30_000, ttlMs: UNA_HORA, actual: actual(1, { cacheado: 52_000 }) }
    // Leyó el comienzo y escribió el resumen: nada que anotar.
    expect(clasificarEscritura({ ...base, limpio: 'compactacion', leido: 30_000, escrito: 22_000 })).toBe(undefined)
    // Se volvió a escribir parte del comienzo (cambió la memoria o CLAUDE.md, que se aplican al compactar).
    expect(clasificarEscritura({ ...base, limpio: 'compactacion', leido: 18_000, escrito: 34_000 })).toEqual({ causa: 'compactacion', tokens: 12_000 })
    expect(clasificarEscritura({ ...base, limpio: 'clear', leido: 18_000, escrito: 34_000 })).toEqual({ causa: 'otro', tokens: 12_000 })
    // Tras una pausa larga, compactar no es la causa.
    expect(clasificarEscritura({ ...base, limpio: 'compactacion', actual: actual(90, { cacheado: 52_000 }), leido: 0, escrito: 52_000 })).toEqual({ causa: 'pausa', tokens: 30_000, minutos: 90 })
  })

  test('lo que costó de más: escribirlo en vez de leerlo, al precio del plazo', () => {
    const usd = (n: number) => Math.round(n * 1e6) / 1e6
    // Opus: escribir con plazo de 1 h, $8 el millón; con 5 min, $5; leer, $0.20.
    expect(usd(costoReescritura(100_000, 'opus', true))).toBe(0.78)
    expect(usd(costoReescritura(100_000, 'opus', false))).toBe(0.48)
    expect(usd(costoReescritura(100_000, 'sonnet', true))).toBe(0.39)
    expect(costoReescritura(0, 'opus', true)).toBe(0)
  })

  test('la línea del diagnóstico dice cuánto, por qué y cuánto de más', () => {
    const r = (x: Parameters<typeof lineaReescritura>[0]) => lineaReescritura(x, PREVIO, actual(1, { modelo: SONNET, esfuerzo: 'low' }), 0.42)
    expect(r({ causa: 'pausa', tokens: 85_200, minutos: 12 })).toBe('caché reescrito: 85.2k por una pausa de 12 min, ~$0.42 de más')
    expect(r({ causa: 'modelo', tokens: 85_200, porToki: true })).toBe('caché reescrito: 85.2k por cambio de modelo claude-opus-5-5 → claude-sonnet-5-5 (Toki), ~$0.42 de más')
    expect(r({ causa: 'esfuerzo', tokens: 85_200, porToki: false })).toBe('caché reescrito: 85.2k por cambio de esfuerzo medium → low, ~$0.42 de más')
    expect(r({ causa: 'compactacion', tokens: 12_000 })).toBe('caché reescrito: 12.0k al compactar, ~$0.42 de más')
    expect(r({ causa: 'otro', tokens: 12_000 })).toBe('caché reescrito: 12.0k por otro cambio (ni pausa, ni modelo, ni esfuerzo), ~$0.42 de más')
  })

  test('el libro suma por causa y ordena por lo que costó', () => {
    let libro = anotar({}, 'modelo', 40_000, 0.22)
    libro = anotar(libro, 'pausa', 100_000, 0.48)
    libro = anotar(libro, 'pausa', 30_000, 0.14)
    expect(libro).toEqual({ modelo: { veces: 1, tokens: 40_000, usd: 0.22 }, pausa: { veces: 2, tokens: 130_000, usd: 0.62 } })
    expect(totalLibro(libro)).toEqual({ veces: 3, tokens: 170_000, usd: 0.84 })
    expect(causasPorCosto(libro)).toEqual(['pausa', 'modelo'])
    expect(porCausa(libro, 'es')).toEqual([
      { nombre: 'pausas', usd: '~$0.62' },
      { nombre: 'cambios de modelo', usd: '~$0.22' },
    ])
    expect(porCausa(libro, 'en').map(c => c.nombre)).toEqual(['pauses', 'model switches'])
    expect(totalLibro({})).toEqual({ veces: 0, tokens: 0, usd: 0 })
  })

  test('lo guardado se lee con cuidado: lo que no se entiende no cuenta', () => {
    expect(leerLibro(undefined)).toEqual({})
    expect(leerLibro({ pausa: { veces: 2, tokens: 9_000, usd: 0.1 }, otra: { veces: 1 }, modelo: { veces: 0, tokens: 5 }, esfuerzo: 'x', otro: { veces: 1, tokens: -3, usd: 'y' } })).toEqual({
      pausa: { veces: 2, tokens: 9_000, usd: 0.1 },
      otro: { veces: 1, tokens: 0, usd: 0 },
    })
    expect(leerPedidoCache({ cacheado: 5, modelo: OPUS, cuando: 1, esfuerzo: 'high', modeloToki: true, esfuerzoToki: 'sí', extra: 1 })).toEqual({ cacheado: 5, modelo: OPUS, cuando: 1, esfuerzo: 'high', modeloToki: true })
    expect(leerPedidoCache({ cacheado: -1, modelo: OPUS, cuando: 1 })).toBe(undefined)
    expect(leerPedidoCache({ cacheado: 5, modelo: '', cuando: 1 })).toBe(undefined)
    expect(leerCachePorSesion({ s1: PREVIO, s2: { cacheado: 'mucho' } })).toEqual({ s1: PREVIO })
    expect(leerCachePorSesion([PREVIO])).toEqual({})
  })

  test('se recuerdan las últimas sesiones, las más recientes', () => {
    let guardadas: Record<string, PedidoCache> = {}
    for (let i = 0; i < SESIONES_GUARDADAS + 3; i++) guardadas = conSesion(guardadas, `s${i}`, { ...PREVIO, cuando: T0 + i * MIN })
    expect(Object.keys(guardadas).length).toBe(SESIONES_GUARDADAS)
    expect(guardadas['s0']).toBe(undefined)
    expect(guardadas[`s${SESIONES_GUARDADAS + 2}`]?.cuando).toBe(T0 + (SESIONES_GUARDADAS + 2) * MIN)
    // Volver a una sesión la pone al día.
    expect(conSesion(guardadas, 's5', { ...PREVIO, cuando: T0 + 999 * MIN })['s5']?.cuando).toBe(T0 + 999 * MIN)
  })
})

describe('reescrituras en la semana (puro)', () => {
  // Miércoles 21 de octubre de 2026, mediodía local.
  const MIE = new Date(2026, 9, 21, 12).getTime()

  test('se suman por causa, sobreviven al store y la tarjeta dice cuánto y por qué', () => {
    let s = sumarSemana({}, MIE, { reescritura: { causa: 'pausa', tokens: 100_000, usd: 0.48 } })
    s = sumarSemana(s, MIE, { reescritura: { causa: 'modelo', tokens: 40_000, usd: 0.22 } })
    s = sumarSemana(s, MIE, { reescritura: { causa: 'pausa', tokens: 30_000, usd: 0.14 } })
    expect(s['2026-10-19']?.reescrito).toEqual({ pausa: { veces: 2, tokens: 130_000, usd: 0.62 }, modelo: { veces: 1, tokens: 40_000, usd: 0.22 } })
    expect(leerSemanas(JSON.parse(JSON.stringify(s)))['2026-10-19']?.reescrito).toEqual(s['2026-10-19']?.reescrito)
    // Una semana guardada antes de esto se lee sin reescrituras.
    expect(leerSemanas({ '2026-10-19': { pedidos: 3 } })['2026-10-19']?.reescrito).toEqual({})
    expect(tarjetaSemana(s, '2026-10-19', MIE, {})).toContain('Reescribir lo que ya estaba en el caché: ~$0.84 de más en 3 veces (pausas ~$0.62 · cambios de modelo ~$0.22)')
    expect(tarjetaSemana(s, '2026-10-19', MIE, {}, { idioma: 'en' })).toContain('Rewriting what was already cached: ~$0.84 extra over 3 times (pauses ~$0.62 · model switches ~$0.22)')
    const una = sumarSemana({}, MIE, { reescritura: { causa: 'esfuerzo', tokens: 30_000, usd: 0.15 } })
    expect(tarjetaSemana(una, '2026-10-19', MIE, {})).toContain('~$0.15 de más en 1 vez, por cambios de esfuerzo')
    // Menos de medio centavo no se muestra.
    const nada = sumarSemana({}, MIE, { reescritura: { causa: 'otro', tokens: 6_000, usd: 0.001 } })
    expect(tarjetaSemana(nada, '2026-10-19', MIE, {})).not.toContain('Reescribir')
  })
})
