import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://2048.lazytoolshub.top',
  compressHTML: true,
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
