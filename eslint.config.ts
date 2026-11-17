import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '**/dist',
    '**/node_modules',
    'apps/*/auto-imports.d.ts',
    'apps/*/components.d.ts',
  ],
  typescript: {
    overrides: {
      'no-console': 'off',
    },
  },
  vue: {
    overrides: {
      'vue/max-attributes-per-line': [
        'error',
        {
          singleline: 1,
          multiline: {
            max: 1,
          },
        },
      ],
    },
  },
})
