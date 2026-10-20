import { describe, expect, test } from 'claude-code/testing'

import { agregarLeccion, claveDia, filasGrafica, leccionCambioModelo, sumarAlDia, totalDesde } from '../hooks/historial'
import { tokiSvg } from '../hooks/toki-svg'

const HOY = Date.UTC(2026, 9, 20, 17, 0, 0) // 20 oct 2026, mediodía en Bogotá

describe('historial', () => {
  test('suma por día y recorta a 60 días', async () => {
    let h = sumarAlDia({}, HOY, 1000)
    h = sumarAlDia(h, HOY, 500)
    h = sumarAlDia(h, HOY - 86_400_000, 200)
    expect(h[claveDia(HOY)]).toBe(1500)
    expect(totalDesde(h, HOY, 1)).toBe(1500)
    expect(totalDesde(h, HOY, 7)).toBe(1700)
    for (let i = 0; i < 70; i++) h = sumarAlDia(h, HOY - i * 86_400_000, 1)
    expect(Object.keys(h).length).toBe(60)
  })

  test('la gráfica escala al máximo y marca hoy', async () => {
    const h = sumarAlDia(sumarAlDia({}, HOY, 4000), HOY - 86_400_000, 2000)
    const filas = filasGrafica(h, HOY, 3, 10)
    expect(filas.length).toBe(3)
    expect(filas[2]?.esHoy).toBe(true)
    expect(filas[2]?.barra).toBe('██████████')
    expect(filas[1]?.barra).toBe('█████░░░░░')
    expect(filas[0]?.valor).toBe('·')
  })

  test('las lecciones no se repiten y la del modelo explica el costo', async () => {
    const l = leccionCambioModelo(120_000, 0.45, 'claude-sonnet-5-5', 'claude-opus-5-5')
    expect(l.texto).toContain('Sonnet a Opus')
    expect(l.texto).toContain('~120.0k')
    expect(l.texto).toContain('$0.45')
    const lista = agregarLeccion(agregarLeccion([], l), l)
    expect(lista.length).toBe(1)
  })
})

describe('Toki en vector', () => {
  test('cada estado produce un SVG válido con accesorio', async () => {
    for (const a of ['tranquilo', 'pensando', 'leyendo', 'ejecutando', 'editando', 'compactando', 'esperando', 'listo', 'dormido', 'alerta'] as const) {
      const svg = tokiSvg(a)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
      expect(svg.length < 131072).toBe(true)
    }
    expect(tokiSvg('listo')).toContain('#f4c35b')
    expect(tokiSvg('dormido')).toContain('>z<')
  })
})
