import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages friendly: assets are relative so the build works from any sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: a game update doesn't re-download three/react, and the
        // browser fetches them in parallel with the app chunk. The post-fx chunk is only ever
        // loaded by presets that use post-processing (never on Potato).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](postprocessing|n8ao)[\\/]/.test(id)) return 'vendor-postfx';
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'vendor-three';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|zustand|immer)[\\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
