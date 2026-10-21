import { describe, expect, test } from 'claude-code/testing'

import { formatear, leerOrden, marcarAvisado, nuevoPresupuesto, porcentaje, subir, umbralCruzado } from '../hooks/presupuesto'

describe('presupuesto por tarea (puro)', () => {
  test('entiende dólares, tokens y quitar', () => {
    expect(leerOrden('$2')).toEqual({ tipo: 'fijar', unidad: 'usd', limite: 2 })
    expect(leerOrden('1,5 dólares')).toEqual({ tipo: 'fijar', unidad: 'usd', limite: 1.5 })
    expect(leerOrden('3usd')).toEqual({ tipo: 'fijar', unidad: 'usd', limite: 3 })
    expect(leerOrden('5')).toEqual({ tipo: 'fijar', unidad: 'usd', limite: 5 })
    expect(leerOrden('500k')).toEqual({ tipo: 'fijar', unidad: 'tokens', limite: 500_000 })
    expect(leerOrden('1.5M')).toEqual({ tipo: 'fijar', unidad: 'tokens', limite: 1_500_000 })
    expect(leerOrden('200000')).toEqual({ tipo: 'fijar', unidad: 'tokens', limite: 200_000 })
    expect(leerOrden('300 mil tokens')).toEqual({ tipo: 'fijar', unidad: 'tokens', limite: 300_000 })
    expect(leerOrden('quitar')).toEqual({ tipo: 'quitar' })
    expect(leerOrden('off')).toEqual({ tipo: 'quitar' })
    expect(leerOrden('')).toEqual({ tipo: 'estado' })
    expect(leerOrden('mucho')).toEqual({ tipo: 'invalida' })
    expect(leerOrden('0')).toEqual({ tipo: 'invalida' })
    expect(leerOrden('50 tokens')).toEqual({ tipo: 'invalida' })
  })

  test('avisa una vez por umbral, el más alto si salta varios', () => {
    let p = nuevoPresupuesto('tokens', 100_000, 1_000_000)
    expect(umbralCruzado(p, 1_040_000)).toBeUndefined()
    expect(umbralCruzado(p, 1_090_000)).toBe(80)
    p = marcarAvisado(p, 80)
    expect(umbralCruzado(p, 1_095_000)).toBeUndefined()
    expect(umbralCruzado(p, 1_100_000)).toBe(100)
    expect(porcentaje(p, 1_150_000)).toBe(150)
  })

  test('subir: 50 % más, desde lo ya gastado si se pasó de largo', () => {
    const p = marcarAvisado(nuevoPresupuesto('usd', 2, 0.5), 100)
    expect(subir(p, 2.6).limite).toBe(3.15)
    expect(subir(p, 4.5).limite).toBe(6)
    expect(subir(p, 2.6).avisados).toEqual([50])
    expect(subir(p, 2.6).preguntado).toBe(false)
    expect(formatear('usd', 2)).toBe('$2.00')
    expect(formatear('tokens', 500_000)).toContain('tokens')
  })
})
