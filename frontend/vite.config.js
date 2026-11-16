import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Source maps let Faro (and you) map minified stack traces back to source.
    sourcemap: true,
  },
  server: { port: 5173 },
});
