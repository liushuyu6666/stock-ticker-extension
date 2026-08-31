import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const outDir = resolve(root, 'release');

const { version } = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const zipPath = resolve(outDir, `stock-ticker-extension-${version}.zip`);

mkdirSync(outDir, { recursive: true });
rmSync(zipPath, { force: true });

/**
 * The Web Store requires manifest.json at the archive root, so the zip is run
 * from inside dist/ — archiving the directory itself would nest everything one
 * level down and be rejected on upload.
 */
execFileSync('zip', ['-r', '-q', '-X', zipPath, '.'], { cwd: dist, stdio: 'inherit' });

const listing = execFileSync('zip', ['-sf', zipPath], { encoding: 'utf8' });
console.log(listing.trim());
console.log(`\n[package] ${zipPath}`);
