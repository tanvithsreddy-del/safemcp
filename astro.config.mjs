import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://safemcp.info',
  output: 'hybrid',
  adapter: cloudflare({
    // Don't try to handle images — we don't use Astro's image component anywhere.
    imageService: 'passthrough',
    platformProxy: {
      // Allow `wrangler dev` style bindings in `astro dev` (so D1 works locally).
      enabled: true,
    },
  }),
  build: {
    format: 'directory',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
