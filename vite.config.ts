import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sharedRoot = path.resolve(__dirname, '..', 'ABDShared');
const sharedAssetsRoot = path.resolve(sharedRoot, 'Assets');
const sharedAssetsDir = path.resolve(sharedAssetsRoot, 'assets');
const banksPublicDir = path.resolve(__dirname, 'WebUI', 'public', 'banks');
const FX_MODELS = [
  're201', 'zita', 'bbd_chorus', 'fair_comp', 'midas_eq', 'mood_filter', 'flanger', 'saturation', 'stereo_delay',
  'generic', 'vocoder_svc350', 'dimension_d', 'plate_emt140', 'lexicon_224', 'leslie_rotary', 'solina_ensemble',
  'sansamp_psa1', 'eventide_h910', 'mutron_biphase', 'drawmer_ds201', 'shimmer_delay', 'edison_imager',
  'ring_modulator', 'spl_vitalizer', 'emt_250', 'echoplex_ep3', 'telray_delay', 'tc_2290', 'lexicon_480l',
  'ams_rmx16', 'yamaha_spx90', 'boss_ce1', 'rhodes_panner', 'pultec_eq', 'culture_vulture', 'bode_freq_shifter',
  'tc_m3000', 'korg_ms2000r', 'fender_spring', 'tree_monster', 'bonsai', 'nimbus', 'fdn_reverb', 'spectral_delay',
  'pattern_freeze', 'decimator', 'roland_boss_reverb', 'roland_mt32_reverb', 'roland_multi_chorus', 'roland_tone_eq',
  'roland_jv_reverb', 'roland_jv_chorus', 'roland_gs_delay', 'eventide_h949', 'granular_delay',
  'oversampled_dist', 'wave_shaper', 'harmonic_reso', 'combulator', 'hartmann_neuron_fx',
  'golana_reverb', 'iterum_delay', 're201_wdf', 'kr106_chorus',
].map((m) => path.join('fx', 'models', `${m}.webp`));

function readAbdbankMeta(filePath: string, filename: string) {
  const stem = filename.replace(/\.abdbank$/i, '');
  const fd = fs.openSync(filePath, 'r');
  try {
    const hdr = Buffer.alloc(30);
    let off = 0;
    for (let i = 0; i < 64; i++) {
      if (fs.readSync(fd, hdr, 0, 30, off) < 30 || hdr.readUInt32LE(0) !== 0x04034b50) break;
      const method = hdr.readUInt16LE(8), compSize = hdr.readUInt32LE(18), nameLen = hdr.readUInt16LE(26), extraLen = hdr.readUInt16LE(28);
      const nameBuf = Buffer.alloc(nameLen);
      fs.readSync(fd, nameBuf, 0, nameLen, off + 30);
      const name = nameBuf.toString('utf8'), dataOff = off + 30 + nameLen + extraLen;
      if (method === 0 && (name === 'manifest.json' || name.endsWith('/manifest.json')) && compSize > 0 && compSize < 2097152) {
        const jsonBuf = Buffer.alloc(compSize);
        fs.readSync(fd, jsonBuf, 0, compSize, dataOff);
        const m = JSON.parse(jsonBuf.toString('utf8'));
        return {
          id: String(m.bankId || stem).trim().toLowerCase(),
          name: String(m.bankName || stem).replace(/_/g, ' ').trim(),
          filename, ...(m.author ? { author: String(m.author) } : {}), ...(m.description ? { description: String(m.description) } : {}),
        };
      }
      off = dataOff + compSize;
    }
  } catch { /* fallback */ } finally { fs.closeSync(fd); }
  return { id: stem.toLowerCase(), name: stem.replace(/_/g, ' ').trim(), filename };
}

function buildDynamicBanksIndex(banksDir: string) {
  const idxPath = path.join(banksDir, 'index.json');
  const entries: Array<Record<string, unknown>> = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : [];
  const known = new Set(entries.map((e) => String(e.filename || '').toLowerCase()));
  if (!fs.existsSync(banksDir)) return entries;
  for (const fn of fs.readdirSync(banksDir).filter((f) => f.toLowerCase().endsWith('.abdbank')).sort()) {
    if (!known.has(fn.toLowerCase())) entries.push(readAbdbankMeta(path.join(banksDir, fn), fn));
  }
  return entries.map((e) => {
    const fn = String(e.filename || ''), fp = fn ? path.join(banksDir, fn) : '';
    return fp && fs.existsSync(fp) ? { ...e, sizeBytes: fs.statSync(fp).size } : e;
  });
}

export default defineConfig({
  root: path.resolve(__dirname, 'WebUI'),
  base: './',
  plugins: [
    {
      name: 'serve-and-copy-shared-assets',
      configureServer(server) {
        server.middlewares.use('/banks/index.json', (_req, res) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(buildDynamicBanksIndex(banksPublicDir), null, 2));
        });
        server.middlewares.use('/assets', (req, res, next) => {
          const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
          const primary = path.resolve(sharedAssetsDir, rel);
          const modelFb = rel.startsWith('models/') ? path.resolve(sharedAssetsRoot, rel) : '';
          const candidate = primary.startsWith(sharedAssetsDir) && fs.existsSync(primary) && fs.statSync(primary).isFile()
            ? primary
            : (modelFb && modelFb.startsWith(sharedAssetsRoot) && fs.existsSync(modelFb) && fs.statSync(modelFb).isFile() ? modelFb : '');
          if (candidate) {
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
        const ENGINE_FACEPLATES = [
          'rompler_faceplate.webp', 'mcs48_faceplate.webp', 'abdmcx0x_faceplate.webp', 'abdjunio601_faceplate.webp', 'juno601_faceplate.webp',
          'abyssmind.webp', 'abyssmind_chassis.webp', 'abyssmind_panel.webp',
          'roland-cm32.webp', 'roland-d50.webp', 'roland-d550.webp', 'roland-jv880.webp', 'roland-u110.webp', 'roland-u220.webp',
        ].map((f) => path.join('engines', f));
        const MODEL_COVERS = [
          'abyssmind.webp', 'emu-emax2.webp', 'korg-ms2000.webp', 'roland-cm32.webp', 'roland-d50.webp',
          'roland-d550.webp', 'roland-jv880.webp', 'roland-tb303.webp', 'roland-u110.webp', 'roland-u220.webp',
        ].map((f) => path.join('models', f));
        for (const rel of [
          'bender.png', path.join('backgrounds', 'bg_tile512.webp'), path.join('backgrounds', 'bg_neutral.webp'), ...FX_MODELS, ...ENGINE_FACEPLATES, ...MODEL_COVERS,
          path.join('junio', 'knob.png'), path.join('junio', 'silver_re201_normal.png'), path.join('junio', 'silver_re201_preset.png'),
          path.join('junio', 're201_big_knob.png'), path.join('junio', 're201_peak_led.png'), path.join('junio', 're201_vumeter_background.png'),
        ]) {
          const pA = path.join(sharedAssetsDir, rel), src = fs.existsSync(pA) ? pA : path.join(sharedAssetsRoot, rel);
          const dst = path.join(distAssets, rel);
          if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
          }
        }
        const distBanksIdx = path.resolve(__dirname, 'WebUI', 'dist', 'banks', 'index.json');
        fs.mkdirSync(path.dirname(distBanksIdx), { recursive: true });
        fs.writeFileSync(distBanksIdx, JSON.stringify(buildDynamicBanksIndex(banksPublicDir), null, 2));
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
