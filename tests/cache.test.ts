import { describe, expect, test } from 'claude-code/testing'

import { CACHE, debeMantenerCache, evaluarPing } from '../hooks/cache'
import type { EstadoCache } from '../hooks/cache'

const T0 = 1_000_000_000

function estado(cambios: Partial<EstadoCache> = {}): EstadoCache {
  return {
    activo: true,
    esApi: true,
    trabajando: false,
    ahora: T0 + CACHE.intervaloMs + 1_000,
    ultimoUsoCache: T0,
    ultimaInteraccion: T0,
    pingsEnPausa: 0,
    apagadoEnPausa: false,
    contextoTokens: 80_000,
    modeloCambio: false,
    ...cambios,
  }
}

describe('mantener el caché caliente', () => {
  test('hace ping justo antes de que venzan los 5 minutos', async () => {
    expect(debeMantenerCache(estado())).toBe(true)
    expect(debeMantenerCache(estado({ ahora: T0 + 60_000 }))).toBe(false)
  })

  test('nunca con suscripción, apagado, trabajando o tras cambiar de modelo', async () => {
    expect(debeMantenerCache(estado({ esApi: false }))).toBe(false)
    expect(debeMantenerCache(estado({ activo: false }))).toBe(false)
    expect(debeMantenerCache(estado({ trabajando: true }))).toBe(false)
    expect(debeMantenerCache(estado({ modeloCambio: true }))).toBe(false)
    expect(debeMantenerCache(estado({ apagadoEnPausa: true }))).toBe(false)
  })

  test('no vale la pena con poco contexto ni si el caché ya venció', async () => {
    expect(debeMantenerCache(estado({ contextoTokens: 4_000 }))).toBe(false)
    expect(debeMantenerCache(estado({ ahora: T0 + CACHE.ttlApiMs + 1 }))).toBe(false)
  })

  test('se rinde tras 30 minutos o 7 pings: probablemente te fuiste', async () => {
    expect(debeMantenerCache(estado({ pingsEnPausa: CACHE.maxPings }))).toBe(false)
    const tarde = T0 + CACHE.ventanaMs + 60_000
    expect(debeMantenerCache(estado({ ahora: tarde, ultimoUsoCache: tarde - CACHE.intervaloMs - 1_000 }))).toBe(false)
  })

  test('un ping solo sirvió si leyó del caché', async () => {
    expect(evaluarPing({ isAnswered: true, usage: { cache_read_input_tokens: 43_000 } })).toEqual({ sirvio: true, leidos: 43_000 })
    expect(evaluarPing({ isAnswered: true, usage: { cache_read_input_tokens: 0 } }).sirvio).toBe(false)
    expect(evaluarPing({ isAnswered: false, reason: 'nothing-to-fork' }).sirvio).toBe(false)
    expect(evaluarPing({ isAnswered: false, reason: 'api-error', usage: { cache_read_input_tokens: 0 } }).sirvio).toBe(false)
  })
})
