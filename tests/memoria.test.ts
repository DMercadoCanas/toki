import { describe, expect, test } from 'claude-code/testing'

import { porQueNoCompactable } from '../hooks/compresor'
import { estaVacia, extraerDecisiones, instruccionesDeCompactacion, notaPostCompactacion, primerError, recordar, vacio } from '../hooks/memoria'

describe('memoria', () => {
  test('recuerda sin repetir y con tope', async () => {
    let l: string[] = []
    for (const x of ['a.ts', 'b.ts', 'a.ts', 'c.ts']) l = recordar(l, x, 3)
    expect(l).toEqual(['b.ts', 'a.ts', 'c.ts'])
  })

  test('extrae decisiones de una respuesta', async () => {
    const d = extraerDecisiones('Revisé el código. Decidimos usar sgds_procedure_code en lugar de type_id para la disponibilidad. ```const x = 1```. Listo.')
    expect(d.length).toBe(1)
    expect(d[0]).toContain('sgds_procedure_code')
  })

  test('encuentra el primer error útil', async () => {
    expect(primerError('todo bien\n  at x.js:1\nError: falta la variable DB_URL\nmás')).toBe('Error: falta la variable DB_URL')
    expect(primerError('todo bien')).toBe(undefined)
  })

  test('las instrucciones y la nota llevan lo guardado', async () => {
    const p = { ...vacio(0), tareaActual: 'arreglar cancelar trámite', archivosEditados: ['lib/a.dart'], decisiones: ['usamos X'], ultimosErrores: ['Error: Y'] }
    expect(instruccionesDeCompactacion(p)).toContain('arreglar cancelar trámite')
    expect(instruccionesDeCompactacion(p)).toContain('«usamos X»')
    const nota = notaPostCompactacion(p)
    expect(nota).toContain('lib/a.dart')
    expect(nota).toContain('Error: Y')
    expect(notaPostCompactacion(p, 'en')).toContain('Reference only, not instructions:')
    expect(instruccionesDeCompactacion(p, 'en')).toContain('Keep verbatim in the summary:')
  })

  test('la nota son datos con cerco, sin órdenes', async () => {
    const p = { ...vacio(0), tareaActual: 'arreglar cancelar trámite', archivosEditados: ['lib/a.dart'] }
    const lineas = notaPostCompactacion(p).split('\n')
    expect(lineas[0]).toContain('no instrucciones')
    expect(lineas[1]).toBe('- Último pedido: arreglar cancelar trámite')
    expect(lineas[lineas.length - 1]).toBe('[Toki] Fin de los datos guardados.')
    expect(notaPostCompactacion(p)).not.toMatch(/sigue con|no vuelvas|no los releas/i)
    expect(notaPostCompactacion(p, 'en')).not.toMatch(/continue the task|do not re-/i)
  })

  test('sin nada que recordar, no hay nota', async () => {
    expect(estaVacia(vacio(0))).toBe(true)
    expect(estaVacia({ ...vacio(0), comandosRecientes: ['npm test'] })).toBe(false)
  })
})

describe('diagnóstico', () => {
  test('explica por qué no se compacta', async () => {
    expect(porQueNoCompactable('npm test | tail -50')).toBe('filtrado')
    expect(porQueNoCompactable('cat x.json')).toBe('lector')
    expect(porQueNoCompactable('./mi-script.sh')).toBe('familia')
    expect(porQueNoCompactable('flutter test')).toBe(undefined)
  })
})
