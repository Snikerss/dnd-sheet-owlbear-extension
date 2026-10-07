import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'src-tauri'],
    // Тесты, требующие DOM API (localStorage, fetch и т.д.), используют jsdom
    // через аннотацию // @vitest-environment jsdom в начале файла.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'utils/**/*.ts',
        'state/**/*.ts',
        'protocol/**/*.ts',
        'sync/**/*.ts',
        'auth/**/*.ts',
        'hooks/**/*.{ts,tsx}',
        // Компоненты в отчёте БЕЗ порога (план 0.5/7.x): метрики видны,
        // CI не падает, пока UI-слой не покрыт smoke-тестами.
        'components/**/*.{ts,tsx}',
        'context/**/*.{ts,tsx}',
        'App.tsx',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/testFixtures.ts',
        '**/mocks/**',
      ],
      // Пороги 6.5 — пер-глоб по покрытым слоям (план аудита).
      // state/** целиком не порогируется, пока useCharacterManager не покрыт
      // renderHook-интеграцией (открытый пункт плана 2.6/6.x); редьюсеры порогируются.
      thresholds: {
        'protocol/**': { statements: 95, branches: 95, functions: 80, lines: 95 },
        'auth/authorization.ts': { statements: 87, branches: 84, functions: 90, lines: 90 },
        'auth/roleService.ts': { statements: 24, branches: 22, functions: 16, lines: 25 },
        'sync/**': { statements: 38, branches: 30, functions: 42, lines: 40 },
        'state/useCharacterManager.ts': { statements: 0, branches: 0, functions: 0, lines: 0 },
        'utils/**': { statements: 38, branches: 35, functions: 48, lines: 40 },
        'state/reducers/**': { statements: 53, branches: 39, functions: 36, lines: 55 },
      },
    },
  },
});
