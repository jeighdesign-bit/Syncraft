const { spawnSync } = require('child_process');

// Values are intentionally read from the caller's environment. Never commit
// production credentials or pipe them through a shell command.
const REQUIRED_ENV_NAMES = [
  'DODO_PAYMENTS_API_KEY',
  'DODO_PAYMENTS_WEBHOOK_SECRET',
  'DODO_PAYMENTS_ENVIRONMENT',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'DODO_PRODUCT_BASIC',
  'DODO_PRODUCT_STARTER',
  'DODO_PRODUCT_PRO',
  'DODO_PRODUCT_ELITE',
];

const missingEnvNames = REQUIRED_ENV_NAMES.filter((name) => !process.env[name]);

if (missingEnvNames.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvNames.join(', ')}`);
  process.exit(1);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runVercel(args, input, allowFailure = false) {
  const result = spawnSync(npxCommand, ['vercel', ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: false,
  });

  if (result.error && !allowFailure) {
    throw result.error;
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Vercel CLI exited with status ${result.status}`);
  }
}

for (const name of REQUIRED_ENV_NAMES) {
  console.log(`Setting ${name}...`);
  runVercel(['env', 'rm', name, 'production', '-y'], undefined, true);
  runVercel(['env', 'add', name, 'production'], `${process.env[name]}\n`);
}

console.log('Done updating Vercel production environment variables.');
