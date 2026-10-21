import { describe, expect, mock, test } from 'claude-code/testing'

import { textosGenerados, tipoGenerado } from '../hooks/generados'

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
    on('tool.call', () => {
      leidas++
      return { result: 'contenido' } as never
    })
    const entera = await $.tool.call({ tool: 'Read', file_path: '/p/package-lock.json' } as never)
    expect(entera.deny).toContain('Toki')
    expect(leidas).toBe(0)
    // Un tramo con offset y limit pasa siempre.
    await $.tool.call({ tool: 'Read', file_path: '/p/yarn.lock', offset: 1, limit: 50 } as never)
    expect(leidas).toBe(1)
    // Insistir con la misma lectura la entrega.
    const otra = await $.tool.call({ tool: 'Read', file_path: '/p/package-lock.json' } as never)
    expect(otra.deny).toBeUndefined()
    expect(leidas).toBe(2)
    // Código normal: sin tocar.
    await $.tool.call({ tool: 'Read', file_path: '/p/src/index.ts' } as never)
    expect(leidas).toBe(3)
    expect(textosGenerados.en.frenado('x.lock', 'lockfile')).toContain('lockfile')
  })
})
