// Makes sure the Electron binary is present. Electron's own postinstall sometimes
// exits silently without unpacking (seen on Windows with newer Node versions), which
// leaves only dist/locales and makes electron-vite fail with "Electron uninstall".
// Strategy: run Electron's installer; if the binary is still missing, download the
// release zip directly and unpack it with the OS's own tools.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronDir = path.dirname(require.resolve('electron/package.json'));
const { version } = require('electron/package.json');
const exe = { win32: 'electron.exe', darwin: 'Electron.app/Contents/MacOS/Electron' }[process.platform] ?? 'electron';
const dist = path.join(electronDir, 'dist');
const installed = () => existsSync(path.join(dist, exe));

if (installed()) process.exit(0);

console.log('Electron binary missing; running Electron installer…');
spawnSync(process.execPath, [path.join(electronDir, 'install.js')], { stdio: 'inherit', cwd: electronDir });
if (installed()) process.exit(0);

const arch = process.env.npm_config_arch || process.arch;
const name = `electron-v${version}-${process.platform}-${arch}.zip`;
const url = `https://github.com/electron/electron/releases/download/v${version}/${name}`;
console.log(`Installer did not unpack Electron. Downloading ${url}`);
const res = await fetch(url);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const zip = path.join(tmpdir(), name);
await writeFile(zip, Buffer.from(await res.arrayBuffer()));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const r =
  process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dist}' -Force`], { stdio: 'inherit' })
    : spawnSync('unzip', ['-q', '-o', zip, '-d', dist], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('Unpacking Electron failed.');
  process.exit(1);
}
writeFileSync(path.join(electronDir, 'path.txt'), exe);
if (!existsSync(path.join(dist, 'version'))) writeFileSync(path.join(dist, 'version'), version);

if (!installed()) {
  console.error(`Electron still missing at ${path.join(dist, exe)}. Antivirus may be removing it; check Windows Security > Protection history.`);
  process.exit(1);
}
console.log('Electron installed.');
