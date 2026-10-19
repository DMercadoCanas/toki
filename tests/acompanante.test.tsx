import { describe, expect, test } from 'claude-code/testing'

const BANDA = {
  plugin: 'ahorro-tokens',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

describe('acompañante', () => {
  test('la franja se dibuja en la terminal y en la app de escritorio', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BANDA, surface })
      expect(await ui.find({ type: 'Text', text: /ahorro-tokens · contexto/ })).toBeDefined()
      expect(await ui.find({ key: 'ocultar' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('cede el lugar a una encuesta', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>propio de Claude Code</Text>
    })
    const ui = await $.ui.mount({ ...BANDA, surface: 'terminal', props: { ...BANDA.props, hasSurvey: true } })
    expect(await ui.find({ type: 'Text', text: /ahorro-tokens/ })).toBe(undefined)
    await ui.unmount()
  })

  test('el botón ocultar la esconde', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>propio de Claude Code</Text>
    })
    const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    await ui.press({ key: 'ocultar' })
    expect(await ui.find({ type: 'Text', text: /ahorro-tokens/ })).toBe(undefined)
    await ui.unmount()
  })
})
