import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import path from 'path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        logs: path.resolve(import.meta.dirname, 'logs.html'),
      },
    },
  },
  plugins: [
    {
      name: 'local-ui-csp',
      transformIndexHtml(html, context) {
        return context.server
          ? html.replace("connect-src 'none'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*")
          : html;
      },
    },
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['original-fs'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            lib: { formats: ['cjs'] },
            rolldownOptions: { external: ['electron'], output: { format: 'cjs', entryFileNames: 'preload.cjs' } },
          },
        },
        onstart(options) {
          options.reload()
        },
      },
      {
        entry: 'electron/proton-captcha-preload.ts',
        vite: {
          build: {
            lib: {
              formats: ['cjs'],
            },
            rolldownOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'proton-captcha-preload.cjs',
              },
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'proton-captcha-preload.cjs',
              },
            },
          },
        },
      },
    ]),
  ],
})
