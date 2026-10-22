import { describe, expect, test } from 'claude-code/testing'

import {
  alCompactar,
  contarLimpio,
  contarPedido,
  contarTemprana,
  decidirVentana,
  esRepetida,
  GASTO_VACIO,
  huella,
  iniciarTemprana,
  leerVentana,
  porcentajeRelectura,
  RELECTURAS_VACIAS,
  retirar,
  sumarPedido,
  tamanoDelPedido,
  topeLimpio,
  totalGasto,
} from '../hooks/gasto'

const PEDIDO = { input_tokens: 2, output_tokens: 300, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 1_500 }

describe('gasto', () => {
  test('suma cada pedido: el principal por partes, los subagentes aparte', async () => {
    let g = sumarPedido(GASTO_VACIO, PEDIDO, false)
    g = sumarPedido(g, PEDIDO, false)
    g = sumarPedido(g, { ...PEDIDO, cache_read_input_tokens: 10_000 }, true)
    expect(g.pedidos).toBe(2)
    expect(g.cacheLeido).toBe(400_000)
    expect(g.salida).toBe(600)
    expect(g.subPedidos).toBe(1)
    expect(g.subTokens).toBe(2 + 10_000 + 1_500 + 300)
    expect(tamanoDelPedido(PEDIDO)).toBe(201_502)
    expect(totalGasto(g)).toBe(2 * 201_802 + 11_802)
    // Casi todo es releer la conversación desde el caché.
    expect(porcentajeRelectura(g)).toBe(99)
  })

  test('lo que Toki saca del contexto se deja de releer en cada pedido siguiente', async () => {
    let r = retirar(RELECTURAS_VACIAS, 5_000)
    // El primer pedido es el que habría llevado la salida: eso ya es el ahorro directo.
    let c = contarPedido(r)
    expect(c.evitadas).toBe(0)
    c = contarPedido(c.r)
    expect(c.evitadas).toBe(5_000)
    r = retirar(c.r, 1_000)
    c = contarPedido(r)
    expect(c.evitadas).toBe(5_000)
    c = contarPedido(c.r)
    expect(c.evitadas).toBe(6_000)
    // Tras compactar ya no estaba en el contexto: nada que contar.
    expect(contarPedido(alCompactar()).evitadas).toBe(0)
  })

  test('compactar antes: cuenta la diferencia hasta donde Claude Code habría compactado, y descuenta la compactación', async () => {
    const inicio = iniciarTemprana(290_000, 500_000)
    expect(inicio.evitadas).toBe(-290_000)
    let p = contarTemprana(inicio.t, 50_000)
    expect(p.evitadas).toBe(240_000)
    p = contarTemprana(p.t, 60_000)
    // Sin Toki: 290k + lo que creció (10k) = 300k; con Toki: 60k.
    expect(p.evitadas).toBe(240_000)
    // Sin Toki habría llegado a la ventana nativa: desde aquí Claude Code también habría compactado.
    p = contarTemprana(p.t, 270_000)
    expect(p.evitadas).toBe(0)
    expect(p.t).toBe(undefined)
    expect(contarTemprana(undefined, 80_000).evitadas).toBe(0)
  })

  test('empezar en limpio con el caché vivo: el primer pedido no cuenta, desde el segundo se deja de releer lo de antes', async () => {
    const l = { antes: 150_000, tope: topeLimpio(1_000_000), frio: false }
    expect(l.tope).toBe(800_000)
    let p = contarLimpio(l, 25_000)
    expect(p.relecturas).toBe(0)
    expect(p.reescritura).toBe(0)
    expect(p.l?.inicio).toBe(25_000)
    p = contarLimpio(p.l, 30_000)
    // Sin Toki: 150k + lo que creció (5k) = 155k; con Toki: 30k. Se cuenta lo que pesaba la de antes y ya no se relee.
    expect(p.relecturas).toBe(125_000)
    expect(p.sinToki).toBe(155_000)
    // Si la nueva pesa menos que al empezar (Claude Code limpió algo), no se cuenta más que eso.
    p = contarLimpio(p.l, 10_000)
    expect(p.relecturas).toBe(125_000)
    // La de antes habría llegado al 80 % de la ventana: Claude Code la habría compactado, no se cuenta más.
    p = contarLimpio(p.l, 700_000)
    expect(p.relecturas).toBe(0)
    expect(p.l).toBe(undefined)
    expect(contarLimpio(undefined, 30_000).relecturas).toBe(0)
  })

  test('empezar en limpio con el caché vencido: el primer pedido ya no reescribe la conversación de antes', async () => {
    let p = contarLimpio({ antes: 220_000, tope: 800_000, frio: true }, 25_000)
    expect(p.reescritura).toBe(195_000)
    expect(p.relecturas).toBe(0)
    expect(p.sinToki).toBe(220_000)
    p = contarLimpio(p.l, 27_000)
    expect(p.reescritura).toBe(0)
    expect(p.relecturas).toBe(195_000)
  })

  test('empezar en limpio no cuenta si la nueva ya pesa lo de antes o si la de antes estaba por compactarse', async () => {
    expect(contarLimpio({ antes: 20_000, tope: 800_000, frio: true }, 25_000)).toEqual({ l: undefined, relecturas: 0, reescritura: 0, sinToki: 25_000 })
    expect(contarLimpio({ antes: 170_000, tope: topeLimpio(200_000), frio: true }, 25_000).l).toBe(undefined)
    // Sin ventana conocida no hay tope: no se cuenta.
    expect(contarLimpio({ antes: 170_000, tope: topeLimpio(0), frio: false }, 25_000).l).toBe(undefined)
  })

  test('baja la ventana solo si nadie la eligió y si la de Claude Code es más grande', async () => {
    const base = { elegida: 300_000, nativa: 500_000, fuente: 'clientdata', envActual: undefined, puestaPorToki: undefined }
    expect(decidirVentana(base)).toEqual({ poner: 300_000, motivo: 'bajada' })
    expect(decidirVentana({ ...base, elegida: 0 }).motivo).toBe('apagado')
    expect(decidirVentana({ ...base, fuente: 'settings' }).motivo).toBe('tuya')
    expect(decidirVentana({ ...base, fuente: 'env', envActual: '400000' }).motivo).toBe('tuya')
    expect(decidirVentana({ ...base, nativa: 200_000, fuente: 'model-default' }).motivo).toBe('ya-baja')
    expect(decidirVentana({ ...base, nativa: undefined }).motivo).toBe('sin-datos')
    // La variable la puso Toki antes (otra recarga): la vuelve a poner con el valor elegido.
    expect(decidirVentana({ ...base, fuente: 'env', envActual: '300000', puestaPorToki: '300000' })).toEqual({ poner: 300_000, motivo: 'bajada' })
  })

  test('lee la opción de la ventana', async () => {
    expect(leerVentana('300k')).toBe(300_000)
    expect(leerVentana('200K')).toBe(200_000)
    expect(leerVentana('1m')).toBe(1_000_000)
    expect(leerVentana('no')).toBe(0)
    expect(leerVentana('50k')).toBe(100_000)
    expect(leerVentana('cualquier cosa')).toBe(300_000)
    expect(leerVentana(undefined)).toBe(300_000)
  })

  test('una salida repetida: idéntica, sin compactar en medio, hace menos de 30 min y de cierto tamaño', async () => {
    const texto = 'x'.repeat(2_000)
    const previa = { huella: huella(texto), cuando: 0, epoca: 0 }
    expect(esRepetida(previa, { huella: huella(texto), cuando: 60_000, epoca: 0 }, texto.length)).toBe(true)
    expect(esRepetida(previa, { huella: huella(`${texto}y`), cuando: 60_000, epoca: 0 }, texto.length + 1)).toBe(false)
    expect(esRepetida(previa, { huella: huella(texto), cuando: 60_000, epoca: 1 }, texto.length)).toBe(false)
    expect(esRepetida(previa, { huella: huella(texto), cuando: 31 * 60_000, epoca: 0 }, texto.length)).toBe(false)
    expect(esRepetida({ ...previa, huella: huella('corto') }, { huella: huella('corto'), cuando: 1, epoca: 0 }, 5)).toBe(false)
    expect(esRepetida(undefined, previa, texto.length)).toBe(false)
  })
})
