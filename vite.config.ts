import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sharedRoot = path.resolve(__dirname, '..', 'ABDShared');
const sharedAssetsDir = path.resolve(sharedRoot, 'Assets', 'assets');

export default defineConfig({
  root: path.resolve(__dirname, 'WebUI'),
  base: './',
  plugins: [
    {
      name: 'serve-and-copy-shared-assets',
      configureServer(server) {
        server.middlewares.use('/assets', (req, res, next) => {
          const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
          const candidate = path.resolve(sharedAssetsDir, rel);
          if (candidate.startsWith(sharedAssetsDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            const ext = path.extname(candidate).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            fs.createReadStream(candidate).pipe(res);
            return;
          }
          next();
        });
      },
      closeBundle() {
        const distAssets = path.resolve(__dirname, 'WebUI', 'dist', 'assets');
        for (const rel of ['bender.png', path.join('backgrounds', 'bg_tile512.webp'), path.join('backgrounds', 'bg_neutral.webp')]) {
          const src = path.join(sharedAssetsDir, rel);
          const dst = path.join(distAssets, rel);
          if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
          }
        }
        const srcWasmDir = path.resolve(__dirname, 'WebUI', 'src', 'wasm');
        if (!fs.existsSync(srcWasmDir)) return;
        const targets = [
          path.resolve(__dirname, 'WebUI', 'dist', 'src', 'wasm'),
          path.resolve(__dirname, 'WebUI', 'dist', 'wasm'),
        ];
        for (const dst of targets) {
          fs.mkdirSync(dst, { recursive: true });
          for (const entry of fs.readdirSync(srcWasmDir)) {
            const fullSrc = path.join(srcWasmDir, entry);
            if (fs.statSync(fullSrc).isFile()) {
              fs.copyFileSync(fullSrc, path.join(dst, entry));
            }
          }
        }
      },
    },
  ],
  build: {
    outDir: path.resolve(__dirname, 'WebUI', 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5330,
    strictPort: true,
    fs: {
      allow: ['..', '../..', sharedRoot],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'WebUI', 'src'),
    },
  },
});
