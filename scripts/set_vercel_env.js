const { execSync } = require('child_process');

const envs = {
  DODO_PAYMENTS_API_KEY: 'PwYRkznPZEpjxyA6.2ZVvi3AHpn3uj5FRFRR7rnSLxPVaYPNt4pVnVRn7CTxiXyOd',
  DODO_PAYMENTS_WEBHOOK_SECRET: 'whsec_fQe4VEXD7dhdpcoyxzUTRqES5/JUxPgo',
  DODO_PAYMENTS_ENVIRONMENT: 'live_mode',
  NEXT_PUBLIC_SITE_URL: 'https://syncraftech.com',
  DODO_PRODUCT_BASIC: 'pdt_0Nk3fX1N1mwp4OzDFEQWh',
  DODO_PRODUCT_STARTER: 'pdt_0Nk3flqLsyLuy1I3b8NRb',
  DODO_PRODUCT_PRO: 'pdt_0Nk3frz6qC3srkXeNLrwO',
  DODO_PRODUCT_ELITE: 'pdt_0Nk3fy2qVe6Bukba6g7I2'
};

for (const [key, value] of Object.entries(envs)) {
  console.log(`Setting ${key}...`);
  try {
    execSync(`npx vercel env rm ${key} production -y`, { stdio: 'ignore' });
  } catch (e) {}
  try {
    execSync(`echo ${value} | npx vercel env add ${key} production`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed setting ${key}:`, err.message);
  }
}

console.log("Done updating Vercel environment variables!");
