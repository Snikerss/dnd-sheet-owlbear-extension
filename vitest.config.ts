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
      reporter: ['text', 'html'],
      include: [
        'utils/**/*.ts',
        'state/**/*.ts',
      ],
      exclude: ['**/*.test.ts'],
    },
  },
});
