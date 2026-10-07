import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'plans/**', 'audits/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // TS сам проверяет определённость имён — базовое правило отключено
      'no-undef': 'off',

      // Контракт React hooks — реальные ошибки, не предупреждения
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Базлайн any-предупреждений снят (0 в коде), правило зафиксировано на error.
      '@typescript-eslint/no-explicit-any': 'error',

      // Существующий базлайн кода: предупреждения вместо ошибок.
      // Ужесточаются по мере рефакторинга (Phase 5/7 плана аудита).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  prettier,
);
