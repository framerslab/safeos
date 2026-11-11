// ESLint for the server (src) and its tests. The web app under apps/ has its
// own config (apps/guardian-ui/.eslintrc.json) and is linted by `next lint`.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'apps/**', 'e2e/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
