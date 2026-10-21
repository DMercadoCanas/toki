import { describe, expect, mock, test } from 'claude-code/testing'

import { TRAMO_GENERADO, textosGenerados, tipoGenerado } from '../hooks/generados'

// Lockfiles, minificados y carpetas de build: la primera lectura completa se frena, repetirla pasa.

describe('archivos generados', () => {
  test('reconoce lo generado y deja el código escrito a mano', () => {
    expect(tipoGenerado('/p/package-lock.json')).toBe('lockfile')
    expect(tipoGenerado('C:\\p\\Cargo.lock')).toBe('lockfile')
    expect(tipoGenerado('/p/web/app.min.js')).toBe('minificado')
    expect(tipoGenerado('/p/lib/modelo.freezed.dart')).toBe('codegen')
    expect(tipoGenerado('/p/node_modules/x/index.js')).toBe('carpeta')
    expect(tipoGenerado('/p/src/index.ts')).toBeUndefined()
    expect(tipoGenerado('/p/build.gradle')).toBeUndefined()
    expect(tipoGenerado('/p/src/distance.ts')).toBeUndefined()
  })

  test('frena la primera lectura entera, deja pasar un tramo y la repetida', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    let leidas = 0
    const limites: unknown[] = []
    on('tool.call', (_$, e) => {
      leidas++
      limites.push((e as { limit?: unknown }).limit)
      return { result: 'contenido' } as never
    })
    const entera = await $.tool.call({ tool: 'Read', file_path: '/p/package-lock.json' } as never)
    expect(entera.deny).toContain('Toki')
    expect(leidas).toBe(0)
    // Un tramo con offset y limit pasa siempre.
    await $.tool.call({ tool: 'Read', file_path: '/p/yarn.lock', offset: 1, limit: 50 } as never)
    expect(leidas).toBe(1)
    // Insistir trae un tramo; insistir otra vez, el archivo entero.
    const otra = await $.tool.call({ tool: 'Read', file_path: '/p/package-lock.json' } as never)
    expect(otra.deny).toBeUndefined()
    expect(limites[1]).toBe(TRAMO_GENERADO)
    await $.tool.call({ tool: 'Read', file_path: '/p/package-lock.json' } as never)
    expect(limites[2]).toBeUndefined()
    expect(leidas).toBe(3)
    // Código normal: sin tocar.
    await $.tool.call({ tool: 'Read', file_path: '/p/src/index.ts' } as never)
    expect(leidas).toBe(4)
    expect(textosGenerados.en.frenado('x.lock', 'lockfile')).toContain('lockfile')
  })
})
