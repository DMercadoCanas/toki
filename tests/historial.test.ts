import { describe, expect, test } from 'claude-code/testing'

import { agregarLeccion, claveDia, filasGrafica, fusionarHistorial, leccionCambioModelo, logrosNuevos, racha, sumarAlDia, totalDesde } from '../hooks/historial'
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
    expect(leccionCambioModelo(120_000, 0, 'claude-sonnet-5-5', 'claude-opus-5-5', 'en').texto).toContain('from Sonnet to Opus')
  })

  test('junta el historial de la versión anterior sumando por día', async () => {
    const h = fusionarHistorial({ '2026-10-19': 100, '2026-10-20': 50 }, { '2026-10-20': 25, '2026-10-18': 10, basura: 5 as number })
    expect(h).toEqual({ '2026-10-18': 10, '2026-10-19': 100, '2026-10-20': 75 })
  })

  test('la gráfica habla inglés', async () => {
    const filas = filasGrafica(sumarAlDia({}, HOY, 10), HOY, 1, 4, 'en')
    expect(filas[0]?.etiqueta.startsWith('Tue')).toBe(true)
  })
})

describe('rachas y logros', () => {
  const DIA = 86_400_000
  test('la racha cuenta días seguidos con ahorro, hasta hoy o hasta ayer', async () => {
    let h = sumarAlDia({}, HOY - DIA, 100)
    h = sumarAlDia(h, HOY - 2 * DIA, 100)
    expect(racha(h, HOY)).toBe(2) // hoy aún no hay ahorro: la racha sigue viva
    expect(racha(sumarAlDia(h, HOY, 5), HOY)).toBe(3)
    expect(racha(sumarAlDia({}, HOY - 3 * DIA, 100), HOY)).toBe(0)
    expect(racha({}, HOY)).toBe(0)
  })

  test('los logros se desbloquean una sola vez', async () => {
    expect(logrosNuevos([], { total: 0, racha: 0 })).toEqual([])
    expect(logrosNuevos([], { total: 12_000, racha: 1 })).toEqual(['primero', 'diez'])
    expect(logrosNuevos(['primero', 'diez'], { total: 12_000, racha: 3, memoria: true })).toEqual(['racha3', 'memoria'])
    expect(logrosNuevos(['primero'], { total: 50, racha: 1, rescate: true })).toEqual(['rescate'])
    expect(logrosNuevos(['primero', 'diez', 'cien', 'millon', 'racha3', 'racha7', 'memoria', 'rescate'], { total: 5_000_000, racha: 30, memoria: true, rescate: true })).toEqual([])
  })
})

describe('Toki en vector', () => {
  test('cada estado produce un SVG válido con accesorio', async () => {
    for (const a of ['tranquilo', 'pensando', 'leyendo', 'ejecutando', 'editando', 'compactando', 'esperando', 'listo', 'dormido', 'alerta', 'celebrando'] as const) {
      const svg = tokiSvg(a)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
      expect(svg.length < 131072).toBe(true)
    }
    expect(tokiSvg('tranquilo')).toContain('#f39a3d') // audífonos naranjas
    expect(tokiSvg('tranquilo')).toContain('>Toki</text>')
    expect(tokiSvg('listo')).toContain('#34a853') // el check verde
    expect(tokiSvg('dormido')).toContain('>z<')
    expect(tokiSvg('compactando')).toContain('animateMotion') // aspira
    expect(tokiSvg('compactando')).toContain('rotate') // ruedas
    expect(tokiSvg('celebrando')).toContain('#bc8cff') // confeti
  })
})
