import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
