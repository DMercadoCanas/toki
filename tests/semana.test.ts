import { describe, expect, test } from 'claude-code/testing'

import { claveDia } from '../hooks/historial'
import { ahorroDe, avisoSemana, consejoDe, leerSemanas, lunesDe, semanaAnterior, SEMANA_VACIA, sumarSemana, tarjetaPendiente, tarjetaSemana } from '../hooks/semana'

// Miércoles 21 de octubre de 2026, mediodía local.
const MIE = new Date(2026, 9, 21, 12).getTime()
const DIA = 86_400_000

describe('tarjeta semanal (puro)', () => {
  test('la semana empieza el lunes, también un domingo', () => {
    expect(lunesDe(MIE)).toBe('2026-10-19')
    expect(lunesDe(MIE + 4 * DIA)).toBe('2026-10-19') // domingo 25
    expect(lunesDe(MIE + 5 * DIA)).toBe('2026-10-26')
    expect(semanaAnterior('2026-10-19')).toBe('2026-10-12')
  })

  test('suma por tipo y guarda solo 12 semanas', () => {
    let s = sumarSemana({}, MIE, { tipo: 'salida', ahorro: 1000 })
    s = sumarSemana(s, MIE, { tipo: 'busqueda', ahorro: 500, pedidos: 2, tokensLeidos: 90_000 })
    s = sumarSemana(s, MIE, { costo: -3 })
    expect(ahorroDe(s['2026-10-19'])).toBe(1500)
    expect(s['2026-10-19']?.pedidos).toBe(2)
    expect(s['2026-10-19']?.costo).toBe(0)
    for (let i = 1; i <= 14; i++) s = sumarSemana(s, MIE + i * 7 * DIA, { pedidos: 1 })
    expect(Object.keys(s).length).toBe(12)
    expect(leerSemanas({ basura: 1, '2026-10-19': { porTipo: { salida: 'x' }, pedidos: 3 } })['2026-10-19']?.pedidos).toBe(3)
    expect(leerSemanas(null)).toEqual({})
  })

  test('la tarjeta de la semana pasada se avisa una sola vez, y solo si hubo algo', () => {
    const s = sumarSemana({}, MIE, { tipo: 'pegado', ahorro: 20_000 })
    const lunesSiguiente = MIE + 5 * DIA
    expect(tarjetaPendiente(s, MIE, undefined)).toBeUndefined() // la pasada está vacía
    expect(tarjetaPendiente(s, lunesSiguiente, undefined)).toBe('2026-10-19')
    expect(tarjetaPendiente(s, lunesSiguiente, '2026-10-19')).toBeUndefined()
  })

  test('la tarjeta muestra el reparto, la comparación, lo leído y el mejor día', () => {
    let s = sumarSemana({}, MIE - 7 * DIA, { tipo: 'salida', ahorro: 10_000 })
    s = sumarSemana(s, MIE, { tipo: 'salida', ahorro: 12_000 })
    s = sumarSemana(s, MIE, { tipo: 'busqueda', ahorro: 3_000, relecturas: 40_000, pedidos: 30, tokensLeidos: 2_000_000, costo: 1.234, sesiones: 2, frenos: 1 })
    const historial = { [claveDia(MIE)]: 9_000, [claveDia(MIE - DIA)]: 6_000 }
    const tarjeta = tarjetaSemana(s, '2026-10-19', MIE + 7 * DIA, historial, { mostrarCosto: true })
    expect(tarjeta).toContain('19 oct – 25 oct')
    expect(tarjeta).toContain('Te ahorré ~15.0k tokens')
    expect(tarjeta).toContain('▲ 50% vs. la semana anterior')
    expect(tarjeta.indexOf('salidas de terminal')).toBeLessThan(tarjeta.indexOf('búsquedas enormes'))
    expect(tarjeta).toContain('~$1.23')
    expect(tarjeta).toContain('Mejor día: mié 21 (~9.0k)')
    expect(tarjeta).toContain('1 lectura frenada')
    expect(tarjetaSemana(s, '2026-10-19', MIE, historial)).not.toContain('$')
    expect(tarjetaSemana({}, '2026-10-19', MIE, {})).toContain('todavía no tiene cifras')
    expect(tarjetaSemana(s, '2026-10-19', MIE, historial, { idioma: 'en' })).toContain('I saved you ~15.0k tokens')
    expect(avisoSemana(s, '2026-10-19')).toContain('/toki-semana')
  })

  test('el consejo sale de las cifras', () => {
    expect(consejoDe({ ...SEMANA_VACIA, pedidos: 40, pedidosLargos: 20 })).toContain('50% de tus pedidos')
    expect(consejoDe({ ...SEMANA_VACIA, porTipo: { pegado: 50_000 } })).toContain('pegaste textos enormes')
    expect(consejoDe({ ...SEMANA_VACIA, frenos: 4 })).toContain('CLAUDE.md')
    expect(consejoDe(SEMANA_VACIA)).toContain('vas bien')
  })
})
