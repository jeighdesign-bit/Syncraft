/**
 * install-sharp.mjs — postinstall script
 *
 * Ensures that sharp's platform-specific native binaries are installed.
 * On Vercel (linux-x64), npm may skip optional dependencies by default.
 * This script detects the current platform and installs the correct
 * @img/sharp-* and @img/sharp-libvips-* packages if they're missing.
 */

import { execSync } from 'node:child_process';
import { platform, arch } from 'node:os';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const os = platform();   // 'linux', 'win32', 'darwin'
const cpu = arch();       // 'x64', 'arm64'

// Map Node.js platform/arch to sharp's package naming
const platformMap = {
  'linux-x64': {
    sharp: '@img/sharp-linux-x64',
    libvips: '@img/sharp-libvips-linux-x64',
  },
  'linux-arm64': {
    sharp: '@img/sharp-linux-arm64',
    libvips: '@img/sharp-libvips-linux-arm64',
  },
  'win32-x64': {
    sharp: '@img/sharp-win32-x64',
    libvips: '@img/sharp-libvips-win32-x64',
  },
  'darwin-x64': {
    sharp: '@img/sharp-darwin-x64',
    libvips: '@img/sharp-libvips-darwin-x64',
  },
  'darwin-arm64': {
    sharp: '@img/sharp-darwin-arm64',
    libvips: '@img/sharp-libvips-darwin-arm64',
  },
};

const key = `${os}-${cpu}`;
const packages = platformMap[key];

if (!packages) {
  console.log(`[install-sharp] No sharp binaries needed for ${key}, skipping.`);
  process.exit(0);
}

const needed = [];

// Check if the platform-specific sharp package is already installed
const sharpPkgPath = join(root, 'node_modules', ...packages.sharp.split('/'));
if (!existsSync(sharpPkgPath)) {
  needed.push(packages.sharp);
}

// Check if the platform-specific libvips package is already installed
const libvipsPkgPath = join(root, 'node_modules', ...packages.libvips.split('/'));
if (!existsSync(libvipsPkgPath)) {
  needed.push(packages.libvips);
}

if (needed.length === 0) {
  console.log(`[install-sharp] Platform binaries for ${key} already present. ✓`);
  process.exit(0);
}

console.log(`[install-sharp] Installing missing binaries for ${key}: ${needed.join(', ')}`);

try {
  execSync(`npm install --no-save ${needed.join(' ')}`, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, npm_config_optional: 'true' },
  });
  console.log(`[install-sharp] Successfully installed binaries for ${key}. ✓`);
} catch (err) {
  console.error(`[install-sharp] Warning: failed to install binaries for ${key}:`, err.message);
  // Don't fail the build — sharp might still work if Next.js bundles its own copy
  process.exit(0);
}
