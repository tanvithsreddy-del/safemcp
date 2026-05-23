import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://safemcp.info',
  output: 'static',
  build: {
    format: 'directory',
  },
  vite: {
    build: {
      // Avoid inlining big JSON into HTML
      assetsInlineLimit: 0,
    },
  },
});
