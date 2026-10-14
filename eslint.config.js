import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // `public/` holds assets and generated files, not source: the vendored Basis transcoder is
    // copied there at build time by `scripts/copy-decoders.mjs`, and linting a minified WebAssembly
    // loader is noise rather than a check.
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'test-results/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts'], languageOptions: { globals: globals.browser } },
  {
    files: ['*.{js,ts}', 'tests/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
