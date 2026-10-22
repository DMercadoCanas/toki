import { describe, expect, test } from 'claude-code/testing'

import {
  ahorroNeto,
  costoClasificador,
  costoSinTokiPedido,
  esPedidoPrevio,
  factorSalida,
  leidoSinToki,
  porcentajeAhorro,
  valorEscritura,
  valorLectura,
} from '../hooks/ahorro'
import type { PedidoPrevio } from '../hooks/ahorro'
import { costoMedido } from '../hooks/modelo'

/** Igual salvo redondeo. */
function cerca(a: number, b: number, eps = 1e-9): void {
  expect(Math.abs(a - b)).toBeLessThan(eps)
}

const HORA = 3_600_000
const OPUS_ANTES: PedidoPrevio = { familia: 'opus', sin: 'opus', tamano: 50_000, cuando: 0 }
const base = {
  familia: 'sonnet' as const,
  sin: 'opus' as const,
  leido: 18_000,
  cacheable: 53_000,
  ahora: 60_000,
  ttlMs: HORA,
  trasLimpiar: false,
  comienzo: 20_000,
  conPings: false,
}

describe('ahorro medido', () => {
  test('la salida de cada esfuerzo frente al que se usó', async () => {
    cerca(factorSalida('xhigh', 'medium'), 1.37)
    cerca(factorSalida('medium', 'low'), 1 / 0.73)
    expect(factorSalida('high', 'high')).toBe(1)
    expect(factorSalida('high', 'medium')).toBe(1)
    expect(factorSalida(undefined, 'low')).toBe(1)
    expect(factorSalida(30, 'low')).toBe(1)
  })

  test('reconoce el último pedido guardado', async () => {
    expect(esPedidoPrevio(OPUS_ANTES)).toBe(true)
    expect(esPedidoPrevio({ ...OPUS_ANTES, prefijo: 18_000 })).toBe(true)
    expect(esPedidoPrevio({ ...OPUS_ANTES, familia: 'gpt' })).toBe(false)
    expect(esPedidoPrevio({ ...OPUS_ANTES, tamano: -1 })).toBe(false)
    expect(esPedidoPrevio({ familia: 'opus', sin: 'opus' })).toBe(false)
    expect(esPedidoPrevio(null)).toBe(false)
    expect(esPedidoPrevio('opus')).toBe(false)
  })

  test('sin cambio de modelo, el caché sin Toki es el real', async () => {
    expect(leidoSinToki({ ...base })).toBe(18_000)
    expect(leidoSinToki({ ...base, previo: { ...OPUS_ANTES, familia: 'sonnet' } })).toBe(18_000)
    // Cambiaste tú de modelo: sin Toki también se habría reescrito.
    expect(leidoSinToki({ ...base, sin: 'sonnet', previo: OPUS_ANTES })).toBe(18_000)
  })

  test('si Toki cambió de modelo, tu modelo tenía la conversación en caché', async () => {
    expect(leidoSinToki({ ...base, previo: OPUS_ANTES })).toBe(50_000)
    // Nunca más de lo que este pedido podía leer.
    expect(leidoSinToki({ ...base, previo: { ...OPUS_ANTES, tamano: 90_000 } })).toBe(53_000)
    // Tras /clear o compactar solo queda en común el comienzo.
    expect(leidoSinToki({ ...base, previo: OPUS_ANTES, trasLimpiar: true })).toBe(20_000)
    expect(leidoSinToki({ ...base, previo: OPUS_ANTES, trasLimpiar: true, leido: 25_000 })).toBe(25_000)
  })

  test('caché vencido: sin los pings de Toki queda el comienzo como mucho', async () => {
    const tarde = { ...base, familia: 'opus' as const, leido: 50_000, ahora: 2 * HORA, previo: OPUS_ANTES }
    expect(leidoSinToki({ ...tarde })).toBe(50_000)
    expect(leidoSinToki({ ...tarde, conPings: true })).toBe(20_000)
  })

  test('lo que habría costado el pedido sin Toki', async () => {
    const uso = { entrada: 1_000, leido: 0, escrito: 50_000, salida: 500 }
    // Opus con 45k en caché: 1k de entrada, 45k leídos, 5k escritos, 500 de salida.
    cerca(costoSinTokiPedido({ familia: 'opus', uso, ttl1h: false, leido: 45_000 }), 0.048)
    cerca(costoSinTokiPedido({ familia: 'opus', uso, ttl1h: false, leido: 45_000, factorSalida: 1.37 }), 0.0517)
    // Nunca lee más de lo que había para leer.
    cerca(costoSinTokiPedido({ familia: 'opus', uso, ttl1h: false, leido: 99_999 }), 0.024)
    // Sin `leido`, el mismo caché que el real.
    cerca(costoSinTokiPedido({ familia: 'opus', uso, ttl1h: false }), costoMedido('opus', uso, false))
  })

  test('cambiar a Sonnet con el caché de Opus caliente cuesta más; seguir en Sonnet ahorra', async () => {
    const cambio = { entrada: 1_000, leido: 0, escrito: 50_000, salida: 500 }
    const real = costoMedido('sonnet', cambio, false)
    const sin = costoSinTokiPedido({ familia: 'opus', uso: cambio, ttl1h: false, leido: 45_000 })
    expect(real).toBeGreaterThan(sin)
    const sigue = { entrada: 1_000, leido: 50_000, escrito: 3_000, salida: 500 }
    cerca(costoMedido('sonnet', sigue, false), 0.0195)
    cerca(costoSinTokiPedido({ familia: 'opus', uso: sigue, ttl1h: false }), 0.039)
  })

  test('preguntarle a Haiku cuesta casi nada, pero se cuenta', async () => {
    cerca(costoClasificador(1_000), 0.0001325)
    cerca(costoClasificador(-5), 0.0000325)
  })

  test('lo que vale no escribir ni releer', async () => {
    cerca(valorEscritura(10_000, 'opus', true), 0.08)
    cerca(valorEscritura(10_000, 'opus', false), 0.05)
    cerca(valorEscritura(10_000, 'haiku', false, 150_000), 0.00625)
    cerca(valorLectura(1_000_000, 'sonnet'), 0.1)
    // Las relecturas de la barra, en dólares: 14,8M en Opus.
    cerca(valorLectura(14_800_000, 'opus'), 2.96, 1e-6)
  })

  test('la cifra única y su porcentaje', async () => {
    cerca(ahorroNeto({ recorte: 1, relecturas: 2, ruteo: 0.5, ruteoExtra: 0.25 }), 3.25)
    expect(ahorroNeto({})).toBe(0)
    expect(porcentajeAhorro(1, 3)).toBe(25)
    expect(porcentajeAhorro(3.07, 13.93)).toBe(18)
    expect(porcentajeAhorro(0, 3)).toBeUndefined()
    expect(porcentajeAhorro(-1, 3)).toBeUndefined()
    expect(porcentajeAhorro(1, Number.NaN)).toBeUndefined()
  })
})
