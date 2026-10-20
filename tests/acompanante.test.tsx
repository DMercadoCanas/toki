import { describe, expect, mock, test } from 'claude-code/testing'

const BANDA = {
  plugin: 'ahorro-tokens',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

describe('acompañante', () => {
  test('la franja se dibuja en la terminal y en la app de escritorio', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BANDA, surface })
      expect(await ui.find({ type: 'Text', text: /Toki/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Todo en orden/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /░/ })).toBeDefined()
      expect(await ui.find({ key: 'ocultar' })).toBeDefined()
      expect(await ui.find({ key: 'detalles' })).toBeDefined()
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
