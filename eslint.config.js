import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts'], languageOptions: { globals: globals.browser } },
  { files: ['*.{js,ts}', 'tests/**/*.ts'], languageOptions: { globals: globals.node } },
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
