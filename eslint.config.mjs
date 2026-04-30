// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'no-console': [
      'error',
      {
        allow: [
          'warn',
          'error',
          'info',
          'debug',
          'trace'
        ]
      }
    ],
    'import/extensions': [
      'error',
      'always',
      {
        js: 'always',
        jsx: 'always',
        ts: 'always',
        tsx: 'always',
        vue: 'always'
      }
    ]
  },
  ignores: [
    '.nuxt/**',
    '.output/**',
    '.nitro/**',
    'dist/**',
    'node_modules/**'
  ]
})
