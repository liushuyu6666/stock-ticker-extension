import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = resolve(root, 'dist');
const watch = process.argv.includes('--watch');

/**
 * Every entry is bundled to a self-contained IIFE. Content scripts cannot be ES
 * modules, and bundling the worker the same way keeps one build shape for all
 * four surfaces.
 */
const options = {
  entryPoints: {
    background: resolve(root, 'src/background/index.ts'),
    content: resolve(root, 'src/content/index.ts'),
    newtab: resolve(root, 'src/newtab/index.ts'),
    options: resolve(root, 'src/options/index.ts')
  },
  outdir,
  bundle: true,
  format: 'iife',
  target: 'chrome114',
  platform: 'browser',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info'
};

async function copyStatic() {
  await cp(resolve(root, 'public'), outdir, { recursive: true });
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyStatic();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build] watching…');
} else {
  await build(options);
  console.log('[build] dist/ ready — load it as an unpacked extension');
}
