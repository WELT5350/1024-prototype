export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['node_modules/**', '.work/**', 'test-results/**'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      eqeqeq: 'error',
      'no-eval': 'error',
    },
  },
];
