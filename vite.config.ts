import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

const API_ORIGIN = 'http://127.0.0.1:3000';

/** The two fonts the first screen is drawn with (the "-ext" files are only fetched for rarer characters). */
const FIRST_SCREEN_FONT = /^assets\/(figtree-latin-wght|dela-gothic-one-latin-400)-normal-.+\.woff2$/;

/**
 * The CSS names the fonts, but the browser only asks for them once it has read the CSS. This asks for them
 * with the page itself (NFR-63). File names carry a hash, so the links are written at build time.
 */
function preloadFirstScreenFonts(): Plugin {
  return {
    name: 'otakudex:preload-first-screen-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (_html, context) =>
        Object.keys(context.bundle ?? {})
          .filter((fileName) => FIRST_SCREEN_FONT.test(fileName))
          .map((fileName) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: `/${fileName}` },
            injectTo: 'head' as const,
          })),
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [preact(), preloadFirstScreenFonts()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Vite's default CORS answer would let a page on another local port read the API through it.
    cors: false,
    // The browser only ever talks to this origin; /api is forwarded to the local server.
    proxy: { '/api': { target: API_ORIGIN, changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
