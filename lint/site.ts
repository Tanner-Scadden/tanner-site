import { definePlugin, defineRule } from '@oxlint/plugins'

const noSwitch = defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Bans switch statements in favour of Effect matching.' },
    messages: {
      noSwitch:
        "Match instead: a tagged enum's match, a state's $match, or Match.valueTags and Match.discriminatorsExhaustive from effect.",
    },
    schema: [],
  },
  create: context => ({
    SwitchStatement: node => context.report({ node, messageId: 'noSwitch' }),
  }),
})

export default definePlugin({
  meta: { name: 'site' },
  rules: { noSwitch },
})
