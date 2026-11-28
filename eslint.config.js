import stylex from '@stylexjs/eslint-plugin'
import babelParser from '@babel/eslint-parser'

// ESLint here is StyleX's rules and a ban on `switch`. Types and Effect are
// checked by `bun run typecheck`. The rules need no types, so Babel parses the
// TypeScript: typescript-eslint doesn't support TypeScript 7 yet.
export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { babelrc: false, configFile: false, parserOpts: { plugins: ['typescript'] } },
      },
    },
    plugins: { '@stylexjs': stylex },
    rules: {
      '@stylexjs/valid-styles': 'error',
      '@stylexjs/valid-shorthands': 'error',
      '@stylexjs/no-unused': 'error',
      '@stylexjs/no-conflicting-props': 'error',
      '@stylexjs/no-legacy-contextual-styles': 'error',
      '@stylexjs/no-lookahead-selectors': 'error',
      '@stylexjs/no-nonstandard-styles': 'error',
      '@stylexjs/enforce-extension': 'error',
      '@stylexjs/sort-keys': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'SwitchStatement',
          message:
            "Match instead: a tagged enum's match, a state's $match, or Match.valueTags and Match.discriminatorsExhaustive from effect.",
        },
      ],
    },
  },
]
