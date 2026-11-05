import { defineConfig } from 'vite'

// Foundry loads one ES module from system.json; everything else (templates, CSS, lang) is served as-is.
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: mode !== 'development',
    target: 'es2022',
    lib: {
      entry: 'src/crawlspace.ts',
      formats: ['es'],
      fileName: () => 'crawlspace.mjs',
    },
  },
}))
