import { describe, expect, mock, test } from 'claude-code/testing'

const BANDA = {
  plugin: 'toki',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

describe('acompañante', () => {
  test('en la app, con el contexto alto: Toki en el anillo, la frase entera, el botón debajo y los controles al final', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 160_000, window: 200_000, percent: 80 }, rateLimits: [] } }) as never)
    const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
    const frase = await ui.find({ type: 'Text', text: /Contexto al 80 ?%/ })
    expect(frase).toBeDefined()
    expect(JSON.stringify(frase)).toContain('"wrap":"wrap"')
    const arbol = JSON.stringify(await ui.drawn())
    // El anillo marca el contexto en rojo; la frase, después el botón y al final los controles.
    const anillo = await ui.find({ type: 'Svg' })
    expect(JSON.stringify(anillo)).toContain('#ef6a6a')
    expect(arbol.indexOf('"compactar"')).toBeGreaterThan(arbol.indexOf('Contexto al'))
    expect(arbol.indexOf('"tamano"')).toBeGreaterThan(arbol.indexOf('"compactar"'))
    await ui.unmount()
  })

  test('«Compactar ahora» compacta; si un hook lo veta o falla, lo dice y deja /compact en el cuadro', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 160_000, window: 200_000, percent: 80 }, rateLimits: [] } }) as never)
    let respuesta: 'compacta' | 'veta' | 'falla' = 'compacta'
    let compactos = 0
    on('session.compact', () => {
      compactos += 1
      if (respuesta === 'falla') throw new Error('hay un turno en curso')
      return (respuesta === 'veta' ? { skip: 'lo bloquea la política de la empresa' } : { messages: [{ role: 'user', text: 'Resumen.', toolUses: [] }] }) as never
    })
    const cuadro: string[] = []
    on('prompt.fill', ($, e) => {
      cuadro.push(e.text)
      return { isFilled: true } as never
    })
    const avisos: string[] = []
    on('ui.toast', ($, e) => {
      avisos.push(e.text)
      return { value: undefined }
    })
    const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
    await ui.press({ key: 'compactar' })
    expect(compactos).toBe(1)
    expect(cuadro).toEqual([])
    respuesta = 'veta'
    await ui.press({ key: 'compactar' })
    expect(compactos).toBe(2)
    expect(cuadro).toEqual(['/compact'])
    expect(avisos.at(-1)).toBe('Toki: no pude compactar desde la barra (lo bloquea la política de la empresa). Dejé /compact en el cuadro: pulsa Enter.')
    respuesta = 'falla'
    await ui.press({ key: 'compactar' })
    expect(cuadro).toEqual(['/compact', '/compact'])
    expect(avisos.at(-1)).toBe('Toki: no pude compactar desde la barra. Dejé /compact en el cuadro: pulsa Enter.')
    await ui.unmount()
  })

  test('la franja se dibuja en la terminal y en la app de escritorio', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BANDA, surface })
      expect(await ui.find({ type: 'Text', text: /Toki/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Todo en orden/ })).toBeDefined()
      // En la terminal el contexto es una barra de texto; en la app, el anillo alrededor de Toki.
      if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: /░/ })).toBeDefined()
      expect(await ui.find({ key: 'ocultar' })).toBeDefined()
      expect(await ui.find({ key: 'detalles' })).toBeDefined()
      if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('el panel /toki muestra cifras, racha, logros, gráfica y sugerencias en ambas superficies', async ($, on) => {
    mock.clock(on, { now: 1_760_000_000_000 })
    mock.store(on, { historialDiario: { '2025-10-07': 1000, '2025-10-08': 2000, '2025-10-09': 3000 }, tokensAhorradosTotal: 15900, logros: ['primero', 'diez'] })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'toki',
        surface,
        component: 'Pane',
        requestId: 'toki-panel',
        props: { title: 'Toki', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
      })
      expect(await ui.find({ type: 'Text', text: /Toki cuida tus tokens/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Cada token cuenta/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Ahorro por día/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /~15\.9k/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Racha: 3 días seguidos/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /✓ 10k tokens/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /○ 100k tokens/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Sugerencias/ })).toBeDefined()
      expect(await ui.find({ key: 'cerrar' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('cede el lugar a una encuesta', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>propio de Claude Code</Text>
    })
    const ui = await $.ui.mount({ ...BANDA, surface: 'terminal', props: { ...BANDA.props, hasSurvey: true } })
    expect(await ui.find({ type: 'Text', text: /Toki/ })).toBe(undefined)
    await ui.unmount()
  })

  test('el botón ocultar la esconde', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>propio de Claude Code</Text>
    })
    const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    await ui.press({ key: 'ocultar' })
    expect(await ui.find({ type: 'Text', text: /Toki/ })).toBe(undefined)
    await ui.unmount()
  })

  test('el botón − pasa a una sola línea y + la devuelve', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>propio de Claude Code</Text>
    })
    const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    await ui.press({ key: 'tamano' })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Todo en orden/ })).toBe(undefined)
    await ui.press({ key: 'tamano' })
    expect(await ui.find({ type: 'Text', text: /Todo en orden/ })).toBeDefined()
    await ui.unmount()
  })

  test('▸ más muestra la fila de detalles', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>propio de Claude Code</Text>
    })
    const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
    await ui.press({ key: 'detalles' })
    expect(await ui.find({ type: 'Text', text: /llamadas/ })).toBeDefined()
    await ui.unmount()
  })
})
