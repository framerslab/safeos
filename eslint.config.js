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
    rules: {
      // The server compiles with strict off and implicit any allowed
      // (tsconfig.json), and uses explicit any in 128 places. They show as
      // warnings in every lint run rather than failing it.
      '@typescript-eslint/no-explicit-any': 'warn',
      // A leading underscore marks a parameter or binding that is unused on
      // purpose (an Express error handler's fourth argument, a hook's result).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `declare global { namespace Express { ... } }` is how Express's
      // Request type is extended.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      // An interface that extends one other type and adds nothing names it.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },
);
