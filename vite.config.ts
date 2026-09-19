import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

  return {
    define: {
      '__GEMINI_API_KEY__': JSON.stringify(apiKey)
    },
    server: {
      port: 5173,
      host: true
    },
    build: {
      target: 'esnext'
    }
  };
});

