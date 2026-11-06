import { configs, plugins } from 'eslint-config-airbnb-extended';
import { globalIgnores } from 'eslint/config';

export default [
  globalIgnores(['dist/**', 'node_modules/**']),

  plugins.stylistic,
  plugins.importX,
  plugins.typescriptEslint,

  ...configs.base.recommended,
  ...configs.base.typescript,

  {
    rules: {
      // В проекте именованные экспорты.
      'import-x/prefer-default-export': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Как в оригинальном Airbnb: длинную регулярку не перенести без потери читаемости.
      '@stylistic/max-len': ['error', { code: 100, tabWidth: 2, ignoreRegExpLiterals: true }],
    },
  },
];
