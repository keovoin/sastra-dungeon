import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3000, host: '0.0.0.0', allowedHosts: true },
  build: { outDir: 'dist', target: 'es2020',
    rollupOptions: {
      output: {
        // Firebase is only needed once someone signs in for cloud saves and the
        // leaderboard, so it must not sit in the first-paint bundle.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  }
});
