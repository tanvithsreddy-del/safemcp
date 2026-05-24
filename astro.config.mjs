import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: 'https://safemcp.info',
  output: "hybrid",

  build: {
    format: 'directory',
  },

  vite: {
    build: {
      // Avoid inlining big JSON into HTML
      assetsInlineLimit: 0,
    },
  },

  adapter: cloudflare()
});