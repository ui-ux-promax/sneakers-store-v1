import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      POSTGRES_URL: 'postgresql://user:pass@ep-test.neon.tech/db?sslmode=require',
      POSTGRES_URL_NON_POOLING: 'postgresql://user:pass@ep-test.neon.tech/db?sslmode=require',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
