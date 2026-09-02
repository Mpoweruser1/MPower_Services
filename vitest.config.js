// vitest.config.js — NEW
// Vitest, not Jest: it reuses your existing vite.config.js setup
// (same resolver, same env handling), so there's no second build
// pipeline to configure and keep in sync.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
